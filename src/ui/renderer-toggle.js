import {
  persistRendererPreference,
  RENDERER_MODES,
} from '../core/renderer.js';

export function createRendererToggle(root, rendererInfo) {
  const buttons = [...root.querySelectorAll('[data-renderer-mode]')];
  const status = root.querySelector('[data-renderer-status]');
  root.dataset.rendererPipeline = rendererInfo.pipeline;
  root.dataset.rendererBackend = rendererInfo.backend;
  root.dataset.rendererAdapter = rendererInfo.adapterName ?? '';

  for (const button of buttons) {
    const active = button.dataset.rendererMode === rendererInfo.pipeline;
    button.setAttribute('aria-pressed', String(active));
    button.classList.toggle('is-active', active);
    button.addEventListener('click', () => {
      const nextMode = button.dataset.rendererMode;
      if (!RENDERER_MODES.includes(nextMode) || nextMode === rendererInfo.pipeline) return;
      persistRendererPreference(nextMode);
      const nextUrl = new URL(window.location.href);
      nextUrl.searchParams.set('renderer', nextMode);
      window.location.assign(nextUrl);
    });
  }

  if (status) {
    status.textContent = rendererInfo.backend === 'webgpu'
      ? 'WebGPU active'
      : rendererInfo.pipeline === 'webgpu'
        ? 'WebGPU pipeline - WebGL 2 fallback'
        : 'WebGL 2 active';
  }

  root.hidden = false;
}
