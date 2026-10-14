# Glow 0.10.6 — App update compatibility

Glow is ready for **Codex 26.1007.71326 (20398)**. Created by **Logan Voss + Astra 6 Ultra**.

This release adapts the native sidebar command to the updated app, keeps support for builds **20156** and **20052**, and fixes Restore after moving your Glow folder. Your glow settings, visuals, and persistent local signing identity stay intact.

## Refresh

From your existing Glow folder:

```sh
git pull --ff-only
npm ci --ignore-scripts --no-audit --no-fund
"./Refresh Neon Codex.command" --local-signing --prepare-only
```

Then run `"./Refresh Neon Codex.command" --local-signing` in a separate Terminal window: **READY → Command-Q → DONE → reopen**. Keep `.local/` and your private signing identity. No Apple Developer account or new publisher signature is required.

[First-time install](https://github.com/LoganVoss/Glow#install-with-one-prompt) · [Keychain prompt explained](https://github.com/LoganVoss/Glow/blob/main/docs/install.md#keychain-and-your-local-identity) · [Watch the demo](https://www.youtube.com/watch?v=H-9Ug0_luwg)

## Verified

All three reviewed vendor builds pass compatibility checks. Runtime/UI, command, installer, recovery, and signing-policy tests pass; the dependency audit reports no known vulnerabilities. The new local build verifies all **110 code signatures**, preserves its checked source/integrity protections, and passes installation preflight. Isolated tests of the packaged renderer also load its real Settings and Appearance modules and verify startup with missing or failing Glow.

**Native post-install testing remains required.** This is an experimental, source-only prerelease for Apple silicon macOS; no OpenAI app bundle, account data, or signing material is distributed. Local signing adds an app-scoped library-validation exception and removes vendor team-bound capabilities; the result is not notarized. [Verification record](https://github.com/LoganVoss/Glow/blob/main/docs/verification.md) · [Installation details](https://github.com/LoganVoss/Glow/blob/main/docs/install.md)

Original code is MIT licensed; third-party marks and artwork retain their respective terms.
