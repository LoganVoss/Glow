# Glow 0.10.8 — Less work, same glow

Memory and idle-rendering fixes for **Codex/ChatGPT**, preserving Glow’s colors, motion, and Appearance controls. Created by **Logan Voss + Astra 6 Ultra**.

- Release detached sidebar controls and route surfaces during navigation.
- Clean up removed theme surfaces without rescanning the conversation or waiting for a visible window.
- Stop invisible border animations after the dissolve; suspend offscreen previews and hidden windows.
- Skip redundant settings updates when unrelated app styles change.

The visible border keeps its established appearance. This release does not claim zero-cost animation or a measured reduction in native app temperature. See the [performance audit](https://github.com/LoganVoss/Glow/blob/main/docs/performance.md) and [verification record](https://github.com/LoganVoss/Glow/blob/main/docs/verification.md).

## Refresh

Update your existing clean checkout with `git pull --ff-only`, preserving local edits and `.local/` recovery files. Run `"./Refresh Neon Codex.command" --local-signing` in a separate Terminal window, then **READY → Command-Q → DONE → reopen**. Your settings and persistent local signing identity are retained; no Apple Developer account is required.

[Install](https://github.com/LoganVoss/Glow#install-with-one-prompt) · [Manual refresh](https://github.com/LoganVoss/Glow/blob/main/docs/install.md#after-an-app-update) · [Demo](https://www.youtube.com/watch?v=H-9Ug0_luwg)

**Native post-install testing remains required.** This is an experimental, source-only prerelease for Apple silicon macOS. Local signing adds an app-scoped library-validation exception and removes vendor team-bound capabilities; the result is not notarized. No OpenAI app bundle, account data, or signing material is distributed.

Original code is MIT licensed; third-party marks and artwork retain their respective terms.
