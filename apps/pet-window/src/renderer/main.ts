import { CompanionEngine } from '@petwhale/core';
import { OrbRenderer } from '@petwhale/renderer-orb';
import { IpcPetSource } from './pet-source';

declare global {
  interface Window {
    petwhale?: {
      onState: (callback: (snapshot: unknown) => void) => () => void;
      status: () => Promise<unknown>;
      quit: () => Promise<void>;
      showMenu: () => void;
    };
  }
}

const statusEl = document.getElementById('status') as HTMLElement;
const container = document.getElementById('pet') as HTMLElement;

const source = new IpcPetSource();
const engine = new CompanionEngine(source, {
  behaviorPolicy: { sleepAfterMs: 3 * 60_000 },
});

const renderer = new OrbRenderer();
void engine.setRenderer(renderer, container, { scale: 1.5 });

engine.start();
source.start();

// Surface the current state for diagnostics and the self-test.
setInterval(() => {
  statusEl.textContent = JSON.stringify({
    state: engine.effectiveState,
    source: source.getSnapshot().state,
  });
}, 500);

// Right-click → native context menu (quit affordance).
container.addEventListener('contextmenu', (event) => {
  event.preventDefault();
  window.petwhale?.showMenu();
});
