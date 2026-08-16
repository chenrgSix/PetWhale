import {
  loadPreferences,
  savePreferences,
  type PetWhalePreferences,
} from './index';

export interface PreferencesStore {
  get(): PetWhalePreferences;
  update(patch: Partial<PetWhalePreferences>): void;
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

    update(patch: Partial<PetWhalePreferences>): void {
      preferences = { ...preferences, ...patch };
      savePreferences(preferences, storage);
      for (const listener of listeners) listener();
    },

    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
