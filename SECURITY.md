# Security and privacy

Glow is an unofficial local appearance patch for reviewed macOS app builds. It is not an OpenAI security update or an official extension. Supported builds are listed in [source pins](scripts/source-pins.json).

## Boundaries

- Build only from your own unmodified, reviewed application copy. Source version, archive integrity, native signing state, and renderer assumptions are deliberately guarded.
- Keep the source and installed app untouched during staging. Installation belongs to the separate foreground installer after all app processes have exited.
- Require an explicit signing policy. Certificate-based mode uses a valid Apple-issued identity. Experimental `--local-signing` generates and retains a private self-signed identity with an app-scoped library-validation exception; it must never be a silent fallback. Code requirements pin the exact certificate and code identifier. Broader native validation remains open.
- Preserve hardened-runtime flags, Electron security fuses, CSP, and archive integrity. Do not disable SIP or Gatekeeper or remove quarantine. Local mode intentionally weakens library validation for the modified app; never claim all protections are unchanged.
- Keep `.local/`, application bundles, signing material, local logs, and reports out of version control and shared archives. The persistent identity lives outside the checkout at `~/Library/Application Support/Glow/Signing`; protect and retain that folder. Its private keychain and unlock secret have owner-only permissions. Never share identities between users.
- Do not alter the real Codex Keychain item or broaden its access list to avoid prompts. No global certificate trust, default keychain, or keychain search-list changes are needed. A local identity does not establish Apple trust or notarization.
- Do not copy user profile, conversation, token, or account data into the repository. Build and installation must not require those data.

Both signing modes change app identity and remove entitlements that belong to OpenAI's signing team. Neither produces a notarized app. Account and service compatibility must be checked manually; do not treat a valid code signature as proof that those services work. In local mode, exact verified snapshots and journaled build provenance are required to recognize an existing Glow installation; arbitrary modified apps are not accepted as trusted baselines. The old ad-hoc schema remains readable for recovery, while new local builds require persistent signing. Missing or conflicting identity state stops refresh rather than generating another key.

## Reporting a security issue

Use [GitHub private vulnerability reporting](https://github.com/LoganVoss/Glow/security/advisories/new). Include the Glow version, app version, and a minimal, redacted reproduction. Do not attach app bundles, account data, private keys, or unredacted reports, and do not post sensitive details in a public issue.

If a candidate fails source verification, code-signature validation, or startup, stop using that candidate and retain the diagnostic locally. Use the documented restore process when available; do not weaken a guard to work around the failure.
