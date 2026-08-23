function finiteCount(value) {
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

export function readRendererFrameDiagnostics(renderer) {
  const render = renderer?.info?.render ?? {};
  const drawCalls = Number.isFinite(render.drawCalls)
    ? render.drawCalls
    : render.calls;

  return {
    drawCalls: finiteCount(drawCalls),
    triangles: finiteCount(render.triangles),
  };
}
