import { type App, normalizePath, stringifyYaml, type TFile } from 'obsidian';

import type { AutonomyLevel, CardKind, CardRole, CardState, CardStatus } from './CardState';
import { buildCardFrontmatter, encodeProviderState, isCardFrontmatter, readCardState } from './cardTemplate';

const FRONTMATTER_RE = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/;
const LOG_HEADING = '## Log';
const ILLEGAL_FILENAME_CHARS = /[\\/:*?"<>|#^[\]]/g;

export interface NewCardInput {
  title: string;
  kind: CardKind;
  prompt: string;
  board?: string | null;
  autonomy?: AutonomyLevel;
  provider?: string;
  parent?: string | null;
  role?: CardRole;
}

export interface RunResult {
  status: CardStatus;
  assistantText: string;
  toolNames: string[];
  session: string | null;
  providerState: Record<string, unknown> | null;
  error?: string;
  /** The follow-up message that drove this turn, recorded for continue turns. */
  prompt?: string;
  /** Whether the turn appears to be waiting on the user. */
  needsReply: boolean;
}

/** Extract the task/prompt body: text between the frontmatter and `## Log`, minus the H1. */
export function extractPrompt(content: string): string {
  const withoutFrontmatter = content.replace(FRONTMATTER_RE, '');
  const beforeLog = withoutFrontmatter.split(LOG_HEADING)[0] ?? '';
  return beforeLog.replace(/^\s*#\s+.*$/m, '').trim();
}

function renderNote(card: CardState): string {
  const frontmatter = stringifyYaml(buildCardFrontmatter(card)).trimEnd();
  return `---\n${frontmatter}\n---\n\n# ${card.title}\n\n${card.prompt}\n\n${LOG_HEADING}\n`;
}

function timestamp(): string {
  return new Date().toISOString().slice(0, 16).replace('T', ' ');
}

function renderLogEntry(result: RunResult): string {
  const lines: string[] = [`### ${timestamp()} — ${result.status}`];
  if (result.prompt) {
    lines.push('', `**Reply:** ${result.prompt}`);
  }
  if (result.error) {
    lines.push('', `> [!warning] ${result.error}`);
  }
  if (result.toolNames.length > 0) {
    const counts = new Map<string, number>();
    for (const name of result.toolNames) counts.set(name, (counts.get(name) ?? 0) + 1);
    const summary = [...counts.entries()].map(([name, n]) => (n > 1 ? `${name}×${n}` : name)).join(', ');
    lines.push('', `Tools: ${summary}`);
  }
  if (result.assistantText) {
    lines.push('', '> [!summary]- Result', ...result.assistantText.split('\n').map((l) => `> ${l}`));
  }
  return lines.join('\n');
}

/** Extract the basename a `[[link|alias]]` points to, ignoring alias and folders. */
export function wikilinkBasename(link: string | null): string | null {
  if (!link) return null;
  const match = link.match(/\[\[([^\]]+)\]\]/);
  const target = (match ? match[1] : link).split('|')[0].trim();
  return target.split('/').pop()?.trim() || null;
}

function appendUnderLog(data: string, entry: string): string {
  const trimmed = data.replace(/\s+$/, '');
  if (trimmed.includes(LOG_HEADING)) {
    return `${trimmed}\n\n${entry}\n`;
  }
  return `${trimmed}\n\n${LOG_HEADING}\n\n${entry}\n`;
}

/**
 * Vault-backed store for board cards. The card note is the system of record;
 * mutations use Obsidian's atomic `processFrontMatter` (frontmatter) and
 * `vault.process` (body) so the runner stays a single writer.
 */
export class CardStore {
  constructor(
    private readonly app: App,
    private readonly boardFolder = 'Board',
  ) {}

  listCards(): CardState[] {
    const cards: CardState[] = [];
    for (const file of this.app.vault.getMarkdownFiles()) {
      const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
      if (!isCardFrontmatter(fm)) continue;
      cards.push(this.toCardState(file, fm as Record<string, unknown>, ''));
    }
    return cards.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
  }

  getCardByPath(path: string): CardState | null {
    const file = this.app.vault.getFileByPath(path);
    if (!file) return null;
    const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
    if (!isCardFrontmatter(fm)) return null;
    return this.toCardState(file, fm as Record<string, unknown>, '');
  }

  /** Read the card and fill the prompt body — required before running a claude card. */
  async loadRunnable(path: string): Promise<CardState | null> {
    const file = this.app.vault.getFileByPath(path);
    if (!file) return null;
    const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
    if (!isCardFrontmatter(fm)) return null;
    const content = await this.app.vault.cachedRead(file);
    return this.toCardState(file, fm as Record<string, unknown>, extractPrompt(content));
  }

  async createCard(input: NewCardInput): Promise<CardState> {
    const card: CardState = {
      path: '',
      title: input.title.trim() || 'Untitled card',
      prompt: input.prompt,
      kind: input.kind,
      role: input.role ?? 'task',
      status: 'inbox',
      autonomy: input.autonomy ?? 'auto_safe',
      board: input.board ?? null,
      provider: input.provider ?? 'claude',
      session: null,
      providerState: null,
      parent: input.parent ?? null,
      children: [],
      needsReply: false,
      order: 0,
    };
    const folder = input.board ? `${this.boardFolder}/${input.board}` : this.boardFolder;
    await this.ensureFolder(folder);
    const path = await this.uniquePath(folder, card.title);
    const file = await this.app.vault.create(path, renderNote(card));
    card.path = file.path;
    card.title = file.basename; // may differ from input after dedupe; links resolve to the basename
    return card;
  }

  /** Subagent cards whose `parent` wikilink resolves to the given card title. */
  listChildren(parentTitle: string): CardState[] {
    return this.listCards().filter(
      (card) => card.role === 'subagent' && wikilinkBasename(card.parent) === parentTitle,
    );
  }

  childProgress(parentTitle: string): { total: number; done: number } | null {
    const children = this.listChildren(parentTitle);
    if (children.length === 0) return null;
    const done = children.filter((c) => c.status === 'review' || c.status === 'done').length;
    return { total: children.length, done };
  }

  async setStatus(path: string, status: CardStatus): Promise<void> {
    const file = this.app.vault.getFileByPath(path);
    if (!file) return;
    await this.app.fileManager.processFrontMatter(file, (fm) => {
      fm.status = status;
    });
  }

  async applyRunResult(path: string, result: RunResult): Promise<void> {
    const file = this.app.vault.getFileByPath(path);
    if (!file) return;
    await this.app.fileManager.processFrontMatter(file, (fm) => {
      fm.status = result.status;
      fm.session = result.session;
      fm.provider_state = encodeProviderState(result.providerState);
      fm.needs_reply = result.needsReply;
    });
    await this.app.vault.process(file, (data) => appendUnderLog(data, renderLogEntry(result)));
  }

  async addChildLink(parentPath: string, childTitle: string): Promise<void> {
    const file = this.app.vault.getFileByPath(parentPath);
    if (!file) return;
    await this.app.fileManager.processFrontMatter(file, (fm) => {
      const children: unknown = fm.children;
      const list = Array.isArray(children) ? children.filter((c): c is string => typeof c === 'string') : [];
      const link = `[[${childTitle}]]`;
      if (!list.includes(link)) list.push(link);
      fm.children = list;
    });
  }

  private toCardState(file: TFile, fm: Record<string, unknown>, prompt: string): CardState {
    return readCardState(fm, { path: file.path, title: file.basename, prompt });
  }

  private async ensureFolder(folder: string): Promise<void> {
    const normalized = normalizePath(folder);
    if (!this.app.vault.getFolderByPath(normalized)) {
      await this.app.vault.createFolder(normalized).catch(() => undefined);
    }
  }

  private async uniquePath(folder: string, title: string): Promise<string> {
    const safeTitle = title.replace(ILLEGAL_FILENAME_CHARS, '-').trim() || 'card';
    let candidate = normalizePath(`${folder}/${safeTitle}.md`);
    let counter = 2;
    while (this.app.vault.getAbstractFileByPath(candidate)) {
      candidate = normalizePath(`${folder}/${safeTitle} ${counter}.md`);
      counter += 1;
    }
    return candidate;
  }
}
