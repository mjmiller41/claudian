export interface ToolCallDescription {
  /** Human-readable action, e.g. "Google Calendar: create event". */
  title: string;
  /** A primary free-form detail (e.g. a shell command), shown prominently. */
  detail?: string;
  /** Remaining input as humanized key/value rows — never raw JSON. */
  fields: Array<[string, string]>;
}

const BUILTIN: Record<string, { title: string; primary?: string }> = {
  Bash: { title: 'Run a shell command', primary: 'command' },
  Write: { title: 'Write a file', primary: 'file_path' },
  Edit: { title: 'Edit a file', primary: 'file_path' },
  MultiEdit: { title: 'Edit a file', primary: 'file_path' },
  Read: { title: 'Read a file', primary: 'file_path' },
  NotebookEdit: { title: 'Edit a notebook', primary: 'notebook_path' },
  Glob: { title: 'Find files', primary: 'pattern' },
  Grep: { title: 'Search file contents', primary: 'pattern' },
  WebFetch: { title: 'Fetch a web page', primary: 'url' },
  WebSearch: { title: 'Search the web', primary: 'query' },
};

function humanizeToken(token: string): string {
  return token.replace(/[_-]+/g, ' ').trim();
}

function humanizeKey(key: string): string {
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function formatValue(value: unknown): string {
  if (typeof value === 'string') return value.length > 120 ? `${value.slice(0, 117)}…` : value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    const json = JSON.stringify(value);
    return json.length > 120 ? `${json.slice(0, 117)}…` : json;
  } catch {
    return String(value);
  }
}

function toFields(record: Record<string, unknown>, skip?: string): Array<[string, string]> {
  const fields: Array<[string, string]> = [];
  for (const [key, value] of Object.entries(record)) {
    if (key === skip) continue;
    if (value === undefined || value === null || value === '') continue;
    fields.push([humanizeKey(key), formatValue(value)]);
  }
  return fields;
}

/** server segment like `claude_ai_Google_Calendar` → "Google Calendar". */
function humanizeService(server: string): string {
  return humanizeToken(server.replace(/^claude_ai_/, '').replace(/^mcp_/, ''));
}

function parseMcpName(toolName: string): { service: string; action: string } {
  const rest = toolName.slice('mcp__'.length);
  const parts = rest.split('__');
  const server = parts[0] ?? rest;
  const action = parts.slice(1).join(' ') || 'use tool';
  return { service: humanizeService(server), action: humanizeToken(action) };
}

/** Turn a tool call into a human-readable summary for the approval prompt. */
export function describeToolCall(toolName: string, input: unknown): ToolCallDescription {
  const record = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};

  const builtin = BUILTIN[toolName];
  if (builtin) {
    const primary = builtin.primary ? record[builtin.primary] : undefined;
    return {
      title: builtin.title,
      detail: typeof primary === 'string' ? primary : undefined,
      fields: toFields(record, builtin.primary),
    };
  }

  if (toolName.startsWith('mcp__')) {
    const { service, action } = parseMcpName(toolName);
    return { title: `${service}: ${action}`, fields: toFields(record) };
  }

  return { title: humanizeToken(toolName), fields: toFields(record) };
}
