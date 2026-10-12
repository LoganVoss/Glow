![Glow framing Codex in dark mode](GitHub%20Photos/Screen%20Shot%202%20-%20Chat%20Window%20Light.png)

<h1 align="center">Glow (Codex Neon Appearance Plugin)</h1>
<p align="center">Soft light. Fluid motion. A workspace that feels like yours.</p>
<p align="center">Created by <strong>Logan Voss + Astra 6 Ultra</strong></p>
<p align="center">
  <a href="https://www.youtube.com/watch?v=H-9Ug0_luwg">Watch the demo</a> ·
  <a href="#install-with-one-prompt">Install</a> ·
  <a href="#after-an-app-update">Refresh after an update</a>
</p>

Glow wraps Codex in a continuous, softly diffused color border. Tune it inside **Settings → Appearance → Glow**, with separate light and dark looks and motion that stays with you as you move between chats and settings.

**macOS · Apple silicon · MIT code · v0.8.9**

An independent, experimental appearance patch. It integrates into your locally installed app; it is not an official OpenAI plugin or endorsed by OpenAI.

![Glow framing Codex in light mode](GitHub%20Photos/Screen%20Shot%201%20-%20Chat%20Window%20Light.png)

## Make it yours

Open **Settings → Appearance → Glow**. Everything lives in one place:

- **Color:** choose one hue with **1**, browse combinations with the **eyedropper**, or roll the **dice** for a new selection.
- **Vibe:** soft matte pastels or saturated Neon. Shuffling stays within your vibe.
- **Animation:** Pulse breathes, Bloom flows, Ping sends a trail of light around the frame.
- **Finish:** adjust thickness, spread, intensity, saturation, gloss, and animation speed.

Light and dark controls stay in sync with the app's Appearance setting. Your first tuned look transfers once to the other mode; after that, each stays independent. Colors blend smoothly, the glow dissolves on and off, and Reduce Motion is respected.

<p align="center">
  <img src="GitHub%20Photos/Screen%20Shot%203%20-%20Settings%20-%20Glow.png" alt="Glow settings: color controls, Soft and Neon vibes, Pulse, Bloom and Ping animations, and six adjustment sliders" width="760">
</p>

### See it in motion

[![Watch the Glow video demo on YouTube](https://i.ytimg.com/vi/H-9Ug0_luwg/maxresdefault.jpg)](https://www.youtube.com/watch?v=H-9Ug0_luwg)

[**Watch the full demo ↗**](https://www.youtube.com/watch?v=H-9Ug0_luwg)

## Install with one prompt

Paste this into **Codex or ChatGPT with terminal access to your Mac**. A browser-only chat can explain the steps but cannot install local software.

**Before you start:** this build supports `/Applications/ChatGPT.app` with bundle ID `com.openai.codex`, versions **26.1007.30912 (20156)** and **26.1007.21159 (20052)**, on Apple silicon. You need Node.js 22.12+, Git, Python 3, macOS command-line tools, and **your own valid Apple-issued signing certificate with its private key in Keychain**. Missing a prerequisite? See the [setup guide](docs/install.md).

```text
Set up Glow from https://github.com/LoganVoss/Glow on this Mac.

Clone it into ~/Glow, or safely update that checkout without overwriting my changes or
deleting .local. Read README.md and docs/install.md. Check the Mac, installed app
version, required tools, and Apple-issued signing identity. If anything is missing or
unsupported, explain the next step and stop without changing the app. Never bypass
version or signature checks.

Run npm ci --ignore-scripts --no-audit --no-fund, then run "./Refresh Neon
Codex.command" --prepare-only. Use automatic signing selection only if exactly one
valid identity is available; otherwise ask which identity to use and pass --identity.
Verify that build, signing, and installation preflight succeed.

Do not quit or reopen the app or start the waiting installer from this chat. Give me
the exact absolute Refresh command to run in a separate Terminal window, including the
same --identity value if one was selected. Explain: wait for READY, quit the app with
Command-Q, leave Terminal open until DONE, then reopen and go to Settings → Appearance
→ Glow. Include the refresh-after-update and restore instructions.
```

**Finish in Terminal:** run the command the assistant provides. Wait for **READY → ⌘Q → DONE → reopen**. Keep Terminal open throughout. Your normal app is updated in place; no separate Glow app is installed.

Prefer to do it yourself? Follow the [manual installation guide](docs/install.md).

## After an app update

An app update may replace Glow. Keep your `~/Glow` folder, including its `.local` backups. In a separate Terminal window, run:

```sh
cd "$HOME/Glow" && git pull --ff-only && \
  npm ci --ignore-scripts --no-audit --no-fund && \
  "./Refresh Neon Codex.command"
```

Use the same **READY → ⌘Q → DONE → reopen** steps. Refresh checks the installed version, prepares a matching signed build, and reapplies Glow. It preserves your saved Glow settings.

**New app versions need a compatibility review.** If Refresh says the version is unsupported, leave the app as it is and check for a compatible Glow update. Glow does not disable the app's updater or stay installed seamlessly through updates. [Refresh details →](docs/build-and-restore.md#one-command-refresh)

## How it integrates

The builder verifies your installed app against a reviewed source, stages a local copy, adds the glow renderer and Appearance controls, and signs that copy with your certificate. After you quit, the installer replaces the app and retains the previous bundle for recovery. Glow's renderer makes no network requests; its preferences stay local.

Local signing changes the app's signing identity and removes OpenAI-specific entitlements. Account services, integrations, and updating need verification on your Mac. This repository distributes source, not a signed or notarized OpenAI app. [Build details](docs/build-and-restore.md) · [Verification](docs/verification.md) · [Security](SECURITY.md)

To undo the last installation, run this in Terminal and follow its quit-and-wait instructions:

```sh
"$HOME/Glow/Restore Previous Codex.command"
```

This restores the immediately previous app bundle, which may be an earlier Glow build.

---

Original code © 2026 Logan Voss, released under the [MIT License](LICENSE). OpenAI and Apple artwork, names, and application imagery retain their respective rights; see [third-party notices](THIRD_PARTY_NOTICES.md).

[Settings guide](docs/appearance.md) · [Contributing](CONTRIBUTING.md) · [Report an issue](https://github.com/LoganVoss/Glow/issues)
