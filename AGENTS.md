# Working with Glow

Read `README.md` and `docs/install.md` for installation requests. The user must have a supported local app and their own valid Apple-issued signing identity. A browser-only chat cannot run the build on their Mac.

- Preserve existing source edits and `.local/` originals, staging, reports, and recovery data. Never commit or upload that directory, app bundles, account data, or signing material.
- For an install requested from inside Codex/ChatGPT, prepare with `"./Refresh Neon Codex.command" --prepare-only`. Verify the build and installation preflight, then give the user the exact absolute command to run in a separate persistent Terminal window. Do not start the waiting installer from the app-hosted session or quit the host app.
- If multiple signing identities are available, ask the user which to use. Do not invent a certificate, use ad-hoc signing, or disable protections.
- An unsupported app version needs a compatibility review. Never make it pass by changing only a version, hash, or signature assertion. `docs/build-and-restore.md` describes the source and recovery safeguards.
- For source changes, run checks appropriate to the change. Keep preview behavior aligned with the app patch. Native testing is separate; do not report it passed on the basis of fixture or signing checks.
- Keep changes focused. The public repository contains source and documentation, never a redistributed OpenAI application.
