import type { CompanionSnapshot } from '../state/types';

/**
 * A host adapter feeding the companion pipeline (design doc §11).
 *
 * `getSnapshot()` returns the CURRENT projected state; `subscribe()` notifies
 * whenever the underlying host state changed. Sources are host-specific
 * (DeepSeek Harness, Telos, future Codex/Claude…) and must never emit visual
 * directives — only semantics (Rule 3).
 */
export interface CompanionSource {
  getSnapshot(): CompanionSnapshot;
  subscribe(listener: () => void): () => void;
  dispose(): void;
}
