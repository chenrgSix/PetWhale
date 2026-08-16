import type { CompanionState } from '@petwhale/core';

export interface SpriteAnimationSpec {
  keyframes: Keyframe[];
  options: KeyframeAnimationOptions;
}

const infinite = (duration: number): KeyframeAnimationOptions => ({
  duration,
  iterations: Number.POSITIVE_INFINITY,
  easing: 'ease-in-out',
});

/** State-only animation mapping; hosts and Agent events never leak in here. */
export function animationForState(state: CompanionState): SpriteAnimationSpec {
  switch (state) {
    case 'thinking':
      return {
        keyframes: [
          { transform: 'rotate(-3deg) translateY(0)' },
          { transform: 'rotate(3deg) translateY(-5%)' },
          { transform: 'rotate(-3deg) translateY(0)' },
        ],
        options: infinite(900),
      };
    case 'answering':
      return {
        keyframes: [
          { transform: 'translateY(0) scale(1)' },
          { transform: 'translateY(-8%) scale(1.025)' },
          { transform: 'translateY(0) scale(1)' },
        ],
        options: infinite(720),
      };
    case 'working':
      return {
        keyframes: [
          { transform: 'translateX(-3%) rotate(-2deg)' },
          { transform: 'translateX(3%) rotate(2deg)' },
          { transform: 'translateX(-3%) rotate(-2deg)' },
        ],
        options: infinite(420),
      };
    case 'waiting':
      return {
        keyframes: [
          { opacity: 1, transform: 'translateY(0)' },
          { opacity: 0.72, transform: 'translateY(2%)' },
          { opacity: 1, transform: 'translateY(0)' },
        ],
        options: infinite(1800),
      };
    case 'success':
      return {
        keyframes: [
          { transform: 'translateY(0) scale(1)' },
          { transform: 'translateY(-14%) scale(1.06)' },
          { transform: 'translateY(0) scale(1)' },
        ],
        options: infinite(900),
      };
    case 'error':
      return {
        keyframes: [
          { transform: 'translateX(0) rotate(0)' },
          { transform: 'translateX(-5%) rotate(-3deg)' },
          { transform: 'translateX(5%) rotate(3deg)' },
          { transform: 'translateX(0) rotate(0)' },
        ],
        options: infinite(500),
      };
    case 'sleeping':
      return {
        keyframes: [
          { transform: 'translateY(2%) scale(0.98)', opacity: 0.82 },
          { transform: 'translateY(0) scale(1)', opacity: 0.92 },
          { transform: 'translateY(2%) scale(0.98)', opacity: 0.82 },
        ],
        options: infinite(3200),
      };
    case 'idle':
    default:
      return {
        keyframes: [
          { transform: 'translateY(1%) rotate(-1deg)' },
          { transform: 'translateY(-3%) rotate(1deg)' },
          { transform: 'translateY(1%) rotate(-1deg)' },
        ],
        options: infinite(2800),
      };
  }
}
