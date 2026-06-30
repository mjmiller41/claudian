import { setIcon } from 'obsidian';

import type { CardState } from '../cards/CardState';

export interface CardElCallbacks {
  onOpen: (card: CardState) => void;
  onRun: (card: CardState) => void;
  isRunning: (card: CardState) => boolean;
}

export function renderCard(container: HTMLElement, card: CardState, cb: CardElCallbacks): void {
  const el = container.createDiv({ cls: 'claudian-board-card' });
  el.dataset.kind = card.kind;
  el.dataset.role = card.role;

  const header = el.createDiv({ cls: 'claudian-board-card-header' });
  header.createEl('span', { cls: 'claudian-board-card-title', text: card.title });

  const badges = el.createDiv({ cls: 'claudian-board-card-badges' });
  badges.createEl('span', {
    cls: `claudian-board-badge claudian-board-badge-kind claudian-board-badge-${card.kind}`,
    text: card.kind,
  });
  if (card.kind === 'claude') {
    badges.createEl('span', {
      cls: 'claudian-board-badge claudian-board-badge-autonomy',
      text: card.autonomy,
    });
    if (card.provider !== 'claude') {
      badges.createEl('span', { cls: 'claudian-board-badge', text: card.provider });
    }
  }
  if (card.role === 'subagent') {
    badges.createEl('span', { cls: 'claudian-board-badge claudian-board-badge-subagent', text: 'Subagent' });
  }
  if (card.children.length > 0) {
    badges.createEl('span', {
      cls: 'claudian-board-badge',
      text: `${card.children.length} child${card.children.length === 1 ? '' : 'ren'}`,
    });
  }

  const actions = el.createDiv({ cls: 'claudian-board-card-actions' });

  const openBtn = actions.createEl('button', { cls: 'claudian-board-card-btn', attr: { 'aria-label': 'Open note' } });
  setIcon(openBtn, 'file-text');
  openBtn.addEventListener('click', () => cb.onOpen(card));

  if (card.kind === 'claude') {
    const running = cb.isRunning(card);
    const runBtn = actions.createEl('button', {
      cls: 'claudian-board-card-btn claudian-board-card-run',
      attr: { 'aria-label': running ? 'Running' : 'Run card' },
    });
    setIcon(runBtn, running ? 'loader' : 'play');
    runBtn.disabled = running;
    if (running) runBtn.addClass('is-running');
    runBtn.addEventListener('click', () => cb.onRun(card));
  }
}
