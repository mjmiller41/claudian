import type { AutonomyLevel } from '../cards/CardState';

export type AutonomyDecision = 'allow' | 'ask';

export interface AutonomyContext {
  /** Returns true when a filesystem path resolves inside the current vault. */
  isPathWithinVault?: (path: string) => boolean;
}

/**
 * Always-ask floor: irreversible outward actions that must prompt regardless of
 * autonomy level — the prompt-injection blast radius. Each rule matches the
 * service and the action anywhere in the tool name, so it catches both bare
 * (`mcp__gmail__send`) and connector (`mcp__claude_ai_Gmail__send_message`) forms.
 */
const ALWAYS_ASK_FLOOR: ReadonlyArray<{ service: RegExp; action: RegExp }> = [
  { service: /gmail|mail/i, action: /send/i },
  { service: /stripe/i, action: /refund|charge|payment|capture|create|update|cancel|delete|write/i },
  { service: /calendar/i, action: /create|delete|update|respond|move/i },
];

const SAFE_READ_TOOLS: ReadonlySet<string> = new Set([
  'Read',
  'Glob',
  'Grep',
  'LS',
  'NotebookRead',
  'TodoWrite',
  'WebSearch',
  'WebFetch',
]);

const IN_VAULT_WRITE_TOOLS: ReadonlySet<string> = new Set(['Write', 'Edit', 'MultiEdit']);

/** Binaries that only read; safe to auto-run under auto_safe when invoked plainly. */
const READONLY_BINARIES: ReadonlySet<string> = new Set([
  'ls', 'cat', 'head', 'tail', 'pwd', 'echo', 'wc', 'stat', 'tree', 'date', 'which', 'whoami',
  'hostname', 'uname', 'basename', 'dirname', 'realpath', 'file', 'grep', 'rg', 'fd', 'find',
  'sort', 'uniq', 'cut', 'nl', 'df', 'du', 'env',
]);

// Shell control characters that could chain, redirect, or subshell into something mutating.
const SHELL_METACHARS = /[;&|<>`$(){}\n\\]/;
// Mutating/outward binaries that must never auto-run, even if they appear as an argument.
const DANGEROUS_TOKENS =
  /\b(rm|rmdir|mv|cp|dd|chmod|chown|kill|curl|wget|ssh|scp|nc|ncat|sudo|tee|xargs|eval|exec|source|python3?|node|sh|bash|zsh|npm|npx|pip3?|git|mkfifo|truncate|ln|touch|mkdir|sed|awk)\b/;
// Read-tool flags that actually write (e.g. find -delete / -exec, grep -o to a redirect).
const WRITE_FLAGS = /(^|\s)-{1,2}(delete|exec|execdir|fprint\w*|output|out-file)\b/;

export function isAlwaysAsk(toolName: string): boolean {
  return ALWAYS_ASK_FLOOR.some(({ service, action }) => service.test(toolName) && action.test(toolName));
}

/**
 * True only for a single, plain invocation of a read-only binary with no shell
 * metacharacters, mutating tokens, or write flags. Fails closed: anything it
 * can't prove safe returns false (→ ask).
 */
export function isReadOnlyBash(command: unknown): boolean {
  if (typeof command !== 'string') return false;
  const trimmed = command.trim();
  if (!trimmed) return false;
  if (SHELL_METACHARS.test(trimmed)) return false;
  if (DANGEROUS_TOKENS.test(trimmed)) return false;
  if (WRITE_FLAGS.test(trimmed)) return false;
  const first = trimmed.split(/\s+/)[0];
  const binary = first.split('/').pop() ?? first;
  return READONLY_BINARIES.has(binary);
}

function isVaultMcpTool(toolName: string): boolean {
  return toolName.startsWith('mcp__') && /obsidian|vault/i.test(toolName);
}

function isDeleteTool(toolName: string): boolean {
  return /delete|trash|remove/i.test(toolName);
}

function extractPath(input: unknown): string | null {
  if (!input || typeof input !== 'object') return null;
  const record = input as Record<string, unknown>;
  const candidate = record.file_path ?? record.path ?? record.notePath;
  return typeof candidate === 'string' ? candidate : null;
}

/**
 * Decide whether a tool call may run automatically or must ask the user.
 * Order: always-ask floor → level rules. `auto_safe` allows reads and in-vault
 * writes; everything else (Bash, vault delete, out-of-vault writes) asks.
 * Fails closed (ask) when an in-vault check can't resolve a path.
 */
export function decide(
  toolName: string,
  input: unknown,
  level: AutonomyLevel,
  ctx: AutonomyContext = {},
): AutonomyDecision {
  if (isAlwaysAsk(toolName)) return 'ask';

  if (level === 'autonomous') return 'allow';
  if (level === 'ask_all') return 'ask';

  // auto_safe
  if (SAFE_READ_TOOLS.has(toolName)) return 'allow';

  if (isVaultMcpTool(toolName)) {
    return isDeleteTool(toolName) ? 'ask' : 'allow';
  }

  if (toolName === 'Bash') {
    const command = (input as { command?: unknown } | null)?.command;
    return isReadOnlyBash(command) ? 'allow' : 'ask';
  }

  if (IN_VAULT_WRITE_TOOLS.has(toolName)) {
    const path = extractPath(input);
    if (path && ctx.isPathWithinVault?.(path)) return 'allow';
    return 'ask';
  }

  return 'ask';
}
