![Glow framing Codex in dark mode](GitHub%20Photos/Screen%20Shot%202%20-%20Chat%20Window%20Light.png)

<h1 align="center">Glow (Codex Neon Appearance Plugin)</h1>
<p align="center">The party starts here.</p>
<p align="center">Created by <strong>Logan Voss + Astra 6 Ultra</strong></p>
<p align="center">
  <a href="https://www.youtube.com/watch?v=H-9Ug0_luwg">Watch the demo</a> ·
  <a href="#install-with-one-prompt">Install</a> ·
  <a href="#after-an-app-update">Refresh after an update</a>
</p>

Glow wraps Codex in a continuous, softly diffused color border. Tune it inside **Settings → Appearance → Glow**, with separate light and dark looks and motion that stays with you as you move between windows.

![Glow framing Codex in light mode](GitHub%20Photos/Screen%20Shot%201%20-%20Chat%20Window%20Light.png)

## Make it yours

Open **Settings → Appearance → Glow**. Everything lives in one place:

- **Color:** choose one hue with **1**, browse combinations with the **eyedropper**, or roll the **dice** for a new selection.
- **Vibe:** soft matte pastels or saturated Neon. Shuffling stays within your vibe.
- **Animation:** Pulse breathes, Bloom flows, Ping sends a trail of light around the frame.
- **Finish:** adjust thickness, spread, intensity, saturation, gloss, and animation speed.

Light and dark surfaces blend gently between modes; Reduce Motion keeps changes immediate. Light and dark controls stay in sync with the app's Appearance setting. Your first tuned look transfers once to the other mode; after that, each stays independent so you can have a distinct look for each.

<p align="center">
  <img src="GitHub%20Photos/Screen%20Shot%203%20-%20Settings%20-%20Glow.png" alt="Glow settings: color controls, Soft and Neon vibes, Pulse, Bloom and Ping animations, and six adjustment sliders" width="760">
</p>

Glow also includes a sidebar toggle tweak. Once Glow is installed, you can use the normal sidebar toggle (top-left corner of chat) to further customize your experience.

## Install with one prompt

**No Apple Developer account or Apple signing certificate required.** Glow 0.10.9 creates a private signing identity on your Mac and reuses it when you refresh. It stays inside your normal app and its Appearance settings.

This is an experimental local modification, **not notarized**. It adds an app-scoped library-validation exception and removes vendor team-bound capabilities. Hardened runtime, Electron fuses, and Content Security Policy are preserved; system-wide protections and quarantine are unchanged. [Verification and remaining native checks →](docs/verification.md)

Paste this into **Codex or ChatGPT with terminal access to your Mac**. A browser-only chat cannot build local software.

```text
Set up Glow from https://github.com/LoganVoss/Glow on this Mac with --local-signing.
No Apple Developer account or Apple-issued certificate should be needed. I understand
this experimental local patch changes the app signature, adds an app-scoped library-
validation exception, and is not notarized.

Use my existing Glow checkout, or clone into ~/Glow. Safely update without overwriting
my changes. Read AGENTS.md, README.md, and docs/install.md. Preserve .local recovery
files and the private identity at ~/Library/Application Support/Glow/Signing. Never
upload that identity, replace it silently, or change my existing Keychain permissions.

Check the required tools and run npm ci --ignore-scripts --no-audit --no-fund. Inspect
the current OpenAI-signed app with scripts/compatibility.mjs, using its matching
preserved original if Glow is installed. Review and adapt new versions using
docs/compatibility.md; do not bypass source, signature, or recovery checks.

Run "./Refresh Neon Codex.command" --local-signing --prepare-only and verify the build
and preflight. Do not quit this app or start the waiting installer from this chat.
Give me the exact absolute Refresh command with --local-signing for a separate
Terminal window: READY → Command-Q → DONE → reopen → Settings → Appearance → Glow.
Explain the initial Keychain prompt and how Always Allow relates to the stable local
identity. Include refresh and restore directions, and state any untested behavior.
```

**Finish in Terminal:** run the provided command. Wait for **READY → ⌘Q → DONE → reopen**. Keep Terminal open throughout. Your normal app is updated in place; no separate Glow app is installed.

**On first launch**, you may see this macOS Keychain prompt:

<p align="center">
  <img src="GitHub%20Photos/Keychain%20Permission.png" alt="macOS asks ChatGPT to access Codex Storage Key, with Always Allow, Deny, and Allow choices" width="760">
</p>

Glow changes the app’s signing identity, so macOS asks it to regain access to its existing **“Codex Storage Key”**—this is expected reauthorization, not Glow collecting your password. [Why macOS asks](https://support.apple.com/guide/keychain-access/kyca1331/mac)

For the ChatGPT/Codex app you just installed with Glow, **choose Always Allow** after entering your login Keychain password in this macOS dialog; this remembers access for that app identity. [Apple’s explanation](https://support.apple.com/guide/keychain-access/kyca1243/mac)

Glow uses a persistent local signature, so you need **no Apple Developer account**; code signing is still in place. Keeping that identity supports authorization across refreshes, although a lost or replaced identity, changed app behavior, or security policy can still require approval. [How Keychain continuity works →](docs/install.md#keychain-and-your-local-identity)

The current reviewed sources are `/Applications/ChatGPT.app`, bundle ID `com.openai.codex`, versions **26.1013.40934 (20770)**, **26.1013.31256 (20586)**, **26.1007.71326 (20398)**, **26.1007.30912 (20156)**, and **26.1007.21159 (20052)** on Apple silicon. Build tools: Node.js 22.12+, Git, Python 3, and macOS command-line tools. [Manual setup and certificate-based mode →](docs/install.md)

## After an app update

When a software update is released by OpenAI, Glow breaks. To fix it, use this prompt with ChatGPT:

```text
Update Glow (Codex/ChatGPT Appearance Plugin) to work with the latest updated build of Codex/ChatGPT app. The most recent app update broke the plugin.
```

Use a chat with file and Terminal access to your Mac, and point it at your existing Glow folder. It can review the new app version, adapt Glow, and prepare the update; then follow its Terminal instructions: **READY → ⌘Q → DONE → reopen**.

Keep your Glow folder, `.local/` backups, and private signing identity. No Apple Developer account or new signature from Glow’s publisher is required. [Manual refresh instructions](docs/install.md#after-an-app-update) · [Compatibility guide](docs/compatibility.md)

## How it integrates

Glow verifies the OpenAI-signed source, stages a local copy, and adds its renderer and controls to the existing Appearance panel. The selected signing mode signs the modified bundle. After you quit, the installer replaces your app and retains the previous bundle for recovery. Glow’s renderer makes no network requests; its preferences stay local.

Invisible glow layers pause after fading out; offscreen previews and hidden windows also stop their animation clocks. The visible border keeps its continuous motion. [Performance audit →](docs/performance.md)

Both modes replace OpenAI’s signature and remove entitlements tied to OpenAI’s signing team. Local signing also adds an app-scoped library-validation exception so code signed by your local identity can load; certificate-based mode retains library validation. Sign-in, integrations, and updating require native verification. This repository distributes source, not a signed or notarized OpenAI application. [Build details](docs/build-and-restore.md) · [Verification](docs/verification.md) · [Security](SECURITY.md)

To undo the last installation, run this in Terminal and follow its quit-and-wait instructions:

```sh
"$HOME/Glow/Restore Previous Codex.command"
```

This restores the immediately previous app bundle, which may be an earlier Glow build.

---

Original code © 2026 Logan Voss, released under the [MIT License](LICENSE). OpenAI and Apple artwork, names, and application imagery retain their respective rights; see [third-party notices](THIRD_PARTY_NOTICES.md).

An independent, experimental appearance patch. It integrates into your locally installed app; it is not (yet) an official OpenAI plugin or endorsed by OpenAI.

[Settings guide](docs/appearance.md) · [Contributing](CONTRIBUTING.md) · [Report an issue](https://github.com/LoganVoss/Glow/issues)
