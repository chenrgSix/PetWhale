import type {
  CompanionAction,
  CompanionContainer,
  CompanionRenderer,
  CompanionRendererOptions,
  CompanionSnapshot,
} from '@petwhale/core';
import {
  animationForState,
  EMOTION_ACCENTS,
  easeOutBack,
  easeOutCubic,
  fpsForState,
  phase,
  STATE_COLORS,
  TAU,
  type OrbAnimation,
} from './visuals';

export interface OrbRendererOptions extends CompanionRendererOptions {
  /** Base orb radius in CSS px (default: 40% of the smaller container side). */
  radius?: number;
}

const SHAKE_DURATION_MS = 450;
const BURST_DURATION_MS = 650;

/**
 * The MVP visual pet: a canvas orb whose animation follows the companion
 * state (design doc §26). It validates the whole pipeline
 * (host → source → core → scheduler → renderer → shell.overlay) before any
 * Live2D work begins. The orb is decorative in M0 — the surface stays
 * click-through until interaction lands (M9).
 */
export class OrbRenderer implements CompanionRenderer {
  readonly id = 'orb';

  private container: HTMLElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private rafHandle = 0;
  private running = false;
  private visible = true;
  private reducedMotion = false;
  private disposed = false;

  private snapshot: CompanionSnapshot | null = null;
  private stateEnteredAt = 0;
  private animation: OrbAnimation = 'none';
  private frameBudgetMs = 1000 / 24;
  private lastFrameTime = 0;
  private baseRadius = 64;
  private scale = 1;

  async mount(
    container: CompanionContainer,
    options?: OrbRendererOptions,
  ): Promise<void> {
    if (this.disposed) return;
    this.container = container as HTMLElement;
    this.scale = options?.scale ?? 1;
    if (options?.radius) this.baseRadius = options.radius;
    this.reducedMotion = options?.reducedMotion ?? false;

    const canvas = document.createElement('canvas');
    canvas.style.position = 'absolute';
    canvas.style.inset = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.pointerEvents = 'none';
    this.container.appendChild(canvas);
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');

    this.applySize();
    this.resizeObserver = new ResizeObserver(() => this.applySize());
    this.resizeObserver.observe(this.container);

    if (this.reducedMotion) {
      // Static frame only — no animation loop.
      this.renderFrame(performance.now());
      return;
    }
    this.startLoop();
  }

  update(snapshot: CompanionSnapshot): void {
    if (this.disposed) return;
    const previousState = this.snapshot?.state;
    this.snapshot = snapshot;
    if (previousState !== snapshot.state) {
      this.stateEnteredAt = performance.now();
      this.animation = animationForState(snapshot.state);
      this.frameBudgetMs = 1000 / fpsForState(snapshot.state);
    }
  }

  trigger(_action: CompanionAction): void {
    // Interaction (poke/wave/…) lands in M9; nothing to do yet.
  }

  resize(width: number, height: number): void {
    void width;
    void height;
    this.applySize();
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    if (this.reducedMotion) return;
    if (visible && !this.running && !this.disposed) this.startLoop();
    else if (!visible) this.stopLoop();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stopLoop();
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.canvas?.remove();
    this.canvas = null;
    this.ctx = null;
    this.container = null;
  }

  private startLoop(): void {
    if (this.running) return;
    this.running = true;
    this.lastFrameTime = 0;
    this.rafHandle = requestAnimationFrame((t) => this.loop(t));
  }

  private stopLoop(): void {
    this.running = false;
    if (this.rafHandle !== 0) {
      cancelAnimationFrame(this.rafHandle);
      this.rafHandle = 0;
    }
  }

  private loop(time: number): void {
    if (!this.running || this.disposed) return;
    const delta = this.lastFrameTime === 0 ? 0 : time - this.lastFrameTime;
    if (delta >= this.frameBudgetMs) {
      this.lastFrameTime = time;
      this.renderFrame(time);
    }
    this.rafHandle = requestAnimationFrame((t) => this.loop(t));
  }

  private applySize(): void {
    if (!this.canvas || !this.container) return;
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  private renderFrame(time: number): void {
    const ctx = this.ctx;
    const canvas = this.canvas;
    if (!ctx || !canvas || !this.visible) return;

    const width = canvas.width / Math.min(window.devicePixelRatio || 1, 3);
    const height = canvas.height / Math.min(window.devicePixelRatio || 1, 3);
    ctx.clearRect(0, 0, width, height);

    const snapshot = this.snapshot;
    if (!snapshot) return;

    const colors = STATE_COLORS[snapshot.state];
    const centerX = width / 2;
    const centerY = height / 2;
    const baseRadius =
      Math.min(width, height) / 2 * 0.4 * this.scale * (this.baseRadius / 64);

    const elapsed = time - this.stateEnteredAt;
    const animation = this.animation;
    const reduced = this.reducedMotion;

    let radius = baseRadius;
    let glowAlpha = 0.5;
    let shakeX = 0;

    switch (animation) {
      case 'breathe': {
        // idle → slow breathing
        const breathe = 1 + 0.05 * Math.sin((time / 3000) * TAU);
        radius *= breathe;
        glowAlpha = 0.4 + 0.1 * Math.sin((time / 3000) * TAU);
        break;
      }
      case 'pulse': {
        // thinking → soft pulse
        const pulse = 1 + 0.07 * Math.sin((time / 800) * TAU);
        radius *= pulse;
        glowAlpha = 0.45 + 0.25 * Math.sin((time / 800) * TAU);
        break;
      }
      case 'ripple':
        break;
      case 'spin':
        break;
      case 'blink': {
        const p = phase(time, 2200);
        const alpha = p < 0.82 ? 1 : 1 - easeOutCubic((p - 0.82) / 0.18);
        glowAlpha *= alpha;
        break;
      }
      case 'burst': {
        const progress = Math.min(1, elapsed / BURST_DURATION_MS);
        radius *= 1 + 0.18 * Math.sin(Math.PI * progress);
        break;
      }
      case 'shake': {
        const progress = Math.min(1, elapsed / SHAKE_DURATION_MS);
        const amplitude = 7 * (1 - easeOutCubic(progress));
        shakeX = Math.sin((elapsed / 34) * TAU) * amplitude;
        break;
      }
      case 'none':
        break;
    }

    ctx.save();
    ctx.translate(centerX + shakeX, centerY);

    // Halo glow.
    const glow = ctx.createRadialGradient(0, 0, radius * 0.4, 0, 0, radius * 1.7);
    glow.addColorStop(0, colors.halo + '55');
    glow.addColorStop(1, colors.halo + '00');
    ctx.fillStyle = glow;
    ctx.globalAlpha = reduced ? 0.8 : glowAlpha;
    ctx.beginPath();
    ctx.arc(0, 0, radius * 1.7, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;

    // Orb body.
    const body = ctx.createRadialGradient(
      -radius * 0.3,
      -radius * 0.3,
      radius * 0.1,
      0,
      0,
      radius,
    );
    body.addColorStop(0, colors.core);
    body.addColorStop(0.7, colors.halo);
    body.addColorStop(1, colors.halo + 'cc');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, TAU);
    ctx.fill();

    if (!reduced) {
      switch (animation) {
        case 'ripple': {
          // answering → expanding rings
          for (let i = 0; i < 2; i++) {
            const p = phase(time + i * 700, 1400);
            const ringRadius = radius * (1 + p * 0.6);
            ctx.strokeStyle = colors.accent;
            ctx.globalAlpha = (1 - p) * 0.55;
            ctx.lineWidth = 2.5 * (1 - p) + 0.5;
            ctx.beginPath();
            ctx.arc(0, 0, ringRadius, 0, TAU);
            ctx.stroke();
          }
          ctx.globalAlpha = 1;
          break;
        }
        case 'spin': {
          // working → orbiting satellites on a tilted ring
          ctx.save();
          ctx.rotate(-0.5);
          ctx.strokeStyle = colors.accent + '66';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.ellipse(0, 0, radius * 1.35, radius * 0.55, 0, 0, TAU);
          ctx.stroke();
          for (let i = 0; i < 2; i++) {
            const angle = phase(time + i * 400, 900) * TAU;
            const x = Math.cos(angle) * radius * 1.35;
            const y = Math.sin(angle) * radius * 0.55;
            ctx.fillStyle = colors.accent;
            ctx.beginPath();
            ctx.arc(x, y, radius * 0.11, 0, TAU);
            ctx.fill();
          }
          ctx.restore();
          break;
        }
        case 'burst': {
          // success → ring burst
          const progress = Math.min(1, elapsed / BURST_DURATION_MS);
          const ringRadius = radius * (1 + easeOutCubic(progress) * 1.2);
          ctx.strokeStyle = colors.accent;
          ctx.globalAlpha = (1 - progress) * 0.8;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(0, 0, ringRadius, 0, TAU);
          ctx.stroke();
          ctx.globalAlpha = 1;
          break;
        }
        default:
          break;
      }
    }

    // Emotion accent: a small inner dot tinted by the current emotion.
    const accent = EMOTION_ACCENTS[snapshot.emotion];
    ctx.fillStyle = accent;
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.arc(0, radius * 0.32, radius * 0.16, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;

    // Success settle: overshoot ring (uses the same burst window).
    if (animation === 'burst') {
      const progress = Math.min(1, elapsed / BURST_DURATION_MS);
      ctx.strokeStyle = colors.accent + 'aa';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, radius * easeOutBack(progress), 0, TAU);
      ctx.stroke();
    }

    ctx.restore();
  }
}
