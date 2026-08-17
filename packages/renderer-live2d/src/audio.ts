interface AudioContextLike {
  state: string;
  resume(): Promise<void>;
}

interface SoundLibraryLike {
  disableAutoPause: boolean;
  context?: {
    audioContext?: AudioContextLike;
  };
}

export interface Live2DAudioController {
  resume(): Promise<boolean>;
}

export function configureLive2DAudio(
  sound: SoundLibraryLike,
): Live2DAudioController {
  sound.disableAutoPause = true;
  return {
    async resume(): Promise<boolean> {
      const context = sound.context?.audioContext;
      if (context === undefined || context.state === 'running') return true;
      try {
        await context.resume();
        return true;
      } catch {
        return false;
      }
    },
  };
}

export async function loadLive2DAudio(): Promise<Live2DAudioController> {
  const { sound } = await import('@pixi/sound');
  return configureLive2DAudio(sound);
}
