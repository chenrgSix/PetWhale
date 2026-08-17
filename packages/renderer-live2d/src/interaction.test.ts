import { describe, expect, it } from 'vitest';
import { selectHitMotionGroup } from './interaction';

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
