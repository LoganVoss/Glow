# Build, install, and restore

## Supported source

The reviewed sources are **26.1007.30912 (20156)** and **26.1007.21159 (20052)**, macOS arm64, with the expected original archive, stylesheet, renderer assets, and signing state. A different version or changed source must fail verification. Do not bypass a failed check by replacing a hash or version number.

Exact source metadata lives in `scripts/source-pins.json`. The builder selects the installed app version, then prefers `.local/originals/<version>-<build>/ChatGPT.app`. It uses the legacy `.local/original/ChatGPT.app` only when its version and build match; otherwise it reads `/Applications/ChatGPT.app`. Explicit `--source` selection still requires the installed baseline to be the same version when building. A stale original cannot cause a downgrade. If the installed app is already patched, supply a separately preserved, unmodified copy explicitly:

```sh
npm run inspect -- --source '/absolute/path/to/original/ChatGPT.app'
npm run build -- --source '/absolute/path/to/original/ChatGPT.app' --identity YOUR_CERTIFICATE_SHA1
```

The default staged output is `.local/staging/ChatGPT.app`. The installer targets `/Applications/ChatGPT.app` only. The builder's `--installed-app` option records another baseline for inspection or testing; it does not change the installation destination. Output and source are separate, and an existing output must not be overwritten. Keep original, staging, and recovery bundles out of Git.

## Signing

Use your own valid Apple-issued development identity, including its private key in your Keychain. The build requires an explicit certificate SHA-1 through `--identity`. The Finder build launcher may select an identity only when exactly one valid identity is available; otherwise use the explicit command. Never commit an identity, signing report, certificate export, or private key.

The locally signed copy cannot retain OpenAI's team-bound entitlements and provisioning. Sign-in, Keychain access, notifications, shared services, integrations, and updating therefore require manual verification. A local development signature is not OpenAI's signature and does not make the copy notarized for distribution.

The builder is intended to preserve hardened runtime, library validation, and Electron security fuses while rebuilding integrity records and signatures. It must not disable macOS protections to make a build launch.

## Installation

1. Build and review the generated local report.
2. Open **Install Neon Codex.command** in Finder. The foreground Terminal process must remain open.
3. Quit ChatGPT with **Command-Q**. Wait for the app and its bundled helpers to exit.
4. Wait for the installer's completion message, then reopen your usual app.
5. Complete the [native smoke test](smoke-test.md), especially startup and Settings → Appearance.

The installer verifies its staged copy and the current installed baseline before replacement. It preserves the previous installed bundle for restoration and aborts if the app changes while it waits. It does not quit or launch the app for you. An `installed` status means the bundle was replaced; it does not confirm a successful app launch.

Command-line equivalents:

```sh
npm run check:install
npm run install:theme
npm run restore
```

Run a waiting installer from a persistent Terminal window, not from a session hosted inside the app that must quit.

## One-command refresh

Open **Refresh Neon Codex.command**, or run `npm run refresh` from a persistent Terminal. The command:

1. Checks the installed bundle signature and exact reviewed version.
2. Reuses a staged build only when its signed contents, installed baseline, theme version, and five runtime source hashes still match.
3. Otherwise verifies a matching pristine vendor source, preserves the old staging directory, builds and signs a fresh replacement, and runs installation preflight.
4. Prints **READY**, waits for your manual **Command-Q**, then installs and prints **DONE**. It never quits or reopens the app.

When the current app exactly matches the recorded completed installation and current Glow source, Refresh reports that it is already installed and returns without rebuilding or asking you to quit.

Use `npm run refresh -- --prepare-only` to stop after preparation. Use `--identity YOUR_CERTIFICATE_SHA1` if more than one signing identity is available. Fresh builds can take a few minutes.

If a reviewed app update completes while Refresh is waiting, it can rebuild for that version and retry, up to three preparation attempts. Unknown versions, changes within the same version, invalid signatures, or a potentially started installation transaction stop the refresh. Recovery copies are retained. Interrupted transactions must be resolved before staging that they depend on can move.

Refresh is a foreground tool, not a background watcher. App updates can replace Glow until you refresh it. It never changes the updater, downloads an app, weakens version checks, or promises compatibility with a future version. A new version must be inspected and added to the reviewed source manifest before refresh can support it.

## Restore and updates

Open **Restore Previous Codex.command**, quit ChatGPT fully, and wait for completion before reopening. This restores the bundle present immediately before this installation; it may be an earlier Neon Codex build. Keep the pristine original separately if you need to return to the vendor build.

Restoration swaps the application bundle, not renderer preferences. Versions 0.4–0.7 cannot read the 0.8 preference schema and fall back to their default glow settings after a downgrade. Keep a private preference backup if you need to preserve tuning through a downgrade.

A future app update can replace the patch and invalidate its reviewed selectors, runtime hooks, archive hashes, or signature assumptions. Re-review that version and rerun verification before creating a new patch. This project does not automatically patch updates or disable the app's updater.

## Local diagnostics

Build and install reports belong under `.local/`. Treat them as private: they can include absolute paths, signing names, Team IDs, and certificate identifiers. Record a redacted result in a review only after running a check. Do not infer a native pass from the preview or from a valid code signature.
