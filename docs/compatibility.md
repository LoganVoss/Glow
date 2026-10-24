# Check an app update

Glow can inspect an updated app without a signing certificate. The check reads the installed app, finds its actual renderer assets, and checks whether Glow’s native Appearance integration still fits. It never patches, signs, installs, launches, or changes preferences.

Glow 0.10.11 checks the native Toggle Sidebar command and its complete titlebar/menu registration against explicit reviewed variants. Its optional callback falls back to native behavior when Glow is absent or fails. No Glow import is added to native startup, and native Settings modules remain unchanged. Review the rail, footer, panel geometry, and guarded Home destination when adapting a new build; hashes alone do not establish compatibility.

Build **21828** separates the main window into an `app-primary` module. The inspector and builder follow its actual `entry → app-main → app-runtime → app-primary` import chain, pin both initial and primary renderers, and patch only the primary module's reviewed sidebar command. They also support its renamed Appearance bindings and page-surface class. Earlier reviewed builds retain their existing integrations. Unknown, mixed, ambiguous, or unlinked modules are refused.

Glow 0.10.11 builds locally with a persistent identity it generates on your Mac. No Apple certificate or new publisher signature is required per update. Retain `~/Library/Application Support/Glow/Signing` and your checkout’s `.local/` recovery records.

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

Use ChatGPT or Codex with file and Terminal access to your Mac, and point it at your existing Glow folder:

```text
Update Glow (Codex/ChatGPT Appearance Plugin) to work with the latest updated build of Codex/ChatGPT app. The most recent app update broke the plugin.
```

The repository's `AGENTS.md` guides the assistant through inspecting the actual app, reviewing changed integration points, preserving your local identity and recovery files, and preparing a verified build. It must not approve compatibility by changing only a version or hash. Finish in a separate Terminal window: **READY → Command-Q → DONE → reopen**. No new publisher signature is required.

## What the check covers

- The intact OpenAI signature, bundle identity, archive-header integrity, embedded framework digest, and reviewed Electron fuse settings.
- Unique discovery of the renderer HTML, its shared stylesheet, the Appearance component, and the bridge/general-settings modules imported by that component.
- The builder’s exact Appearance insertion point, its React/JSX bindings, one native entry module, unchanged Content Security Policy, and valid syntax after the proposed transform.
- The required bridge exports and the native scoped, non-optimistic theme writer used for bidirectional light/dark switching.
- Exact source-pin agreement for known builds and refusal of existing Glow assets, ambiguous discoveries, changed hooks, or a fallback mount on `document.body`.

The inspector and builder share the same Appearance and sidebar transformers, so review checks and packaged changes cannot drift apart. Reviewed file hashes remain an additional build requirement. It does not execute the app or its JavaScript. Static checks cannot prove sign-in, updating, window transitions, or every runtime selector works on a new version. Those remain separate validation steps before declaring support.
