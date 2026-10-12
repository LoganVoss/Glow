# Verification — 0.8.9

Recorded October 11, 2026. Glow 0.8.9 is built and staged against the installed Codex 26.1007.30912 (20156) baseline. Preparation did not replace, launch, or quit the app. Native testing of this candidate remains open.

## UI and motion

- All 37 runtime tests passed again for the 0.8.9 public source release.
- All 23 isolated browser scenarios passed again for 0.8.9 (24 Node records including their parent). These use the local fixture only and never access the native app.
- The color section has no enclosing surface, border, shadow, or fixed-width cap. The dots and action row fill the settings width and lead the controls below the preview. Vibe follows, then Animation, then the material sliders. The three equally spaced boxed actions are **1 → Color Slider → Dice**, with matching 48 px targets and 44 px targets at narrow widths.
- The 28 px stage-to-action gap (20 px larger), vertical section order, responsive geometry, and keyboard order passed at 1440, 768, and 390 px viewport widths. Opening and closing Color Slider leaves the dots, actions, material controls, and reserved space stationary. The hidden slider is disabled and inert; keyboard opening focuses it and Escape returns focus.
- Actual rendered gradients for Bloom, Pulse, and Ping interpolate through intermediate colors over 420 ms. Rapid selections start from the currently displayed colors, preserve the orbit object and time, and do not interrupt intensity. All six dot materials interpolate as well. Reduce Motion keeps the shorter border transition and skips dot motion.
- The color catalog is prepared at module load, and single-color slider tracks are prepared with the panel. Unrelated material edits do not recalculate palette positions; color edits no longer query the animation clock or rewrite unchanged variables.
- Existing lifecycle checks pass: two-way native-shaped theme updates, first-profile transfer, independent later edits, async theme callbacks, persistence, neutral hue, passive dots, route continuity, reversible on/off dissolve, speed phase preservation, 125% zoom geometry, utility-window guards, and disposal.
- The wider smile has eyes centered 60 px apart, a 168 px mouth span, and more spacing between its four mouth dots. Every dot formation remains contained through rapid reshuffles and resizing. Visual review covers the full light/dark settings layout, open slider, and narrow controls. Visual review confirmed the centered eyes and unchanged mouth spacing.

The static settings screenshots in `docs/images/` retain the unchanged 0.8.7 layout. `smile.png` shows the 0.8.8 eyes, now closer together above the same mouth. These are standalone fixture captures, not native app screenshots.

- The only runtime change in 0.8.9 is selected-state styling. In both themes, selected **1**, open **Color Slider**, and pressed Dice have identical computed fill, icon, border, and shadow styles. Hover preserves the selected highlight; Dice returns to its resting state on release. Button size and corner radius remain unchanged. Isolated visual review confirmed both selected controls together in light and dark mode.

[Selected controls in light mode](images/selected-light.png) · [Selected controls in dark mode](images/selected-dark.png)

## Packaging

The actual **Refresh Neon Codex.command --prepare-only** run preserved the previous staged output, built and signed 0.8.9, passed installation preflight, and returned READY. All 110 code objects were signed. The five packaged runtime assets match the final tested source files. Six archive entries changed; original packed data, Electron fuses, CSP, source bundle, and installed baseline were preserved. Signature and signing-team checks passed.

The Appearance bridge remains pinned to the reviewed vendor source. Patched-asset checks passed for this build. The reviewed-source manifest and installer are unchanged from 0.8.5, whose 26 refresh tests and atomic-exchange/recovery tests passed. Unknown app versions still require compatibility review; the updater is not changed.

## Native verification remaining

Complete the [native smoke test](smoke-test.md) after installing 0.8.9, especially the color controls, palette transitions, and settings-to-chat continuity. Fixture tests and signature checks cannot establish native startup, actual account/integration behavior, or sustained native performance. The current app was left untouched during preparation.

Private build/signature evidence remains under `.local/`, excluded from Git. The public source release includes the supplied screenshots and a linked video demo. App bundles and private build records are not distributed.
