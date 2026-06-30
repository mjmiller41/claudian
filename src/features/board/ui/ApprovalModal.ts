import { type App, Modal, Setting } from 'obsidian';

import type { ApprovalDecision } from '../../../core/types';
import { describeToolCall } from './describeToolCall';

export interface ApprovalRequest {
  cardTitle: string;
  toolName: string;
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

    const { title, detail, fields } = describeToolCall(this.request.toolName, this.request.input);
    const body = contentEl.createDiv({ cls: 'claudian-board-approval-detail' });
    body.createEl('div', { cls: 'claudian-board-approval-action', text: title });
    if (detail) {
      body.createEl('div', { cls: 'claudian-board-approval-command', text: detail });
    }
    if (fields.length > 0) {
      const list = body.createDiv({ cls: 'claudian-board-approval-fields' });
      for (const [key, value] of fields) {
        const row = list.createDiv({ cls: 'claudian-board-approval-field' });
        row.createEl('span', { cls: 'claudian-board-approval-field-key', text: key });
        row.createEl('span', { cls: 'claudian-board-approval-field-value', text: value });
      }
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
