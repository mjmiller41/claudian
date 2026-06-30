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

export function isAlwaysAsk(toolName: string): boolean {
  return ALWAYS_ASK_FLOOR.some(({ service, action }) => service.test(toolName) && action.test(toolName));
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

  if (IN_VAULT_WRITE_TOOLS.has(toolName)) {
    const path = extractPath(input);
    if (path && ctx.isPathWithinVault?.(path)) return 'allow';
    return 'ask';
  }

  return 'ask';
}
