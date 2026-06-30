import { type App, Modal, Setting } from 'obsidian';

import type { ApprovalDecision } from '../../../core/types';

export interface ApprovalRequest {
  cardTitle: string;
  toolName: string;
  description: string;
  input: Record<string, unknown>;
}

/** Synchronous approval surface for a gated tool call during a card run. */
export class ApprovalModal extends Modal {
  private resolved = false;
  private resolver: ((decision: ApprovalDecision) => void) | null = null;

  constructor(app: App, private readonly request: ApprovalRequest) {
    super(app);
  }

  openAndWait(): Promise<ApprovalDecision> {
    return new Promise((resolve) => {
      this.resolver = resolve;
      this.open();
    });
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass('claudian-board-approval');
    contentEl.createEl('h3', { text: 'Permission required' });
    contentEl.createEl('p', {
      cls: 'claudian-board-approval-card',
      text: this.request.cardTitle,
    });

    const detail = contentEl.createDiv({ cls: 'claudian-board-approval-detail' });
    detail.createEl('span', { cls: 'claudian-board-approval-tool', text: this.request.toolName });
    if (this.request.description) {
      detail.createEl('div', { cls: 'claudian-board-approval-desc', text: this.request.description });
    }

    new Setting(contentEl)
      .addButton((btn) => btn.setButtonText('Deny').onClick(() => this.finish('deny')))
      .addButton((btn) => btn.setButtonText('Allow once').setCta().onClick(() => this.finish('allow')))
      .addButton((btn) => btn.setButtonText('Always allow').onClick(() => this.finish('allow-always')));
  }

  onClose(): void {
    this.finish('cancel');
  }

  private finish(decision: ApprovalDecision): void {
    if (this.resolved) return;
    this.resolved = true;
    this.resolver?.(decision);
    this.close();
  }
}
