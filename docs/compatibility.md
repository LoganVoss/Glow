# Check an app update

Glow can inspect an updated app without a signing certificate. The check reads the installed app, finds its actual renderer assets, and checks whether Glow’s native Appearance integration still fits. It never patches, signs, installs, launches, or changes preferences.

Glow 0.10.5 also checks the native Toggle Sidebar command and its exact shared titlebar/menu registration. Its optional callback falls back to native behavior when Glow is absent or fails. No Glow import is added to native startup, and the native Settings module remains unchanged. Review the rail, footer, panel geometry, and guarded Home destination when adapting a new build; hashes alone do not establish compatibility.

Glow 0.10.5 builds locally with a persistent identity it generates on your Mac. No Apple certificate or new publisher signature is required per update. Retain `~/Library/Application Support/Glow/Signing` and your checkout’s `.local/` recovery records.

From the Glow repository, after `npm ci --ignore-scripts`:

```sh
node scripts/compatibility.mjs
```

The default source is `/Applications/ChatGPT.app`. If that copy already has Glow, use its matching preserved, OpenAI-signed original:

```sh
node scripts/compatibility.mjs --source "/path/to/Glow/.local/originals/<version>-<build>/ChatGPT.app"
```

Older installations may keep the original at `.local/original/ChatGPT.app`. Use the original for the version being checked, not an older backup. The inspector refuses modified or re-signed sources; it verifies Apple’s certificate chain and OpenAI’s signing team before inspecting the archive.

## Read the result

The command prints JSON with the detected version, build, asset paths, hashes, and evidence:

| Status | Meaning |
| --- | --- |
| `compatible-known` | The actual source matches a reviewed build, including its recorded hashes and integration checks. |
| `compatible-candidate` | The version is new, but the current structural checks pass. The report includes a proposed source pin for review. This is not installation approval or a claim that native behavior has been tested. |
| `unsupported` | A signature, integrity, asset, or integration check failed. The report explains why. The command exits with status 2. |

Unknown versions are inspected rather than rejected solely for their version number. A known version with changed hashes is still refused. A candidate report does not alter `scripts/source-pins.json` or make the existing builder accept unreviewed sources.

## Ask ChatGPT to help after an update

A local assistant can review and adapt your checkout without waiting for Logan to sign a new package. This still requires evidence that the changed app fits the integration. Use Codex or ChatGPT with access to files and Terminal on your Mac, and paste this prompt with your repository path:

```text
Help me restore Glow after a Codex app update, using experimental --local-signing.
My Glow repository is at [absolute repository path]. I understand this mode replaces
the app signature and adds an app-scoped library-validation exception; it is not
notarized and still needs native validation.

Read AGENTS.md and the installation documentation. If the checkout predates 0.9.0,
safely update it without overwriting my changes. No Apple-issued certificate is needed. Run scripts/compatibility.mjs against my current app. If
Glow is installed, locate its matching preserved OpenAI-signed original and inspect
that with --source.

Use the reported asset paths, hashes, and integration checks to investigate. For a
candidate, review the real native Appearance mount, settings writer, renderer entry,
Electron integrity, and current builder transformation before proposing a precise
compatibility change. Do not approve it by only changing a version or hash. If the
structure changed, explain the failed check and repair it only when verifiable.

After review and any justified changes, run appropriate source and packaging checks.
Prepare with "./Refresh Neon Codex.command" --local-signing --prepare-only. Give me
the exact absolute Refresh command with --local-signing for a separate persistent
Terminal window. Explain READY → Command-Q → DONE → reopen, native checks still
needed, and how to restore the previous app.

Do not quit this host app or start a waiting installer from this chat. Do not claim
native testing passed without testing it. Preserve originals, recovery data, settings,
and ~/Library/Application Support/Glow/Signing. Do not rotate my local identity or
change existing Keychain permissions. Explain remaining requirements honestly.
```

## What the check covers

- The intact OpenAI signature, bundle identity, archive-header integrity, embedded framework digest, and reviewed Electron fuse settings.
- Unique discovery of the renderer HTML, its shared stylesheet, the Appearance component, and the bridge/general-settings modules imported by that component.
- The builder’s exact Appearance insertion point, its React/JSX bindings, one native entry module, unchanged Content Security Policy, and valid syntax after the proposed transform.
- The required bridge exports and the native scoped, non-optimistic theme writer used for bidirectional light/dark switching.
- Exact source-pin agreement for known builds and refusal of existing Glow assets, ambiguous discoveries, changed hooks, or a fallback mount on `document.body`.

The transform strings deliberately match `scripts/build.mjs`; a regression check catches drift. The inspector additionally checks bridge bindings that the builder currently protects through reviewed file hashes. It does not execute the app or its JavaScript. Static checks cannot prove sign-in, updating, window transitions, or every runtime selector works on a new version. Those remain separate validation steps before declaring support.
