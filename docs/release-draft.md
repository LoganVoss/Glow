# Glow 0.10.7 — App update compatibility

Updated for **Codex/ChatGPT 26.1013.31256 (20586)**. Created by **Logan Voss + Astra 6 Ultra**.

This release repairs the updated app’s Appearance integration, border alignment, and sidebar toggle. Earlier reviewed builds remain supported. Your saved looks and persistent local signing identity are preserved.

## Refresh with one prompt

Paste this into ChatGPT or Codex with file and Terminal access to your Mac, and point it at your existing Glow folder:

```text
Update Glow (Codex/ChatGPT Appearance Plugin) to work with the latest updated build of Codex/ChatGPT app. The most recent app update broke the plugin.
```

The assistant can review your app and prepare the update. Finish with its command in a separate Terminal window: **READY → Command-Q → DONE → reopen**. Keep your `.local/` backups and private signing identity. No Apple Developer account or new publisher signature is required.

[Install](https://github.com/LoganVoss/Glow#install-with-one-prompt) · [Manual refresh](https://github.com/LoganVoss/Glow/blob/main/docs/install.md#after-an-app-update) · [Demo](https://www.youtube.com/watch?v=H-9Ug0_luwg)

## Verification

All four reviewed vendor builds pass compatibility checks. Appearance, sidebar, border geometry, runtime, installer, recovery, and signing-policy checks pass. The prepared local build verifies **109 code objects**, passes installation preflight, and starts its packaged renderer with normal, missing, and failing Glow. The dependency audit reports no known vulnerabilities. See the [verification record](https://github.com/LoganVoss/Glow/blob/main/docs/verification.md) for local package and bootstrap results.

**Native post-install testing remains required.** This is an experimental, source-only prerelease for Apple silicon macOS. Local signing adds an app-scoped library-validation exception and removes vendor team-bound capabilities; the result is not notarized. No OpenAI app bundle, account data, or signing material is distributed.

Original code is MIT licensed; third-party marks and artwork retain their respective terms.
