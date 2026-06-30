import { inferNeedsReply } from '@/features/board/run/inferNeedsReply';

describe('inferNeedsReply', () => {
  it('is true when the AskUserQuestion tool was used', () => {
    expect(inferNeedsReply('All set.', ['Read', 'AskUserQuestion'])).toBe(true);
  });

  it('is true when the closing line is a question', () => {
    expect(inferNeedsReply('I already created that.\n\nDo you want a second one?')).toBe(true);
  });

  it('is false when the turn ends with a statement', () => {
    expect(inferNeedsReply('Done. Created the event.')).toBe(false);
  });

  it('ignores trailing blank lines when finding the closing line', () => {
    expect(inferNeedsReply('Which one did you mean?\n\n  \n')).toBe(true);
  });

  it('is false for empty text', () => {
    expect(inferNeedsReply('')).toBe(false);
    expect(inferNeedsReply('   \n  ')).toBe(false);
  });
});
