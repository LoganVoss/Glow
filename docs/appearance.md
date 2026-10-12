# Glow settings

Open **Settings → Appearance → Glow**. The switch dissolves the glow on or off without resetting its animation.

The centered **Light** and **Dark** tabs change the app's saved appearance through the same native settings writer as the main Appearance control. Changing the main control updates Glow too. Selecting a Glow tab chooses an explicit Light or Dark mode; use the main control to return to System. The [official Appearance documentation](https://learn.chatgpt.com/docs/reference/settings#appearance) describes the app's modes.

Both new profiles start with Bloom, Neon, thickness 1.2 px, spread 7.5 px, intensity 65%, saturation 160%, gloss 100%, and Animation Speed 2.05×. On a fresh setup, the first edited profile transfers once when you enter the other. Afterward the profiles remain independent. Upgrades preserve existing tuning except Hue Offset, which is standardized to 0° for every profile.

Below the preview, the controls appear in this order: **color dots and actions → Vibe → Animation → adjustment sliders**.

| Animation | Motion |
| --- | --- |
| Pulse | Stationary colors with smooth, full-border breathing; the quiet point remains visible |
| Bloom | The default: established Prism motion with repeating refracted bands around the frame |
| Ping | Traveling light with a fading trail |

**Soft** uses matte pastels; **Neon** uses more saturated colors. Both preserve the animation and numeric adjustments. Animation selection likewise preserves the selected colors and tuning.

The six dots and three controls lead the settings below the preview and span its width without an enclosing box. The dots are purely visual and have no click or keyboard actions. All six palette colors remain active in multicolor mode. The integrated action row contains **1**, **Color Slider**, and **Dice** in that order. Their matching rounded square buttons are evenly spaced beneath the dots and clear of their animation, with 48 px targets (44 px in narrow layouts). A 28 px gap separates the animation stage from the actions, adding 20 px more breathing room.

Selected **1** and an open **Color Slider** use the same filled accent and contrasting icon in both themes. Dice uses that highlight while pressed. The fill, icon, outline, and shadow transition together without changing button size.

All palette combinations are prepared when the module loads; both single-color slider tracks are prepared with the panel. Color changes interpolate from the currently displayed colors over 420 ms, including rapid dice clicks, palette scrubbing, and transitions into single-color mode. The loop keeps running at the same point. The dots use the same color transition timing.

**Shuffle color selection** chooses another coordinated family within the selected vibe, preserving the slider settings. The dots favor a broad smiley face, with eyes centered 60 px apart and a 168 px smile at full size. The four mouth dots have more separation while the whole face stays inside its animation stage. Curved gathering and staggered returns accompany rotating orbit, blooming flower, and traveling wave variations. Motion stays inside the stage through rapid reshuffles, and the dots settle into their aligned row on resize or Reduce Motion.

**1** activates single-color mode: all six dots show the chosen color at full brightness. Dice explores another color. The eyedropper works in this mode too, browsing individual colors while retaining a complete multicolor bank for when **1** is turned off.

**Color Slider** opens the integrated palette slider with a short, reversible reveal. Space is reserved for it from the start, so no settings shift when it opens or closes. Drag or use the arrow keys to browse 33 curated combinations in the selected vibe. In single-color mode, it browses 192 individual colors in spectrum order. The combination slider uses the same quiet accent rail as the adjustment controls; the single-color slider shows a spectrum. There are no visible combination names, titles, or counts. Opening the slider never changes the selected colors; Escape closes it and returns focus to the eyedropper.

Six adjustment sliders remain visible. Hue Offset, 3D Depth, and the Reset button have been removed from the panel. The three icon tooltips consistently omit terminal punctuation.

| Control | Range |
| --- | --- |
| Thickness | 0.5–6 px |
| Spread | 0–24 px |
| Intensity | 0–100% |
| Saturation | 0–200% |
| Gloss | 0–100% |
| Animation Speed | 0.25×–6×; higher is faster |

Animation loops endlessly. The app's effective Reduce Motion preference stops continuous motion, skips the dice and dot flourishes, and shortens the on/off transition.

Glow preferences stay in the renderer's local storage under `neon-codex:preferences:v1`. Schema 5 reads earlier schemas 1–4 and preserves colors, initial-profile setup, and numeric tuning other than retired Hue Offset. Every loaded profile, new default, save, color operation, theme transfer, and cross-window merge normalizes Hue Offset to 0°; turning single-color mode off also leaves it at 0°. The renderer’s CSS default is 0° as well. Retired depth values remain saved. Legacy per-dot enabled masks remain stored as compatibility metadata and no longer hide palette colors. Prism becomes Bloom without changing its motion; Flow becomes Pulse; retired Ribbon becomes Bloom. Candy/Sunrise colors remain saved, associated with the nearest available vibe. Retired reverse-direction flags no longer affect motion. A storage or native theme-write failure shows a concise error; normal saves have no status text.

The glow module makes no network requests. Glow preferences are separate from the source repository; the main theme uses the app's existing settings bridge. The original app ignores the glow key after restoration. The preview is a standalone fixture; complete the [native smoke test](smoke-test.md) after installation.
