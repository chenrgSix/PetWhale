/**
 * Dependency-free structural mirror of @petwhale/core's CompanionSnapshot.
 * Electron hosts can use this in their main process without importing a DOM
 * renderer or coupling their lifecycle to the standalone PetWhale app.
 */
export interface PetSnapshot {
  state:
    | 'idle'
    | 'thinking'
    | 'answering'
    | 'working'
    | 'waiting'
    | 'success'
    | 'error'
    | 'sleeping';
  emotion:
    | 'neutral'
    | 'happy'
    | 'focused'
    | 'curious'
    | 'confused'
    | 'concerned';
  since: number;
  activity?: { kind: string; label?: string };
  context?: { host?: string; sessionId?: string; workspace?: string };
}

export interface PetActivity {
  kind: string;
  label?: string;
}

/** One frame from the DSH host event stream. */
export interface HostFrame {
  type: string;
  [key: string]: unknown;
}

/** Parse a raw WebSocket message into a host frame (envelope-tolerant). */
export function parseHostFrame(data: unknown): HostFrame | null {
  try {
    const parsed = JSON.parse(String(data)) as unknown;
    if (parsed === null || typeof parsed !== 'object') return null;
    const record = parsed as Record<string, unknown>;
    const payload =
      record.type === 'server-request'
        ? (record.payload as HostFrame | undefined)
        : (record as HostFrame);
    if (payload !== undefined && typeof payload.type === 'string') return payload;
    return null;
  } catch {
    return null;
  }
}

/**
 * Coarse activity classification from a host/remote-event until real traffic
 * is captured: any tool-ish token → working (with a best-effort tool name),
 * reasoning tokens → thinking, assistant output tokens → answering.
 */
export function activityFromRemoteEvent(
  event: string | undefined,
  args: unknown[] | undefined,
): PetActivity | null {
  const haystack = JSON.stringify({ event, args }).toLowerCase();
  if (haystack === undefined || haystack === '') return null;
  if (/tool\/|toolcall|runningcall|bash|pwsh|shell|exec|edit|fs\/|subagent|workflow|command|todo/.test(haystack)) {
    return { kind: 'tool', label: toolNameFromArgs(args) };
  }
  if (/reasoning|think|deliberat/.test(haystack)) return { kind: 'reasoning' };
  if (/assistant|answer|message|chunk|turn\/end|text/.test(haystack)) return { kind: 'answer' };
  return null;
}

/**
 * Best-effort tool name from the remote-event args: look for a
 * `"name":"<identifier>"` value that reads like a tool id.
 */
function toolNameFromArgs(args: unknown[] | undefined): string | undefined {
  try {
    const json = JSON.stringify(args ?? []);
    const match = json.match(/"name"\s*:\s*"([a-zA-Z][a-zA-Z0-9_\-.]{1,39})"/);
    return match?.[1];
  } catch {
    return undefined;
  }
}

/**
 * Coarse companion-state projection over the DSH host event stream. Pure
 * logic (no DOM, no WebSocket) so both the Electron main process and any
 * other consumer can drive it:
 *
 *   host/session-status running → thinking (tool frames refine to working)
 *   host/agent-error            → error
 *   running → settled           → transient success (the engine holds it)
 */
export class PetStateTracker {
  private readonly sessions = new Map<string, { running: boolean }>();
  private wasActive = false;
  private errorFlash = false;
  private activity: PetActivity | undefined;
  private snapshot: PetSnapshot = {
    state: 'idle',
    emotion: 'neutral',
    since: Date.now(),
    context: { host: 'deepseek-harness' },
  };

  getSnapshot(): PetSnapshot {
    return this.snapshot;
  }

  /** Number of sessions currently known to be running. */
  runningCount(): number {
    let count = 0;
    for (const session of this.sessions.values()) if (session.running) count++;
    return count;
  }

  ingest(frame: HostFrame): void {
    switch (frame.type) {
      case 'host/session-added': {
        const id = frame.sessionId as string | undefined;
        if (id !== undefined) this.sessions.set(id, { running: false });
        break;
      }
      case 'host/session-removed': {
        const id = frame.sessionId as string | undefined;
        if (id !== undefined) this.sessions.delete(id);
        break;
      }
      case 'host/session-status': {
        const id = frame.sessionId as string | undefined;
        const running = frame.running === true;
        if (id === undefined) break;
        const wasRunning = this.sessions.get(id)?.running ?? false;
        this.sessions.set(id, { running });
        if (running || wasRunning) this.wasActive = true;
        break;
      }
      case 'host/agent-error': {
        this.errorFlash = true;
        this.wasActive = true;
        const message = typeof frame.message === 'string' ? frame.message : '';
        this.activity = { kind: 'system', label: message.slice(0, 60) };
        break;
      }
      case 'host/remote-event': {
        const activity = activityFromRemoteEvent(
          frame.event as string | undefined,
          frame.args as unknown[] | undefined,
        );
        if (activity !== null) {
          this.activity = activity;
          this.wasActive = true;
        } else {
          this.activity = undefined;
        }
        break;
      }
      default:
        return;
    }
    this.recompute();
  }

  private recompute(): void {
    const running = this.runningCount() > 0;
    let state: PetSnapshot['state'];
    let emotion: PetSnapshot['emotion'] = 'neutral';
    let activity: PetActivity | undefined;

    if (this.errorFlash) {
      state = 'error';
      emotion = 'concerned';
      activity = this.activity;
      this.errorFlash = false;
    } else if (running) {
      state = this.activity?.kind === 'tool' ? 'working' : 'thinking';
      emotion = this.activity?.kind === 'tool' ? 'focused' : 'curious';
      activity = this.activity;
    } else if (this.wasActive) {
      state = 'success';
      emotion = 'happy';
      this.wasActive = false;
      this.activity = undefined;
    } else {
      state = 'idle';
    }

    this.snapshot = {
      state,
      emotion,
      activity,
      since: Date.now(),
      context: { host: 'deepseek-harness' },
    };
  }
}
