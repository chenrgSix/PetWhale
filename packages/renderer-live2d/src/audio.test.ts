import { describe, expect, it, vi } from 'vitest';
import { configureLive2DAudio } from './audio';

describe('configureLive2DAudio', () => {
  it('keeps motion audio active when the companion window loses focus', () => {
    const sound = { disableAutoPause: false };
    configureLive2DAudio(sound);
    expect(sound.disableAutoPause).toBe(true);
  });

  it('resumes a suspended WebAudio context on pet interaction', async () => {
    const resume = vi.fn(async () => undefined);
    const controller = configureLive2DAudio({
      disableAutoPause: false,
      context: { audioContext: { state: 'suspended', resume } },
    });
    await expect(controller.resume()).resolves.toBe(true);
    expect(resume).toHaveBeenCalledOnce();
  });

  it('does not interrupt the motion when audio cannot be resumed', async () => {
    const controller = configureLive2DAudio({
      disableAutoPause: false,
      context: {
        audioContext: {
          state: 'suspended',
          resume: async () => { throw new Error('blocked'); },
        },
      },
    });
    await expect(controller.resume()).resolves.toBe(false);
  });

  it('mutes and unmutes all Live2D motion audio', async () => {
    const muteAll = vi.fn();
    const unmuteAll = vi.fn();
    const resume = vi.fn(async () => undefined);
    const controller = configureLive2DAudio({
      disableAutoPause: false,
      muteAll,
      unmuteAll,
      context: { audioContext: { state: 'suspended', resume } },
    });

    controller.setEnabled(false);
    await expect(controller.resume()).resolves.toBe(true);
    expect(muteAll).toHaveBeenCalledOnce();
    expect(resume).not.toHaveBeenCalled();

    controller.setEnabled(true);
    await expect(controller.resume()).resolves.toBe(true);
    expect(unmuteAll).toHaveBeenCalledOnce();
    expect(resume).toHaveBeenCalledOnce();
  });
});
