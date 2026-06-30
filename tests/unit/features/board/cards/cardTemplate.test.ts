import type { CardState } from '@/features/board/cards/CardState';
import { CARD_STATE_SCHEMA_VERSION } from '@/features/board/cards/CardState';
import {
  buildCardFrontmatter,
  decodeProviderState,
  encodeProviderState,
  isCardFrontmatter,
  readCardState,
} from '@/features/board/cards/cardTemplate';

describe('provider_state round-trip', () => {
  it('survives values with YAML-hostile characters', () => {
    const state = {
      threadId: 'abc:123',
      note: 'line1\nline2 "quoted" {braces}: [brackets]',
      nested: { a: 1, b: [true, null, 'x'] },
    };
    const encoded = encodeProviderState(state);
    expect(typeof encoded).toBe('string');
    expect(encoded).toMatch(/^[A-Za-z0-9+/=]+$/); // base64 scalar — safe in YAML
    expect(decodeProviderState(encoded)).toEqual(state);
  });

  it('encodes null as null and decodes junk as null', () => {
    expect(encodeProviderState(null)).toBeNull();
    expect(decodeProviderState(null)).toBeNull();
    expect(decodeProviderState('')).toBeNull();
    expect(decodeProviderState('not-base64-json!!')).toBeNull();
    expect(decodeProviderState(42)).toBeNull();
  });
});

describe('card frontmatter build → read round-trip', () => {
  const card: CardState = {
    path: 'Board/Card.md',
    title: 'Research the thing',
    prompt: 'Do the research.',
    kind: 'claude',
    role: 'task',
    status: 'review',
    autonomy: 'auto_safe',
    board: 'Project X',
    provider: 'claude',
    session: 'sess-1',
    providerState: { threadId: 't1' },
    parent: '[[Parent]]',
    children: ['[[Child A]]', '[[Child B]]'],
    order: 3,
  };

  it('preserves all durable fields through frontmatter', () => {
    const fm = buildCardFrontmatter(card);
    expect(fm.type).toBe('card');
    expect(fm.state_schema_version).toBe(CARD_STATE_SCHEMA_VERSION);

    const restored = readCardState(fm as unknown as Record<string, unknown>, {
      path: card.path,
      title: card.title,
      prompt: card.prompt,
    });
    expect(restored).toEqual(card);
  });
});

describe('readCardState defaults', () => {
  it('defaults card_kind to human so unspecified cards never auto-run', () => {
    const restored = readCardState({ type: 'card' }, { path: 'a.md', title: 'A', prompt: '' });
    expect(restored.kind).toBe('human');
    expect(restored.status).toBe('inbox');
    expect(restored.autonomy).toBe('auto_safe');
    expect(restored.provider).toBe('claude');
  });

  it('rejects invalid enum values, falling back to safe defaults', () => {
    const restored = readCardState(
      { type: 'card', card_kind: 'robot', status: 'nonsense', autonomy: 'wild' },
      { path: 'a.md', title: 'A', prompt: '' },
    );
    expect(restored.kind).toBe('human');
    expect(restored.status).toBe('inbox');
    expect(restored.autonomy).toBe('auto_safe');
  });
});

describe('isCardFrontmatter', () => {
  it('detects card notes by type', () => {
    expect(isCardFrontmatter({ type: 'card' })).toBe(true);
    expect(isCardFrontmatter({ type: 'note' })).toBe(false);
    expect(isCardFrontmatter(null)).toBe(false);
    expect(isCardFrontmatter(undefined)).toBe(false);
  });
});
