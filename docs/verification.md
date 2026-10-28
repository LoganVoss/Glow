# Verification

## 0.10.12 — App update compatibility, October 28, 2026

Reviewed the actual OpenAI-signed **26.1023.50603 (22391)** archive against preserved build **21828**. Appearance's React/JSX/cache bindings and native scoped theme writer were renamed, as were the sidebar command bindings. Explicit reviewed variants now support those renames while preserving the original mount, non-optimistic theme writes, complete command registration, disabled guard, and native fallback. Removing the sidebar bridge restores the original primary module byte for byte. Unknown or mixed variants remain refused. All **eight** reviewed vendor builds pass compatibility inspection.

The split `entry → app-main → app-runtime → app-primary` layout remains intact. The native page-surface class and its 20 related CSS rules are unchanged, as are the panel geometry, compact account footer, Settings heading, and guarded Home destination. The added tooltip providers do not add DOM wrappers. No Glow runtime, visual, preference, or performance behavior needed changes.

Passed **117 source/runtime/compatibility/transform tests**, **25 Glow browser cases**, **22 sidebar cases**, **12 theme cases**, and **4 early-window startup cases**. One mid-transition color assertion failed on the combined browser run; the complete 12-case theme suite passed unchanged on its focused rerun. Refresh's **26 tests**, recovery, installer, archive preservation, and local-signing policy/identity checks passed. The dependency audit reports no known vulnerabilities. Changed documentation links resolve, and no private build or signing artifacts are tracked.

Preparation returned **READY** for Glow **0.10.12** on build **22391**, reused the persistent local identity, verified **109 code objects**, and passed installation preflight. All nine source hashes and five packaged JavaScript modules match the source. Exactly nine packed renderer entries changed. Appearance and primary equal their reviewed transformations; initial, the settings bridge, and general settings remain byte-identical to the original. CSP, Electron fuses, original packed payload, vendor source, and installed baseline passed preservation checks.

All **three isolated packaged-module cases** passed with normal, deliberately failing, and missing Glow. They evaluate the actual initial and primary modules; the normal case also imports actual Settings and patched Appearance. Native launchers, initial renderer, and Settings modules were checked against the original bytes. The hosted app was not quit, replaced, or launched. Native launch, account services, updater behavior, and thermal performance remain separate [post-install smoke tests](smoke-test.md).

## 0.10.11 — App update compatibility, October 23, 2026

Reviewed the actual OpenAI-signed **26.1021.31345 (21828)** archive against preserved build **21161**. This update moved the sidebar command and main window into `app-primary`, renamed the native page surface, and changed Appearance bindings. The shared inspector/builder discovery now follows literal imports through `entry → app-main → app-runtime → app-primary`; preload catalogs alone cannot select a patch target. Both initial and primary renderers are pinned. The initial renderer, native launchers, and Settings modules remain unchanged; only the exact reviewed sidebar command in primary receives the optional bridge. Earlier layouts still patch their initial renderer. All **seven** reviewed vendor builds pass compatibility inspection.

The new surface class is supported by both geometry controllers and transition CSS. The frame-by-frame regression caught a missing CSS selector that caused a jump; adding the reviewed class restored interpolation without changing motion settings or weakening assertions. Native geometry rules, rail/footer/account controls, Settings headings, and guarded Home navigation were reviewed. Glow's visual tuning, preferences, and memory/idle-rendering fixes remain intact.

Passed **108 source/runtime/compatibility/transform tests**, **25 Glow browser cases**, **22 sidebar cases**, **12 theme cases**, **4 early-window startup cases**, and **13 rendering/runtime performance cases**. Refresh, recovery, installer, and archive checks passed. The package audit found no known dependency vulnerabilities, broken local documentation/image links, non-executable launchers, or tracked private build/signing artifacts.

Preparation returned **READY** for Glow **0.10.11** on build **21828**, reused the persistent local identity, verified **109 code objects**, and passed installation preflight. All nine source hashes and five packaged JavaScript modules match the source. Exactly nine packed renderer entries changed, with primary replacing initial as the sidebar patch target. Appearance and primary equal their reviewed transformations; initial is byte-identical to the original. CSP, Electron fuses, original packed payload, vendor source, and installed baseline passed preservation checks.

All **three isolated packaged-module cases** passed with normal, deliberately failing, and missing Glow. They evaluate the actual initial and primary modules; the normal case also imports actual Settings and patched Appearance. The new launcher starts host services, so this split-layout test uses an isolated entry rather than claiming full launcher execution. It verifies the native entry, main, runtime, initial, Settings loader, and Settings bytes against the original. All three legacy packaged-bootstrap cases also pass on a preserved build. The hosted app was not quit, replaced, or launched. Native launch, account services, updater behavior, and thermal performance require the [native smoke test](smoke-test.md) after installation.

## 0.10.10 — App update compatibility, October 21, 2026

Reviewed the actual OpenAI-signed **26.1016.51333 (21161)** archive against preserved build **20770** before adding its source pin. This build renamed the Appearance bindings and mount expression, plus the native sidebar command bindings. Explicit reviewed variants now preserve the native component/key, scoped non-optimistic theme writer, complete sidebar memoization/registration, and native fallback. Unknown or mixed variants remain rejected. Native page-surface geometry, rail/footer/account structure, and Settings Home contracts remain compatible; Glow's runtime, visuals, preferences, and 0.10.8 performance fixes are unchanged. The new vendor CSP is preserved without modification.

Passed **94 source/runtime/compatibility/transform tests**, **24 Glow browser cases**, **21 sidebar cases**, **12 theme cases**, **4 early-window startup cases**, and **13 rendering/runtime performance cases**. All six reviewed OpenAI-signed builds pass compatibility inspection. Refresh, recovery, installer, and archive-preservation checks passed. The package audit found no known dependency vulnerabilities, broken local Markdown/image links, non-executable launchers, or tracked private build/signing artifacts.

Preparation returned **READY** for Glow **0.10.10** on build **21161**, reused the persistent local identity, verified **109 code objects**, and passed installation preflight. All nine source hashes and five packaged JavaScript modules match the source. Exactly nine packed renderer entries changed. The packaged Appearance and initial renderer equal the reviewed transformations; the native settings bridge and general-settings modules are unchanged. CSP, Electron fuses, original packed payload, vendor source, and installed baseline passed preservation checks.

All **three isolated packaged-bootstrap cases** passed: normal, deliberately failing, and missing Glow. Normal startup also imports the actual Settings and patched Appearance modules. The hosted app was not quit, replaced, or launched. These checks do not establish native sign-in, account integrations, updater behavior, or sustained thermal performance; complete the [native smoke test](smoke-test.md) after installation.

## 0.10.9 — App update compatibility, October 18, 2026

Reviewed the actual OpenAI-signed **26.1013.40934 (20770)** archive against preserved build **20586** before adding its source pin. The Appearance component and main general-settings module match after normalizing hashed imports. React/JSX/cache bindings, AppScope, the theme schema, and the scoped non-optimistic writer remain unchanged. The complete sidebar command, memoization, titlebar dispatch, and command registration retain the reviewed variant. Native workspace, rail, footer/account controls, surface class map, and surface CSS are unchanged; Settings differs only in hashed imports. No Glow runtime or visual changes were needed, and the 0.10.8 memory and idle-rendering fixes remain included.

Passed **84 source/runtime/compatibility/transform tests**, **24 Glow browser cases**, **21 sidebar cases**, **12 theme cases**, **4 early-window startup cases**, and **13 rendering/runtime performance cases**. Refresh, recovery, installer, and archive-preservation checks passed. The package audit found no known dependency vulnerabilities, broken local Markdown links, non-executable launchers, or tracked private build/signing artifacts.

Preparation returned **READY** for Glow **0.10.9** on build **20770**, reused the persistent local identity, verified **109 code objects**, and passed installation preflight. All nine source hashes and five packaged JavaScript modules match the source. Exactly nine packed renderer entries changed. The packaged Appearance and initial renderer equal the reviewed transformations; the native settings bridge and general-settings modules are unchanged. CSP, Electron fuses, original packed payload, vendor source, and installed baseline passed preservation checks.

All **three isolated packaged-bootstrap cases** passed: normal, deliberately failing, and missing Glow. Normal startup also imports the actual Settings and patched Appearance modules. The hosted app was not quit, replaced, or launched. These checks do not establish native sign-in, account integrations, updater behavior, or sustained thermal performance; complete the [native smoke test](smoke-test.md) after installation.

## 0.10.8 — Memory and idle-rendering audit, October 17, 2026

Fixed retained detached sidebar controls and native route surfaces. Saved geometry now keeps the painted dimensions without holding a removed DOM tree. Theme cleanup releases only removed subtrees, works with suspended animation frames, and avoids whole-conversation rescans. The runtime skips unchanged Appearance updates, suspends offscreen previews and hidden documents, and pauses a disabled or zero-intensity border after its dissolve. Quick reversals and visible motion retain the same animation clock. Destroy cleanup also covers late native-window initialization.

All **13 focused rendering/runtime performance cases** pass. They cover removed native surfaces becoming collectible, 12 start/destroy cycles with 120 Appearance remounts, complete observer/listener cleanup, utility-window transitions, no-op host updates with real geometry changes, stable paused clocks with zero paint, and visibility restoration. Additional sidebar/theme regressions verify collection of 59 retired sidebar nodes and incremental cleanup without animation frames. The full **24-case Glow browser suite**, **4 early-window startup cases**, **21 sidebar cases**, **12 theme cases**, and **84 source/runtime/compatibility/transform tests** pass. Installer, refresh, and recovery checks pass; dependency audits report no known vulnerabilities.

The isolated five-second Chromium comparison recorded **900 → 0 paint events** after the off dissolve and **2,700 → 900** with previews offscreen while the border remained visible. Offscreen-preview renderer task time fell **419.25 → 191.26 ms**. Visible workspace animation cost stayed in its previous range; no native thermal improvement is claimed. Rejected renderer prototypes were not shipped. Conditions, limits, and reproduction commands are in the [performance audit](performance.md).

Final preparation returned **READY** for Glow **0.10.8** on **26.1013.31256 (20586)**, reused the persistent local identity, verified **109 code objects**, and passed installation preflight. All nine source hashes and five packaged JavaScript modules match the final source, including the route-retention fix. Exactly nine packed renderer entries changed; the builder's archive, CSP, fuse, vendor-source, and installed-baseline preservation checks passed.

All **three isolated packaged-bootstrap cases** passed: normal, deliberately failing, and missing Glow; the normal case imports the actual Settings and patched Appearance modules. The hosted app was not quit, replaced, or launched. These checks do not establish native account functionality, macOS window occlusion, or sustained thermal behavior; complete the [native smoke test](smoke-test.md) after installation.

## 0.10.7 — App update compatibility, October 16, 2026

The installed app **26.1013.31256 (20586)** was confirmed up to date through its configured updater. Its Appearance exports, native sidebar command bindings, and page-surface class changed. Each was reviewed against the actual OpenAI-signed archive and the preserved previous build before recording the new source pin. All four actual vendor sources (**20586**, **20398**, **20156**, **20052**) pass compatibility inspection.

The builder and inspector now share one Appearance transformer with explicit reviewed binding variants. Both preserve the native component, callback-ref mount, and scoped non-optimistic theme writer; unknown, mixed, missing, or duplicate bindings are refused. The new sidebar variant preserves native fallback and introduces no startup imports. Glow tracks both reviewed surface classes with direct-child selectors, excluding nested lookalikes. The current preview uses the new class.

Passed checks: **37** preference/runtime tests, **20** compatibility tests, **7** Appearance-transform tests, **20** sidebar-command tests, **24** Glow browser cases, **20** sidebar browser cases, **10** theme cases, and **4** early-window startup cases. Geometry coverage includes zoom, asymmetric corners, all three sidebar states, intermediate animated positions, and both reviewed surfaces. Installer, refresh, moved-checkout recovery, archive-preservation, and local-signing policy checks also passed. The package audit found no known dependency vulnerabilities, broken local documentation links, missing executable launchers, or tracked private artifacts. The README and compatibility guide now include the user's short repair prompt.

Preparation returned **READY** for Glow **0.10.7** on build **20586**, reused the persistent local identity, verified all **109 code objects**, and passed installation preflight. All nine source hashes and five packaged JavaScript modules match the final source. Exactly nine packed renderer entries changed as allowed; expected unpacked signing/integrity changes are accounted for separately. The packaged Appearance and initial-renderer modules equal their exact reviewed transformations; the native settings bridge and general-settings modules are unchanged. CSP, Electron fuses, original packed payload, vendor original, and installed baseline passed preservation checks.

All **three** isolated packaged-bootstrap cases passed: normal, deliberately failing, and missing Glow. The normal case imports the actual Settings and patched Appearance modules without dependency errors. The hosted app was not quit, replaced, or launched. These checks do not establish native sign-in, account integrations, or sustained performance; complete the [native smoke test](smoke-test.md) after installation.

## 0.10.6 — App update compatibility, October 14, 2026

The installed app **26.1007.71326 (20398)** was confirmed up to date through its configured updater. The old compatibility check refused its renamed native sidebar command. Review of the actual OpenAI-signed archive confirmed the same callback behavior, disabled guard, memoization, and titlebar/menu/keyboard registration; the new bindings are now an explicit reviewed variant. The complete hook must match, and unknown, mixed, duplicate, or modified hooks are rejected. All three actual vendor sources (**20398**, **20156**, **20052**) pass the inspector. Removing the optional bridge restores each original renderer byte for byte; no native dependency on Glow is introduced.

The actual Appearance mount, scoped non-optimistic theme writer, rail/footer/account structure, panel geometry, and guarded Home destination were reviewed against the preserved previous build. Glow's runtime and visual assets required no changes. The source pin records the verified new archive and linked asset hashes after this review.

The package audit also found that a moved checkout could leave Restore unable to use an intact backup. Restore now validates the historical canonical path pair and its record-directory/build-ID binding, then uses only the current checkout's fixed backup/staging locations. It preserves historical paths and all bundle/signature checks. Synthetic restore exchanges cover moved backups and interrupted staging, malformed paths, mismatched IDs/roots, and symlink redirects. The actual moved checkout's read-only Restore preflight passes; no restoration was performed.

Passed: **37** preference/runtime tests, **23** Glow browser cases, **10** theme cases, **4** early-window startup cases, **19** sidebar cases, **19** compatibility tests, **14** native command tests, **26** refresh tests, **68** signing-policy tests, **18** recovery groups, and the installer/archive checks. The package audit found no known dependency vulnerabilities, broken local documentation links, missing executable launchers, or tracked private artifacts. The README edit already on GitHub was preserved.

Preparation returned **READY** for Glow **0.10.6** on build **20398**, reused the persistent local identity, verified all **110 code objects**, and passed installation preflight. All nine source hashes and five packaged JavaScript modules match the final source. Exactly nine packed renderer entries changed as allowed; expected unpacked signing/integrity changes are accounted for separately. CSP, Electron fuses, original packed payload, the preserved vendor original, and the installed baseline passed preservation checks.

All **three** isolated packaged-bootstrap cases passed: normal, deliberately failing, and missing Glow. The normal case also imports the actual Settings and patched Appearance modules without renderer or dependency errors. Native Settings remains byte-identical to the original, and the initial renderer equals the exact reviewed command transformation. The hosted app was not quit, replaced, or launched. These source, signature, and isolated-module checks do not establish native sign-in, account integrations, or sustained performance; complete the [native smoke test](smoke-test.md) after installation.

## 0.10.5 — Sidebar state and motion polish, October 12, 2026

The hidden-rail layout now has a distinct full-width window icon on the original titlebar control and an accessible state description. Its native button, handlers, original icons for the other two states, and hover treatment remain intact. The icon is a local CSS mask permitted by the existing CSP; no policy changes or network requests are needed.

The Settings → Home flash was reproduced with an undecorated replacement destination group: the old controller briefly restored visibility and faded it out again. Replacement groups now inherit the requested hidden state before measurement, without restoring the shell or replaying a toggle. Icon visibility also remains stable through temporary narrow native panel widths; native geometry and the account control remain safe. The regression checks the immediate style and every sampled rendered frame, original profile identity, hit testing, and unchanged frame bounds.

Theme surfaces and borders dissolve over **160 ms**, with immediate foreground colors and native mode selection. This avoids inherited text colors trailing behind nested surfaces. A focused test verifies immediate text response, interpolated surfaces, and settlement within 200 ms. Reduced motion, reversals, streaming behavior, and simultaneous sidebar motion remain covered.

Passed source/browser checks: **37** preference/runtime tests, **17** compatibility tests, **6** command-transform tests, **26** refresh tests, **23** existing Glow browser cases, **10** theme cases, **4** early-window startup cases, and **19** sidebar cases. The final icon and hidden Settings layout were visually reviewed in isolated fixtures. The README sidebar note is placed directly below the Settings image, and installation/release documentation is updated for 0.10.5.

Preparation returned **READY** for **26.1007.30912 (20156)**, reused the persistent local identity, verified all **110 code objects**, and passed installation preflight. All nine source hashes and five packaged JavaScript modules match the final source. Exactly nine packed renderer entries changed as allowed; unpacked native signing/integrity updates are accounted for separately. CSP, Electron fuses, the original packed payload, the vendor original, and the installed baseline passed preservation checks.

The staged native modules passed all **three** isolated bootstrap cases (normal, deliberately failing, and missing Glow), and the real Settings lazy import resolves. The initial renderer matches exactly the reviewed optional command patch; the Settings chunk remains byte-identical to the preserved original. These checks do not replace a native post-install test. The hosted session did not quit or replace the running app. Release packaging includes committed source/documentation/images only, with no app bundle, account data, private reports, or signing material.

## 0.10.4 superseded local candidate — Native sidebar cycle, October 12, 2026

The user requested restoring the expanded layout through the existing titlebar **Toggle Sidebar** command. Its first click keeps native chat-list hiding; the second restores chats while tucking away the icon rail; the third restores both. The same command serves the keyboard/menu. There is no second toggle or added selected-button styling. State stays local to the current window and persists across its route changes.

The account/footer subtree stays intact. Settings keeps the rail hidden and gains a small Home button beside its existing title. Home invokes the original native Home destination, retaining its guarded navigation path. The Settings module itself is unchanged. Rail-only destinations temporarily retain native navigation to protect account access. Normal native peek/hover widths are not overridden.

The only initial-renderer modification is an exact, hash-pinned optional command callback with the original native fallback. Neither Glow nor its sidebar module enters the native startup dependency graph. The actual OpenAI-signed **20052** and **20156** sources were inspected, their shared command and footer/panel/Settings structures reviewed, and both return `compatible-known`. The persistent local signing policy is unchanged.

Verification passed: 37 preference/runtime tests, 17 compatibility tests, 6 native-command transform/behavior tests, 26 refresh tests, 23 existing Glow browser cases, 9 theme cases, 4 early-window startup cases, and 16 dedicated sidebar cases. The dedicated tests include native peek, rail-only account hit testing, original profile identity, Settings Home, disabled Home, optional failure fallback, rapid reversals, per-frame border geometry, reduced motion, replacement Home handlers, simultaneous theme and layout motion, cleanup, and complete shell replacement without an expanded frame or replayed collapse. Light-mode fixture screenshots were visually reviewed. These are isolated browser/source checks, not proof of native account or application startup.

Preparation returned **READY** for **26.1007.30912 (20156)**, reused the persistent local identity, verified all **110 code objects**, and passed installation preflight. All nine source hashes and all five packaged JavaScript modules match the final source. The nine changed packed renderer entries match the explicit allowlist; unpacked native code has the expected signing/integrity updates. CSP, Electron fuses, the original packed payload, the vendor original, and the installed baseline passed preservation checks.

The staged native bootstrap passes all three cases: normal Glow, intentionally throwing Glow, and missing Glow. The initial renderer equals exactly the reviewed optional command transformation of the preserved original; the Settings module is byte-identical and its real lazy import resolves. The normal app still requires post-install native testing. This hosted session did not quit, launch, or replace the installed app, access account data, or publish the candidate.

## 0.10.3 superseded local candidate — Restore native navigation, October 12, 2026

Removed the complete custom sidebar experiment at the user's request: collapse/expand controller, CSS and animation rules, stored-choice handling, Settings Home/loading hooks, native renderer and Settings navigation transformations, related build pins, fixture controls, and feature-specific tests. Native navigation and account positioning are left to the app. Glow's border and Appearance controls remain, along with the independent light/dark color dissolve.

The builder returns to changing only the shared appearance stylesheet, renderer HTML, and native Appearance component, plus four self-contained Glow JavaScript modules. No custom sidebar module is packaged. The early-window startup and native bootstrap regressions remain; the latter can compare the initial renderer and Settings navigation chunk byte-for-byte with `NEON_TEST_ORIGINAL_ASAR`.

Verification passed: 37 preference/runtime tests, 23 Glow browser cases, 9 independent theme cases, 4 early-window startup cases, 15 compatibility tests, and 26 refresh tests. The staged archive also passes all three isolated native bootstrap cases (normal, throwing, and missing Glow), imports the native Settings page successfully, and matches the preserved original's initial renderer and Settings navigation chunk **byte for byte**.

Preparation built 0.10.3 for **26.1007.30912 (20156)**, reused the persistent local identity, verified all **110 code objects**, passed installation preflight, and returned READY. The seven source hashes and four packaged JavaScript files match the final source. The seven changed archive entries match the explicit Glow-only allowlist; no sidebar runtime or hooks are packaged. Original data, CSP, Electron fuses, and installed baseline checks passed. The installed app was not replaced, launched, or quit; no Keychain permissions were changed. Native reopening after installation remains a manual check.

The 0.10.0–0.10.2 notes below are historical verification records for the removed experiment, not current features or installation recommendations.

## 0.10.2 superseded candidate — Settings continuity and motion, October 12, 2026

The collapsed rail now stays hidden through Settings and its lazy loading placeholder. A small Home control beside the native Settings title navigates to the app's chats Home through its existing unsaved-change guard. It is absent from expanded navigation. The original profile subtree, handlers, native legacy Back, and Settings close action remain unchanged. The newly edited Settings chunk is discovered through the actual initial renderer import, hash-pinned, and checked by the compatibility inspector for both reviewed builds.

The sidebar button now uses its arrow direction alone for persistent state. Collapse animates the specific geometry anchors instead of propagating an animated inherited variable through the entire chat tree; native live resizing stays immediate once the short toggle transition ends. In an isolated 6,000-node fixture, style-recalculation time fell about 75% and total browser task time about 26% across six toggles. This is workload evidence, not a measured native-app frame-rate claim.

Light/dark changes use a 320ms color dissolve on native surfaces and controls. Existing layout, transform, and opacity transitions are preserved. There is no snapshot layer or input blocking. Reduce Motion cancels the dissolve. Setup inspects only newly added element subtrees after initial setup: a probe of 30 streamed text replacements triggered zero document scans and zero animation-frame requests from the theme helper.

Source/UI verification passed:

- 18 sidebar browser cases, including Settings navigation through the original account menu, keyboard Home, no loading-state flash, unchanged account identity, no selected fill, rapid reversals, geometry continuity, immediate resizing, and disposal. Light/dark collapsed Settings screenshots were visually reviewed; they are standalone fixture captures.
- 8 theme browser cases, including intermediate rendered colors, rapid reversal, native system-mode resolution, reduced-motion cancellation, cleanup, live input, incremental setup, and simultaneous rail/theme changes with an aligned border and fixed account corner.
- All 23 existing Glow browser cases, 37 preference/runtime tests, 4 early-window startup cases, 9 sidebar transform tests, 6 Settings transform tests, 18 compatibility tests, and 26 refresh tests.
- Read-only compatibility inspection of both pristine OpenAI-signed sources returns `compatible-known` with the new Settings integration checks.

Final preparation built **0.10.2** for **26.1007.30912 (20156)**, reused the persistent local signing identity, verified all **110 code objects**, passed installation preflight, and returned READY. All nine source hashes, five packaged JavaScript files, and both transformed native chunks match the final tested sources. Ten archive entries changed; original packed data, CSP, Electron fuses, and installed baseline checks passed.

The actual staged archive passes all three isolated bootstrap cases (normal Glow, deliberately throwing Glow, missing Glow). In the normal case the test also imports the real patched Settings chunk and verifies its `SettingsPage` export without page errors or missing dependencies. This executes the bundled modules in a fresh browser with external networking blocked; it does not launch the native app or access an account. Preparation did not replace or quit the installed app, change Keychain permissions, or publish a GitHub release.

Actual native reopening, Settings prompts, and sustained motion quality still require the [native smoke test](smoke-test.md) after installing this candidate. The user’s feedback on 0.10.1 established that the app reopened and the rail was usable; it also identified the Settings navigation and motion issues addressed here. It was not a complete native feature pass.

## 0.10.1 local repair — Startup isolation, October 12, 2026

The user reported that installing 0.10.0 left the native app stuck loading. The failure was reproduced using that installed archive's actual renderer assets in a fresh isolated browser: before the native window type is set, the navigation controller stored `false` as its shell and called `shell?.querySelector(...)`. That throws because optional chaining only protects null/undefined. The new static import in the native entry propagated the exception and prevented both native entry modules from completing. The pristine original and earlier working recovery completed without errors.

0.10.1 uses a null shell until the main window exists and removes Glow from the native entry module's static dependencies. Glow loads independently from HTML. The sidebar's optional mount bridge tolerates an absent runtime and catches mount errors, leaving the native toolbar able to commit. This isolation applies to native startup and the new sidebar bridge; the existing Appearance bridge is unchanged.

The four startup regression cases now pass for unset, browser, utility, and electron window types, including late main-window initialization and switching back to a utility window. Before the fix, all four failed. All 8 native-transform tests, 17 compatibility tests, and 37 preference/runtime tests pass. The native-transform checks include absent-runtime and throwing-mount cases.

To test the actual staged renderer modules without launching the app or touching account data:

```sh
npm run test:startup
NEON_TEST_APP_ASAR="$PWD/.local/staging/ChatGPT.app/Contents/Resources/app.asar" node --test tests/native-bootstrap.test.mjs
```

The opt-in test serves only the archive's webview assets to an isolated browser and blocks external requests. It checks native module completion and optional-runtime failure isolation. It does not establish actual Electron startup, account access, integrations, or native sidebar behavior. Those require the [native smoke test](smoke-test.md) after installation.

Final verification passed:

- The actual staged 0.10.1 archive completes both native startup modules in all three cases: normal Glow, deliberately throwing Glow, and a missing Glow module. The normal case has no page errors; injected failures remain isolated from native module evaluation.
- All 23 existing Glow browser scenarios and 13 sidebar scenarios pass, including the original profile/menu, input and dialogs, settings routing, persistence, native-shaped resizing, and cleanup.
- `Refresh Neon Codex.command --local-signing --prepare-only` built for **26.1007.30912 (20156)**, verified all **110 signed code objects**, reused the persistent identity, passed installation preflight, and returned READY. All seven source hashes and all four packaged JavaScript files match the tested source. The packaged native entry exactly matches the final guarded transform.
- Source/original bundle, packed data, CSP, Electron fuses, and installed baseline checks passed. The installed app was not replaced or launched by preparation. No real Keychain permissions were read or changed. This repair has not been published as a GitHub release; actual native reopening and account functionality still require confirmation.

## 0.10.0 local candidate — Navigation rail, October 12, 2026

The arrow control mounts immediately before the native notification bell. It collapses only the outer icon rail, retains the chat-list width, and gives the reclaimed width to the conversation. One animated measurement drives panel space and the page surface that Glow already follows. The original account/profile subtree, menu, native rail measurement, and panel resize handlers are preserved. The preference is local and independent of Glow's on/off state.

Verification passed:

- 13 isolated browser scenarios, including continuous pre-paint alignment through rapid reversals, exact reclaimed width, unchanged avatar identity, account-menu operation, footer clearance, keyboard focus, persistence, cross-window sync, reduced motion, native compact-panel fallback, header remounts, and disposal.
- 6 native-transform tests and 17 compatibility tests. Both reviewed pristine vendor renderers (20052 and 20156) passed the full transform and syntax checks; the compatibility inspector verifies the initial renderer and geometry assets as well as Appearance.
- All 37 existing preference/runtime tests, 23 existing Glow browser scenarios, and 26 refresh regression tests.
- Visual review of the collapsed light and dark standalone fixtures. These screenshots are not captures of the native application.

The final `Refresh Neon Codex.command --local-signing --prepare-only` built 0.10.0 for **26.1007.30912 (20156)**, reused the persistent signing identity, verified all **110 code objects**, passed installation preflight, and returned READY. All seven source assets match the staged report and the packaged navigation runtime matches the final tested source. Eight archive entries changed. CSP, original packed data, signature policy, and the installed baseline checks passed.

**Native launch failed after the user installed this candidate.** The earlier preparation had not replaced, quit, or launched the app; its fixture and packaging checks missed the absent window type during native startup. See the 0.10.1 repair above. This candidate was not published as a GitHub release. The sidebar's actual account menu, navigation, compact/peek behavior, resizing, and browser/right-pane layout still require native checks.

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
