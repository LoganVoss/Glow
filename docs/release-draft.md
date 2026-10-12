# Glow 0.9.0 — No Apple certificate required

Glow stays inside **Settings → Appearance → Glow**, with the same polished color and animation controls. Created by **Logan Voss + Astra 6 Ultra**.

This release adds **persistent local signing**. Glow generates a private signing identity on each user's Mac and reuses it for refreshes. No Apple Developer membership, Apple-issued certificate, or new signature from the publisher is required after each app update.

The first switch may still need approval for **“Codex Storage Key.”** Subsequent builds use the same certificate-bound identity so Keychain can retain the grant. This was tested with changed executables and disposable Keychain data; another signing key or app identifier was denied. Actual Codex migration and repeated-refresh behavior still need native testing. Identity loss, changed access requests, or system policy can require approval again.

## Included

- A private identity stored outside the repository, preserved across source updates.
- Checks that stop on missing or mismatched signing state, with compatibility for earlier installation and recovery records.
- A structural compatibility inspector and copyable local-assistant repair prompt for app updates.
- Updated installation, Keychain, refresh, and restore instructions.

[Watch the demo](https://www.youtube.com/watch?v=H-9Ug0_luwg) · [Install with one prompt](https://github.com/LoganVoss/Glow#install-with-one-prompt) · [Refresh after updates](https://github.com/LoganVoss/Glow#after-an-app-update)

## Availability

Experimental, source-only release for **Apple silicon macOS** and reviewed app builds **26.1007.30912 (20156)** and **26.1007.21159 (20052)**. The modified app is built locally; no OpenAI app bundle or signing key is distributed.

Local signing adds an **app-scoped library-validation exception** and removes vendor team-bound capabilities. Hardened runtime, Electron fuses, CSP, and integrity checks remain; global trust, SIP, Gatekeeper, and quarantine are unchanged. The result is not notarized. Unknown app versions require compatibility review, and app updates may remove Glow until it is refreshed.

See [verification](https://github.com/LoganVoss/Glow/blob/main/docs/verification.md) for tested scope and remaining native checks. Original code is MIT licensed; third-party marks and artwork retain their own terms.
