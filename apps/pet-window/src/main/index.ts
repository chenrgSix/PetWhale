/**
 * PetWhale pet window — Electron main process.
 *
 * Responsibilities:
 * - discover the DSH Web server (its port is dynamic; Telos spawns it with
 *   `--port 0`), by enumerating listening TCP ports and probing each for the
 *   `__DSH_BOOT__` signature;
 * - connect a Node WebSocket to the host event stream
 *   (`ws://127.0.0.1:<port>/api/events.host`). Node sends no Origin header,
 *   which the DSH server accepts (it rejects browser `file://` origins), so
 *   the connection lives in the main process and state is forwarded to the
 *   renderer over IPC;
 * - open a frameless, transparent, always-on-top, draggable window hosting
 *   the orb renderer;
 * - persist the pet's screen position and provide a quit affordance.
 */
import { app, BrowserWindow, ipcMain, Menu } from 'electron';
import { execFile } from 'node:child_process';
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { PetStateTracker, parseHostFrame } from '../shared/pet-state';

const execFileAsync = promisify(execFile);

const DSH_SIGNATURE = '__DSH_BOOT__';
const POSITION_FILE = 'pet-position.json';
const WINDOW_SIZE = { width: 300, height: 380 };
const REDISCOVER_MS = 10_000;

// ---------- DSH discovery (the port changes on every Telos launch) ----------

async function listeningPorts(): Promise<number[]> {
  try {
    const { stdout } = await execFileAsync('netstat', ['-ano', '-p', 'TCP'], {
      timeout: 8000,
    });
    const ports = new Set<number>();
    for (const line of stdout.split(/\r?\n/)) {
      const match = line.match(/^\s*TCP\s+(\S+):(\d+)\s+\S+:\S+\s+LISTENING/i);
      if (!match) continue;
      const address = match[1] ?? '';
      if (address === '127.0.0.1' || address === '0.0.0.0' || address === '[::]' || address === '::') {
        ports.add(Number(match[2]));
      }
    }
    return [...ports];
  } catch {
    return [];
  }
}

async function probeDsh(port: number, timeoutMs = 1500): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`http://127.0.0.1:${port}/`, { signal: controller.signal });
    if (!response.ok) return null;
    const text = await response.text();
    return text.includes(DSH_SIGNATURE) ? `http://127.0.0.1:${port}` : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Find the DSH Web base URL by scanning listening ports for the boot signature. */
async function discoverDshUrl(): Promise<string | null> {
  const ports = await listeningPorts();
  const results = await Promise.all(ports.map((port) => probeDsh(port)));
  const hit = ports.find((_, index) => results[index]);
  return hit !== undefined ? `http://127.0.0.1:${hit}` : null;
}

// ---------- host event stream (lives in main: Node WS sends no Origin) ----------

const tracker = new PetStateTracker();
let webSocket: WebSocket | null = null;
let baseUrl: string | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let lastDiscovery: string | null = null;
let lastClose: { code: number; reason: string } | null = null;

/** PETWINDOW_LOG_FRAMES=1 appends every raw host frame to userData for mapping refinement. */
const logFrames = process.env.PETWINDOW_LOG_FRAMES === '1';

function appendFrame(raw: string): void {
  try {
    mkdirSync(app.getPath('userData'), { recursive: true });
    appendFileSync(
      join(app.getPath('userData'), 'petwhale-frames.log'),
      `${new Date().toISOString()} ${raw}\n`,
    );
  } catch {
    // Frame logging is best-effort.
  }
}

function connectionDiagnostics(): Record<string, unknown> {
  return {
    discovery: lastDiscovery,
    ws: webSocket !== null && webSocket.readyState === WebSocket.OPEN ? 'open' : 'closed',
    lastClose,
    runningSessions: tracker.runningCount(),
  };
}

function pushState(): void {
  if (petWindow !== null && !petWindow.isDestroyed() && !petWindow.webContents.isDestroyed()) {
    petWindow.webContents.send('petwhale:state', tracker.getSnapshot());
  }
}

function scheduleReconnect(delayMs: number): void {
  if (reconnectTimer !== null) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    void connectLoop();
  }, delayMs);
}

async function connectLoop(): Promise<void> {
  const url = await discoverDshUrl();
  lastDiscovery = url;
  if (url === null) {
    scheduleReconnect(2000);
    return;
  }
  if (url === baseUrl && webSocket !== null && webSocket.readyState === WebSocket.OPEN) {
    return;
  }
  baseUrl = url;
  webSocket?.close();
  const socket = new WebSocket(`${url.replace(/^http/, 'ws')}/api/events.host`);
  webSocket = socket;
  socket.onopen = () => {
    lastClose = null;
  };
  socket.onmessage = (event) => {
    const raw = String(event.data);
    if (logFrames) appendFrame(raw);
    const frame = parseHostFrame(raw);
    if (frame !== null) {
      tracker.ingest(frame);
      pushState();
    }
  };
  socket.onclose = (event) => {
    lastClose = { code: event.code, reason: event.reason };
    if (webSocket === socket) webSocket = null;
    scheduleReconnect(2000);
  };
  socket.onerror = () => {
    try {
      socket.close();
    } catch {
      // Already closing.
    }
  };
}

// ---------- window lifecycle ----------

function positionFile(): string {
  return join(app.getPath('userData'), POSITION_FILE);
}

function loadPosition(): { x: number; y: number } | null {
  try {
    const parsed = JSON.parse(readFileSync(positionFile(), 'utf8')) as { x?: number; y?: number };
    if (typeof parsed.x === 'number' && typeof parsed.y === 'number') return { x: parsed.x, y: parsed.y };
  } catch {
    // No saved position yet.
  }
  return null;
}

function savePosition(position: readonly number[]): void {
  try {
    mkdirSync(app.getPath('userData'), { recursive: true });
    writeFileSync(positionFile(), JSON.stringify({ x: position[0], y: position[1] }));
  } catch {
    // Position persistence is best-effort.
  }
}

function createPetWindow(): BrowserWindow {
  const saved = loadPosition();
  const window = new BrowserWindow({
    ...WINDOW_SIZE,
    ...(saved ? { x: saved.x, y: saved.y } : {}),
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    fullscreenable: false,
    maximizable: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  window.setAlwaysOnTop(true, 'screen-saver');
  window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  window.on('moved', () => savePosition(window.getPosition()));
  window.on('close', () => savePosition(window.getPosition()));
  window.webContents.on('did-finish-load', () => pushState());
  void window.loadFile(join(__dirname, '../renderer/index.html'));
  return window;
}

// ---------- app lifecycle ----------

let petWindow: BrowserWindow | null = null;

function openPetWindow(): void {
  if (petWindow !== null && !petWindow.isDestroyed()) return;
  petWindow = createPetWindow();
  petWindow.on('closed', () => {
    petWindow = null;
  });
}

ipcMain.handle('petwhale:quit', () => app.quit());
ipcMain.handle('petwhale:status', () => connectionDiagnostics());
ipcMain.on('petwhale:menu', (event) => {
  const menu = Menu.buildFromTemplate([
    {
      label: '退出 PetWhale 宠物',
      click: () => app.quit(),
    },
  ]);
  const window = BrowserWindow.fromWebContents(event.sender);
  if (window !== null) menu.popup({ window });
});

app.whenReady().then(() => {
  openPetWindow();
  void connectLoop();
  setInterval(() => {
    void connectLoop();
  }, REDISCOVER_MS);

  if (process.env.PETWINDOW_SELF_TEST === '1') {
    // Self-test: after the renderer has had time to mount the orb, sample
    // the canvas and the live connection state, write the verdict to a file
    // (GUI-subsystem processes have no usable stdout on Windows), then exit.
    setTimeout(async () => {
      const window = petWindow;
      const record = (result: Record<string, unknown>): void => {
        try {
          mkdirSync(app.getPath('userData'), { recursive: true });
          writeFileSync(
            join(app.getPath('userData'), 'petwhale-self-test.json'),
            JSON.stringify(result, null, 2),
          );
        } catch (error) {
          console.error('[self-test] failed to write result', error);
        }
      };
      if (window === null) {
        record({ passed: false, reason: 'no window' });
        app.exit(1);
        return;
      }
      try {
        const result = (await window.webContents.executeJavaScript(`
          (() => {
            const canvas = document.querySelector('canvas');
            const center = canvas ? Array.from(canvas.getContext('2d').getImageData(Math.round(canvas.width/2), Math.round(canvas.height/2), 1, 1).data) : null;
            const src = document.querySelector('#status')?.textContent ?? '';
            return { center, status: src };
          })()
        `)) as { center: number[] | null; status: string };
        const painted = result.center !== null && (result.center[3] ?? 0) > 10;
        const outcome = {
          passed: painted,
          canvasCenter: result.center,
          status: result.status,
          connection: connectionDiagnostics(),
        };
        record(outcome);
        console.log(`[self-test] ${painted ? 'PASS' : 'FAIL'}`, outcome);
        app.exit(painted ? 0 : 1);
      } catch (error) {
        record({ passed: false, error: String(error) });
        app.exit(1);
      }
    }, 9000);
  }
});

app.on('window-all-closed', () => {
  app.quit();
});
