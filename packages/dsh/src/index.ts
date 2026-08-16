/**
 * @petwhale/dsh — PetWhale client plugin for DeepSeek Harness / Telos
 * (design doc §16–§17).
 *
 * The plugin contributes a PetWhale entry into the frame-wide `shell.overlay`
 * list slot (additive, click-through by default). It follows the official DSH
 * third-party rule: register through `ctx.slots.inject(...)` so the entry
 * waits for the declaration and survives layout rebuilds — it never assumes
 * ui-layout loaded first.
 */
import type { ClientContextCompat } from './client/types/dsh-compat';
import { OVERLAY_ENTRY_ID, PetWhaleOverlay } from './client/overlay';

/** Required services (cordis fiber inject). */
export const inject = ['slots', 'sessions'];

/**
 * Plugin body. M0 registers the placeholder overlay entry; M2 wires the
 * engine + OrbRenderer inside it.
 */
export function apply(ctx: ClientContextCompat): void {
  ctx.slots.inject('shell.overlay', () =>
    ctx.slots.register(
      {
        name: 'shell.overlay',
        id: OVERLAY_ENTRY_ID,
        order: 50,
        label: 'PetWhale',
      },
      PetWhaleOverlay,
    ),
  );
}
