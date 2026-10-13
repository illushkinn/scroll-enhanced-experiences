# Architecture

**Libertad Buildings** — a concept project. A static Astro 5 site where the
scroll drives a pre-rendered camera flight: five stops (the camera rests while
the copy reads) joined by four generated clips. Bilingual: Spanish at `/`,
English at `/en/`. All imagery is AI-generated and labelled as such on the page.

The scroll engine is the `scroll-world` skill's `references/scrub-engine.js`,
copied to `src/lib/scroll-world.js` with small, tagged patches (see §3).

## 1. Media pipeline

```
5 frames ─▶ 4 clips (kling3_0, start+end image) ─▶ encode (skill Step 6) ─▶ public/media/clips/
                                                └▶ stills = real clip frames ─▶ public/media/stops/
```

Generation is documented in `prompts/` (frames, clips, style bible). That record
predates the rename and still calls the property "Maravilla".

The four source clips are 1912×1080, 24 fps, 4.04 s, silent. Seams were measured
before wiring: PSNR between the last frame of clip k and the first frame of
clip k+1 is 35.4–36.7 dB on the raw sources and 32.6–33.8 dB on the committed
encodes. The skill judges seams by composition rather than raw PSNR (Step 8: a
correctly frame-locked seam can read ~18–25 dB); all three match in composition.

| Output | Command (per clip) | Notes |
| --- | --- | --- |
| `clips/cN.mp4` | `ffmpeg -i src.mp4 -an -vf "unsharp=5:5:0.8:5:5:0.0" -c:v libx264 -preset slow -crf 20 -pix_fmt yuv420p -g 8 -keyint_min 8 -sc_threshold 0 -movflags +faststart cN.mp4` | Desktop. Native resolution, a keyframe every 8 frames (≈0.33 s). |
| `clips/cN-m.mp4` | same, with `-vf "scale=-2:720,unsharp=5:5:0.6:5:5:0.0" -crf 23 -g 4 -keyint_min 4` | Phones. 720p, tighter GOP = cheaper seeks on a phone decoder. |
| `stops/sK.webp` | `ffmpeg -i clips/c(K+1).mp4 -frames:v 1 -c:v libwebp -quality 84 sK.webp` | Stop K = **first frame of clip K+1** (K = 0–3). |
| `stops/s4.webp` | `ffmpeg -i clips/c4.mp4 -vf "select=eq(n\,96)" -frames:v 1 -c:v libwebp -quality 84 s4.webp` | Last stop = **last frame of clip 4**. |
| `stops/sK-m.webp` | same, from the `-m.mp4` encodes, `-quality 80` | Phone posters, matching the phone clips. |
| `og.jpg` | `ffmpeg -i stops/s3.webp -vf "scale=1200:-2,crop=1200:630:0:(ih-630)*0.45" -q:v 3 og.jpg` | Social preview: the tower stop scaled to 1200 wide (1200×678), cropped to 630 high at y≈22. |

Stills are always taken from the **encoded clips**, never from the generated
images: that is the skill's seam rule (any re-render differs slightly and pops).

**Mobile is a stopgap.** Phones get a crop of the 16:9 film (per-stop
`focus` in `src/data/world.ts` decides where). The skill's real mobile version
is a second, natively 9:16 clip chain, which needs new generations.

## 2. Runtime

```
src/pages/index.astro, src/pages/en/index.astro
  └─ Layout.astro           <html lang>, SEO, hreflang, og:*, html.js flag
     ├─ StructuredData.astro JSON-LD: WebPage + CreativeWork (a concept piece)
     └─ Experience.astro     header + menu, static story (no-JS), #world, client script
          └─ mountScrollWorld(#world, config)   src/lib/scroll-world.js
```

- **Data:** `src/data/world.ts` (stills, clips, focus, pacing) and
  `src/i18n/content.ts` (all copy, per language), joined by stop `id`
  (`terreno`, `plano`, `obra`, `torre`, `penthouse`).
- **Segments:** stop 0, clip 1, stop 1, … clip 4, stop 4. Each stop rests for
  `scroll` viewport-heights (1.3 / 1 / 1 / 1 / 1.4); each clip takes
  `connScroll` = 1.6. Total ≈ 13 viewports (the previous build had 4 for the
  whole film, which is why it felt too fast).
- **Engine behaviour (from the skill):** clips are fetched as Blobs (always
  seekable, no dependence on HTTP range support), loaded when within 1.6
  viewports of their segment, and scrubbed with rAF smoothing (lerp 0.18).
  Layers swap with a cut at the frame-matched seams; `crossfade` (0.08
  viewport-heights) is how far before a seam the next layer is already kept in
  sync underneath, not a visible dissolve. On phones it serves the `-m` files,
  coalesces seeks, primes videos on first touch (iOS) and ignores URL-bar
  resizes.
- **First paint:** the hero still is preloaded from `<head>` and, inside the
  engine, the still on screen at mount gets high priority; clips wait for it.
  Other stills load with their clips' window.
- **Copy:** the engine renders one block per stop; it is fully visible only
  while the camera rests on that stop. The hero's title is the page's only h1.
- **Menu:** `Experience.astro` — a dialog with the five stops (drives
  `api.jumpTo`), the language switch (keeps the current stop as `#id`), Escape
  to close, focus trap, the rest of the page `inert` and scroll locked while
  open. Deep links (`/#torre`) start the flight at that stop (`initialSection`).
- **Theme:** `--sw-*` engine tokens map to `src/styles/tokens.css`; the engine's
  CSS lives in `@layer sw`, above the page reset (`@layer reset`) and below the
  page's own rules.

## 3. Local engine patches

`src/lib/scroll-world.js` is the skill's engine plus these changes, each tagged
`PATCH n` in the file so it can be re-synced:

1. ES module export; returns `{ jumpTo(indexOrId, { instant }), sectionIds }`.
2. `stillMotion: false` — no Ken-Burns zoom/offset on stills. The stills are
   real clip frames and must sit exactly where the clip paints them.
3. `atmosphere: false` also removes the drifting particles.
4. Per-section `focus: [x, y]` (object-position %); clips interpolate from the
   origin stop's focus to the destination's, so phone crops match at both seams.
5. Per-section `titleTag` (the hero uses `h1`).
6. `onActive(index)` callback (menu `aria-current`, language-switch hash).
7. The engine's empty top bar is not mounted (the page has its own header).
8. Jumping to the first section goes to the top, where the hero copy shows.
9. A clip that finishes loading mid-segment starts on the scrolled-to frame
   instead of lerping up from frame 0 (which replayed the flight).
10. Route dots carry `aria-label` (their label is hidden on phones) and
    `aria-current` on the active stop.
11. Copy drift goes through `--sw-copy-dy`, so the desktop copy stays
    vertically centred.
12. The decorative stage is `aria-hidden`.
13. `initialSection` positions the page before the first read (deep links don't
    fetch the clips around the top first).
14. Stills load in the clips' load window (`loading=lazy` never deferred them in
    a fixed stage); the first visible still is prioritised and gates the clips.

## 4. Degradation

| Condition | Behaviour |
| --- | --- |
| `prefers-reduced-motion` | No clip is downloaded; each stop's still holds and switches to the next one with a cut at the start of each clip's band. |
| JavaScript disabled, the module fails to load, or the engine fails to mount | `html.js` is absent or removed (inline check at `DOMContentLoaded`, plus the mount `catch`): a stacked static version of the five stops, with the h1 and a language link, is shown instead. |
| A clip fails to load | Its still stays up; the rest of the flight keeps working. |

## 5. QA

Headless Chromium builds lack an H.264 decoder, so automated runs serve VP9
copies of the same encoded frames in place of the MP4s (test-only). Real
Chrome, Safari and Firefox play the H.264 files directly. Check the Vercel
preview on a real phone (iOS Safari especially) before calling a change done.
