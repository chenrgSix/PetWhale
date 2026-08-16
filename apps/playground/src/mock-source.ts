import type {
  CompanionActivity,
  CompanionSnapshot,
  CompanionSource,
  CompanionState,
} from '@petwhale/core';

/** A snapshot without the timestamp — publish() stamps `since`. */
export type MockSnapshot = Omit<CompanionSnapshot, 'since'>;

export type StoryStep = readonly [delayMs: number, snapshot: MockSnapshot];

/** A scripted agent session: think → work → answer → success → idle. */
export const AGENT_STORY: StoryStep[] = [
  [0, { state: 'thinking', emotion: 'curious', activity: { kind: 'reasoning', label: 'reasoning…' } }],
  [1600, { state: 'working', emotion: 'focused', activity: { kind: 'tool', label: 'bash' } }],
  [1400, { state: 'working', emotion: 'focused', activity: { kind: 'tool', label: 'edit' } }],
  [1200, { state: 'answering', emotion: 'happy', activity: { kind: 'answer', label: 'writing…' } }],
  [1400, { state: 'success', emotion: 'happy' }],
  [1800, { state: 'idle', emotion: 'neutral' }],
];

export class MockSource implements CompanionSource {
  private snapshot: CompanionSnapshot = {
    state: 'idle',
    emotion: 'neutral',
    since: Date.now(),
  };
  private readonly listeners = new Set<() => void>();
  private storyTimer: ReturnType<typeof setTimeout> | null = null;
  private storyIndex = 0;

  getSnapshot(): CompanionSnapshot {
    return this.snapshot;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  dispose(): void {
    this.stopStory();
    this.listeners.clear();
  }

  /** Drive a manual snapshot from the playground UI. */
  set(snapshot: MockSnapshot): void {
    this.stopStory();
    this.publish(snapshot);
  }

  setState(state: CompanionState): void {
    this.set({ state, emotion: this.snapshot.emotion });
  }

  setEmotion(emotion: CompanionSnapshot['emotion']): void {
    this.set({ state: this.snapshot.state, emotion });
  }

  setActivity(activity: CompanionActivity | undefined): void {
    this.set({ state: this.snapshot.state, emotion: this.snapshot.emotion, activity });
  }

  isStoryRunning(): boolean {
    return this.storyTimer !== null;
  }

  startStory(): void {
    if (this.storyTimer) return;
    this.storyIndex = 0;
    this.stepStory();
  }

  stopStory(): void {
    if (this.storyTimer !== null) {
      clearTimeout(this.storyTimer);
      this.storyTimer = null;
    }
  }

  private stepStory(): void {
    const step = AGENT_STORY[this.storyIndex];
    if (!step) {
      this.storyTimer = null;
      return;
    }
    const [delay, snapshot] = step;
    this.storyTimer = setTimeout(() => {
      this.publish(snapshot);
      this.storyIndex += 1;
      this.stepStory();
    }, delay);
  }

  private publish(snapshot: MockSnapshot): void {
    this.snapshot = { ...snapshot, since: Date.now() };
    for (const listener of this.listeners) listener();
  }
}
