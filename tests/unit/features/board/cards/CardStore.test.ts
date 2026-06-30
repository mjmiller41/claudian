import { extractPrompt } from '@/features/board/cards/CardStore';

describe('extractPrompt', () => {
  it('returns the task body between the title and the log', () => {
    const content = [
      '---',
      'type: card',
      'status: inbox',
      '---',
      '',
      '# Research the thing',
      '',
      'Find three sources and summarize them.',
      '',
      '## Log',
      '',
      '### 2026-06-30 12:00 — review',
      'old run output',
    ].join('\n');
    expect(extractPrompt(content)).toBe('Find three sources and summarize them.');
  });

  it('returns the whole body (minus title) when there is no log yet', () => {
    const content = ['---', 'type: card', '---', '', '# Title', '', 'Do the work.'].join('\n');
    expect(extractPrompt(content)).toBe('Do the work.');
  });

  it('handles CRLF line endings', () => {
    const content = ['---', 'type: card', '---', '', '# T', '', 'Prompt here.', '', '## Log'].join('\r\n');
    expect(extractPrompt(content)).toBe('Prompt here.');
  });

  it('returns empty string when only a title is present', () => {
    const content = ['---', 'type: card', '---', '', '# Title', '', '## Log'].join('\n');
    expect(extractPrompt(content)).toBe('');
  });
});
