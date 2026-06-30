export type CardKind = 'human' | 'claude';
export type CardRole = 'task' | 'subagent';
export type CardStatus = 'inbox' | 'running' | 'blocked' | 'review' | 'done' | 'failed';
export type AutonomyLevel = 'auto_safe' | 'ask_all' | 'autonomous';

export const CARD_STATUSES: readonly CardStatus[] = [
  'inbox',
  'running',
  'blocked',
  'review',
  'done',
  'failed',
];

export const AUTONOMY_LEVELS: readonly AutonomyLevel[] = ['auto_safe', 'ask_all', 'autonomous'];

/** Current state-of-record schema version stored in card frontmatter. */
export const CARD_STATE_SCHEMA_VERSION = 1;

/**
 * A board card resolved from its markdown note. The note is the system of
 * record: frontmatter holds the durable state, the body holds the task prompt
 * and the `## Log`.
 */
export interface CardState {
  /** Vault-relative path of the card note. */
  path: string;
  title: string;
  kind: CardKind;
  role: CardRole;
  status: CardStatus;
  autonomy: AutonomyLevel;
  board: string | null;
  /** Provider id; defaults to `claude`. */
  provider: string;
  /** Session id used to resume a claude card's conversation. */
  session: string | null;
  /** Decoded opaque provider state (stored as a JSON scalar in frontmatter). */
  providerState: Record<string, unknown> | null;
  /** Wikilink target of the parent card, for subagent/child cards. */
  parent: string | null;
  /** Wikilink targets of child cards. */
  children: string[];
  /** Task/prompt body that drives a claude card. */
  prompt: string;
  /** Column ordering hint. */
  order: number;
}
