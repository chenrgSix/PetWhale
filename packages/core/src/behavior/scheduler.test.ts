import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CompanionState } from '../state/types';
import { BehaviorScheduler } from './scheduler';

describe('BehaviorScheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function transitions(scheduler: BehaviorScheduler): CompanionState[] {
    const seen: CompanionState[] = [];
    scheduler.onTransition((state) => seen.push(state));
    return seen;
  }

  it('starts idle', () => {
    const scheduler = new BehaviorScheduler();
    expect(scheduler.getEffectiveState()).toBe('idle');
    expect(scheduler.getTarget()).toBe('idle');
  });

  it('applies a higher-priority state immediately', () => {
    const scheduler = new BehaviorScheduler();
    scheduler.request('thinking');
    expect(scheduler.getEffectiveState()).toBe('thinking');
    scheduler.request('working');
    expect(scheduler.getEffectiveState()).toBe('working');
  });

  it('defers same/lower-priority flapping until the minimum duration, last request wins', () => {
    const scheduler = new BehaviorScheduler();
    const seen = transitions(scheduler);
    scheduler.request('working');
    vi.advanceTimersByTime(50);
    // Lower priority while working is on screen: deferred.
    scheduler.request('thinking');
    expect(scheduler.getEffectiveState()).toBe('working');
    // Last request in the window wins.
    scheduler.request('answering');
    vi.advanceTimersByTime(200);
    expect(scheduler.getEffectiveState()).toBe('answering');
    expect(seen).toEqual(['working', 'answering']);
  });

  it('does not emit when the same stable state is re-requested', () => {
    const scheduler = new BehaviorScheduler();
    const seen = transitions(scheduler);
    scheduler.request('thinking');
    scheduler.request('thinking');
    expect(seen).toEqual(['thinking']);
  });

  it('holds success for successHoldMs then releases to idle', () => {
    const scheduler = new BehaviorScheduler();
    const seen = transitions(scheduler);
    scheduler.request('working');
    scheduler.request('success');
    expect(scheduler.getEffectiveState()).toBe('success');
    vi.advanceTimersByTime(1800);
    expect(scheduler.getEffectiveState()).toBe('idle');
    expect(seen).toEqual(['working', 'success', 'idle']);
  });

  it('holds error for errorHoldMs then releases to idle', () => {
    const scheduler = new BehaviorScheduler();
    scheduler.request('error');
    expect(scheduler.getEffectiveState()).toBe('error');
    vi.advanceTimersByTime(2200);
    expect(scheduler.getEffectiveState()).toBe('idle');
  });

  it('lets a fresh stable state supersede a transient hold', () => {
    const scheduler = new BehaviorScheduler();
    scheduler.request('success');
    expect(scheduler.getEffectiveState()).toBe('success');
    scheduler.request('working');
    expect(scheduler.getEffectiveState()).toBe('working');
    vi.advanceTimersByTime(3000);
    expect(scheduler.getEffectiveState()).toBe('working');
  });

  it('restarts the hold when the same transient is re-requested', () => {
    const scheduler = new BehaviorScheduler();
    scheduler.request('success');
    vi.advanceTimersByTime(1000);
    scheduler.request('success');
    vi.advanceTimersByTime(1000);
    expect(scheduler.getEffectiveState()).toBe('success');
    vi.advanceTimersByTime(800);
    expect(scheduler.getEffectiveState()).toBe('idle');
  });

  it('falls asleep after sleepAfterMs of idle and wakes on any request', () => {
    const scheduler = new BehaviorScheduler({ sleepAfterMs: 5000 });
    vi.advanceTimersByTime(5000);
    expect(scheduler.getEffectiveState()).toBe('sleeping');
    // A plain idle also wakes it.
    scheduler.request('idle');
    expect(scheduler.getEffectiveState()).toBe('idle');
    vi.advanceTimersByTime(5000);
    expect(scheduler.getEffectiveState()).toBe('sleeping');
    scheduler.request('working');
    expect(scheduler.getEffectiveState()).toBe('working');
  });

  it('activity cancels the pending sleep', () => {
    const scheduler = new BehaviorScheduler({ sleepAfterMs: 5000 });
    vi.advanceTimersByTime(4000);
    scheduler.request('thinking');
    vi.advanceTimersByTime(4000);
    expect(scheduler.getEffectiveState()).toBe('thinking');
  });

  it('clears every timer on dispose', () => {
    const scheduler = new BehaviorScheduler();
    scheduler.request('success');
    scheduler.dispose();
    vi.advanceTimersByTime(60_000);
    expect(scheduler.getEffectiveState()).toBe('success');
  });

  it('stops notifying after unsubscribe', () => {
    const scheduler = new BehaviorScheduler();
    const seen: CompanionState[] = [];
    const unsubscribe = scheduler.onTransition((state) => seen.push(state));
    scheduler.request('working');
    unsubscribe();
    scheduler.request('error');
    expect(seen).toEqual(['working']);
  });
});
