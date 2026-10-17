# Performance audit — Glow 0.10.8

Glow’s visible border is an ongoing animation, so it has a rendering cost. This pass removes work that contributes nothing visible and fixes retained DOM nodes, while preserving the existing colors, gradients, blur, speed, and rounded geometry.

## Fixed

- **Detached sidebar nodes:** route changes could leave old native triggers and geometry elements in Glow’s saved-attribute map. They are now restored and released during reconciliation. A forced-GC regression confirms 59 retired nodes are collectible while the controller remains active.
- **Detached route surfaces:** the border remembered a native surface node with its last geometry, keeping a removed route tree alive. It now retains only its painted dimensions and releases detached measurement anchors. GC checks cover route gaps and utility-window suspension without disturbing the border’s position.
- **Theme cleanup:** removing any element previously scanned every prepared theme surface and deferred cleanup until an animation frame. Cleanup now visits only the removed subtree, including when animation frames are suspended. Nested additions are collected once.
- **Invisible animation:** the border now pauses its existing clock after the off dissolve or at zero intensity. A single intersection observer pauses offscreen previews; document visibility changes suspend and resume the registered layers. Quick reversals preserve the clock and cancel the pending pause.
- **Unrelated host updates:** root/body style changes no longer rewrite the full settings panel when appearance is unchanged. Surface geometry still updates, including inherited transforms that do not trigger ResizeObserver.
- **Disposal:** all visibility observers, listeners, and fade timers are released. Destroying the runtime during late native-window initialization cannot recreate a frame during cleanup.

Repeated start/destroy and Appearance remount tests return observer and listener counts to baseline. Idle JavaScript, streamed text, and ordinary paragraph insertion did not show a recurring Glow polling loop. The panel is intentionally prepared once and reused; its detached controls are bounded, not allocated on every visit.

## Recorded comparison

One five-second run per scenario, comparing 0.10.7 with 0.10.8 in Chrome **152.0.7977.84**, headless, **1440 × 900**, device scale **2**. Renderer task time is accumulated main-thread CPU time during that interval, not CPU percentage for the whole app.

| Scenario | Task time before → after | Paint events before → after |
| --- | --- | --- |
| Border off, dissolve finished | 171.58 → 0.54 ms | 900 → 0 |
| Hidden-document signal simulated | 175.60 → 0.54 ms | 900 → 0 |
| Previews offscreen, border visible | 419.25 → 191.26 ms | 2,700 → 900 |
| Runtime removed, fixture baseline | 0.53 → 0.49 ms | 0 → 0 |

Offscreen previews used a blank fixture spacer to place every sample outside the scroll viewport. Visible Bloom task time remained approximately **174–180 ms** per five seconds; Pulse and Ping likewise remained in their previous range. Appearance task time was **278 → 235 ms**, though the number of rendered frames differed, so this is not a controlled per-frame speedup claim. These are single-run diagnostic results, not statistical benchmarks or native thermal measurements.

## Scope

Measurements use an isolated Chromium fixture with external networking blocked, not the running ChatGPT/Codex app. Paint events, task time, and heap size do not establish native temperature, energy use, total process memory, or GPU utilization. Native window occlusion also depends on the visibility signals the host delivers; the visibility regression explicitly simulates that signal rather than claiming a macOS minimization test.

The visible Bloom, Pulse, and Ping renderers are unchanged. We rejected clipping and segmented-paint experiments that failed to improve measured work, and a compositor experiment that needed additional large textures. We did not trade higher GPU-memory demand or reduced animation smoothness for a better CPU number.

## Reproduce

Run the lifecycle and rendering regressions:

```sh
npm run test:performance
```

Profile the fixture without running other tests simultaneously:

```sh
node scripts/profile-rendering.mjs --output .local/rendering-profile.json
```

The profiler uses a 1440 × 900 viewport at device scale 2, five seconds per scenario, and a fresh browser context for each. `NEON_TEST_BROWSER` can select a Chromium executable. Use `--root /path/to/another/checkout` to compare source revisions with the same browser and machine; `--trace-dir .local/traces` retains detailed traces locally. Reports can contain local paths and belong outside the public package.

For the actual app, follow the idle on/off/minimized comparison in the [native smoke test](smoke-test.md). A thermal improvement has not yet been established by this isolated audit.
