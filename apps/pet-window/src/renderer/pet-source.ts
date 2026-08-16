import type {
  CompanionSnapshot,
  CompanionSource,
} from '@petwhale/core';

/**
 * CompanionSource fed over IPC from the Electron main process (which owns
 * the DSH host-event WebSocket — a browser context cannot connect because
 * the DSH server rejects file:// origins).
 */
export class IpcPetSource implements CompanionSource {
  private snapshot: CompanionSnapshot = {
    state: 'idle',
    emotion: 'neutral',
    since: Date.now(),
    context: { host: 'deepseek-harness' },
  };
  private readonly listeners = new Set<() => void>();
  private unsubscribe: (() => void) | null = null;

  getSnapshot(): CompanionSnapshot {
    return this.snapshot;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  start(): void {
    this.unsubscribe = window.petwhale?.onState((snapshot) => {
      this.snapshot = snapshot as CompanionSnapshot;
      for (const listener of this.listeners) listener();
    }) ?? null;
  }

  dispose(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.listeners.clear();
  }
}
