export const LIVE2D_CUBISM_CORE_URL =
  'https://cubism.live2d.com/sdk-web/core/05/live2dcubismcore.min.js';

declare global {
  interface Window {
    Live2DCubismCore?: unknown;
  }
}

let pending: Promise<void> | null = null;

export function ensureLive2DCubismCore(): Promise<void> {
  if (window.Live2DCubismCore !== undefined) return Promise.resolve();
  if (pending !== null) return pending;
  pending = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = LIVE2D_CUBISM_CORE_URL;
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.addEventListener('load', () => {
      if (window.Live2DCubismCore === undefined) {
        pending = null;
        reject(new Error('Live2D Cubism Core 加载完成但未正确初始化'));
        return;
      }
      resolve();
    }, { once: true });
    script.addEventListener('error', () => {
      pending = null;
      script.remove();
      reject(new Error('无法从 Live2D 官方服务加载 Cubism Core，请检查网络连接'));
    }, { once: true });
    document.head.appendChild(script);
  });
  return pending;
}
