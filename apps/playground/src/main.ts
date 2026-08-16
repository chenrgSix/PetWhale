import {
  CompanionEngine,
  COMPANION_ACTIONS,
  COMPANION_EMOTIONS,
  COMPANION_STATES,
  type CompanionAction,
  type CompanionEmotion,
  type CompanionState,
} from '@petwhale/core';
import { OrbRenderer } from '@petwhale/renderer-orb';
import { MockSource } from './mock-source';
import './style.css';

const petContainer = document.querySelector<HTMLElement>('.pw-pet');
const source = new MockSource();
const engine = new CompanionEngine(source);

const statesGrid = document.querySelector<HTMLElement>('#states');
const emotionsGrid = document.querySelector<HTMLElement>('#emotions');
const actionsGrid = document.querySelector<HTMLElement>('#actions');
const storyButton = document.querySelector<HTMLButtonElement>('#btn-story');
const pauseButton = document.querySelector<HTMLButtonElement>('#btn-pause');
const srcState = document.querySelector<HTMLElement>('#src-state');
const effState = document.querySelector<HTMLElement>('#eff-state');
const activityLine = document.querySelector<HTMLElement>('#activity');
const engineLine = document.querySelector<HTMLElement>('#engine');

function button(label: string, onClick: () => void): HTMLButtonElement {
  const el = document.createElement('button');
  el.textContent = label;
  el.addEventListener('click', onClick);
  return el;
}

for (const state of COMPANION_STATES) {
  statesGrid?.appendChild(
    button(state, () => {
      source.setState(state as CompanionState);
      storyButton!.textContent = '▶ Run agent story';
    }),
  );
}

for (const emotion of COMPANION_EMOTIONS) {
  emotionsGrid?.appendChild(
    button(emotion, () => {
      source.setEmotion(emotion as CompanionEmotion);
    }),
  );
}

for (const action of COMPANION_ACTIONS) {
  actionsGrid?.appendChild(
    button(action, () => {
      engine.trigger(action as CompanionAction);
    }),
  );
}

storyButton?.addEventListener('click', () => {
  if (source.isStoryRunning()) {
    source.stopStory();
    storyButton.textContent = '▶ Run agent story';
  } else {
    source.startStory();
    storyButton.textContent = '⏹ Stop story';
  }
});

let paused = false;
pauseButton?.addEventListener('click', () => {
  paused = !paused;
  engine.setPaused(paused);
  pauseButton.textContent = paused ? '▶ Resume' : '⏸ Pause (hidden)';
});

// Mirror the host behaviour the DSH plugin will wire: pause while hidden.
document.addEventListener('visibilitychange', () => {
  engine.setPaused(document.visibilityState === 'hidden');
});

async function main(): Promise<void> {
  if (!petContainer) throw new Error('missing #pet-whale container');
  await engine.setRenderer(new OrbRenderer(), petContainer, { scale: 1.1 });
  engine.start();
  source.subscribe(() => renderStatus());
  renderStatus();
}

function renderStatus(): void {
  const snapshot = source.getSnapshot();
  srcState!.textContent = snapshot.state;
  effState!.textContent = engine.effectiveState;
  activityLine!.textContent = snapshot.activity?.label
    ? `${snapshot.activity.kind} · ${snapshot.activity.label}`
    : (snapshot.activity?.kind ?? '—');
  engineLine!.textContent = [
    engine.status.started ? 'started' : 'stopped',
    engine.status.paused ? 'paused' : 'live',
    engine.status.rendererId ?? 'no renderer',
  ].join(' · ');
}

void main();
