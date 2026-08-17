import type {
  CompanionAction,
  CompanionContainer,
  CompanionRenderer,
  CompanionRendererOptions,
  CompanionSnapshot,
} from '@petwhale/core';
import type { Application as PixiApplication } from 'pixi.js';
import type { Live2DModel as PixiLive2DModel } from 'untitled-pixi-live2d-engine/cubism';
import { type Live2DAudioController, loadLive2DAudio } from './audio';
import { ensureLive2DCubismCore } from './core-loader';
import type { Live2DMotionBinding, Live2DPetManifest } from './manifest';
import {
  type InteractionBounds,
  padInteractionBounds,
  selectHitMotionGroup,
  transformInteractionBounds,
  unionInteractionBounds,
} from './interaction';

let pluginRegistered = false;
const MOTION_SAFETY_PADDING = 0.08;
const IDENTITY_TRANSFORM = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };

interface DrawableVisibilityModel {
  getDrawableOpacity?: (index: number) => number;
  getDrawableDynamicFlagIsVisible?: (index: number) => boolean;
}

export class Live2DRenderer implements CompanionRenderer {
  readonly id: string;

  private readonly pet: Live2DPetManifest;
  private wrapper: HTMLDivElement | null = null;
  private readonly interactionSurfaces = new Map<string, HTMLDivElement>();
  private app: PixiApplication | null = null;
  private model: PixiLive2DModel | null = null;
  private audio: Live2DAudioController | null = null;
  private contentBounds: InteractionBounds | null = null;
  private observer: ResizeObserver | null = null;
  private lastState: CompanionSnapshot['state'] | null = null;
  private motionGeneration = 0;
  private scaleMultiplier = 1;
  private soundEnabled = true;
  private disposed = false;

  constructor(pet: Live2DPetManifest) {
    this.pet = pet;
    this.id = `live2d:${pet.id}`;
  }

  async mount(
    container: CompanionContainer,
    options?: CompanionRendererOptions,
  ): Promise<void> {
    if (this.disposed) return;
    const host = container as HTMLElement;
    this.scaleMultiplier = options?.scale ?? 1;
    const wrapper = document.createElement('div');
    Object.assign(wrapper.style, {
      position: 'absolute',
      inset: '0',
      pointerEvents: 'none',
      overflow: 'hidden',
    });
    host.appendChild(wrapper);
    this.wrapper = wrapper;

    try {
      await ensureLive2DCubismCore();
      if (this.disposed) return;
      await import('pixi.js/unsafe-eval');
      const [{ Application, extensions }, live2d, audio] = await Promise.all([
        import('pixi.js'),
        import('untitled-pixi-live2d-engine/cubism'),
        loadLive2DAudio(),
      ]);
      if (!pluginRegistered) {
        extensions.add(live2d.Live2DPlugin);
        pluginRegistered = true;
      }
      const app = new Application();
      await app.init({
        resizeTo: wrapper,
        preference: 'webgl',
        backgroundAlpha: 0,
        antialias: true,
        autoDensity: true,
        resolution: Math.min(window.devicePixelRatio || 1, 2),
      });
      if (this.disposed) {
        app.destroy({ removeView: true }, { children: true });
        return;
      }
      this.app = app;
      this.audio = audio;
      this.audio.setEnabled(this.soundEnabled);
      wrapper.addEventListener('pointerdown', this.handleAudioUnlock, true);
      app.canvas.dataset.petId = this.pet.id;
      app.canvas.dataset.renderer = 'live2d';
      app.canvas.dataset.soundEnabled = String(this.soundEnabled);
      wrapper.appendChild(app.canvas);
      const model = await live2d.Live2DModel.from(this.pet.modelUrl, {
        ticker: app.ticker,
        textureOptions: { lod: 'single-auto' },
      });
      if (this.disposed) {
        model.destroy({ children: true, texture: true, baseTexture: true });
        return;
      }
      model.anchor.set(0, 0);
      app.stage.addChild(model);
      this.model = model;
      this.contentBounds = this.measureContentBounds();
      options?.onIntrinsicSize?.({
        width: this.contentBounds.width,
        height: this.contentBounds.height,
      });
      model.on('hit', this.handleHitAreas);
      this.mountInteractionSurface(wrapper);
      this.fit();
      this.observer = new ResizeObserver(() => this.fit());
      this.observer.observe(wrapper);
      const idle = this.pet.motions.idle;
      if (idle !== undefined) this.startMotion(idle, true);
    } catch (error) {
      this.dispose();
      throw error;
    }
  }

  update(snapshot: CompanionSnapshot): void {
    if (this.disposed || this.model === null || snapshot.state === this.lastState) return;
    this.lastState = snapshot.state;
    const binding = this.pet.motions[snapshot.state] ?? this.pet.motions.idle;
    if (binding !== undefined) {
      if (this.app !== null) {
        this.app.canvas.dataset.companionState = snapshot.state;
        this.app.canvas.dataset.motionGroup = binding.group;
      }
      this.startMotion(binding, snapshot.state === 'idle');
    }
  }

  trigger(action: CompanionAction): void {
    if (action !== 'poke' || this.model === null) return;
    const group = selectHitMotionGroup([], this.availableMotionGroups());
    if (group !== undefined) this.startMotion({ group }, false);
  }

  resize(): void {
    this.fit();
  }

  setVisible(visible: boolean): void {
    if (this.wrapper !== null) this.wrapper.style.visibility = visible ? 'visible' : 'hidden';
    if (visible) this.app?.ticker.start();
    else this.app?.ticker.stop();
  }

  setSoundEnabled(enabled: boolean): void {
    this.soundEnabled = enabled;
    this.audio?.setEnabled(enabled);
    if (this.app !== null) {
      this.app.canvas.dataset.soundEnabled = String(enabled);
      if (!enabled) this.app.canvas.dataset.audioStatus = 'muted';
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.motionGeneration += 1;
    this.observer?.disconnect();
    this.observer = null;
    this.model?.off('hit', this.handleHitAreas);
    this.model?.destroy({ children: true, texture: true, baseTexture: true });
    this.model = null;
    this.contentBounds = null;
    this.wrapper?.removeEventListener('pointerdown', this.handleAudioUnlock, true);
    this.audio = null;
    this.app?.destroy({ removeView: true }, { children: true });
    this.app = null;
    this.wrapper?.remove();
    this.wrapper = null;
    this.interactionSurfaces.clear();
  }

  private fit(): void {
    if (this.wrapper === null || this.app === null || this.model === null) return;
    const bounds = this.contentBounds ?? this.measureContentBounds();
    const width = bounds.width;
    const height = bounds.height;
    if (width <= 0 || height <= 0) return;
    const scale = Math.min(
      this.wrapper.clientWidth / width,
      this.wrapper.clientHeight / height,
    ) * this.scaleMultiplier;
    this.model.scale.set(scale);
    this.model.position.set(
      this.app.screen.width / 2 - (bounds.x + bounds.width / 2) * scale,
      this.app.screen.height / 2 - (bounds.y + bounds.height / 2) * scale,
    );
    this.updateInteractionBounds();
  }

  private measureContentBounds(): InteractionBounds {
    if (this.model === null) {
      return { x: 0, y: 0, width: 1, height: 1 };
    }
    const internalModel = this.model.internalModel;
    const coreModel = internalModel.coreModel as DrawableVisibilityModel;
    const visibleDrawables: InteractionBounds[] = [];

    for (const id of internalModel.getDrawableIDs()) {
      const index = internalModel.getDrawableIndex(id);
      if (index < 0) continue;
      const opacity = coreModel.getDrawableOpacity?.(index);
      if (opacity !== undefined && opacity <= 0.001) continue;
      if (coreModel.getDrawableDynamicFlagIsVisible?.(index) === false) continue;
      visibleDrawables.push(internalModel.getDrawableBounds(index));
    }

    const canvasBounds = unionInteractionBounds(visibleDrawables) ?? {
      x: 0,
      y: 0,
      width: internalModel.originalWidth,
      height: internalModel.originalHeight,
    };
    const localBounds = transformInteractionBounds(
      canvasBounds,
      internalModel.localTransform,
      IDENTITY_TRANSFORM,
    );
    return padInteractionBounds(localBounds, MOTION_SAFETY_PADDING);
  }

  private mountInteractionSurface(wrapper: HTMLDivElement): void {
    if (this.model === null) return;
    for (const hitArea of Object.keys(this.model.internalModel.hitAreas)) {
      const surface = document.createElement('div');
      surface.dataset.live2dInteraction = 'true';
      surface.dataset.hitArea = hitArea;
      surface.setAttribute('role', 'button');
      surface.setAttribute('aria-label', `Interact with ${this.pet.label}: ${hitArea}`);
      Object.assign(surface.style, {
        position: 'absolute',
        pointerEvents: 'auto',
        WebkitAppRegion: 'no-drag',
        cursor: 'pointer',
        touchAction: 'manipulation',
      });
      surface.addEventListener('click', this.handleInteractionClick);
      wrapper.appendChild(surface);
      this.interactionSurfaces.set(hitArea, surface);
    }
  }

  private readonly handleInteractionClick = (event: MouseEvent): void => {
    if (event.button !== 0 || this.model === null) return;
    const surface = event.currentTarget;
    if (!(surface instanceof HTMLElement)) return;
    const hitArea = surface.dataset.hitArea;
    if (hitArea === undefined) return;
    this.handleHitAreas([hitArea]);
  };

  private readonly handleAudioUnlock = (): void => {
    void this.audio?.resume();
  };

  private readonly handleHitAreas = (hitAreas: string[]): void => {
    if (hitAreas.length === 0 || this.model === null) return;
    const hitArea = hitAreas[0];
    if (this.app !== null) this.app.canvas.dataset.hitArea = hitArea;

    const group = selectHitMotionGroup(hitAreas, this.availableMotionGroups());
    if (group !== undefined) {
      if (this.app !== null) this.app.canvas.dataset.motionGroup = group;
      this.startMotion({ group }, false);
      return;
    }

    void this.model.expression().catch((error: unknown) => {
      console.error('[Live2DRenderer] failed to play hit expression', error);
    });
  };

  private availableMotionGroups(): string[] {
    if (this.model === null) return [];
    return Object.keys(this.model.internalModel.motionManager.motionGroups);
  }

  private updateInteractionBounds(): void {
    if (this.interactionSurfaces.size === 0 || this.app === null || this.model === null) return;
    this.model.getBounds();
    const internalModel = this.model.internalModel;
    for (const [name, surface] of this.interactionSurfaces) {
      const hitArea = internalModel.hitAreas[name];
      let index = hitArea?.index ?? -1;
      if (index < 0 && hitArea !== undefined) {
        index = internalModel.getDrawableIndex(hitArea.id);
        hitArea.index = index;
      }
      if (index < 0) {
        surface.hidden = true;
        continue;
      }
      const bounds = transformInteractionBounds(
        internalModel.getDrawableBounds(index),
        internalModel.localTransform,
        this.model.worldTransform,
      );
      const left = Math.max(0, bounds.x);
      const top = Math.max(0, bounds.y);
      const right = Math.min(this.app.screen.width, bounds.x + bounds.width);
      const bottom = Math.min(this.app.screen.height, bounds.y + bounds.height);
      surface.hidden = right <= left || bottom <= top;
      Object.assign(surface.style, {
        left: `${left}px`,
        top: `${top}px`,
        width: `${Math.max(0, right - left)}px`,
        height: `${Math.max(0, bottom - top)}px`,
      });
    }
  }

  private startMotion(binding: Live2DMotionBinding, idle: boolean): void {
    const generation = ++this.motionGeneration;
    void this.play(binding, idle, generation).catch((error: unknown) => {
      console.error('[Live2DRenderer] failed to play motion', error);
    });
  }

  private async play(
    binding: Live2DMotionBinding,
    idle: boolean,
    generation: number,
  ): Promise<void> {
    if (this.model === null) return;
    await this.audio?.resume();
    const { MotionPriority } = await import('untitled-pixi-live2d-engine/cubism');
    if (this.disposed || generation !== this.motionGeneration || this.model === null) return;
    const started = await this.model.motion(
      binding.group,
      binding.index,
      idle ? MotionPriority.IDLE : MotionPriority.FORCE,
      {
        loop: binding.loop ?? idle,
        onError: (error) => {
          if (this.app !== null) this.app.canvas.dataset.audioStatus = 'error';
          console.error('[Live2DRenderer] failed to play motion audio', error);
        },
      },
    );
    if (
      this.app !== null
      && generation === this.motionGeneration
      && started
      && this.app.canvas.dataset.audioStatus !== 'error'
    ) {
      this.app.canvas.dataset.audioStatus = this.soundEnabled
        ? this.model.internalModel.motionManager.currentAudio === undefined ? 'none' : 'started'
        : 'muted';
    }
  }
}
