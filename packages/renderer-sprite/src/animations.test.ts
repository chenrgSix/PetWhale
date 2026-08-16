import { describe, expect, it } from 'vitest';
import type { CompanionState } from '@petwhale/core';
import { animationForState } from './animations';

describe('animationForState', () => {
  it('defines a visible animation for every companion state', () => {
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

    for (const state of states) {
      const spec = animationForState(state);
      expect(spec.keyframes.length).toBeGreaterThanOrEqual(3);
      expect(spec.options.duration).toBeTypeOf('number');
    }
  });
});
