import type {
  CompanionAction,
  CompanionContainer,
  CompanionRenderer,
  CompanionRendererOptions,
  CompanionSnapshot,
} from '@petwhale/core';
import type { Application as PixiApplication } from 'pixi.js';
import type { Live2DModel as PixiLive2DModel } from 'untitled-pixi-live2d-engine/cubism';
import { ensureLive2DCubismCore } from './core-loader';
import type { Live2DMotionBinding, Live2DPetManifest } from './manifest';
import { selectHitMotionGroup, transformInteractionBounds } from './interaction';

let pluginRegistered = false;

export class Live2DRenderer implements CompanionRenderer {
  readonly id: string;

  private readonly pet: Live2DPetManifest;
  private wrapper: HTMLDivElement | null = null;
  private readonly interactionSurfaces = new Map<string, HTMLDivElement>();
  private app: PixiApplication | null = null;
  private model: PixiLive2DModel | null = null;
  private observer: ResizeObserver | null = null;
  private lastState: CompanionSnapshot['state'] | null = null;
  private motionGeneration = 0;
  private scaleMultiplier = 1;
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
      const [{ Application, extensions }, live2d] = await Promise.all([
        import('pixi.js'),
        import('untitled-pixi-live2d-engine/cubism'),
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
      app.canvas.dataset.petId = this.pet.id;
      app.canvas.dataset.renderer = 'live2d';
      wrapper.appendChild(app.canvas);
      const model = await live2d.Live2DModel.from(this.pet.modelUrl, {
        ticker: app.ticker,
        textureOptions: { lod: 'single-auto' },
      });
      if (this.disposed) {
        model.destroy({ children: true, texture: true, baseTexture: true });
        return;
      }
      model.anchor.set(0.5, 0.5);
      app.stage.addChild(model);
      this.model = model;
      options?.onIntrinsicSize?.({
        width: model.internalModel.originalWidth,
        height: model.internalModel.originalHeight,
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

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.motionGeneration += 1;
    this.observer?.disconnect();
    this.observer = null;
    this.model?.off('hit', this.handleHitAreas);
    this.model?.destroy({ children: true, texture: true, baseTexture: true });
    this.model = null;
    this.app?.destroy({ removeView: true }, { children: true });
    this.app = null;
    this.wrapper?.remove();
    this.wrapper = null;
    this.interactionSurfaces.clear();
  }

  private fit(): void {
    if (this.wrapper === null || this.app === null || this.model === null) return;
    const bounds = this.model.getLocalBounds();
    const width = bounds.width;
    const height = bounds.height;
    if (width <= 0 || height <= 0) return;
    const scale = Math.min(
      (this.wrapper.clientWidth * 0.92) / width,
      (this.wrapper.clientHeight * 0.94) / height,
    ) * this.scaleMultiplier;
    this.model.scale.set(scale);
    this.model.position.set(this.app.screen.width / 2, this.app.screen.height / 2);
    this.updateInteractionBounds();
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
    if (event.button !== 0 || this.app === null || this.model === null) return;
    const canvasBounds = this.app.canvas.getBoundingClientRect();
    if (canvasBounds.width <= 0 || canvasBounds.height <= 0) return;
    const x = ((event.clientX - canvasBounds.left) / canvasBounds.width) * this.app.screen.width;
    const y = ((event.clientY - canvasBounds.top) / canvasBounds.height) * this.app.screen.height;
    this.model.tap(x, y);
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
    const { MotionPriority } = await import('untitled-pixi-live2d-engine/cubism');
    if (this.disposed || generation !== this.motionGeneration || this.model === null) return;
    await this.model.motion(
      binding.group,
      binding.index,
      idle ? MotionPriority.IDLE : MotionPriority.FORCE,
      { loop: binding.loop ?? idle },
    );
  }
}
