import type { CompanionAction, CompanionSnapshot } from '../state/types';

/**
 * Opaque host-provided surface container. Core never touches it at runtime —
 * DOM and platform details belong to renderers and hosts, which cast to their
 * own container type (Rule 1/2: core knows neither hosts nor renderers).
 */
export type CompanionContainer = object;

export interface CompanionRendererOptions {
  /** Uniform scale multiplier applied by the renderer. */
  scale?: number;
  /** Renderer should avoid animation (prefers-reduced-motion). */
  reducedMotion?: boolean;
}

/**
 * A visual pet implementation (design doc §12). Renderers consume only
 * `CompanionSnapshot` semantics — never Agent events (Rule 4).
 */
export interface CompanionRenderer {
  readonly id: string;

  /** Attach the renderer to a host-provided container. */
  mount(
    container: CompanionContainer,
    options?: CompanionRendererOptions,
  ): Promise<void>;

  /** Render the latest effective snapshot. */
  update(snapshot: CompanionSnapshot): void;

  /** Play a one-shot action gesture. */
  trigger(action: CompanionAction): void;

  /** Resize the surface (host-driven). */
  resize?(width: number, height: number): void;

  /** Pause/resume rendering while hidden (page visibility). */
  setVisible?(visible: boolean): void;

  /** Tear down, release resources (rAF, observers, WebGL…). */
  dispose(): void;
}
