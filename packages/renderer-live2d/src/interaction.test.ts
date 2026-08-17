import { describe, expect, it } from 'vitest';
import { selectHitMotionGroup, transformInteractionBounds } from './interaction';

describe('selectHitMotionGroup', () => {
  it('maps a body hit to the conventional TapBody motion group', () => {
    expect(selectHitMotionGroup(['Body'], ['Idle', 'TapBody'])).toBe('TapBody');
  });

  it('prefers the motion matching the hit area', () => {
    expect(selectHitMotionGroup(['Head', 'Body'], ['TapBody', 'Tap_Head'])).toBe('Tap_Head');
  });

  it('falls back to TapBody when the hit area has no dedicated motion', () => {
    expect(selectHitMotionGroup(['Head'], ['Idle', 'tap_body'])).toBe('tap_body');
  });

  it('returns undefined when the model has no interaction motion', () => {
    expect(selectHitMotionGroup(['Head'], ['Idle', 'Thinking'])).toBeUndefined();
  });
});

describe('transformInteractionBounds', () => {
  it('maps a drawable through the model layout and world transforms', () => {
    expect(transformInteractionBounds(
      { x: 2, y: 3, width: 4, height: 5 },
      { a: 2, b: 0, c: 0, d: 3, tx: 10, ty: 20 },
      { a: 0.5, b: 0, c: 0, d: 0.5, tx: 100, ty: 200 },
    )).toEqual({ x: 107, y: 214.5, width: 4, height: 7.5 });
  });

  it('keeps an axis-aligned box around rotated corners', () => {
    expect(transformInteractionBounds(
      { x: 0, y: 0, width: 10, height: 4 },
      { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 },
      { a: 0, b: 1, c: -1, d: 0, tx: 20, ty: 30 },
    )).toEqual({ x: 16, y: 30, width: 4, height: 10 });
  });
});
