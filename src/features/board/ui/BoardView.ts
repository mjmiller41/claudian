import { ItemView, type WorkspaceLeaf } from 'obsidian';

import type ClaudianPlugin from '../../../main';
import { CARD_STATUSES, type CardKind, type CardState } from '../cards/CardState';
import { CardStore } from '../cards/CardStore';
import { CardRunner } from '../run/CardRunner';
import { ApprovalModal } from './ApprovalModal';
import { renderCard } from './cardEl';
import { NewCardModal } from './NewCardModal';
import { QuestionModal } from './QuestionModal';

export const VIEW_TYPE_BOARD = 'claudian-board-view';

const COLUMN_LABELS: Record<string, string> = {
  inbox: 'Inbox',
  running: 'Running',
  blocked: 'Blocked',
  review: 'Review',
  done: 'Done',
  failed: 'Failed',
};

export class BoardView extends ItemView {
  private readonly store: CardStore;
  private readonly runner: CardRunner;
  private renderScheduled = false;

  constructor(leaf: WorkspaceLeaf, private readonly plugin: ClaudianPlugin) {
    super(leaf);
    this.store = new CardStore(plugin.app);
    this.runner = new CardRunner({
      plugin,
      store: this.store,
      requestApproval: (card, toolName, input, description) =>
        new ApprovalModal(plugin.app, { cardTitle: card.title, toolName, description, input }).openAndWait(),
      askQuestion: (input) => new QuestionModal(plugin.app, input).openAndWait(),
      onUpdate: () => this.scheduleRender(),
    });
  }

  getViewType(): string {
    return VIEW_TYPE_BOARD;
  }

  getDisplayText(): string {
    return 'Claudian board';
  }

  getIcon(): string {
    return 'layout-dashboard';
  }

  async onOpen(): Promise<void> {
    this.registerEvent(this.app.metadataCache.on('changed', () => this.scheduleRender()));
    this.registerEvent(this.app.vault.on('create', () => this.scheduleRender()));
    this.registerEvent(this.app.vault.on('delete', () => this.scheduleRender()));
    this.registerEvent(this.app.vault.on('rename', () => this.scheduleRender()));
    this.render();
  }

  async onClose(): Promise<void> {
    this.contentEl.empty();
  }

  newCard(kind: CardKind): void {
    new NewCardModal(this.app, { kind }, async (input) => {
      await this.store.createCard(input);
      this.scheduleRender();
    }).open();
  }

  private scheduleRender(): void {
    if (this.renderScheduled) return;
    this.renderScheduled = true;
    window.setTimeout(() => {
      this.renderScheduled = false;
      this.render();
    }, 50);
  }

  private render(): void {
    const root = this.contentEl;
    if (!root) return;
    root.empty();
    root.addClass('claudian-board-view');

    const toolbar = root.createDiv({ cls: 'claudian-board-toolbar' });
    toolbar.createEl('span', { cls: 'claudian-board-toolbar-title', text: 'Board' });
    const addClaude = toolbar.createEl('button', { cls: 'claudian-board-toolbar-btn mod-cta', text: 'New Claude card' });
    addClaude.addEventListener('click', () => this.newCard('claude'));
    const addHuman = toolbar.createEl('button', { cls: 'claudian-board-toolbar-btn', text: 'New human card' });
    addHuman.addEventListener('click', () => this.newCard('human'));

    const cards = this.store.listCards();
    const columns = root.createDiv({ cls: 'claudian-board-columns' });
    for (const status of CARD_STATUSES) {
      const columnCards = cards.filter((card) => card.status === status);
      const column = columns.createDiv({ cls: `claudian-board-column claudian-board-column-${status}` });

      const head = column.createDiv({ cls: 'claudian-board-column-head' });
      head.createEl('span', { cls: 'claudian-board-column-title', text: COLUMN_LABELS[status] ?? status });
      head.createEl('span', { cls: 'claudian-board-column-count', text: String(columnCards.length) });

      const body = column.createDiv({ cls: 'claudian-board-column-body' });
      for (const card of columnCards) {
        renderCard(body, card, {
          onOpen: (target) => this.openNote(target),
          onRun: (target) => void this.runner.run(target.path),
          isRunning: (target) => this.runner.isRunning(target.path),
        });
      }
    }
  }

  private openNote(card: CardState): void {
    const file = this.app.vault.getFileByPath(card.path);
    if (file) {
      void this.app.workspace.getLeaf(true).openFile(file);
    }
  }
}
