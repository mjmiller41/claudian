import { setIcon } from 'obsidian';

import type { CardState, CardStatus } from '../cards/CardState';

export interface CardElCallbacks {
  onOpen: (card: CardState) => void;
  onRun: (card: CardState) => void;
  onReply: (card: CardState, text: string) => void;
  onDecompose: (card: CardState) => void;
  isRunning: (card: CardState) => boolean;
  childProgress: (card: CardState) => { total: number; done: number } | null;
}

/** States where continuing the conversation makes sense. */
const REPLIABLE: ReadonlySet<CardStatus> = new Set<CardStatus>(['review', 'done', 'failed']);

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
  const progress = cb.childProgress(card);
  if (progress) {
    badges.createEl('span', {
      cls: 'claudian-board-badge claudian-board-badge-progress',
      text: `${progress.done}/${progress.total} done`,
    });
  }

  const running = cb.isRunning(card);
  if (card.kind === 'claude' && !running && REPLIABLE.has(card.status)) {
    if (card.needsReply) {
      badges.createEl('span', {
        cls: 'claudian-board-badge claudian-board-badge-needs-reply',
        text: 'Reply needed',
      });
    } else if (card.status === 'review') {
      badges.createEl('span', {
        cls: 'claudian-board-badge claudian-board-badge-ready',
        text: 'Ready',
      });
    }
  }

  const actions = el.createDiv({ cls: 'claudian-board-card-actions' });

  const openBtn = actions.createEl('button', { cls: 'claudian-board-card-btn', attr: { 'aria-label': 'Open note' } });
  setIcon(openBtn, 'file-text');
  openBtn.addEventListener('click', () => cb.onOpen(card));

  if (card.kind === 'claude') {
    if (REPLIABLE.has(card.status) && !running) {
      renderReply(el, actions, card, cb, card.needsReply);
    }

    if (card.role === 'task' && !running) {
      const decomposeBtn = actions.createEl('button', {
        cls: 'claudian-board-card-btn',
        attr: { 'aria-label': 'Decompose into subtasks' },
      });
      setIcon(decomposeBtn, 'git-fork');
      decomposeBtn.addEventListener('click', () => cb.onDecompose(card));
    }

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

function renderReply(
  card: HTMLElement,
  actions: HTMLElement,
  state: CardState,
  cb: CardElCallbacks,
  autoOpen: boolean,
): void {
  const replyArea = card.createDiv({ cls: 'claudian-board-card-reply' });
  replyArea.toggleClass('is-collapsed', !autoOpen);
  const input = replyArea.createEl('textarea', {
    cls: 'claudian-board-reply-input',
    attr: { placeholder: 'Reply to continue…', rows: '2' },
  });
  const send = replyArea.createEl('button', { cls: 'claudian-board-reply-send', text: 'Send' });

  const submit = (): void => {
    const text = input.value.trim();
    if (!text) return;
    cb.onReply(state, text);
  };
  send.addEventListener('click', submit);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  });

  let open = autoOpen;
  const toggleBtn = actions.createEl('button', {
    cls: 'claudian-board-card-btn',
    attr: { 'aria-label': 'Reply' },
  });
  setIcon(toggleBtn, 'reply');
  toggleBtn.addEventListener('click', () => {
    open = !open;
    replyArea.toggleClass('is-collapsed', !open);
    if (open) input.focus();
  });
}
