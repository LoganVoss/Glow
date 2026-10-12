# Security and privacy

Glow is an unofficial local appearance patch for reviewed macOS app builds. It is not an OpenAI security update or an official extension. Supported builds are listed in [source pins](scripts/source-pins.json).

## Boundaries

- Build only from your own unmodified, reviewed application copy. Source version, archive integrity, native signing state, and renderer assumptions are deliberately guarded.
- Keep the source and installed app untouched during staging. Installation belongs to the separate foreground installer after all app processes have exited.
- Require a valid Apple development identity. Preserve macOS protections and Electron security fuses; do not introduce an ad-hoc or unsigned fallback.
- Keep `.local/`, application bundles, signing material, local logs, and reports out of version control and shared archives.
- Do not copy user profile, conversation, token, or account data into the repository. Build and installation must not require those data.

Local signing changes app identity and removes entitlements that belong to OpenAI's signing team. Account and service compatibility must be checked manually; do not treat a valid code signature as proof that those services work.

## Reporting a security issue

Use [GitHub private vulnerability reporting](https://github.com/LoganVoss/Glow/security/advisories/new). Include the Glow version, app version, and a minimal, redacted reproduction. Do not attach app bundles, account data, private keys, or unredacted reports, and do not post sensitive details in a public issue.

If a candidate fails source verification, code-signature validation, or startup, stop using that candidate and retain the diagnostic locally. Use the documented restore process when available; do not weaken a guard to work around the failure.
