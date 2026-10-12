# Contributing to Glow

Glow's original code is available under the [MIT license](LICENSE). Contributions to that code use the same license. See [third-party notices](THIRD_PARTY_NOTICES.md) for artwork and dependencies governed by separate terms.

Keep changes focused on the patch source, preview, documentation, and tests. Do not commit vendor app code, reconstructed app bundles, user data, signing identifiers, logs, or reports. Machine-specific material belongs under `.local/`.

Preserve source/version guards, signing checks, process checks, and restoration behavior. App updates require a fresh compatibility review rather than relaxed assertions. Keep native behavior and the standalone preview aligned, and state clearly which environment was tested.

Before opening a pull request, run the relevant source and installer checks, review the Git diff for private information, and record native test results only after completing the [smoke test](docs/smoke-test.md) in the actual app. Describe the change and what you tested. Report security concerns through the [private reporting channel](SECURITY.md).
