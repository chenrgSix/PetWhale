/**
 * Compatibility gate: loads the REAL built client bundle
 * (packages/dsh/lib/client.js, the DSH ModuleLoader artifact) inside a fake
 * browser sandbox and drives the plugin end-to-end:
 *
 *   window.__ModuleLoader__.load → apply(mockCtx) → slots.register('shell.overlay')
 *     → mock sessions push conversation snapshots → source → engine.effectiveState
 *
 * This is the closest keyless stand-in for the live DSH Web integration
 * (design doc §39 Integration) without touching a running harness.
 *
 * Requires `pnpm build` first (the bundle is a build artifact); the test
 * skips with a message when it is missing.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

const BUNDLE_PATH = fileURLToPath(
  new URL('../../packages/dsh/lib/client.js', import.meta.url),
);

let bundlePresent = false;
try {
  bundlePresent = readFileSync(BUNDLE_PATH, 'utf8').startsWith(
    'window.__ModuleLoader__.load',
  );
} catch {
  bundlePresent = false;
}

interface Handoff {
  id: string;
  factory: (require: (spec: string) => unknown) => Record<string, unknown>;
}

function loadBundle(): { handoff: Handoff; exports: Record<string, unknown> } {
  let handoff: Handoff | null = null;
  const windowStub = {
    addEventListener: () => {},
    matchMedia: () => ({ matches: false }),
    __ModuleLoader__: {
      load: (h: Handoff) => {
        handoff = h;
      },
    },
  };
  const documentStub = {
    visibilityState: 'visible',
    addEventListener: () => {},
    removeEventListener: () => {},
    head: { appendChild: () => {} },
    createElement: () => ({
      dataset: {},
      style: {},
      remove: () => {},
      set textContent(_value: string) {},
    }),
    querySelector: () => null,
  };
  const sandbox = {
    window: windowStub,
    document: documentStub,
    localStorage: {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
      clear: () => {},
      key: () => null,
      get length() {
        return 0;
      },
    },
    setTimeout,
    clearTimeout,
    console,
  };
  vm.createContext(sandbox);
  const source = readFileSync(BUNDLE_PATH, 'utf8');
  vm.runInContext(source, sandbox);
  if (!handoff) throw new Error('bundle did not call window.__ModuleLoader__.load');
  const exports = handoff.factory((spec: string) => {
    if (spec === 'react') return { useEffect: () => {}, useRef: () => ({}) };
    if (spec === 'react/jsx-runtime') return { jsx: () => null, jsxs: () => null };
    throw new Error(`bundle required an unexpected module: ${spec}`);
  });
  return { handoff, exports };
}

function baseConversation(sessionId: string): Record<string, unknown> {
  return {
    sessionId,
    partial: null,
    runningCalls: [],
    pending: [],
    running: false,
    promptError: null,
    lastAgentError: null,
    blank: false,
  };
}

function makeMockSessions() {
  type Listener = () => void;
  const listListeners = new Set<Listener>();
  const sessionListeners = new Set<Listener>();
  const listState = { ids: [] as string[], byId: {}, current: undefined as string | undefined };
  let conversation = baseConversation('s1');

  const sessions = {
    list: {
      getSnapshot: () => listState,
      subscribe: (fn: Listener) => {
        listListeners.add(fn);
        return () => listListeners.delete(fn);
      },
    },
    binding: (id: string) => ({
      sessionId: id,
      session: {
        sessionId: id,
        getSnapshot: () => conversation,
        subscribe: (fn: Listener) => {
          sessionListeners.add(fn);
          return () => sessionListeners.delete(fn);
        },
      },
    }),
    scope: () => undefined,
    sessionOf: () => undefined,
    clear: () => {},
    open: () => {},
  };

  return {
    sessions,
    setCurrent(id: string | undefined): void {
      listState.current = id;
      listState.ids = id ? [id] : [];
      for (const fn of listListeners) fn();
    },
    pushConversation(next: Record<string, unknown>): void {
      conversation = next;
      for (const fn of sessionListeners) fn();
    },
  };
}

describe('compatibility: built @petwhale/dsh client bundle', () => {
  it.skipIf(!bundlePresent)(
    'loads into the DSH ModuleLoader with the expected handoff and exports',
    () => {
      const { handoff, exports } = loadBundle();
      expect(handoff.id).toBe('@petwhale/dsh');
      expect(exports.inject).toEqual(['slots', 'sessions']);
      expect(typeof exports.apply).toBe('function');
      expect(exports.resolveState).toBeTypeOf('function');
      expect(exports.DshCompanionSource).toBeTypeOf('function');
    },
  );

  it.skipIf(!bundlePresent)(
    'registers the shell.overlay entry and drives the orb pipeline from session state',
    () => {
      const { exports } = loadBundle();
      const mock = makeMockSessions();

      let registered: { entry: Record<string, unknown>; component: unknown } | null = null;
      let injectedEffect: (() => void) | null = null;
      const ctx = {
        slots: {
          inject: (_key: string, callback: () => unknown) => {
            injectedEffect = callback() as () => void;
            return () => {};
          },
          register: (entry: Record<string, unknown>, component: unknown) => {
            registered = { entry, component };
            return () => {};
          },
        },
        sessions: mock.sessions,
      };

      (exports.apply as (ctx: unknown) => void)(ctx);

      expect(registered).not.toBeNull();
      expect(registered!.entry.name).toBe('shell.overlay');
      expect(registered!.entry.id).toBe('petwhale');
      expect(registered!.entry.order).toBe(50);
      expect(typeof registered!.component).toBe('function');

      // The inject face hands the engine to the component.
      const face = (registered!.entry as { inject?: () => unknown }).inject?.() as {
        engine?: { effectiveState: string };
      };
      expect(face?.engine).toBeDefined();

      // Current session appears → idle.
      mock.setCurrent('s1');
      const engine = face.engine!;
      expect(engine.effectiveState).toBe('idle');

      // Reasoning → thinking.
      mock.pushConversation({
        ...baseConversation('s1'),
        running: true,
        partial: { turn: 1, step: 1, blocks: [{ kind: 'reasoning', text: 'hmm' }] },
      });
      expect(engine.effectiveState).toBe('thinking');

      // Tool call → working.
      mock.pushConversation({
        ...baseConversation('s1'),
        running: true,
        runningCalls: [{ callId: 'c1', name: 'bash', argsRaw: '{}', turn: 1, step: 1, time: 0 }],
      });
      expect(engine.effectiveState).toBe('working');

      // Settles → transient success.
      mock.pushConversation(baseConversation('s1'));
      expect(engine.effectiveState).toBe('success');

      // Plugin teardown disposes the engine (no further updates).
      injectedEffect?.();
      mock.pushConversation({
        ...baseConversation('s1'),
        running: true,
        partial: { turn: 1, step: 1, blocks: [{ kind: 'reasoning', text: 'after dispose' }] },
      });
      expect(engine.effectiveState).toBe('success');
    },
  );
});
