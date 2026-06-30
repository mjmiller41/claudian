export interface Subtask {
  title: string;
  prompt: string;
}

const FENCED_BLOCK = /```(?:json)?\s*([\s\S]*?)```/gi;

function coerceSubtasks(value: unknown): Subtask[] {
  if (!Array.isArray(value)) return [];
  const subtasks: Subtask[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const title = typeof record.title === 'string' ? record.title.trim() : '';
    const prompt = typeof record.prompt === 'string' ? record.prompt.trim() : '';
    if (title && prompt) subtasks.push({ title, prompt });
  }
  return subtasks;
}

function tryParse(candidate: string): Subtask[] {
  try {
    return coerceSubtasks(JSON.parse(candidate));
  } catch {
    return [];
  }
}

/**
 * Extract a subtask list from a planning turn's response. Prefers a fenced
 * ```json block; falls back to the outermost bare JSON array. Returns [] when
 * nothing parseable is found, so the caller can surface a clean failure rather
 * than materializing garbage cards.
 */
export function parseSubtasks(text: string): Subtask[] {
  let lastBlock: string | null = null;
  for (const match of text.matchAll(FENCED_BLOCK)) {
    lastBlock = match[1];
  }
  if (lastBlock) {
    const fromBlock = tryParse(lastBlock.trim());
    if (fromBlock.length) return fromBlock;
  }

  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start !== -1 && end > start) {
    const fromBare = tryParse(text.slice(start, end + 1));
    if (fromBare.length) return fromBare;
  }

  return [];
}
