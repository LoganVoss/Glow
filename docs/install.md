# Install Glow

Glow builds a locally signed copy of your installed app, then replaces the app after you quit it. The source is public; application bundles and signing certificates are not included.

For guided setup, use the copy-and-paste prompt in the [README](../README.md). It requires an assistant with terminal access to your Mac. These are the equivalent manual steps.

## Requirements

| Requirement | Supported configuration |
| --- | --- |
| Mac | Apple silicon, macOS |
| Installed app | `/Applications/ChatGPT.app`, bundle identifier `com.openai.codex` |
| Reviewed app versions | **26.1007.30912 (20156)** or **26.1007.21159 (20052)** |
| Build tools | Node.js **22.12+**, npm, Git, Python 3 at `/usr/bin/python3`, and macOS command-line tools |
| Signing | Your own valid Apple-issued code-signing certificate **and its private key**, available in Keychain |
| Location | A local checkout on the same filesystem as `/Applications`, with permission to replace the installed app |

The exact reviewed versions live in [source-pins.json](../scripts/source-pins.json). An unknown version stops before patching. Renaming another app or changing a version number does not make it compatible.

The installer does not request administrator privileges. Keep the checkout at `~/Glow` on your internal disk and retain its `.local/` folder; it contains the verified original, prepared builds, and recovery copies.

## First installation

Open **Terminal** and download the source:

```sh
git clone https://github.com/LoganVoss/Glow.git "$HOME/Glow"
cd "$HOME/Glow"
npm ci --ignore-scripts --no-audit --no-fund
```

If you already have this checkout, use the [update steps](#after-an-app-update) instead of cloning over it.

Prepare and verify the build:

```sh
"$HOME/Glow/Refresh Neon Codex.command" --prepare-only
```

This checks your app, preserves a verified unmodified source, builds Glow, signs the result, and runs installation checks. It selects a certificate automatically only when exactly one valid identity is available. See [signing setup](#signing-setup) if it cannot select one.

Preparation can take a few minutes. **`READY. Preparation complete` means your installed app has not changed.** You can run this preparation step from a locally connected assistant.

To finish, run the following yourself in a persistent **Terminal window**:

```sh
"$HOME/Glow/Refresh Neon Codex.command"
```

1. Wait for **READY** and the instruction to quit.
2. Quit ChatGPT/Codex completely with **Command-Q**.
3. Keep Terminal open until **DONE**.
4. Reopen your usual app and go to **Settings → Appearance → Glow**.

Do not run this waiting step inside the app that must quit. The installer never quits or reopens the app for you. If the current Glow build is already installed and matches the source, Refresh reports that no change is needed.

Check startup, your normal account features, and the Appearance controls after installation. The [native smoke test](smoke-test.md) gives the full checklist; a successful build alone does not establish native compatibility.

## Signing setup

You need a valid Apple-issued signing identity with its private key in your Mac's Keychain. An Apple Development identity is suitable for the local build. The project does not provide certificates and does not use ad-hoc signing.

Use Apple's instructions to [create and manage signing certificates in Xcode](https://help.apple.com/xcode/mac/current/en.lproj/dev154b28f09.html). Installing the command-line tools alone does not create a signing identity.

List the identities the builder accepts:

```sh
cd "$HOME/Glow"
node scripts/build.mjs --list-identities
```

If several are listed, select your certificate by replacing `YOUR_CERTIFICATE_SHA1` with its 40-character SHA-1:

```sh
"$HOME/Glow/Refresh Neon Codex.command" --prepare-only --identity YOUR_CERTIFICATE_SHA1
```

Use the same `--identity YOUR_CERTIFICATE_SHA1` option on the final Refresh command. Keep certificate exports, private keys, and full signing output private.

Local signing replaces OpenAI's signature and removes capabilities tied to OpenAI's signing team. The result is not notarized for distribution. Sign-in, Keychain access, notifications, integrations, and updating require manual verification. The builder preserves hardened runtime, library validation, and Electron security fuses.

## After an app update

An app update can replace Glow. **There is no background reinstallation or guaranteed uninterrupted glow across updates.** Once the update finishes, get the latest Glow source and refresh:

```sh
cd "$HOME/Glow" && git pull --ff-only && \
  npm ci --ignore-scripts --no-audit --no-fund && \
  "./Refresh Neon Codex.command"
```

Continue only if the source and dependency updates succeed. Then follow the same **READY → Command-Q → DONE → reopen** sequence. Use `--identity YOUR_CERTIFICATE_SHA1` if you need to select a certificate explicitly.

Refresh checks the currently installed version and prepares the matching build. It preserves old staging and recovery files and leaves your saved Glow preferences in place. It does not downgrade the app or change its updater.

If the new app version **has not been reviewed**, Refresh stops without patching it. Wait for a compatible Glow update, then run these steps again. Do not bypass version, hash, signature, or recovery checks. If an update completes while Refresh is waiting, it can retry for a reviewed version; unsupported changes still stop safely.

## Restore the previous app

From the same checkout in Terminal:

```sh
"$HOME/Glow/Restore Previous Codex.command"
```

Follow its quit-and-wait instructions, wait for completion, then reopen. This restores the **bundle installed immediately before the last Glow installation**. It may be an earlier Glow build. The untouched vendor source is preserved separately under `.local/originals/`.

Restoration changes the application bundle, not your saved renderer preferences. Keep `.local/` until you no longer need recovery. See [build and restore details](build-and-restore.md) for source selection and interrupted transactions.

## Troubleshooting

| Message or symptom | Next step |
| --- | --- |
| App version has not been reviewed | Update this repository. If your version is still absent from `source-pins.json`, wait for compatibility support. |
| Installed app differs from the recorded build snapshot | Run **Refresh**, which prepares against the current reviewed app. Do not reuse the old Install command or edit the snapshot. |
| No valid signing identity | Add your Apple-issued certificate and its private key to Keychain using the signing instructions above. |
| More than one valid signing identity | List accepted identities and pass your choice using `--identity`. |
| `node` or `npm` not found, or Node is too old | Install Node.js 22.12 or later and reopen Terminal. |
| Git, Python, or macOS build tools are missing | Install Apple's command-line tools with `xcode-select --install`, finish the installation, then retry. |
| Atomic exchange requires the same filesystem | Use a checkout on the app's filesystem, normally `~/Glow` on the internal disk. Retain any existing `.local/` recovery files. |
| Permission denied when replacing the app | Confirm your Mac account can replace `/Applications/ChatGPT.app`. On a managed Mac, contact its administrator. |
| Waiting for Codex and its helpers | Use Command-Q, not just the window's close button. Keep Terminal open. Control-C cancels while waiting. |
| Interrupted installation or recovery record | Keep the checkout and `.local/` intact. Follow the restore instructions; do not delete staging to force a new build. |
| Startup, account, or integration regression | Restore the previous app and report the app version, Glow version, and a minimal reproduction. |

Reports and logs in `.local/` can contain your username, file paths, and signing identifiers. Share only redacted excerpts. Never upload application bundles, account data, certificates, or private keys.
