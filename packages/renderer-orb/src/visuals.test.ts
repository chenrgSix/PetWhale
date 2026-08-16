import type { CompanionState } from '@petwhale/core';
import { describe, expect, it } from 'vitest';
import {
  animationForState,
  clamp01,
  easeOutBack,
  easeOutCubic,
  fpsForState,
  phase,
  STATE_COLORS,
} from './visuals';

describe('orb visuals mapping', () => {
  const states: CompanionState[] = [
    'idle',
    'thinking',
    'answering',
    'working',
    'waiting',
    'success',
    'error',
    'sleeping',
  ];

  it('maps every state to a distinct animation (design doc §26)', () => {
    const animations = states.map(animationForState);
    expect(new Set(animations).size).toBe(states.length);
    expect(animationForState('idle')).toBe('breathe');
    expect(animationForState('thinking')).toBe('pulse');
    expect(animationForState('answering')).toBe('ripple');
    expect(animationForState('working')).toBe('spin');
    expect(animationForState('waiting')).toBe('blink');
    expect(animationForState('success')).toBe('burst');
    expect(animationForState('error')).toBe('shake');
    expect(animationForState('sleeping')).toBe('none');
  });

  it('has colors for every state and an fps budget for every state', () => {
    for (const state of states) {
      expect(STATE_COLORS[state]).toBeDefined();
      expect(fpsForState(state)).toBeGreaterThan(0);
    }
  });

  it('sleeping runs at the lowest fps (idle frame reduction)', () => {
    expect(fpsForState('sleeping')).toBeLessThan(fpsForState('idle'));
    expect(fpsForState('working')).toBeGreaterThan(fpsForState('idle'));
  });
});

describe('easing helpers', () => {
  it('clamps to [0, 1]', () => {
    expect(clamp01(-1)).toBe(0);
    expect(clamp01(2)).toBe(1);
    expect(clamp01(0.5)).toBe(0.5);
  });

  it('easeOutCubic goes 0 → 1 monotonically', () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5); // fast start
  });

  it('easeOutBack overshoots past 1', () => {
    expect(easeOutBack(1)).toBeCloseTo(1);
    expect(easeOutBack(0.5)).toBeGreaterThan(0.5);
  });

  it('phase wraps into [0, 1)', () => {
    expect(phase(0, 1000)).toBe(0);
    expect(phase(500, 1000)).toBe(0.5);
    expect(phase(1500, 1000)).toBe(0.5);
    expect(phase(-500, 1000)).toBe(0.5);
  });
});
