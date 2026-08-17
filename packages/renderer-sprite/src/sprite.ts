import type {
  CompanionAction,
  CompanionContainer,
  CompanionRenderer,
  CompanionRendererOptions,
  CompanionSnapshot,
} from '@petwhale/core';
import { animationForState } from './animations';

export interface SpritePetManifest {
  id: string;
  label: string;
  src: string;
}

export interface SpriteRendererOptions extends CompanionRendererOptions {
  /** Percentage of the host surface occupied by the character. */
  fit?: number;
}

export class SpriteRenderer implements CompanionRenderer {
  readonly id: string;

  private readonly pet: SpritePetManifest;
  private wrapper: HTMLDivElement | null = null;
  private image: HTMLImageElement | null = null;
  private animation: Animation | null = null;
  private reducedMotion = false;
  private disposed = false;
  private lastState: CompanionSnapshot['state'] | null = null;

  constructor(pet: SpritePetManifest) {
    this.pet = pet;
    this.id = `sprite:${pet.id}`;
  }

  async mount(
    container: CompanionContainer,
    options?: SpriteRendererOptions,
  ): Promise<void> {
    if (this.disposed) return;
    const host = container as HTMLElement;
    const scale = options?.scale ?? 1;
    const fit = options?.fit ?? 0.88;
    this.reducedMotion = options?.reducedMotion ?? false;

    const wrapper = document.createElement('div');
    Object.assign(wrapper.style, {
      position: 'absolute',
      inset: '0',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      pointerEvents: 'none',
      transform: `scale(${scale})`,
      transformOrigin: 'center bottom',
    });

    const image = document.createElement('img');
    image.alt = this.pet.label;
    image.draggable = false;
    image.dataset.petId = this.pet.id;
    Object.assign(image.style, {
      width: `${fit * 100}%`,
      height: `${fit * 100}%`,
      objectFit: 'contain',
      transformOrigin: 'center bottom',
      userSelect: 'none',
      WebkitUserDrag: 'none',
      filter: 'drop-shadow(0 8px 10px rgba(0, 0, 0, 0.28))',
    });
    image.addEventListener('load', () => {
      if (image.naturalWidth > 0 && image.naturalHeight > 0) {
        options?.onIntrinsicSize?.({
          width: image.naturalWidth,
          height: image.naturalHeight,
        });
      }
    }, { once: true });
    image.src = this.pet.src;

    wrapper.appendChild(image);
    host.appendChild(wrapper);
    this.wrapper = wrapper;
    this.image = image;
  }

  update(snapshot: CompanionSnapshot): void {
    if (this.disposed || !this.image || snapshot.state === this.lastState) return;
    this.lastState = snapshot.state;
    this.animation?.cancel();
    this.animation = null;

    this.image.style.filter =
      snapshot.state === 'error'
        ? 'drop-shadow(0 8px 12px rgba(255, 70, 90, 0.55))'
        : snapshot.state === 'success'
          ? 'drop-shadow(0 8px 14px rgba(80, 255, 180, 0.55))'
          : 'drop-shadow(0 8px 10px rgba(0, 0, 0, 0.28))';

    if (this.reducedMotion || typeof this.image.animate !== 'function') return;
    const spec = animationForState(snapshot.state);
    this.animation = this.image.animate(spec.keyframes, spec.options);
  }

  trigger(_action: CompanionAction): void {}

  setVisible(visible: boolean): void {
    if (this.wrapper) this.wrapper.style.visibility = visible ? 'visible' : 'hidden';
    if (!visible) this.animation?.pause();
    else this.animation?.play();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.animation?.cancel();
    this.animation = null;
    this.wrapper?.remove();
    this.wrapper = null;
    this.image = null;
    this.lastState = null;
  }
}
