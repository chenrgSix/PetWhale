import type {
  ConversationSnapshotCompat,
  RunningToolCallCompat,
} from '../types/dsh-compat';
import { describe, expect, it } from 'vitest';
import {
  composeSnapshot,
  createCompletionTracking,
  hasAnswer,
  hasReasoning,
  latestRunningCall,
  resolveActivity,
  resolveEmotion,
  resolveState,
} from './resolve-state';

function conversation(overrides: Partial<ConversationSnapshotCompat> = {}): ConversationSnapshotCompat {
  return {
    sessionId: 's1',
    partial: null,
    runningCalls: [],
    pending: [],
    running: false,
    promptError: null,
    lastAgentError: null,
    blank: false,
    ...overrides,
  };
}

function reasoningPartial(): NonNullable<ConversationSnapshotCompat['partial']> {
  return { turn: 1, step: 1, blocks: [{ kind: 'reasoning', text: 'let me think' }] };
}

function textPartial(): NonNullable<ConversationSnapshotCompat['partial']> {
  return { turn: 1, step: 1, blocks: [{ kind: 'text', text: 'here is the answer' }] };
}

function call(name = 'bash'): RunningToolCallCompat {
  return { callId: 'c1', name, argsRaw: '{}', turn: 1, step: 1, time: 0 };
}

describe('resolveState (design doc §19)', () => {
  it('maps promptError → error', () => {
    expect(resolveState(conversation({ promptError: { op: 'send', error: {} } }))).toBe('error');
  });

  it('maps lastAgentError → error', () => {
    expect(resolveState(conversation({ lastAgentError: 'boom' }))).toBe('error');
  });

  it('maps pending interactions → waiting', () => {
    expect(
      resolveState(conversation({ pending: [{ id: 'p1', kind: 'confirm', status: 'open' }] })),
    ).toBe('waiting');
  });

  it('maps runningCalls → working', () => {
    expect(resolveState(conversation({ runningCalls: [call()], running: true }))).toBe('working');
  });

  it('maps a reasoning partial → thinking', () => {
    expect(resolveState(conversation({ partial: reasoningPartial(), running: true }))).toBe('thinking');
  });

  it('maps a text partial → answering', () => {
    expect(resolveState(conversation({ partial: textPartial(), running: true }))).toBe('answering');
  });

  it('maps running without output → thinking', () => {
    expect(resolveState(conversation({ running: true }))).toBe('thinking');
  });

  it('maps a settled conversation → idle', () => {
    expect(resolveState(conversation())).toBe('idle');
  });

  it('checks errors before everything else', () => {
    expect(
      resolveState(
        conversation({
          promptError: { op: 'send', error: {} },
          runningCalls: [call()],
          pending: [{ id: 'p1', kind: 'confirm', status: 'open' }],
        }),
      ),
    ).toBe('error');
  });
});

describe('partial helpers', () => {
  it('hasReasoning only counts non-blank reasoning blocks', () => {
    expect(hasReasoning(reasoningPartial())).toBe(true);
    expect(hasReasoning(null)).toBe(false);
    expect(hasReasoning({ turn: 1, step: 1, blocks: [{ kind: 'reasoning', text: '  ' }] })).toBe(false);  });

  it('hasAnswer only counts non-blank text blocks', () => {
    expect(hasAnswer(textPartial())).toBe(true);
    expect(hasAnswer({ turn: 1, step: 1, blocks: [{ kind: 'text', text: '' }] })).toBe(false);
  });

  it('latestRunningCall returns the last call', () => {
    expect(latestRunningCall([])).toBeUndefined();
    expect(latestRunningCall([call('bash'), call('edit')])?.name).toBe('edit');
  });
});

describe('resolveActivity', () => {
  it('labels the current tool', () => {
    expect(resolveActivity(conversation({ runningCalls: [call('edit')] }))).toEqual({
      kind: 'tool',
      label: 'edit',
    });
  });

  it('distinguishes reasoning / answer / waiting', () => {
    expect(resolveActivity(conversation({ partial: reasoningPartial() }))?.kind).toBe('reasoning');
    expect(resolveActivity(conversation({ partial: textPartial() }))?.kind).toBe('answer');
    expect(
      resolveActivity(conversation({ pending: [{ id: 'p1', kind: 'confirm', status: 'open' }] }))?.kind,
    ).toBe('waiting');
    expect(resolveActivity(conversation())).toBeUndefined();
  });
});

describe('resolveEmotion', () => {
  it('is concerned on error and focused while tools run', () => {
    expect(resolveEmotion(conversation({ lastAgentError: 'boom' }))).toBe('concerned');
    expect(resolveEmotion(conversation({ runningCalls: [call()] }))).toBe('focused');
    expect(resolveEmotion(conversation())).toBe('neutral');
  });
});

describe('composeSnapshot', () => {
  it('emits a transient success when an active conversation settles', () => {
    const tracking = createCompletionTracking();
    const first = composeSnapshot(
      conversation({ runningCalls: [call()], running: true }),
      tracking,
      1000,
    );
    expect(first.snapshot.state).toBe('working');

    const second = composeSnapshot(conversation(), first.tracking, 2000);
    expect(second.snapshot.state).toBe('success');
    expect(second.snapshot.since).toBe(2000);
  });

  it('does not emit success when idle follows idle', () => {
    const tracking = createCompletionTracking();
    const result = composeSnapshot(conversation(), tracking, 1000);
    expect(result.snapshot.state).toBe('idle');
  });

  it('carries context into the snapshot', () => {
    const { snapshot } = composeSnapshot(
      conversation({ runningCalls: [call('bash')], running: true }),
      createCompletionTracking(),
      1000,
      { host: 'deepseek-harness', sessionId: 's1' },
    );
    expect(snapshot.context).toEqual({ host: 'deepseek-harness', sessionId: 's1' });
    expect(snapshot.activity).toEqual({ kind: 'tool', label: 'bash' });
  });
});
