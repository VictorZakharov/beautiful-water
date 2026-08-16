# Beautiful Water

[![CI](https://github.com/VictorZakharov/beautiful-water/actions/workflows/ci.yml/badge.svg)](https://github.com/VictorZakharov/beautiful-water/actions/workflows/ci.yml)
[![Deploy GitHub Pages](https://github.com/VictorZakharov/beautiful-water/actions/workflows/deploy-pages.yml/badge.svg)](https://github.com/VictorZakharov/beautiful-water/actions/workflows/deploy-pages.yml)
[![MIT License](https://img.shields.io/badge/license-MIT-34b7a7.svg)](LICENSE)

A cinematic, full-screen shallow-ocean environment rendered with Three.js. It combines a
directional procedural wave spectrum with physically grounded surface lighting, a responsive
navigation buoy, and an explorable underwater habitat. WebGPU is the default renderer, with a
persistent in-scene WebGL toggle and automatic WebGL 2 fallback when native WebGPU is unavailable.

[![Beautiful Water running in the browser](docs/open-water.jpg)](https://victorzakharov.github.io/beautiful-water/)

**[Open the live demo](https://victorzakharov.github.io/beautiful-water/)**

## A two-day build and effort-estimation case study

The complete project—from the initial water prototype through dual WebGPU/WebGL renderers,
underwater behavior, automated visual regression, performance adaptation, and publishing—was
developed in **two days of intensive human-AI collaboration**. That unusually short delivery
window makes the repository useful both as a pretty public graphics demo and as a transparent
calibration case for software-effort estimation.

EffortHours estimates that the finished repository represents 161.5 equivalent human-hours,
with a preliminary range of 78–306.75 hours. A separate manual code review estimates 240 hours,
with a clean-recreation range of 182–302 hours. These figures describe counterfactual human
replacement effort, not elapsed development time or a claim that two days contained that many
labor hours.

- [Complete EffortHours report](docs/effort-hours-report.md)
- [Detailed manual effort review](docs/effort-hours-manual-review.md)

Both reports are committed with the source so this project can serve as a reproducible case for
refining the `eh` estimator while the live demo remains available for direct visual inspection.

## Features

- Broad, non-repeating directional swells with domain warping, wave packets, crest shaping,
  distance-aware detail, and a CPU sampler shared by floating objects.
- Projective reflection and refraction, Fresnel response, GGX sun glitter, shallow-water
  transmission, depth-dependent cyan-to-blue color, cloud reflections, and cloud shadows.
- Transported, lifecycle-driven foam that follows energetic crests without revealing a tiled
  wave pattern or moving as a single permanent sheet.
- A visible sun, procedural sky and clouds, natural reflection path, underwater caustics,
  volumetric sun rays, seabed vegetation, and rocks.
- A procedural navigation buoy that bobs, tilts, reflects, casts a shadow, and remains the
  camera's orbit pivot.
- Three procedural fish schools with separation, alignment, cohesion, depth avoidance,
  curiosity, habituation, and escape responses to a moving underwater camera.
- Above-water and underwater rendering states reached continuously by orbiting through the
  animated surface, plus a responsive loading screen and FPS counter.
- GPU-aware render budgets, high-density antialiasing policy, and frame-time adaptation keep
  4K displays practical without changing the CSS resolution or the default 1080p presentation.
- Native WebGPU/TSL and legacy WebGL/GLSL water pipelines share the same wave spectrum, scene,
  controls, simulation clock, and quality controller. Backend-only code is loaded on demand so
  the compatibility option does not block the initial renderer.
- No downloaded scene assets: geometry, behavior, shaders, sky, noise, and habitat details are
  generated in code and released under the MIT license.

## Run locally

```bash
bun install
bun run dev
```

Open the local URL printed by Vite.

- Left mouse: orbit around the buoy
- Wheel: move toward or away from the buoy
- Orbit beneath the surface to enter the underwater environment
- Use the upper-right renderer switch to reload in WebGPU or WebGL mode

Panning and cursor-offset zoom are intentionally disabled so the buoy remains the stable focal
point.

## Automated visual harness

The included Playwright harness starts Vite, freezes the simulation clock, and captures twenty
named regression views at 1600 by 900 locally. It also renders four identical camera/time presets
through WebGL and WebGPU, writes the individual frames plus labeled side-by-side composites, and
enforces normalized pixel-error and perceptual-similarity limits. Pull-request CI runs the scene,
fish, and renderer-parity gates in parallel at 960 by 540; every CI job has a hard two-minute cap.
The full camera matrix remains available locally, while the required gate samples every major
rendering and behavior system. Fixed-step fish habituation advances simulation state without
wasting software-GPU time on intermediate frames. Coverage includes:

- the sun path, cross-sun grazing angles, opposite-sun water, and top-down rendering;
- near, wide, and far-field compositions designed to expose repetition and grazing artifacts;
- foam formation, transition, replacement, and long-interval transport;
- general underwater rendering plus calm, curious, and startled fish behavior;
- loading-stage order, progress monotonicity, frame cadence, shader warm-up, and browser errors;
- 4K framebuffer budgets, integrated/discrete GPU policy, and adaptive quality recovery;
- WebGPU/WebGL selection, fallback diagnostics, shared wave geometry, and side-by-side parity;
- displacement-field correlation at three simulation times to prevent periodic tiling from
  returning unnoticed.

```bash
bun run visual:test
bun run quality:test
# Optional side-by-side WebGL/WebGPU 4K startup and FPS profile
# (not used as a hardware-dependent CI gate)
bun run performance:profile
```

Screenshots, side-by-side composites, pixel metrics, camera and renderer diagnostics,
wave-correlation measurements, and startup timing are written to `visual-results/`. The optional
profile adds both renderer measurements to `runtime-4k.json`. Set
`PLAYWRIGHT_CHROMIUM_PATH` when Chrome or Edge is not in a standard location.

## Production and GitHub Pages

```bash
bun run build
bun run build:pages
bun run check:pages
```

Pull requests run independent production-build and time-budgeted browser renderer checks. Pushes to
`main` retain the quick production verification but skip the already-passed browser gate. Pages
then builds the repository-scoped artifact, deploys through GitHub's official actions, and
smoke-tests the live document and JavaScript bundle without repeating the visual matrix.

Every same-repository pull request also receives a sticky link to an isolated preview at
`/beautiful-water/pr-preview/pr-<number>/`. Preview and production publication share one serialized
Pages pipeline, production retains previews for open pull requests, and stale previews are removed
when their pull requests close.

## License

MIT -- see [LICENSE](LICENSE).
