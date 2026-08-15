function nextPaint() {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

export function createLoadingController(app) {
  const loader = app.querySelector('.loader');
  const status = loader?.querySelector('.loader__status');
  let progress = 0;

  function setStage(nextProgress, message) {
    progress = Math.max(progress, Math.min(nextProgress, 1));
    loader?.style.setProperty('--loader-progress', String(progress));
    if (status && message) status.textContent = message;
  }

  return {
    setStage,
    async paint(nextProgress, message) {
      setStage(nextProgress, message);
      await nextPaint();
    },
    async reveal() {
      setStage(1, 'Open water ready');
      await nextPaint();
      app.classList.add('is-ready');
    },
    fail(message = 'Unable to start WebGL') {
      if (status) status.textContent = message;
      loader?.classList.add('loader--error');
    },
  };
}
