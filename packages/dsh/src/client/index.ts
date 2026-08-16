/**
 * @petwhale/dsh — browser half (the DSH `dsh.client` bundle entry, design doc
 * §16–§17). Registers the PetWhale overlay into the frame-wide
 * `shell.overlay` list slot and the PetWhale settings page into
 * `settings.section`, both through `ctx.slots.inject(...)` — the official
 * third-party rule: wait for the declaration, survive layout rebuilds, leave
 * with the plugin fiber. The bundle is built into the DSH ModuleLoader format
 * (window.__ModuleLoader__.load) and served as /plugins/@petwhale/dsh/client.js.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
import { CompanionEngine } from '@petwhale/core';
import { DshCompanionSource } from './source/dsh-source';
import { OVERLAY_ENTRY_ID, PetWhaleOverlay } from './overlay';
import { PetWhaleSettings } from './settings/PetWhaleSettings';
import { createPreferencesStore } from './settings/preferences-store';
import {
  injectOverlayStyle,
  injectSettingsStyle,
} from './styles';

/** Required services (cordis fiber inject). */
export const inject = ['slots', 'sessions'];

const OVERLAY_SECTION_ID = 'petwhale';

/**
 * Plugin body. One shared PreferencesStore (design doc §34–§35, first version
 * localStorage) is created here and handed to both entries through their
 * inject faces; the overlay pipeline subscribes to it so settings apply live.
 */
export function apply(ctx: ClientContext): void {
  const preferences = createPreferencesStore();

  ctx.slots.inject('shell.overlay', () => {
    const source = new DshCompanionSource(ctx.sessions, {
      host: 'deepseek-harness',
    });
    const engine = new CompanionEngine(source, {
      behaviorPolicy: { sleepAfterMs: preferences.get().sleepAfterMs },
    });

    // Settings changes apply to the running pipeline without a reload.
    const unsubscribePreferences = preferences.subscribe(() => {
      engine.setBehaviorPolicy({ sleepAfterMs: preferences.get().sleepAfterMs });
    });

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
          inject: () => ({ engine, preferences }),
        },
        PetWhaleOverlay,
      ),
    );

    return () => {
      for (const dispose of disposers.reverse()) dispose();
      unsubscribePreferences();
      styleTag?.remove();
      document.removeEventListener('visibilitychange', syncVisibility);
      source.dispose();
      engine.dispose();
    };
  });

  ctx.slots.inject('settings.section', () => {
    const disposers: Array<() => void> = [];
    disposers.push(
      ctx.slots.register(
        {
          name: 'settings.section',
          id: OVERLAY_SECTION_ID,
          order: 90,
          label: 'PetWhale',
          inject: () => ({ preferences }),
        },
        PetWhaleSettings,
      ),
    );
    const styleTag = injectSettingsStyle();
    return () => {
      for (const dispose of disposers.reverse()) dispose();
      styleTag?.remove();
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
export { createPreferencesStore } from './settings/preferences-store';
export type { PreferencesStore } from './settings/preferences-store';
export {
  OVERLAY_CLASS,
  OVERLAY_CSS,
  PET_CLASS,
  SETTINGS_CLASS,
  ROW_CLASS,
  SETTINGS_CSS,
  injectOverlayStyle,
  injectSettingsStyle,
} from './styles';
export { OVERLAY_ENTRY_ID } from './overlay';
