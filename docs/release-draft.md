# Glow 0.10.10 — App update compatibility

Restores Glow support for **Codex/ChatGPT 26.1016.51333 (21161)**. Created by **Logan Voss + Astra 6 Ultra**.

This update adapts Glow to the app's renamed Appearance and sidebar controls. The integration was reviewed against the actual OpenAI-signed build, with explicit checks for each supported version. Glow's design, saved preferences, and memory and idle-rendering fixes remain unchanged.

## Refresh

Update your existing clean checkout with `git pull --ff-only`, preserving local edits and `.local/` recovery files. Run `"./Refresh Neon Codex.command" --local-signing` in a separate Terminal window, then **READY → Command-Q → DONE → reopen**. Your persistent local signing identity is reused; no Apple Developer account is required.

[Install](https://github.com/LoganVoss/Glow#install-with-one-prompt) · [Refresh instructions](https://github.com/LoganVoss/Glow/blob/main/docs/install.md#after-an-app-update) · [Verification](https://github.com/LoganVoss/Glow/blob/main/docs/verification.md) · [Demo](https://www.youtube.com/watch?v=H-9Ug0_luwg)

**Native post-install testing remains required.** This is an experimental, source-only prerelease for Apple silicon macOS. Local signing adds an app-scoped library-validation exception and removes vendor team-bound capabilities; the result is not notarized. No OpenAI app bundle, account data, or signing material is distributed.

Original code is MIT licensed; third-party marks and artwork retain their respective terms.
