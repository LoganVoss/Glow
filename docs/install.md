# Install Glow

Glow 0.10.13 builds and signs a local copy of your app, then replaces the app after you quit. Its border and controls live in **Settings → Appearance → Glow**. No Apple Developer membership, Apple-issued certificate, or signature from Glow's publisher is required.

This is an experimental local modification, not a notarized distribution. See [verification](verification.md) for what has actually been tested.

## Requirements

| Requirement | Configuration |
| --- | --- |
| Mac | Apple silicon, macOS |
| Installed app | `/Applications/ChatGPT.app`, bundle identifier `com.openai.codex` |
| Reviewed sources | **26.1027.30824 (22943)**, **26.1023.50603 (22391)**, **26.1021.31345 (21828)**, **26.1016.51333 (21161)**, **26.1013.40934 (20770)**, **26.1013.31256 (20586)**, **26.1007.71326 (20398)**, **26.1007.30912 (20156)**, or **26.1007.21159 (20052)** |
| Build tools | Node.js **22.12+**, npm, Git, Python 3, and Apple's command-line tools |
| Signing | Generated automatically on this Mac with explicit `--local-signing` |
| Location | Checkout on the same filesystem as the app, with permission to replace it |

The installer does not request administrator privileges. New app versions need a [structural compatibility review](compatibility.md); changing only a version or hash is insufficient.

## Prepare

For a new checkout:

```sh
git clone https://github.com/LoganVoss/Glow.git "$HOME/Glow"
cd "$HOME/Glow"
npm ci --ignore-scripts --no-audit --no-fund
"./Refresh Neon Codex.command" --local-signing --prepare-only
```

Use an existing checkout when available. Never clone over it or discard its `.local/` backups.

Preparation verifies the OpenAI-signed source, preserves an original, builds Glow, signs with your persistent local identity, and checks installation. It can take a few minutes. **`READY. Preparation complete` means your installed app has not changed.** A local assistant can perform this step.

## Finish in Terminal

Run this in a separate, persistent **Terminal window**:

```sh
"$HOME/Glow/Refresh Neon Codex.command" --local-signing
```

1. Wait for **READY** and the instruction to quit.
2. Quit ChatGPT/Codex completely with **Command-Q**.
3. Keep Terminal open until **DONE**.
4. Reopen your usual app and go to **Settings → Appearance → Glow**.

The installer does not quit or reopen the app. Do not start this waiting step from a chat hosted inside the app that must quit. Complete the [native smoke test](smoke-test.md), including account features and a subsequent relaunch.

## Keychain and your local identity

**On first launch**, macOS may show this prompt, including when migrating from an older Apple-signed or ad-hoc Glow build:

<p align="center">
  <img src="../GitHub%20Photos/Keychain%20Permission.png" alt="macOS asks ChatGPT to access Codex Storage Key, with Always Allow, Deny, and Allow choices" width="760">
</p>

Glow changes the app’s signing identity, so macOS asks it to regain access to its existing **“Codex Storage Key”**—this is expected reauthorization, not Glow collecting your password. [Why macOS asks](https://support.apple.com/guide/keychain-access/kyca1331/mac)

For the ChatGPT/Codex app you just installed with Glow, **choose Always Allow** after entering your login Keychain password in this macOS dialog; this remembers access for that app identity. **Allow** grants only the current request. [Apple’s explanation](https://support.apple.com/guide/keychain-access/kyca1243/mac)

Glow uses a persistent local signature, so you need **no Apple Developer account**; code signing is still in place.

Glow creates a unique self-signed code-signing identity under:

```text
~/Library/Application Support/Glow/Signing
```

This identity is generated locally; it is **not an Apple-issued certificate** and needs no Apple account. Keep this private folder. It lives outside the Git checkout so pulling updates or re-cloning the source does not replace it. Never upload it, include it in issue attachments, or share it between users.

Each signed code component has a designated requirement bound to its identifier and that exact certificate. Rebuilt versions can therefore satisfy the same identity requirement even when their executable code changes. A different signing key cannot gain access just by using the same app name. [Apple's code identity documentation](https://developer.apple.com/library/archive/documentation/Security/Conceptual/CodeSigningGuide/Procedures/Procedures.html)

Reusing the same identity is designed to preserve that authorization across Glow refreshes.

This does not promise that macOS will never ask again. Losing or replacing the local identity, certificate expiry, changed access requests, or macOS/managed-device policy can require reauthorization. Glow stops if recorded identity state is missing or mismatched instead of silently rotating the key. Ordinary app updates can still remove the appearance patch until you refresh it.

The installer does not read the actual Codex storage secret, enter your login password, edit the item's access list, or grant access to arbitrary apps. Initial authorization remains a macOS decision. [Why modified apps may need authorization again](https://support.apple.com/guide/keychain-access/kyca1331/mac)

## Security tradeoff

Both signing modes replace OpenAI's signature and remove capabilities tied to OpenAI's signing team. Local signing also adds an app-scoped **library-validation exception** so libraries signed by your local identity can load. This reduces that protection for the modified app.

Hardened-runtime flags, Electron fuses, CSP, and archive integrity remain checked. Glow does not disable SIP or Gatekeeper, change system trust, or remove quarantine. The result is not notarized; macOS or managed-device policy may prevent it from launching. Restore the previous bundle if it fails rather than disabling system protections. Startup, Keychain, account services, notifications, integrations, and updater behavior require native testing.

## After an app update

Keep both your `.local/` recovery folder and your private signing identity. Update a clean checkout with `git pull --ff-only`, preserving any local edits, then run `npm ci --ignore-scripts --no-audit --no-fund`.

Prepare again:

```sh
"$HOME/Glow/Refresh Neon Codex.command" --local-signing --prepare-only
```

Then finish in Terminal with the same command without `--prepare-only`, following **READY → Command-Q → DONE → reopen**. Refresh preserves Glow preferences, reuses your local identity, and does not downgrade the app or alter its updater.

For help with any app update, use the [short repair prompt in the README](../README.md#after-an-app-update). If the version is unreviewed, follow the [compatibility review](compatibility.md). Your local assistant can inspect and adapt the integration without waiting for a publisher-signed package. A structural candidate still requires review and validation. An app update that arrives during installation is rechecked before any swap.

## Restore

From the same checkout in Terminal:

```sh
"$HOME/Glow/Restore Previous Codex.command"
```

Follow its quit-and-wait instructions, then reopen. This restores the bundle installed immediately before the latest Glow installation; it may be an earlier Glow build. It does not erase saved preferences or your signing identity. A pristine vendor original is retained separately in `.local/originals/`. Keep recovery records even if a build fails. If you move the checkout, move its entire `.local/` folder with it; Restore recognizes the moved backup and verifies its original contents and signature before use.

## Optional Apple certificate mode

Existing users may still choose an Apple-issued identity from Keychain:

```sh
node scripts/build.mjs --list-identities
"./Refresh Neon Codex.command" --prepare-only --identity YOUR_CERTIFICATE_SHA1
```

Finish in Terminal with the same identity and without `--prepare-only`. Do not combine `--identity` and `--local-signing`. Apple certificate mode retains library validation but still replaces OpenAI's identity and is not notarized by this project.

## Troubleshooting

| Message or symptom | Next step |
| --- | --- |
| App version has not been reviewed | Use the [compatibility inspector and repair prompt](compatibility.md); do not bypass source checks. |
| Inspector rejects a modified source | Use the preserved OpenAI-signed original matching the installed version. |
| Installed app differs from the recorded snapshot | Use Refresh to prepare against the current reviewed source; do not reuse old staging or edit the snapshot. |
| Local identity is missing, damaged, or mismatched | Preserve the checkout and private identity folder. Recover the original identity if available; do not delete files to force a silent replacement. |
| Another identity session is active | Let that build finish before retrying. Do not remove its lock while it is running. |
| Node or build tools are missing | Install Node.js 22.12+ and Apple's command-line tools (`xcode-select --install`), then reopen Terminal. |
| Atomic exchange requires the same filesystem | Use a checkout on the app's filesystem, normally the internal disk. |
| Waiting for Codex and helpers | Use Command-Q, not just the window close button. Keep Terminal open; Control-C cancels while waiting. |
| Interrupted installation | Keep `.local/` intact and follow the restore instructions. |
| Launch, account, or integration failure | Restore the previous bundle and report a minimal reproduction. Do not disable system protections. |

Share only redacted diagnostics. Never upload app bundles, account data, private signing material, or unredacted local reports.
