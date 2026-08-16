import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  CompanionAction,
  CompanionContainer,
  CompanionRenderer,
  CompanionRendererOptions,
  CompanionSnapshot,
  CompanionSource,
} from '../index';
import { CompanionEngine } from './engine';

class MockSource implements CompanionSource {
  private snapshot: CompanionSnapshot = {
    state: 'idle',
    emotion: 'neutral',
    since: 0,
  };
  private listeners = new Set<() => void>();

  getSnapshot(): CompanionSnapshot {
    return this.snapshot;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  dispose(): void {
    this.listeners.clear();
  }

  set(snapshot: CompanionSnapshot): void {
    this.snapshot = { ...snapshot, since: Date.now() };
    for (const listener of this.listeners) listener();
  }
}

class MockRenderer implements CompanionRenderer {
  readonly id = 'mock';
  updates: CompanionSnapshot[] = [];
  actions: CompanionAction[] = [];
  visible = true;
  mounted = false;
  disposed = false;
  resizeCalls: Array<[number, number]> = [];

  async mount(_container: CompanionContainer, _options?: CompanionRendererOptions): Promise<void> {
    this.mounted = true;
  }

  update(snapshot: CompanionSnapshot): void {
    this.updates.push(snapshot);
  }

  trigger(action: CompanionAction): void {
    this.actions.push(action);
  }

  resize(width: number, height: number): void {
    this.resizeCalls.push([width, height]);
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
  }

  dispose(): void {
    this.disposed = true;
  }
}

describe('CompanionEngine', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('pushes the current snapshot to the renderer after start', async () => {
    const source = new MockSource();
    const engine = new CompanionEngine(source);
    const renderer = new MockRenderer();
    await engine.setRenderer(renderer, {});
    engine.start();
    expect(renderer.updates.at(-1)?.state).toBe('idle');
  });

  it('drives renderer updates from source changes through the scheduler', async () => {
    const source = new MockSource();
    const engine = new CompanionEngine(source);
    const renderer = new MockRenderer();
    await engine.setRenderer(renderer, {});
    engine.start();

    source.set({ state: 'working', emotion: 'focused', since: 0 });
    expect(renderer.updates.at(-1)?.state).toBe('working');
    expect(renderer.updates.at(-1)?.emotion).toBe('focused');

    source.set({ state: 'success', emotion: 'happy', since: 0 });
    expect(renderer.updates.at(-1)?.state).toBe('success');
    vi.advanceTimersByTime(1800);
    expect(renderer.updates.at(-1)?.state).toBe('idle');
  });

  it('replaces the renderer, disposing the previous one', async () => {
    const source = new MockSource();
    const engine = new CompanionEngine(source);
    const first = new MockRenderer();
    const second = new MockRenderer();
    await engine.setRenderer(first, {});
    engine.start();
    await engine.setRenderer(second, {});
    expect(first.disposed).toBe(true);
    expect(second.disposed).toBe(false);
    expect(engine.status.rendererId).toBe('mock');
  });

  it('forwards one-shot actions to the renderer', async () => {
    const source = new MockSource();
    const engine = new CompanionEngine(source);
    const renderer = new MockRenderer();
    await engine.setRenderer(renderer, {});
    engine.trigger('wave');
    engine.trigger('poke');
    expect(renderer.actions).toEqual(['wave', 'poke']);
  });

  it('pauses rendering while hidden and resumes with the latest state', async () => {
    const source = new MockSource();
    const engine = new CompanionEngine(source);
    const renderer = new MockRenderer();
    await engine.setRenderer(renderer, {});
    engine.start();

    engine.setPaused(true);
    expect(renderer.visible).toBe(false);
    const before = renderer.updates.length;
    source.set({ state: 'working', emotion: 'focused', since: 0 });
    expect(renderer.updates.length).toBe(before);

    engine.setPaused(false);
    expect(renderer.visible).toBe(true);
    expect(renderer.updates.at(-1)?.state).toBe('working');
  });

  it('forwards host resize events to the renderer', async () => {
    const source = new MockSource();
    const engine = new CompanionEngine(source);
    const renderer = new MockRenderer();
    await engine.setRenderer(renderer, {});
    renderer.resize?.(320, 480);
    expect(renderer.resizeCalls).toEqual([[320, 480]]);
  });

  it('disposes the renderer and stops listening on dispose', async () => {
    const source = new MockSource();
    const engine = new CompanionEngine(source);
    const renderer = new MockRenderer();
    await engine.setRenderer(renderer, {});
    engine.start();
    engine.dispose();
    expect(renderer.disposed).toBe(true);
    const before = renderer.updates.length;
    source.set({ state: 'working', emotion: 'focused', since: 0 });
    expect(renderer.updates.length).toBe(before);
    expect(engine.status.started).toBe(false);
  });

  it('stop() halts ingestion and start() resumes it', async () => {
    const source = new MockSource();
    const engine = new CompanionEngine(source);
    const renderer = new MockRenderer();
    await engine.setRenderer(renderer, {});
    engine.start();
    engine.stop();
    const before = renderer.updates.length;
    source.set({ state: 'working', emotion: 'focused', since: 0 });
    expect(renderer.updates.length).toBe(before);
    engine.start();
    expect(renderer.updates.at(-1)?.state).toBe('working');
  });
});
