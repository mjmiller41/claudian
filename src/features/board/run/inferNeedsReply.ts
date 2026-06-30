/**
 * Best-effort guess at whether a finished turn is waiting on the user rather
 * than simply done. Reliable when the agent used the AskUserQuestion tool;
 * otherwise a heuristic on the closing line. It is a soft flag — the reply box
 * is available either way — so over-flagging a courtesy question is acceptable.
 */
export function inferNeedsReply(assistantText: string, toolNames: readonly string[] = []): boolean {
  if (toolNames.some((name) => name === 'AskUserQuestion')) return true;

  const lines = assistantText
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const last = lines[lines.length - 1];
  return last !== undefined && last.endsWith('?');
}
