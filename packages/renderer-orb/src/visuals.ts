import type { CompanionEmotion, CompanionState } from '@petwhale/core';

/**
 * Pure state → visual mapping for the orb (design doc §26). Kept free of DOM
 * so it is unit-testable in plain Node.
 */

export interface OrbColors {
  /** Outer halo color. */
  halo: string;
  /** Inner core color. */
  core: string;
  /** Activity accent (ripples, spin trail…). */
  accent: string;
}

export const STATE_COLORS: Record<CompanionState, OrbColors> = {
  idle: { halo: '#5b8cff', core: '#c3d6ff', accent: '#5b8cff' },
  thinking: { halo: '#9a6bff', core: '#ddccff', accent: '#9a6bff' },
  answering: { halo: '#2fd4a7', core: '#c2f4e6', accent: '#2fd4a7' },
  working: { halo: '#ff9f43', core: '#ffe6c9', accent: '#ff9f43' },
  waiting: { halo: '#ffd166', core: '#fff2c9', accent: '#ffd166' },
  success: { halo: '#38d47a', core: '#c9f6dc', accent: '#38d47a' },
  error: { halo: '#ff5d5d', core: '#ffd1d1', accent: '#ff5d5d' },
  sleeping: { halo: '#7f8da6', core: '#d8dde8', accent: '#7f8da6' },
};

export const EMOTION_ACCENTS: Record<CompanionEmotion, string> = {
  neutral: '#ffffff',
  happy: '#ffe066',
  focused: '#ffb35c',
  curious: '#5bc8ff',
  confused: '#c99bff',
  concerned: '#ff8f8f',
};

export type OrbAnimation =
  | 'breathe' // idle → slow breathing
  | 'pulse' // thinking → soft pulse
  | 'ripple' // answering → expanding rings
  | 'spin' // working → orbiting satellites
  | 'blink' // waiting → intermittent blink
  | 'burst' // success → expand + settle
  | 'shake' // error → shake
  | 'none'; // sleeping → static (low fps)

export function animationForState(state: CompanionState): OrbAnimation {
  switch (state) {
    case 'idle':
      return 'breathe';
    case 'thinking':
      return 'pulse';
    case 'answering':
      return 'ripple';
    case 'working':
      return 'spin';
    case 'waiting':
      return 'blink';
    case 'success':
      return 'burst';
    case 'error':
      return 'shake';
    case 'sleeping':
      return 'none';
  }
}

/** Target loop fps per animation (design doc §36 idle frame reduction). */
export function fpsForState(state: CompanionState): number {
  switch (state) {
    case 'working':
    case 'answering':
    case 'waiting':
      return 60;
    case 'idle':
    case 'thinking':
      return 24;
    case 'success':
    case 'error':
      return 30;
    case 'sleeping':
      return 8;
  }
}

export const TAU = Math.PI * 2;

export function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

export function easeOutCubic(t: number): number {
  const x = clamp01(t);
  return 1 - Math.pow(1 - x, 3);
}

export function easeOutBack(t: number): number {
  const x = clamp01(t);
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}

/** Cycle a phase in [0, 1) over `periodMs` at time `t`. */
export function phase(t: number, periodMs: number): number {
  return ((t % periodMs) + periodMs) % periodMs / periodMs;
}
