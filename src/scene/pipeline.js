export async function loadScenePipeline(rendererMode) {
  if (rendererMode === 'webgpu') {
    const [skyModule, oceanModule, raysModule] = await Promise.all([
      import('./sky-webgpu.js'),
      import('./ocean-webgpu.js'),
      import('./underwater-rays-webgpu.js'),
    ]);
    return {
      createSky: skyModule.createWebGpuSky,
      createOcean: oceanModule.createWebGpuOcean,
      createUnderwaterRays: raysModule.createWebGpuUnderwaterRays,
    };
  }

  const [skyModule, oceanModule, raysModule] = await Promise.all([
    import('./sky.js'),
    import('./ocean.js'),
    import('./underwater-rays.js'),
  ]);
  return {
    createSky: skyModule.createSky,
    createOcean: oceanModule.createOcean,
    createUnderwaterRays: raysModule.createUnderwaterRays,
  };
}
