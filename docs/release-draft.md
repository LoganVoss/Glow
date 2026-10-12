# Glow 0.10.5 — Sidebar & motion

More room, one familiar control. Created by **Logan Voss + Astra 6 Ultra**.

The existing **Toggle Sidebar** button now cycles through hiding chats, restoring chats with the icon rail tucked away, and restoring the normal layout. A full-width window icon identifies the new state. Your original account control stays accessible, and Settings includes a small Home button while the rail is hidden.

This release keeps replacement navigation icons hidden from their first frame when returning from Settings. Light/dark changes use a brief **160 ms** surface dissolve; the selected mode and text update immediately. Glow’s color, animation, and material controls remain in **Settings → Appearance → Glow**.

[Watch the demo](https://www.youtube.com/watch?v=H-9Ug0_luwg) · [Install with one prompt](https://github.com/LoganVoss/Glow#install-with-one-prompt) · [Refresh after updates](https://github.com/LoganVoss/Glow#after-an-app-update)

## Install or refresh

**No Apple Developer account or Apple-issued certificate required.** Download the source bundle or update your checkout. From that folder, run:

```sh
npm ci --ignore-scripts --no-audit --no-fund
"./Refresh Neon Codex.command" --local-signing --prepare-only
```

Finish in a separate Terminal window with `"./Refresh Neon Codex.command" --local-signing`: **READY → Command-Q → DONE → reopen**. Keep your `.local/` recovery records and private signing identity. The same refresh flow reapplies Glow after a reviewed app update.

## Availability and verification

Experimental, source-only prerelease for **Apple silicon macOS**, reviewed against app builds **26.1007.30912 (20156)** and **26.1007.21159 (20052)**. The modified app is built and signed locally; the download contains no OpenAI app bundle, account data, or signing key.

The sidebar command fails back to native behavior when Glow is unavailable. Browser regressions cover route replacement, account access, the three-state cycle, rapid reversals, native peek, reduced motion, and concurrent theme/layout transitions. Separate isolated checks exercise the actual packaged native entry with normal, missing, and failing Glow. Native post-install verification is still required; see the [verification record](https://github.com/LoganVoss/Glow/blob/main/docs/verification.md).

Local signing reuses your Mac’s private identity. Initial Keychain authorization may be required. It adds an app-scoped library-validation exception and removes vendor team-bound capabilities; the result is not notarized. System-wide protections are unchanged. Unknown app versions require compatibility review. [Installation details](https://github.com/LoganVoss/Glow/blob/main/docs/install.md)

Original code is MIT licensed; third-party marks and artwork retain their respective terms.
