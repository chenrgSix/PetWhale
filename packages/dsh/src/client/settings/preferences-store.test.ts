import { describe, expect, it } from 'vitest';
import { createPreferencesStore } from './preferences-store';
import { DEFAULT_PREFERENCES, type PetWhalePreferences } from './index';

class MemoryStorage implements Pick<Storage, 'getItem' | 'setItem'> {
  private readonly data = new Map<string, string>();

  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
}

describe('createPreferencesStore', () => {
  it('starts from defaults and persists updates', () => {
    const storage = new MemoryStorage();
    const store = createPreferencesStore(storage);
    expect(store.get()).toEqual(DEFAULT_PREFERENCES);

    store.update({ scale: 1.4, anchor: 'bottom-left' });
    expect(store.get().scale).toBe(1.4);
    expect(store.get().anchor).toBe('bottom-left');

    // A fresh store over the same storage reads the persisted values.
    const reloaded = createPreferencesStore(storage);
    expect(reloaded.get().scale).toBe(1.4);
    expect(reloaded.get().anchor).toBe('bottom-left');
  });

  it('notifies subscribers on update', () => {
    const store = createPreferencesStore(new MemoryStorage());
    const seen: Array<PetWhalePreferences['sleepAfterMs']> = [];
    const unsubscribe = store.subscribe(() => seen.push(store.get().sleepAfterMs));

    store.update({ sleepAfterMs: 60_000 });
    store.update({ sleepAfterMs: 0 });
    unsubscribe();
    store.update({ sleepAfterMs: 300_000 });

    expect(seen).toEqual([60_000, 0]);
  });

  it('merges patches without dropping other fields', () => {
    const store = createPreferencesStore(new MemoryStorage());
    store.update({ motion: false });
    expect(store.get()).toEqual({ ...DEFAULT_PREFERENCES, motion: false });
    store.update({ scale: 1.2 });
    expect(store.get().motion).toBe(false);
    expect(store.get().scale).toBe(1.2);
  });

  it('reports persistence failures while keeping the live update', () => {
    const storage = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota');
      },
    };
    const store = createPreferencesStore(storage);
    expect(store.update({ scale: 1.3 })).toBe(false);
    expect(store.get().scale).toBe(1.3);
  });
});
