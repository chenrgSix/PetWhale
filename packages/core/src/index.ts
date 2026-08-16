// Public API of @petwhale/core (design doc §7: TypeScript only, no DOM, no
// host, no renderer knowledge).

export * from './state/types';
export * from './state/priority';

export * from './behavior/policy';
export { BehaviorScheduler } from './behavior/scheduler';
export type { SchedulerListener } from './behavior/scheduler';

export type { CompanionSource } from './source/types';

export type {
  CompanionContainer,
  CompanionRenderer,
  CompanionRendererOptions,
} from './renderer/types';

export { CompanionEngine, DEFAULT_RENDER_POLICY } from './engine/engine';
export type {
  CompanionEngineOptions,
  EngineStatus,
  RenderPolicy,
} from './engine/engine';
