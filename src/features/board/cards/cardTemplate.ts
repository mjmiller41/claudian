import {
  AUTONOMY_LEVELS,
  type AutonomyLevel,
  CARD_STATE_SCHEMA_VERSION,
  CARD_STATUSES,
  type CardKind,
  type CardRole,
  type CardState,
  type CardStatus,
} from './CardState';

/**
 * Frontmatter shape persisted to a card note. `provider_state` is a single
 * opaque scalar (base64 of JSON) so YAML never reinterprets its internals —
 * this is what makes resume state survive write → read intact.
 */
export interface CardFrontmatter {
  type: 'card';
  card_kind: CardKind;
  card_role: CardRole;
  status: CardStatus;
  autonomy: AutonomyLevel;
  board: string | null;
  provider: string;
  session: string | null;
  provider_state: string | null;
  state_schema_version: number;
  parent: string | null;
  children: string[];
  order: number;
}

export function encodeProviderState(state: Record<string, unknown> | null): string | null {
  if (!state) return null;
  try {
    return Buffer.from(JSON.stringify(state), 'utf-8').toString('base64');
  } catch {
    return null;
  }
}

export function decodeProviderState(scalar: unknown): Record<string, unknown> | null {
  if (typeof scalar !== 'string' || scalar.length === 0) return null;
  try {
    const json = Buffer.from(scalar, 'base64').toString('utf-8');
    const parsed: unknown = JSON.parse(json);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function coerceEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

function coerceString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function coerceStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string');
  }
  return typeof value === 'string' && value.length > 0 ? [value] : [];
}

export function buildCardFrontmatter(card: CardState): CardFrontmatter {
  return {
    type: 'card',
    card_kind: card.kind,
    card_role: card.role,
    status: card.status,
    autonomy: card.autonomy,
    board: card.board,
    provider: card.provider,
    session: card.session,
    provider_state: encodeProviderState(card.providerState),
    state_schema_version: CARD_STATE_SCHEMA_VERSION,
    parent: card.parent,
    children: card.children,
    order: card.order,
  };
}

export interface CardBodyParts {
  path: string;
  title: string;
  prompt: string;
}

/**
 * Resolve a `CardState` from a parsed frontmatter object (e.g. the metadata
 * cache) plus body-derived fields. Unknown/invalid enum values fall back to
 * safe defaults — notably `card_kind` defaults to `human`, so an unspecified
 * card is never auto-run.
 */
export function readCardState(frontmatter: Record<string, unknown>, body: CardBodyParts): CardState {
  return {
    path: body.path,
    title: body.title,
    prompt: body.prompt,
    kind: coerceEnum<CardKind>(frontmatter.card_kind, ['human', 'claude'], 'human'),
    role: coerceEnum<CardRole>(frontmatter.card_role, ['task', 'subagent'], 'task'),
    status: coerceEnum<CardStatus>(frontmatter.status, CARD_STATUSES, 'inbox'),
    autonomy: coerceEnum<AutonomyLevel>(frontmatter.autonomy, AUTONOMY_LEVELS, 'auto_safe'),
    board: coerceString(frontmatter.board),
    provider: coerceString(frontmatter.provider) ?? 'claude',
    session: coerceString(frontmatter.session),
    providerState: decodeProviderState(frontmatter.provider_state),
    parent: coerceString(frontmatter.parent),
    children: coerceStringArray(frontmatter.children),
    order: typeof frontmatter.order === 'number' ? frontmatter.order : 0,
  };
}

export function isCardFrontmatter(frontmatter: Record<string, unknown> | null | undefined): boolean {
  return !!frontmatter && frontmatter.type === 'card';
}
