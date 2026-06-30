import { parseSubtasks } from '@/features/board/run/parseSubtasks';

describe('parseSubtasks', () => {
  it('parses a fenced json block', () => {
    const text = [
      "Here's the plan:",
      '```json',
      '[{"title":"Research","prompt":"Find sources"},{"title":"Draft","prompt":"Write it"}]',
      '```',
    ].join('\n');
    expect(parseSubtasks(text)).toEqual([
      { title: 'Research', prompt: 'Find sources' },
      { title: 'Draft', prompt: 'Write it' },
    ]);
  });

  it('parses a bare json array when there is no fence', () => {
    const text = 'Plan: [{"title":"A","prompt":"do a"}] — let me know.';
    expect(parseSubtasks(text)).toEqual([{ title: 'A', prompt: 'do a' }]);
  });

  it('uses the last fenced block when several are present', () => {
    const text = ['```json', '[]', '```', 'revised:', '```json', '[{"title":"X","prompt":"y"}]', '```'].join('\n');
    expect(parseSubtasks(text)).toEqual([{ title: 'X', prompt: 'y' }]);
  });

  it('drops items missing a title or prompt and trims', () => {
    const text = '[{"title":" A ","prompt":" p "},{"title":"no prompt"},{"prompt":"no title"}]';
    expect(parseSubtasks(text)).toEqual([{ title: 'A', prompt: 'p' }]);
  });

  it('returns [] for non-array, garbage, or empty input', () => {
    expect(parseSubtasks('no json here')).toEqual([]);
    expect(parseSubtasks('```json\n{"not":"an array"}\n```')).toEqual([]);
    expect(parseSubtasks('')).toEqual([]);
  });
});
