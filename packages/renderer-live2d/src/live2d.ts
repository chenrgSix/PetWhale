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

let pluginRegistered = false;

export class Live2DRenderer implements CompanionRenderer {
  readonly id: string;

  private readonly pet: Live2DPetManifest;
  private wrapper: HTMLDivElement | null = null;
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

  trigger(_action: CompanionAction): void {}

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
    this.model?.destroy({ children: true, texture: true, baseTexture: true });
    this.model = null;
    this.app?.destroy({ removeView: true }, { children: true });
    this.app = null;
    this.wrapper?.remove();
    this.wrapper = null;
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
