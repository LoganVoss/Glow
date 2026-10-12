# Verification

## 0.9.0 — Persistent local identity, October 12, 2026

The local signing mode now generates and retains a unique self-signed identity on the user's Mac. It requires no Apple-issued certificate, membership, or per-update publisher signature. Exact code requirements bind the certificate and each code identifier; local identity state is pinned and preserved across refreshes. No real Codex Keychain item or access list was inspected or changed during development.

**Actual Keychain continuity was verified with disposable data:** a fixture granted access to version 1, then atomically replaced it with different executable bytes signed by the same identity. Version 2 read the dummy item with Keychain UI disabled. A different certificate with the same identifier, and the same certificate with a different identifier, were both denied. The grant also survived locking and unlocking its test keychain. The test uses the production identity manager in separate signing sessions; default keychain, search list, and trust settings were unchanged.

Source and integration checks cover:

- 7 identity-manager checks: persistent reuse, damaged/mismatched state, file permissions, no secret metadata, read-only inspection, symlink rejection, concurrent sessions, and relocking after a callback failure.
- 6 Keychain continuity test records, including the parent integration test, using only generated identities and a dummy secret.
- 68 installer/refresh tests, including existing certificate behavior, local opt-in, stable certificate and designated requirements, recovery provenance, legacy ad-hoc migration, retained-identity checks, and refusal of silent key rotation.
- Existing atomic-exchange/recovery regression checks, 5 local-signing checks, all 15 structural compatibility tests, and all 37 Glow runtime tests. The renderer and UI assets are unchanged from 0.8.9; browser scenarios were not rerun for this packaging-only change.

The actual `Refresh Neon Codex.command --local-signing --prepare-only` run built 0.9.0 against Codex **26.1007.30912 (20156)**, signed and verified all **110 code objects** with the persistent identity, passed installation preflight, and returned READY. Original packed data, intended entitlements, hardened-runtime flags, Electron fuses, CSP, pristine source, and installed baseline were checked. The running app was not replaced, quit, or launched.

**Native limit:** the user's previous ad-hoc build launched successfully, but that is not a native test of 0.9.0's new persistent identity. Initial migration can require Keychain authorization. Repeated actual Codex refreshes, sign-in, account integrations, restoration in native use, and updater behavior remain manual checks. The release is experimental and source-only, with an app-scoped library-validation exception; it is not notarized. The fixture proves the identity mechanism, not that macOS can never prompt again.


## Earlier ad-hoc prototype — October 12, 2026

The earlier unreleased prototype added an explicit ad-hoc `--local-signing` mode, now superseded by 0.9.0 persistent signing. The actual `Refresh Neon Codex.command --local-signing --prepare-only` run built against Codex **26.1007.30912 (20156)**, verified all **110 signed code objects**, passed installation preflight, and returned READY. No Keychain signing identity or publisher certificate was used. The current app was not replaced, launched, or quit.

The schema-3 report verifies local ad-hoc signatures, intended entitlements, preserved hardened-runtime flags, original packed data, CSP, Electron fuses, archive integrity, pristine source, and the unchanged installed baseline. Process executables receive an app-scoped library-validation exception. Library validation is therefore intentionally weaker for the modified app; global security settings and quarantine were not changed. The candidate is not notarized.

Verification passed:

- 5 focused signing tests, including actual loading of our own tiny hardened-runtime host and library, rejection without the exception, rejection with the explicit library-validation flag, and preservation of library entitlements on macOS 15+.
- 47 refresh/local-signing tests covering existing certificate behavior, explicit local opt-in, staging mode changes, tampering, provenance, and restore ancestry.
- Atomic-exchange and recovery regression checks.
- 15 structural compatibility tests, plus read-only checks of both pristine reviewed vendor builds (20156 and 20052).
- All 37 existing Glow runtime tests. Renderer/UI files did not change in this candidate.

**Initial native launch confirmed; broader validation remains open.** On October 12, the user installed the candidate and reported that it launched and Glow was working. Read-only checks matched the installed app exactly to the schema-3 local-signing build, verified its ad-hoc signature and retained hardened runtime, confirmed that the running process started after installation, and verified the preserved previous certificate-signed bundle. The user also reported a macOS Keychain prompt for “Codex Storage Key” on launch. This is a compatibility observation, not a prompt-free pass. Unchanged relaunch, subsequent rebuild authorization, account features, integrations, restoration in native use, and updater behavior still need testing. No Keychain secret or access control was read or modified by verification. Complete the native smoke test before publishing this mode as an installable release. The v0.8.9 source prerelease used the previous Apple-certificate-based version.

## Previous source release — 0.8.9

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
