# Beautiful Water

A full-screen Three.js shallow-ocean scene with a broad directional wave spectrum,
distance-filtered capillary normals, projective reflection/refraction, Fresnel and GGX
lighting, broken cloud reflections and shadows, sun glints, crest scattering, transported
foam, underwater caustics, and a buoy that samples the same wave field so it naturally bobs
and tilts with the surface. A seeded, generated noise texture keeps the fragment shader fast
to compile without introducing downloaded assets.

The underwater habitat includes three procedural fish schools rendered in two instanced draw
calls. Fish use separation, alignment, cohesion, depth avoidance, and smooth steering. A moving
underwater camera triggers escape behavior; a camera that remains still is gradually accepted,
with a small seeded subset approaching to circle at a cautious distance.

## Run locally

```bash
npm install
npm run dev
```

Then open the local URL printed by Vite.

- Left mouse: orbit
- Wheel: zoom toward or away from the buoy
- Orbit beneath the animated surface to enter the underwater rendering state

The orbit pivot remains locked to the buoy; panning and cursor-offset zoom are disabled.

## Production build

```bash
npm run build
npm run preview
```

## Visual regression harness

The Playwright harness starts Vite, freezes the simulation clock, and captures twenty named
1600×900 views covering the sun path, both cross-sun grazing angles, opposite-sun water,
top-down water, two far-field repetition angles, near and wide reference compositions,
short- and long-interval foam detail, the general underwater scene, and calm/startled fish
responses. It fails on browser or WebGL console errors and asserts that fish habituate, retain
curious animals nearby, and flee a fast camera approach. Startup checks also verify ordered,
monotonic loading stages, animation-frame cadence during asynchronous shader compilation, and
split reflection/refraction warm-up. The sampled displacement field also has a maximum
spatial-correlation guard at three points in time so a single dominant wavelength cannot
silently turn back into visible tiling.

```bash
npm run visual:test
```

Screenshots, their camera/renderer manifest, and `startup.json` timing diagnostics are written
to `visual-results/`. Set `PLAYWRIGHT_CHROMIUM_PATH` when Chrome or Edge is not installed in a
standard location.

## License

MIT — see [LICENSE](./LICENSE).
