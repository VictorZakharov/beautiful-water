# Beautiful Water — Manual Equivalent-Human-Effort Estimate

Date: 2026-08-16<br>
Repository: [VictorZakharov/beautiful-water](https://github.com/VictorZakharov/beautiful-water)<br>
Assessment type: clean recreation of the current functional and quality state

## Executive summary

| Measure | Low | Expected | High |
| --- | ---: | ---: | ---: |
| Human effort | 182 hours | **240 hours** | 302 hours |
| Full-time weeks at 40 hours/week | 4.6 | **6.0** | 7.6 |
| Replacement cost at $160 USD/hour | $29,120 | **$38,400** | $48,320 |

The `eh` result of 161.5 expected hours is credible as an optimistic floor for a highly experienced Three.js graphics engineer who receives the completed application as an exact blueprint. After manually examining the repository, I would not use 161.5 hours as the central planning estimate. The custom rendering work, dual backend implementation, visual tuning, performance hardening, and automated screenshot harness make approximately **240 hours** a more defensible midpoint.

If the developer starts only with the original open-ended visual references and must discover the desired appearance through iteration, a practical delivery range is approximately **240–350 hours**.

## What was inspected

The assessment considered the tracked repository structure, representative implementation modules, shader and node-graph complexity, automated tests, CI workflows, and commit history.

### Handwritten inventory

| Area | Files | Total lines | Nonblank lines |
| --- | ---: | ---: | ---: |
| Production source under `src/` | 26 | 5,621 | 5,185 |
| Tests under `tests/` | 7 | 1,205 | 1,136 |
| CI and scripts | 6 | 552 | 467 |
| Root application/configuration/docs sample | 4 | 273 | 249 |

The repository also contains a screenshot asset, lockfile, license, and small support files. Generated, vendored, binary, and dependency code is not valued as handwritten implementation effort.

Line count is only an inventory signal. The estimate primarily weights the semantic difficulty of the systems represented by those lines.

## Complexity findings

### 1. Procedural ocean and WebGL rendering

The WebGL path is substantially more than a stock Three.js water example. It contains a shared multi-scale wave field, domain warping, energy modulation, analytic derivatives/normals, reflection and refraction capture, shallow-water color, depth attenuation, Fresnel response, GGX-style specular response, caustics, foam, glitter, sun-path shaping, and underwater transitions.

This work is spread across the shared wave model, the ocean capture system, and several custom GLSL modules. Much of the implementation requires graphics-domain reasoning and visual tuning rather than ordinary application programming.

### 2. Independent WebGPU/TSL renderer

The application has a separate WebGPU path instead of merely switching renderer constructors. Water functions, wave displacement, material behavior, sky rendering, and underwater rays are represented with Three.js node/TSL code. The two implementations must remain visually comparable despite different APIs, render-target behavior, antialiasing, and driver characteristics.

Renderer selection, fallback behavior, persistent toggling, software-adapter portability, sun-path parity, and waterline transition fixes add integration and debugging effort that static line-count models tend to miss.

### 3. Procedural scene behavior

The surrounding scene includes a modeled navigation buoy, floating response to the sampled ocean surface, a procedural seabed, rocks and vegetation, underwater particles, shadows, caustics, sky and sun systems, underwater light rays, and schools of procedural fish.

Fish behavior includes schooling, cruising cadence, camera awareness, flight response, habituation, curiosity, seabed/water-surface constraints, and instanced-mesh updates. This is small simulation/animation work rather than static decoration.

### 4. Runtime performance and loading

The code contains GPU classification, pixel budgets, adaptive render scaling, antialiasing policy, capture-resolution tiers, shadow-quality tiers, conservative quality recovery, 4K behavior, WebGPU/WebGL-specific capture strategies, staged asynchronous loading, and shader warm-up.

Cross-browser and cross-GPU performance work is expensive because many failures are visual, temporal, driver-specific, or only visible at particular camera angles. The repository's history shows dedicated fixes for integrated-GPU performance, CI runtime, software WebGPU adapters, renderer parity, horizon transitions, and cloud rendering.

### 5. Automated verification

The Playwright harness is a material project component, not a token smoke test. It captures multiple deterministic camera views, checks 4K adaptive-quality policy, validates fish behavior, measures wave-field repetition, compares WebGL and WebGPU output, measures sun-path contrast, guards sky detail, detects waterline transition discontinuities, records diagnostics, and enforces loader responsiveness.

The unit tests also cover renderer preference, GPU classification, adaptive-quality behavior, and CI workflow budgets.

### 6. Delivery infrastructure

The repository includes production builds, GitHub Pages deployment, pull-request previews, preview cleanup, deployment serialization, linear-history enforcement, smoke validation, pinned actions, two-minute job budgets, artifact publication, and separate visual suites.

This infrastructure is compact in file count but contains nontrivial GitHub Actions behavior and operational tuning.

## Manual effort breakdown

| Work area | Low | Expected | High | Rationale |
| --- | ---: | ---: | ---: | --- |
| Application architecture, controls, UI and loading | 15 | 20 | 25 | Scene lifecycle, orbit behavior, renderer selection, loading states, FPS UI and integration |
| Wave model and WebGL ocean rendering | 40 | 52 | 65 | Custom wave mathematics, GLSL, captures, water optics, foam, caustics and tuning |
| WebGPU implementation and renderer parity | 35 | 45 | 55 | TSL port, reflector-node path, backend differences, fallback and visual parity |
| Environment, buoy, sky, underwater effects and fish | 30 | 40 | 50 | Procedural content, animation, behavior, shadows and underwater presentation |
| Performance, loading and cross-platform hardening | 25 | 35 | 45 | 4K adaptation, GPU tiers, warm-up, integrated-GPU work and artifact debugging |
| Unit, visual and performance test harnesses | 25 | 32 | 40 | Deterministic captures, behavioral checks, image metrics and CI integration |
| CI/CD, previews, Pages and documentation | 12 | 16 | 22 | Three workflows, preview lifecycle, publishing, policy checks and project docs |
| **Total** | **182** | **240** | **302** | |

## Assumptions

- The estimate represents competent human replacement effort, not recorded historical hours.
- The engineer is experienced with JavaScript, Three.js, shaders, browser graphics, and GitHub Actions.
- The current repository and its visual outputs can be used as a precise behavioral reference.
- Existing open-source Three.js primitives and browser APIs may be reused normally.
- The estimate recreates the present buoy-and-ocean application; it does not include the ship or island from the commercial visual reference.
- It assumes ordinary access to representative WebGL and WebGPU hardware for validation.
- It includes implementation, debugging, tests, CI, and self-review needed to reach the current state.
- It excludes project management overhead, stakeholder scheduling, marketing, legal review, and ongoing maintenance.

## Comparison with EffortHours

| Estimate | Low | Expected | High |
| --- | ---: | ---: | ---: |
| `eh` implementation profile | 78 | 161.5 | 306.75 |
| Manual assessment | 182 | **240** | 302 |

The two high estimates are nearly identical, but the manually assessed low and expected values are higher. The main reasons are:

1. `eh` assigns 88 expected hours to production implementation despite the large concentration of custom graphics and shader code.
2. It assigns only 3 expected hours to manual validation, debugging, and hardening. Visual water tuning and GPU-specific debugging are central to this repository.
3. It assigns 1.75 hours to specification and domain learning, which is optimistic for ocean optics, wave synthesis, WebGPU/TSL, and cross-renderer behavior.
4. The tool statically assumes the application and tests work; it does not render the scene, exercise GPU backends, or observe the difficulty of reaching visual parity.
5. Its 19-hour end-to-end estimate and 6.25-hour CI/CD estimate are possible for clean transcription, but optimistic for designing and stabilizing the existing harness and deployment behavior.

The `eh` high bound is useful. Its expected value is best interpreted as an expert, low-rework implementation scenario.

## Confidence and limitations

Confidence in the manual midpoint is **medium**. This was a repository-based engineering assessment, not a time-and-motion study or independent reimplementation. Productivity varies significantly with graphics specialization. A senior graphics engineer already fluent in Three.js TSL may approach the lower half of the range; a general frontend engineer learning GPU rendering while implementing the project could exceed the high bound.

## Conclusion

For planning or valuation, use **approximately 240 human-hours / $38,400 USD** as the central estimate. Use **182–302 hours / $29,120–$48,320 USD** as the clean-recreation range, and allow up to roughly **350 hours** when the open-ended visual discovery and feedback cycle must also be reproduced.
