import type { PetWhalePreferences } from './index';

/** Position anchors for the overlay (design doc §33). */
export const ANCHOR_OPTIONS: ReadonlyArray<{ label: string; value: PetWhalePreferences['anchor'] }> = [
  { label: '右下角', value: 'bottom-right' },
  { label: '左下角', value: 'bottom-left' },
];

/** Idle-sleep choices; 0 = never sleep. */
export const SLEEP_OPTIONS: ReadonlyArray<{ label: string; value: number }> = [
  { label: '1 分钟', value: 60_000 },
  { label: '5 分钟', value: 5 * 60_000 },
  { label: '15 分钟', value: 15 * 60_000 },
  { label: '从不', value: 0 },
];

export const SCALE_MIN = 0.6;
export const SCALE_MAX = 1.6;
export const SCALE_STEP = 0.1;
