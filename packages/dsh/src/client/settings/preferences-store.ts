import {
  loadPreferences,
  savePreferences,
  type PetWhalePreferences,
} from './index';

export interface PreferencesStore {
  get(): PetWhalePreferences;
  /** Returns whether the update was persisted; state still updates in-memory on failure. */
  update(patch: Partial<PetWhalePreferences>): boolean;
  subscribe(listener: () => void): () => void;
}

/**
 * An observable, localStorage-backed preferences store (design doc §34–§35).
 * One instance is created in the plugin apply() and shared between the
 * overlay entry and the settings section through their inject faces — the
 * DSH-sanctioned way to share registrant state across entries.
 * @param storage - defaults to localStorage.
 */
export function createPreferencesStore(
  storage?: Pick<Storage, 'getItem' | 'setItem'>,
): PreferencesStore {
  let preferences = loadPreferences(storage);
  const listeners = new Set<() => void>();

  return {
    get(): PetWhalePreferences {
      return preferences;
    },

    update(patch: Partial<PetWhalePreferences>): boolean {
      preferences = { ...preferences, ...patch };
      const persisted = savePreferences(preferences, storage);
      for (const listener of listeners) listener();
      return persisted;
    },

    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
