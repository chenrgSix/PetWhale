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
 * - open a frameless, transparent, always-on-top, draggable companion window;
 * - provide a system-tray icon + context menu (show/hide, lock position,
 *   choose/import/remove pets, toggle size, quit) and persist settings.
 */
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  Tray,
  nativeImage,
  protocol,
  shell,
} from 'electron';
import { execFile } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import {
  CustomPetStore,
  DEFAULT_PET_SETTINGS,
  PetStateTracker,
  detectPetImage,
  isPetChoiceId,
  normalizePetSettings,
  parseHostFrame,
  petMenuOptions,
  type CustomPetRecord,
  type CustomPetRendererConfig,
  type PetChoiceId,
  type PetSettings,
} from '@petwhale/electron-host';
import { listeningPorts } from './listening-ports';

protocol.registerSchemesAsPrivileged([{
  scheme: 'petwhale-live2d',
  privileges: {
    standard: true,
    secure: true,
    supportFetchAPI: true,
    corsEnabled: true,
    stream: true,
  },
}]);

const execFileAsync = promisify(execFile);

const DSH_SIGNATURE = '__DSH_BOOT__';
const POSITION_FILE = 'pet-position.json';
const SETTINGS_FILE = 'petwhale-settings.json';
const TRAY_ICON_FILE = 'tray-icon.png';
const CUSTOM_PETS_DIR = 'custom-pets';
const LIVE2D_LICENSE_FILE = 'live2d-license.json';
const LIVE2D_PROPRIETARY_LICENSE_URL =
  'https://www.live2d.com/eula/live2d-proprietary-software-license-agreement_cn.html';
const LIVE2D_OPEN_LICENSE_URL =
  'https://www.live2d.com/eula/live2d-open-software-license-agreement_cn.html';
const REDISCOVER_MS = 10_000;

/** A 32×32 blue orb, generated at build time and written to userData for the tray. */
const TRAY_ICON_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAFuSURBVFhH7ZevUsNAEMYrkUgkkseo5A2gd8wEiayso46Z3HUikZWVSCSPEFmJrKzE7TJ7DaH5joRc7jIMA9/MzyS3++XPZm8zmfzrNyq75xNteIrIcVybVMryrTb0pCy9acv8JXLe0B3GRsndoaXSM+vC0PYmp0vMFSyd09xLHoCyVGDO3tIrWmPCIShLz8H1oS0vMFEctEGPVsm78xPE07s4gwuuJ8rSLiv4FP0akqvEwJQoQw/o2ZCy9IJBSTG0Rc9a8ng6m0wiZpYv0Nvp0HD8gNRIR0Vvp5mha1w8Egv0dhq7AGsML9HbyW02uHgM2i7gx2vgquBzXDwKhqfoXWusLviBdEP0bEjeDwYlZUVr9GyoakY7LzAB0uRam9CxYoeQNoKGE5ntMEEcVAYNJW7yTVaQ9CpfGHp8q6oeIndHKgeZH0v28GG7JD0GPfYuZTmfySekDO19o08O52nTq9qHqvoTWiJJ/gP+nN4BDe1NvJvLQM0AAAAASUVORK5CYII=';

const PET_SIZES: Record<PetSettings['size'], { width: number; height: number }> = {
  small: { width: 200, height: 253 },
  large: { width: 300, height: 380 },
};

// ---------- DSH discovery (the port changes on every Telos launch) ----------

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
  const ports = await listeningPorts(process.platform, execFileAsync);
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

// ---------- settings ----------

function settingsFile(): string {
  return join(app.getPath('userData'), SETTINGS_FILE);
}

function loadSettings(): PetSettings {
  try {
    return normalizePetSettings(JSON.parse(readFileSync(settingsFile(), 'utf8')));
  } catch {
    return { ...DEFAULT_PET_SETTINGS };
  }
}

function saveSettings(): void {
  try {
    mkdirSync(app.getPath('userData'), { recursive: true });
    writeFileSync(settingsFile(), JSON.stringify(petSettings));
  } catch {
    // Settings persistence is best-effort.
  }
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

let petWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let petSettings: PetSettings = { ...DEFAULT_PET_SETTINGS };
let customPetStore: CustomPetStore | null = null;
let customPets: CustomPetRecord[] = [];
let selfTestCustomPet: CustomPetRendererConfig | null = null;

function live2DLicenseFile(): string {
  return join(app.getPath('userData'), LIVE2D_LICENSE_FILE);
}

async function confirmLive2DLicense(): Promise<boolean> {
  if (existsSync(live2DLicenseFile())) return true;
  while (true) {
    const result = await dialog.showMessageBox({
      type: 'info',
      title: '启用 Live2D Cubism',
      message: '导入 Live2D 模型需要使用 Live2D Cubism Core。',
      detail:
        '继续即表示你已阅读并同意 Live2D Proprietary Software License Agreement 和 ' +
        'Live2D Open Software License Agreement，' +
        '并确认拥有所导入模型及素材的使用权。PetWhale 将从 Live2D 官方固定版本地址加载 Cubism Core。',
      buttons: ['取消', '查看许可', '同意并继续'],
      defaultId: 0,
      cancelId: 0,
    });
    if (result.response === 0) return false;
    if (result.response === 1) {
      await shell.openExternal(LIVE2D_PROPRIETARY_LICENSE_URL);
      await shell.openExternal(LIVE2D_OPEN_LICENSE_URL);
      continue;
    }
    mkdirSync(app.getPath('userData'), { recursive: true });
    writeFileSync(live2DLicenseFile(), JSON.stringify({
      acceptedAt: new Date().toISOString(),
      cubismCore: '5.3-hosted',
    }));
    return true;
  }
}

function live2DContentType(path: string): string {
  const extension = path.toLocaleLowerCase('en-US').split('.').pop();
  switch (extension) {
    case 'json': return 'application/json; charset=utf-8';
    case 'png': return 'image/png';
    case 'webp': return 'image/webp';
    case 'jpg':
    case 'jpeg': return 'image/jpeg';
    case 'wav': return 'audio/wav';
    case 'mp3': return 'audio/mpeg';
    case 'ogg': return 'audio/ogg';
    case 'm4a': return 'audio/mp4';
    case 'aac': return 'audio/aac';
    case 'flac': return 'audio/flac';
    case 'webm': return 'audio/webm';
    default: return 'application/octet-stream';
  }
}

function installLive2DProtocol(): void {
  void protocol.handle('petwhale-live2d', (request) => {
    try {
      const url = new URL(request.url);
      const requestPath = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
      const resource = customPetStore?.resolveLive2DResource(url.hostname, requestPath);
      if (resource === null || resource === undefined) return new Response('Not found', { status: 404 });
      return new Response(readFileSync(resource), {
        headers: {
          'Content-Type': live2DContentType(resource),
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'private, max-age=3600',
        },
      });
    } catch {
      return new Response('Bad request', { status: 400 });
    }
  });
}

function pushConfig(): void {
  if (petWindow !== null && !petWindow.isDestroyed() && !petWindow.webContents.isDestroyed()) {
    const customPet = customPets.find((pet) => pet.id === petSettings.pet);
    petWindow.webContents.send('petwhale:config', {
      ...petSettings,
      customPet:
        selfTestCustomPet?.id === petSettings.pet
          ? selfTestCustomPet
          : customPet !== undefined && customPetStore !== null
          ? customPetStore.rendererConfig(customPet)
          : undefined,
    });
  }
}

function refreshTrayMenu(): void {
  tray?.setContextMenu(buildMenu());
}

function toggleVisible(): void {
  if (petWindow !== null && !petWindow.isDestroyed() && petWindow.isVisible()) {
    petWindow.hide();
  } else {
    const window = openPetWindow();
    window.show();
  }
  refreshTrayMenu();
}

function setLocked(locked: boolean): void {
  petSettings.locked = locked;
  saveSettings();
  pushConfig();
  refreshTrayMenu();
}

function toggleSize(): void {
  petSettings.size = petSettings.size === 'large' ? 'small' : 'large';
  saveSettings();
  if (petWindow !== null && !petWindow.isDestroyed()) {
    petWindow.setSize(PET_SIZES[petSettings.size].width, PET_SIZES[petSettings.size].height);
  }
  pushConfig();
  refreshTrayMenu();
}

function setPet(pet: PetChoiceId): void {
  if (
    pet.startsWith('custom:') &&
    selfTestCustomPet?.id !== pet &&
    !customPets.some((candidate) => candidate.id === pet)
  ) return;
  petSettings.pet = pet;
  saveSettings();
  pushConfig();
  refreshTrayMenu();
}

async function importCustomPet(): Promise<void> {
  if (customPetStore === null) return;
  const result = await dialog.showOpenDialog({
    title: '导入自定义宠物',
    properties: ['openFile'],
    filters: [
      { name: '宠物图片', extensions: ['png', 'apng', 'webp'] },
    ],
  });
  const sourcePath = result.filePaths[0];
  if (result.canceled || sourcePath === undefined) return;
  try {
    const imported = customPetStore.importFile(sourcePath);
    customPets = customPetStore.load();
    setPet(imported.id);
  } catch (error) {
    dialog.showErrorBox('无法导入宠物', error instanceof Error ? error.message : String(error));
  }
}

async function importLive2DPet(): Promise<void> {
  if (customPetStore === null || !(await confirmLive2DLicense())) return;
  const result = await dialog.showOpenDialog({
    title: '导入 Live2D 模型包',
    properties: ['openFile'],
    filters: [{ name: 'Live2D ZIP 模型包', extensions: ['zip'] }],
  });
  const sourcePath = result.filePaths[0];
  if (result.canceled || sourcePath === undefined) return;
  try {
    const imported = customPetStore.importLive2D(sourcePath);
    customPets = customPetStore.load();
    setPet(imported.id);
  } catch (error) {
    dialog.showErrorBox(
      '无法导入 Live2D 宠物',
      error instanceof Error ? error.message : String(error),
    );
  }
}

async function removeCustomPet(pet: CustomPetRecord): Promise<void> {
  if (customPetStore === null) return;
  const result = await dialog.showMessageBox({
    type: 'warning',
    title: '删除自定义宠物',
    message: `确定删除“${pet.label}”吗？`,
    detail: 'PetWhale 保存的副本会被删除，原始图片不受影响。',
    buttons: ['取消', '删除'],
    defaultId: 0,
    cancelId: 0,
  });
  if (result.response !== 1) return;
  try {
    if (petSettings.pet === pet.id) setPet('orb');
    customPetStore.remove(pet.id);
    customPets = customPetStore.load();
    refreshTrayMenu();
  } catch (error) {
    dialog.showErrorBox('无法删除宠物', error instanceof Error ? error.message : String(error));
  }
}

function buildMenu(): Menu {
  const visible = petWindow !== null && !petWindow.isDestroyed() && petWindow.isVisible();
  return Menu.buildFromTemplate([
    {
      label: visible ? '隐藏宠物' : '显示宠物',
      click: () => toggleVisible(),
    },
    {
      label: '锁定位置',
      type: 'checkbox',
      checked: petSettings.locked,
      click: (item) => setLocked(item.checked),
    },
    {
      label: petSettings.size === 'large' ? '切换为小尺寸' : '切换为大尺寸',
      click: () => toggleSize(),
    },
    {
      label: '更换宠物',
      submenu: [
        ...petMenuOptions(petSettings.pet, customPets).map((option) => ({
          label: option.label,
          type: 'radio' as const,
          checked: option.checked,
          click: () => setPet(option.id),
        })),
        { type: 'separator' as const },
        {
          label: '导入图片宠物…',
          click: () => void importCustomPet(),
        },
        {
          label: '导入 Live2D 宠物…',
          click: () => void importLive2DPet(),
        },
      ],
    },
    ...(customPets.length > 0
      ? [{
          label: '删除自定义宠物',
          submenu: customPets.map((pet) => ({
            label: pet.label,
            click: () => void removeCustomPet(pet),
          })),
        }]
      : []),
    { type: 'separator' },
    {
      label: '退出 PetWhale 宠物',
      click: () => app.quit(),
    },
  ]);
}

function createPetWindow(): BrowserWindow {
  const saved = loadPosition();
  const size = PET_SIZES[petSettings.size];
  const window = new BrowserWindow({
    ...size,
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
  window.webContents.on('did-finish-load', () => {
    pushState();
    pushConfig();
  });
  void window.loadFile(join(__dirname, '../renderer/index.html'));
  return window;
}

function openPetWindow(): BrowserWindow {
  if (petWindow !== null && !petWindow.isDestroyed()) return petWindow;
  petWindow = createPetWindow();
  petWindow.on('closed', () => {
    petWindow = null;
  });
  return petWindow;
}

// ---------- IPC ----------

ipcMain.handle('petwhale:quit', () => app.quit());
ipcMain.handle('petwhale:status', () => ({
  ...connectionDiagnostics(),
  locked: petSettings.locked,
  size: petSettings.size,
  pet: petSettings.pet,
}));
ipcMain.on('petwhale:menu', (event) => {
  const menu = buildMenu();
  const window = BrowserWindow.fromWebContents(event.sender);
  if (window !== null) menu.popup({ window });
});
ipcMain.on('petwhale:renderer-error', (_event, message: unknown) => {
  if (typeof message !== 'string' || message.length === 0 || message.length > 500) return;
  const selected = customPets.find((pet) => pet.id === petSettings.pet);
  if (selected?.type !== 'live2d') return;
  if (process.env.PETWINDOW_SELF_TEST === '1') {
    console.error('[self-test] Live2D renderer failed', message);
  } else {
    dialog.showErrorBox('Live2D 宠物加载失败', message);
  }
  setPet('orb');
});

// ---------- app lifecycle ----------

app.whenReady().then(() => {
  if (process.platform === 'darwin') app.dock?.hide();
  customPetStore = new CustomPetStore(join(app.getPath('userData'), CUSTOM_PETS_DIR));
  customPets = customPetStore.load();
  installLive2DProtocol();
  petSettings = loadSettings();
  if (
    petSettings.pet.startsWith('custom:') &&
    !customPets.some((pet) => pet.id === petSettings.pet)
  ) {
    petSettings.pet = 'orb';
    saveSettings();
  }
  const selfTestPet = process.env.PETWINDOW_SELF_TEST_PET;
  if (process.env.PETWINDOW_SELF_TEST === '1' && isPetChoiceId(selfTestPet)) {
    petSettings.pet = selfTestPet;
  }
  const selfTestCustomPath = process.env.PETWINDOW_SELF_TEST_CUSTOM_PET_PATH;
  if (process.env.PETWINDOW_SELF_TEST === '1' && selfTestCustomPath) {
    try {
      if (detectPetImage(readFileSync(selfTestCustomPath)) !== null) {
        selfTestCustomPet = {
          type: 'image',
          id: 'custom:self-test',
          label: '自定义宠物自检',
          src: pathToFileURL(selfTestCustomPath).href,
        };
        petSettings.pet = selfTestCustomPet.id;
      }
    } catch {
      // The regular self-test will report a missing image.
    }
  }
  const selfTestLive2DPath = process.env.PETWINDOW_SELF_TEST_LIVE2D_PATH;
  if (process.env.PETWINDOW_SELF_TEST === '1' && selfTestLive2DPath) {
    try {
      const imported = customPetStore.importLive2D(selfTestLive2DPath);
      customPets = customPetStore.load();
      petSettings.pet = imported.id;
    } catch (error) {
      console.error('[self-test] failed to import Live2D package', error);
    }
  }
  openPetWindow();

  const trayIconPath = join(app.getPath('userData'), TRAY_ICON_FILE);
  try {
    mkdirSync(app.getPath('userData'), { recursive: true });
    writeFileSync(trayIconPath, Buffer.from(TRAY_ICON_BASE64, 'base64'));
  } catch {
    // Tray icon write is best-effort; the tray falls back to an empty icon.
  }
  const icon = nativeImage.createFromPath(trayIconPath);
  if (process.platform === 'darwin') icon.setTemplateImage(true);
  tray = new Tray(icon);
  tray.setToolTip('PetWhale 宠物');
  tray.on('click', () => toggleVisible());
  refreshTrayMenu();

  void connectLoop();
  setInterval(() => {
    void connectLoop();
  }, REDISCOVER_MS);

  if (process.env.PETWINDOW_SELF_TEST === '1') {
    const requestedState = process.env.PETWINDOW_SELF_TEST_STATE;
    const selfTestStates = new Set([
      'idle', 'thinking', 'answering', 'working', 'waiting', 'success', 'error', 'sleeping',
    ]);
    if (requestedState !== undefined && selfTestStates.has(requestedState)) {
      setTimeout(() => {
        if (petWindow !== null && !petWindow.isDestroyed()) {
          petWindow.webContents.send('petwhale:state', {
            ...tracker.getSnapshot(),
            state: requestedState,
            since: Date.now(),
          });
        }
      }, 3000);
    }
    // Self-test: after the active renderer has mounted, sample the canvas or
    // image and the live connection state, then write the verdict to a file
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
            const image = document.querySelector('#pet img');
            const context2d = canvas?.getContext('2d') ?? null;
            const center = canvas && context2d ? Array.from(context2d.getImageData(Math.round(canvas.width/2), Math.round(canvas.height/2), 1, 1).data) : null;
            const live2DReady = canvas?.dataset.renderer === 'live2d' && canvas.width > 0 && canvas.height > 0;
            const imageReady = image ? image.complete && image.naturalWidth > 0 : false;
            const src = document.querySelector('#status')?.textContent ?? '';
            return {
              center,
              live2DReady,
              imageReady,
              petId: image?.dataset.petId ?? canvas?.dataset.petId ?? 'orb',
              companionState: canvas?.dataset.companionState ?? null,
              motionGroup: canvas?.dataset.motionGroup ?? null,
              audioStatus: canvas?.dataset.audioStatus ?? null,
              status: src,
            };
          })()
        `)) as { center: number[] | null; live2DReady: boolean; imageReady: boolean; petId: string; companionState: string | null; motionGroup: string | null; audioStatus: string | null; status: string };
        const requestedState = process.env.PETWINDOW_SELF_TEST_STATE;
        const requireAudio = process.env.PETWINDOW_SELF_TEST_REQUIRE_AUDIO === '1';
        const capture = await window.webContents.capturePage();
        const bitmap = capture.toBitmap();
        let capturePainted = false;
        for (let index = 0; index + 3 < bitmap.length; index += 4) {
          const color = (bitmap[index] ?? 0) + (bitmap[index + 1] ?? 0) + (bitmap[index + 2] ?? 0);
          if ((bitmap[index + 3] ?? 0) > 10 && color > 30) {
            capturePainted = true;
            break;
          }
        }
        const rendered =
          (result.center !== null && (result.center[3] ?? 0) > 10) ||
          result.imageReady ||
          capturePainted;
        const painted = rendered && (
          requestedState === undefined ||
          (result.companionState === requestedState && result.motionGroup !== null)
        ) && (!requireAudio || result.audioStatus === 'started');
        const outcome = {
          passed: painted,
          canvasCenter: result.center,
          live2DReady: result.live2DReady,
          capturePainted,
          imageReady: result.imageReady,
          petId: result.petId,
          companionState: result.companionState,
          motionGroup: result.motionGroup,
          audioStatus: result.audioStatus,
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
