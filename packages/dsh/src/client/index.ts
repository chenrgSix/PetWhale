/**
 * @petwhale/dsh — browser half (the DSH `dsh.client` bundle entry, design doc
 * §16–§17). Registers a PetWhale entry into the frame-wide `shell.overlay`
 * list slot through `ctx.slots.inject(...)` — the official third-party rule:
 * wait for the declaration, survive layout rebuilds, leave with the plugin
 * fiber. The bundle is built into the DSH ModuleLoader format
 * (window.__ModuleLoader__.load) and served as /plugins/@petwhale/dsh/client.js.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
import { CompanionEngine } from '@petwhale/core';
import { DshCompanionSource } from './source/dsh-source';
import { OVERLAY_ENTRY_ID, PetWhaleOverlay } from './overlay';
import { loadPreferences } from './settings';
import { injectOverlayStyle } from './styles';

/** Required services (cordis fiber inject). */
export const inject = ['slots', 'sessions'];

/**
 * Plugin body: on every shell.overlay declaration lifetime, create the
 * companion pipeline (source → engine), wire host facts (visibility,
 * reduced-motion, preferences), register the overlay entry, and return a
 * disposer that tears the whole pipeline down with the fiber.
 */
export function apply(ctx: ClientContext): void {
  ctx.slots.inject('shell.overlay', () => {
    const preferences = loadPreferences();
    const source = new DshCompanionSource(ctx.sessions, {
      host: 'deepseek-harness',
    });
    const engine = new CompanionEngine(source, {
      behaviorPolicy: { sleepAfterMs: preferences.sleepAfterMs },
    });
    const reducedMotion =
      !preferences.motion ||
      (typeof matchMedia === 'function' &&
        matchMedia('(prefers-reduced-motion: reduce)').matches);
    const rendererOptions = { scale: preferences.scale, reducedMotion };

    source.start();
    engine.start();
    const syncVisibility = (): void => {
      engine.setPaused(document.visibilityState === 'hidden');
    };
    syncVisibility();
    document.addEventListener('visibilitychange', syncVisibility);
    const styleTag = injectOverlayStyle();

    const disposers: Array<() => void> = [];
    disposers.push(
      ctx.slots.register(
        {
          name: 'shell.overlay',
          id: OVERLAY_ENTRY_ID,
          order: 50,
          label: 'PetWhale',
          inject: () => ({ engine, rendererOptions }),
        },
        PetWhaleOverlay,
      ),
    );

    return () => {
      for (const dispose of disposers.reverse()) dispose();
      styleTag?.remove();
      document.removeEventListener('visibilitychange', syncVisibility);
      source.dispose();
      engine.dispose();
    };
  });
}

// Shared logic re-exported for consumers of the ./client entry.
export {
  composeSnapshot,
  createCompletionTracking,
  hasAnswer,
  hasReasoning,
  latestRunningCall,
  resolveActivity,
  resolveEmotion,
  resolveState,
} from './source/resolve-state';
export type { CompletionTracking } from './source/resolve-state';
export { DshCompanionSource } from './source/dsh-source';
export type { DshSourceOptions } from './source/dsh-source';
export {
  DEFAULT_PREFERENCES,
  loadPreferences,
  savePreferences,
} from './settings';
export type { PetWhalePreferences } from './settings';
export { OVERLAY_CLASS, OVERLAY_CSS, PET_CLASS, injectOverlayStyle } from './styles';
export { OVERLAY_ENTRY_ID } from './overlay';
