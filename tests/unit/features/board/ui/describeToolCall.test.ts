import { describeToolCall } from '@/features/board/ui/describeToolCall';

describe('describeToolCall', () => {
  it('describes Bash with the command as the detail', () => {
    expect(describeToolCall('Bash', { command: 'rm board-test.md' })).toEqual({
      title: 'Run a shell command',
      detail: 'rm board-test.md',
      fields: [],
    });
  });

  it('humanizes an MCP connector name and its fields (no raw JSON)', () => {
    const result = describeToolCall('mcp__claude_ai_Google_Calendar__create_event', {
      summary: 'test',
      startTime: '2026-07-01T15:00:00',
      endTime: '2026-07-01T16:00:00',
    });
    expect(result.title).toBe('Google Calendar: create event');
    expect(result.detail).toBeUndefined();
    expect(result.fields).toEqual([
      ['Summary', 'test'],
      ['Start Time', '2026-07-01T15:00:00'],
      ['End Time', '2026-07-01T16:00:00'],
    ]);
  });

  it('uses the file path as the detail for writes', () => {
    expect(describeToolCall('Write', { file_path: 'notes/a.md', content: 'hi' })).toEqual({
      title: 'Write a file',
      detail: 'notes/a.md',
      fields: [['Content', 'hi']],
    });
  });

  it('truncates long values and skips empties', () => {
    const result = describeToolCall('mcp__x__do', { big: 'a'.repeat(200), empty: '', n: 3 });
    expect(result.fields).toContainEqual(['N', '3']);
    expect(result.fields.find(([k]) => k === 'Big')?.[1]).toMatch(/…$/);
    expect(result.fields.some(([k]) => k === 'Empty')).toBe(false);
  });

  it('falls back to a humanized tool name', () => {
    expect(describeToolCall('TodoWrite', {}).title).toBe('TodoWrite');
  });
});
