import { CompanionEngine } from '@petwhale/core';
import {
  Live2DRenderer,
  isLive2DPetManifest,
} from '@petwhale/renderer-live2d';
import { OrbRenderer } from '@petwhale/renderer-orb';
import {
  SpriteRenderer,
  isCustomPetId,
  isCustomPetManifest,
  isSpritePetId,
  spritePetById,
} from '@petwhale/renderer-sprite';
import { isPetChoiceId, type PetChoiceId } from '@petwhale/electron-host/settings';
import { IpcPetSource } from './pet-source';

declare global {
  interface Window {
    petwhale?: {
      onState: (callback: (snapshot: unknown) => void) => () => void;
      onConfig: (callback: (config: unknown) => void) => () => void;
      status: () => Promise<unknown>;
      quit: () => Promise<void>;
      showMenu: () => void;
      reportRendererError: (message: string) => void;
    };
  }
}

const statusEl = document.getElementById('status') as HTMLElement;
const labelEl = document.getElementById('label') as HTMLElement;
const container = document.getElementById('pet') as HTMLElement;

const source = new IpcPetSource();
const engine = new CompanionEngine(source, {
  behaviorPolicy: { sleepAfterMs: 3 * 60_000 },
});

let activePet: PetChoiceId | null = null;
let rendererGeneration = 0;

async function setPet(
  pet: PetChoiceId,
  customPet?: unknown,
): Promise<void> {
  const imagePet = isCustomPetManifest(customPet) && customPet.id === pet ? customPet : undefined;
  const live2DPet = isLive2DPetManifest(customPet) && customPet.id === pet ? customPet : undefined;
  if (isCustomPetId(pet) && imagePet === undefined && live2DPet === undefined) pet = 'orb';
  if (pet === activePet) return;
  activePet = pet;
  const generation = ++rendererGeneration;
  const renderer = live2DPet !== undefined
    ? new Live2DRenderer(live2DPet)
    : isCustomPetId(pet) && imagePet !== undefined
    ? new SpriteRenderer(imagePet)
    : isSpritePetId(pet)
      ? new SpriteRenderer(spritePetById(pet))
      : new OrbRenderer();
  try {
    await engine.setRenderer(renderer, container, { scale: pet === 'orb' ? 1.5 : 1 });
    if (generation !== rendererGeneration) renderer.dispose();
  } catch (error) {
    console.error('[pet-window] failed to mount renderer', error);
    window.petwhale?.reportRendererError(
      error instanceof Error ? error.message : String(error),
    );
    renderer.dispose();
    if (generation === rendererGeneration && pet !== 'orb') {
      activePet = null;
      await setPet('orb');
    }
  }
}

void setPet('orb');

engine.start();
source.start();

// Apply live window config (position lock) from the main process.
window.petwhale?.onConfig((config) => {
  const { locked, pet, customPet } = config as {
    locked?: boolean;
    pet?: unknown;
    customPet?: unknown;
  };
  document.body.classList.toggle('locked', locked === true);
  if (isPetChoiceId(pet)) {
    void setPet(pet, customPet);
  }
});

// Surface the current state for diagnostics and the self-test.
setInterval(() => {
  statusEl.textContent = JSON.stringify({
    state: engine.effectiveState,
    source: source.getSnapshot().state,
  });
}, 500);

// Activity label: the tool name while working, the state name otherwise.
setInterval(() => {
  const snap = source.getSnapshot();
  const text =
    snap.activity?.label ??
    (snap.state !== 'idle' && snap.state !== 'sleeping' ? snap.state : '');
  labelEl.textContent = text;
  labelEl.style.opacity = text ? '1' : '0';
}, 250);

// Right-click → native context menu (quit affordance).
container.addEventListener('contextmenu', (event) => {
  event.preventDefault();
  window.petwhale?.showMenu();
});
