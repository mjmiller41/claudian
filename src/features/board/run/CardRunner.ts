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

type ToolGateFn = (toolName: string, input: unknown) => 'allow' | 'ask' | 'deny';

/** The concrete-runtime gate hooks added to ClaudeChatRuntime; absent on providers without them. */
interface BoardGatedRuntime {
  setPermissionModeOverride(mode: PermissionMode | null): void;
  setToolGate(gate: ToolGateFn | null): void;
}

function asGated(runtime: ChatRuntime): BoardGatedRuntime | null {
  const candidate = runtime as unknown as Partial<BoardGatedRuntime>;
  return typeof candidate.setPermissionModeOverride === 'function'
    && typeof candidate.setToolGate === 'function'
    ? (candidate as BoardGatedRuntime)
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

      const gated = asGated(runtime);
      if (!gated) {
        await this.deps.store.applyRunResult(
          path,
          this.failure(card, 'Permission gate unavailable for this provider; refusing to run ungated.'),
        );
        return;
      }
      gated.setPermissionModeOverride('normal');

      const conversation = this.buildConversation(card);
      runtime.syncConversationState({
        sessionId: card.session,
        providerState: card.providerState ?? undefined,
      });

      const vaultPath = getVaultPath(this.deps.plugin.app) ?? '';
      const gateContext = { isPathWithinVault: (p: string) => !!vaultPath && isPathWithinVault(p, vaultPath) };

      // PreToolUse gate covers built-in tools (Bash/Write); the approval callback
      // renders the modal when the gate routes a call to `ask`.
      gated.setToolGate((toolName, input) => decide(toolName, input, card.autonomy, gateContext));
      runtime.setApprovalCallback(async (toolName, input, description) => {
        if (decide(toolName, input, card.autonomy, gateContext) === 'allow') return 'allow';
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
