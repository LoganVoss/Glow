# Native smoke test

Use this checklist after installing a candidate build. It is a test plan, **not a record of passed checks**. Run it manually in the actual ChatGPT/Codex app; the standalone preview and source tests cannot establish these results.

Record the patch version, app version/build, macOS version, display scaling, and result locally under `.local/`. Omit account content and identifying signing information from shared notes.

## Startup and recovery

- [ ] The normal application path opens past loading and reaches the chat UI without a crash or signing error. Test a cold launch.
- [ ] Record any macOS Keychain authorization prompt on first launch, unchanged relaunch, and a subsequent rebuild. Distinguish successful launch after authorization from a prompt-free experience. Never record Always Allow as permanent across future app identities without evidence.
- [ ] The expected account, existing chats, and projects are available.
- [ ] The app can quit fully and reopen without losing settings.
- [ ] Restore Previous Codex returns the exact prior bundle and that app opens.
- [ ] Reinstalling a candidate after restoration works through the documented process.

## Appearance controls

- [ ] The first Settings → Appearance visit contains one fully prepared Glow section with no delayed insertion or layout jump.
- [ ] The effect dissolves smoothly off and on; rapid toggling reverses the fade without flashing.
- [ ] Every profile and adjustable control visibly changes the intended property.
- [ ] The selected profile and settings survive reopening Appearance and restarting the app.
- [ ] Primary Light/Dark/System appearance changes automatically select the matching Glow profile, and Glow Light/Dark tabs update the app’s actual saved Appearance mode. Test both directions and restart persistence.
- [ ] The color dots and action row appear first, followed by Vibe with Soft and Neon, then Animation with Pulse, Bloom, Ping. Bloom is selected by default. No drawer, color hue sliders, reverse button, or retired cards appear.
- [ ] Animation and Vibe selections preserve numeric tuning. Exactly six adjustment sliders stay visible: Thickness, Spread, Intensity, Saturation, Gloss, and Animation Speed. Hue Offset and 3D Depth are absent.
- [ ] Palette dice stays within the selected vibe, changes colors, and preserves slider settings. The dots lead an open, unboxed section above equally spaced boxed 1, Color Slider, and Dice buttons, with extra space above the buttons; Vibe follows, then Animation and the adjustment sliders; their tooltips have no terminal punctuation. The slider has no visible combination names or counts.
- [ ] Dots follow swift curved/staggered paths, with a wider, clearly separated smiley on most clicks and rotating orbit, blooming flower, or traveling wave variations. They stay inside the stage through rapid reshuffles and resizing, clear of the dock.
- [ ] Dots have no click, toggle, tooltip, hover, or keyboard behavior in either mode. All six colors participate in multicolor mode, including after upgrading old disabled-dot preferences.
- [ ] The rounded 1 button enables single-color mode: all six dots show the chosen hue at full brightness. Dice shuffles it, and Eyedropper can remain active to browse individual colors. The selected color survives restart and mode changes.
- [ ] Selected 1 and open Color Slider have the same clearly filled highlight and contrasting icon in light and dark themes. Hover preserves their selected state. Dice uses matching feedback while pressed and returns to its resting state on release.
- [ ] Turning 1 off restores the complete multicolor display and leaves the palette browser usable. Clicking dots never changes any settings.
- [ ] Palette changes blend smoothly through all six colors and the dots. Rapid selections retarget without popping or restarting the glow loop.
- [ ] Only color dice remains; there is no slider dice or extra Glow settings heading.
- [ ] Color Slider reveals a palette slider in reserved space without moving the dots, button row, other sliders, or panel bottom. Closing reverses the animation. Opening alone leaves colors unchanged.
- [ ] Palette browsing stays in Soft or Neon, preserves all material tuning and the selected animation, and saves the selected combination. Both ends and keyboard stepping work.
- [ ] Escape closes the palette slider and returns focus to the eyedropper. Closed controls are absent from the tab order; Reduce Motion skips the reveal transition.
- [ ] The Reset button is absent.
- [ ] Existing light/dark profiles load with Hue Offset 0°, regardless of the previously saved offset. Switching 1 on and off, shuffling, browsing colors, changing appearance, and restarting never restores an offset. Colors track the selected swatches.
- [ ] A fresh setup copies the first edited profile once on entering the other, then edits remain independent. Existing tuned profiles remain separate.
- [ ] Existing 0.4–0.7 preferences preserve colors and tuning. Prism remains visually Bloom; Flow migrates to Pulse and Ribbon to Bloom.
- [ ] Keyboard navigation reaches the controls; names, values, and state are understandable.

## Border and motion

- [ ] From Home/chat with both navigation areas visible, click the existing titlebar Toggle Sidebar: first hides the chat list, second restores it while hiding the icon rail, third restores both. Menu/keyboard commands follow the same cycle. The hidden-rail state has a distinct full-width window icon and an accessible state description; the two native states keep their original icons. There is no additional toggle or selected-box styling.
- [ ] In the hidden-rail layout, the original account button and any update/usage controls remain usable in the bottom-left. Open Settings from the account menu: the rail stays hidden through loading; Home appears beside Settings and follows the existing guarded native navigation. Unsaved-change prompts remain functional.
- [ ] Native hover/peek works after the first click and in the normal layout. Rail-only destinations retain their profile control and safe native panel width while the requested icon visibility stays consistent; returning to a chat/settings panel restores the expanded frame.
- [ ] Rapid cycle reversals, changing appearance during a cycle, live resizing, and route replacements leave the frame aligned. With Reduce Motion, layout changes are immediate. The titlebar toggle retains its native disabled behavior in Settings; use Home to return.

- [ ] The border follows the outer page frame and remains clear of titlebar and navigation controls.
- [ ] Sidebar open/closed, window resizing, full screen, and different display scales preserve all four corners.
- [ ] Light, dark, and system appearance retain the intended contrast without changing content colors.
- [ ] Light/dark surfaces blend briefly (160 ms) while foregrounds and the selected theme update immediately, including native Appearance and Glow theme controls. Reverse mid-transition, type during it, and use the app’s native sidebar controls at the same time. There is no blocking layer or layout jump. Reduce Motion disables the dissolve.
- [ ] Animation advances smoothly through a complete repeat, with no flash or visible restart. Bloom retains its established motion; Pulse breathes with stationary color and a visible quiet point; Ping retains its traveling trail.
- [ ] Effective Reduce Motion stops continuous motion and dot/dice flourishes while preserving a usable static frame and aligned dots.
- [ ] Motion resumes only when the relevant reduced-motion preference permits it.
- [ ] The border does not capture clicks, text selection, dragging, scroll, or composer input.
- [ ] Menus, dialogs, tooltips, and confirmation sheets remain visible and usable above the effect.
- [ ] Settings → home/chat → Settings retains a continuously visible border with no flash, pop, or animation restart.
- [ ] Repeated navigation and opening additional windows do not duplicate the effect or controls.

## Compatibility and sustained use

- [ ] Ordinary chat, project navigation, and the features used by this account still work.
- [ ] Sign-in, integrations, notifications, and shared services work where applicable.
- [ ] Idle and active use show no sustained excessive CPU/GPU usage, fan activity, stutter, or growing memory use compared with the original app.
- [ ] Sleep/wake and moving the window between displays preserve geometry and animation state.

Record failures with a minimal reproduction and a redacted diagnostic. A successful preview or package validation must not be recorded as a native pass.
