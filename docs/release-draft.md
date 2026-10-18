# Glow 0.10.9 — App update compatibility

Restores Glow support for **Codex/ChatGPT 26.1013.40934 (20770)**. Created by **Logan Voss + Astra 6 Ultra**.

The updated OpenAI-signed app was reviewed against the previous build. Its Appearance controls, native sidebar command, and window geometry retain the existing integration, so Glow's design and runtime are unchanged. The memory and idle-rendering fixes from 0.10.8 remain included.

## Refresh

Update your existing clean checkout with `git pull --ff-only`, preserving local edits and `.local/` recovery files. Run `"./Refresh Neon Codex.command" --local-signing` in a separate Terminal window, then **READY → Command-Q → DONE → reopen**. Your settings and persistent local signing identity are retained; no Apple Developer account is required.

[Install](https://github.com/LoganVoss/Glow#install-with-one-prompt) · [Refresh instructions](https://github.com/LoganVoss/Glow/blob/main/docs/install.md#after-an-app-update) · [Verification](https://github.com/LoganVoss/Glow/blob/main/docs/verification.md) · [Demo](https://www.youtube.com/watch?v=H-9Ug0_luwg)

**Native post-install testing remains required.** This is an experimental, source-only prerelease for Apple silicon macOS. Local signing adds an app-scoped library-validation exception and removes vendor team-bound capabilities; the result is not notarized. No OpenAI app bundle, account data, or signing material is distributed.

Original code is MIT licensed; third-party marks and artwork retain their respective terms.
