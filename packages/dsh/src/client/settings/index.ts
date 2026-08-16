/**
 * User preferences (design doc §33–§35). First version persists to
 * localStorage; a settings.section registration lands in M5.
 */
export interface PetWhalePreferences {
  enabled: boolean;
  renderer: string;
  anchor: 'bottom-left' | 'bottom-right';
  scale: number;
  motion: boolean;
  sleepAfterMs: number;
  /**
   * Free-form overlay position set by dragging the pet (M9). When present it
   * overrides `anchor`; changing the anchor in settings clears it.
   */
  position?: { x: number; y: number };
  /** Renderer-specific configuration (e.g. live2d character/scale). */
  rendererConfig?: Record<string, unknown>;
}

export const DEFAULT_PREFERENCES: PetWhalePreferences = {
  // The in-page overlay is opt-in now: the standalone desktop pet
  // (apps/pet-window) is the primary companion surface.
  enabled: false,
  renderer: 'orb',
  anchor: 'bottom-right',
  scale: 1,
  motion: true,
  sleepAfterMs: 5 * 60_000,
};

// v2: the in-page overlay became opt-in (default enabled: false).
const STORAGE_KEY = 'petwhale.preferences.v2';

export function loadPreferences(storage: Pick<Storage, 'getItem'> = localStorage): PetWhalePreferences {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PREFERENCES };
    return { ...DEFAULT_PREFERENCES, ...(JSON.parse(raw) as Partial<PetWhalePreferences>) };
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

export function savePreferences(
  preferences: PetWhalePreferences,
  storage: Pick<Storage, 'setItem'> = localStorage,
): boolean {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(preferences));
    return true;
  } catch {
    // Storage unavailable (private mode / quota): keep running in-memory.
    return false;
  }
}
