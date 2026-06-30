import { ProviderRegistry } from '../../../core/providers/ProviderRegistry';
import type { ProviderId } from '../../../core/providers/types';
import type { ChatRuntime } from '../../../core/runtime/ChatRuntime';
import type { ApprovalDecision, Conversation } from '../../../core/types';
import type { PermissionMode } from '../../../core/types/settings';
import type ClaudianPlugin from '../../../main';
import { getVaultPath, isPathWithinVault } from '../../../utils/path';
import type { CardState } from '../cards/CardState';
import type { CardStore, RunResult } from '../cards/CardStore';
import { decide } from './AutonomyGate';

/** The concrete-runtime hook added to ClaudeChatRuntime; absent on providers without it. */
interface PermissionModeOverridable {
  setPermissionModeOverride(mode: PermissionMode | null): void;
}

function asOverridable(runtime: ChatRuntime): PermissionModeOverridable | null {
  const candidate = runtime as unknown as Partial<PermissionModeOverridable>;
  return typeof candidate.setPermissionModeOverride === 'function'
    ? (candidate as PermissionModeOverridable)
    : null;
}

export type ApprovalResolver = (
  card: CardState,
  toolName: string,
  input: Record<string, unknown>,
  description: string,
) => Promise<ApprovalDecision>;

export type QuestionResolver = (
  input: Record<string, unknown>,
) => Promise<Record<string, string | string[]> | null>;

export interface CardRunnerDeps {
  plugin: ClaudianPlugin;
  store: CardStore;
  requestApproval: ApprovalResolver;
  askQuestion: QuestionResolver;
  onUpdate?: () => void;
}

/**
 * Runs a claude card as a headless turn: resumes its session, gates tool use
 * through the autonomy gate (forcing a non-yolo mode so the gate fires),
 * streams a summarized transcript into the note's `## Log`, and persists the
 * session for resume. Fails closed if the gate cannot be enforced.
 */
export class CardRunner {
  private readonly running = new Set<string>();

  constructor(private readonly deps: CardRunnerDeps) {}

  isRunning(path: string): boolean {
    return this.running.has(path);
  }

  async run(path: string): Promise<void> {
    if (this.running.has(path)) return;

    const card = await this.deps.store.loadRunnable(path);
    if (!card || card.kind !== 'claude') return; // human cards are manual

    this.running.add(path);
    let runtime: ChatRuntime | null = null;
    try {
      runtime = ProviderRegistry.createChatRuntime({
        plugin: this.deps.plugin,
        providerId: card.provider as ProviderId,
      });

      const overridable = asOverridable(runtime);
      if (!overridable) {
        await this.deps.store.applyRunResult(
          path,
          this.failure(card, 'Permission gate unavailable for this provider; refusing to run ungated.'),
        );
        return;
      }
      overridable.setPermissionModeOverride('normal');

      const conversation = this.buildConversation(card);
      runtime.syncConversationState({
        sessionId: card.session,
        providerState: card.providerState ?? undefined,
      });

      const vaultPath = getVaultPath(this.deps.plugin.app) ?? '';
      runtime.setApprovalCallback(async (toolName, input, description) => {
        const gate = decide(toolName, input, card.autonomy, {
          isPathWithinVault: (p) => !!vaultPath && isPathWithinVault(p, vaultPath),
        });
        if (gate === 'allow') return 'allow';
        return this.deps.requestApproval(card, toolName, input, description);
      });
      runtime.setAskUserQuestionCallback((input) => this.deps.askQuestion(input));

      await this.deps.store.setStatus(path, 'running');
      this.deps.onUpdate?.();

      const turn = runtime.prepareTurn({ text: card.prompt, currentNotePath: card.path });

      let assistantText = '';
      const toolNames: string[] = [];
      let errored = false;
      let errorText: string | undefined;

      for await (const chunk of runtime.query(turn)) {
        switch (chunk.type) {
          case 'text':
            assistantText += chunk.content;
            break;
          case 'tool_use':
            toolNames.push(chunk.name);
            break;
          case 'error':
            errored = true;
            errorText = chunk.content;
            break;
          default:
            break;
        }
      }

      const { updates } = runtime.buildSessionUpdates({
        conversation,
        sessionInvalidated: runtime.consumeSessionInvalidation(),
      });
      const session = updates.sessionId ?? runtime.getSessionId() ?? card.session ?? null;
      const providerState = updates.providerState ?? card.providerState ?? null;

      await this.deps.store.applyRunResult(path, {
        status: errored ? 'failed' : 'review',
        assistantText: assistantText.trim(),
        toolNames,
        session,
        providerState,
        error: errorText,
      });
    } catch (err) {
      await this.deps.store.applyRunResult(
        path,
        this.failure(card, err instanceof Error ? err.message : String(err)),
      );
    } finally {
      runtime?.cleanup();
      this.running.delete(path);
      this.deps.onUpdate?.();
    }
  }

  private buildConversation(card: CardState): Conversation {
    const now = Date.now();
    return {
      id: card.path,
      providerId: card.provider as ProviderId,
      title: card.title,
      createdAt: now,
      updatedAt: now,
      sessionId: card.session,
      providerState: card.providerState ?? undefined,
      messages: [],
    };
  }

  private failure(card: CardState, error: string): RunResult {
    return {
      status: 'failed',
      assistantText: '',
      toolNames: [],
      session: card.session,
      providerState: card.providerState,
      error,
    };
  }
}
