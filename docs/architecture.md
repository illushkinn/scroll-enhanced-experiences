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
predates the rename and still calls the property "Maravilla";
`prompts/pipeline.md` also describes the first build's encode (one concat
video), replaced by the table below.

The four source clips are 1912×1080, 24 fps, 4.04 s (97 frames), silent, with
no colour tags. Seams were measured before wiring: PSNR between the last frame
of clip k and the first frame of clip k+1 is 35.4–36.7 dB on the raw sources
and 32.5–33.8 dB on the encodes. The skill judges seams by composition rather than raw PSNR (Step 8: a
correctly frame-locked seam can read ~18–25 dB); all three match in composition.

| Output | Command (per clip) | Notes |
| --- | --- | --- |
| `clips/cN.mp4` | `ffmpeg -i src.mp4 -an -vf "unsharp=5:5:0.8:5:5:0.0" -c:v libx264 -preset slow -crf 20 -pix_fmt yuv420p -bf 0 -g 8 -keyint_min 8 -sc_threshold 0 -colorspace bt709 -color_primaries bt709 -color_trc bt709 -color_range tv -movflags +faststart cN.mp4` | Desktop. Native resolution, a keyframe every 8 frames (≈0.33 s), no B-frames (a seek never decodes frames out of order; ~3 % larger), tagged BT.709 so a browser doesn't have to guess the colour matrix (Chrome and Firefox already assumed BT.709 for untagged HD; Safari's handling of the tags is worth a look on a real device). |
| `clips/cN-m.mp4` | same, with `-vf "scale=-2:720,unsharp=5:5:0.6:5:5:0.0" -crf 23 -g 4 -keyint_min 4` | Phones. 720p, tighter GOP = cheaper seeks on a phone decoder. |
| `stops/sK.webp` | `ffmpeg -i clips/c(K+1).mp4 -frames:v 1 -vf "scale=in_color_matrix=bt709:in_range=tv:flags=accurate_rnd+full_chroma_int,format=bgra" -c:v libwebp -quality 84 sK.webp` | Stop K = **first frame of clip K+1** (K = 0–3). The frame goes through RGB on purpose: passed straight through, the video's BT.709 YUV was stored in the WebP, which browsers decode as BT.601, so next to a BT.709 video the stills came out cooler and darker (R −1.7 to −4.4, G −1 to −2.5, B up to +2 levels). Now within ±0.3 levels; PSNR to the frame the browser shows went from 35.3–37.8 to 39.0–40.9 dB (phones: 34.6–36.3 to 37.2–39.1 dB). |
| `stops/s4.webp` | `ffmpeg -i clips/c4.mp4 -vf "select=eq(n\,96),scale=in_color_matrix=bt709:in_range=tv:flags=accurate_rnd+full_chroma_int,format=bgra" -frames:v 1 -c:v libwebp -quality 84 s4.webp` | Last stop = **last frame of clip 4**. |
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
  `scroll` viewport-heights (1.3 / 1 / 1 / 1 / 1.4); the clips take
  `connScroll` = 2 / 2.4 / 2.2 / 4.5. Total ≈ 17.8 viewports including the
  closing one (the first build had 4 for the whole film). Under reduced motion
  each clip band is capped at 1 viewport (it only holds a still).
- **Pacing:** a clip does not move evenly (c2–c4 start at full speed; c4, the
  fly-up into the penthouse, moves 9–21× more than the others, mostly in its
  middle), so a linear scroll→time mapping feels abrupt. `pnpm time-maps`
  (`scripts/time-maps.mjs`) measures each clip's frame-to-frame motion with
  ffmpeg on the desktop encodes and writes `src/data/time-maps.json`: per
  clip, a 65-sample scroll→time table that spreads the motion evenly over the
  band (75 % measured motion, 25 % plain time) and ramps the speed up and down
  over the first and last 12 %, so the camera leaves each stop from rest and
  settles into the next. The frames are lightly blurred before measuring, so
  compression noise (which jumps at every keyframe) doesn't count as motion:
  the tables land within 0.4 % of the clip of the same measurement on the raw
  clips. That blur also counts fine texture as less motion than before, so the
  pacing moved by up to 5.8 % of a clip (≈5 frames, c2) versus the first
  tables. The clips' lengths grow with how much each moves
  (not in proportion; c4 would need ~20 viewports). Re-run it whenever a clip
  changes.
- **One smoothed position (`damping`):** the browser's scroll (`rawY`) is not
  drawn directly. A critically damped spring — the SmoothDamp maths behind
  `maath`'s `easing.damp` — produces `vy`, and *everything* is rendered from
  it in one rAF loop: which layer is on top, the video frame, copy, route dots
  and progress bar. `smoothTime` 0.45 s (0.3 s on touch, where the finger
  already adds inertia), speed capped at 3 viewports/s (the cap loosens in
  proportion once the picture lags more than 2 viewports, so a fast scroll
  stays one continuous flight). Before, layers and
  copy followed the raw scroll while the video chased it with a lerp, so every
  seam cut to the next still before the video had arrived. Scrolling stop to
  stop, the QA measured 7–8 frames skipped per seam at 1 viewport/s, 15–19 at 2
  and 29–38 at 4 on the live build (2–6, 7–18 and 16–36 after the first pacing
  fix); now 0 at all three speeds (the check allows 1). Headless runs vary by a
  few frames from run to run. A spring also eases into each wheel notch instead of starting
  at full speed like a lerp.
- **Frames, not seconds:** the video seeks only when the frame index changes,
  to the middle of that frame (`fps` 24), so at rest the picture is exactly
  the frame the position asks for.
- **Jumps:** route dots, the menu, `/#stop` changes, and a gap wider than 4
  viewports opened faster than 15 viewports/s (End key, a scrollbar click or
  fast drag — never a hand on a wheel or trackpad) fade the stage out (0.2 s), move both
  positions while it is covered, wait for the destination still and fade back
  in (0.32 s). Nothing scrubs through the clips in between and only the
  destination's media is fetched (a menu jump to the penthouse used to download
  c2, c3 and c4; a download still running for the old position is dropped).
  Clicking the stop you are on does nothing.
- **Soft snap (`snap`):** after 400 ms at rest within half a viewport of a stop
  whose copy isn't fully shown, the page glides on to that stop (0.6–1.2 s) —
  only in the direction the visitor was scrolling, so it finishes a move and
  never pulls anyone back. Off under reduced motion, while a finger is down and
  while the menu is open.
- **Engine behaviour (from the skill, plus patches):** clips are fetched as
  Blobs (always seekable, no dependence on HTTP range support), one at a time,
  nearest first, when within 1.6 viewports of `vy`; a download is dropped
  when the visitor moves away, times out after 30 s, and a failed one retries
  after 2, 4 and 8 s and then gives up (the stills carry on). Layers swap with
  a cut at the frame-matched seams; `crossfade` (0.08 viewport-heights) is how
  far before a seam the next layer is already kept in sync underneath, not a
  visible dissolve. A clip that hasn't painted yet is replaced by a dissolve
  from the origin still to the destination still across its band (the origin
  still loads with the clip's band, and a late clip fades in over the
  dissolve before it is dropped). On phones
  it serves the `-m` files, coalesces seeks, primes videos on first touch
  (iOS) and ignores URL-bar resizes; a rotation or resize keeps the visitor at
  the same point of the story.
- **First paint:** the hero still is preloaded from `<head>` and, inside the
  engine, the still on screen at mount gets high priority; clips wait for it.
  Other stills load with their clips' window.
- **Copy:** the engine renders one block per stop, fully visible over the
  central 60 % of the stop (the hero over its first 30 %, the last stop from
  40 % on) and only while the camera rests there. The hero's title is the
  page's only h1.
- **Menu:** `Experience.astro` — a dialog with the five stops (drives
  `api.jumpTo`), the language switch (keeps the current stop as `#id`), Escape
  to close, focus trap, the rest of the page `inert`, scroll locked and the
  snap paused while open. Deep links (`/#torre`) start the flight at that stop (`initialSection`).
- **Theme:** `--sw-*` engine tokens map to `src/styles/tokens.css`; the engine's
  CSS lives in `@layer sw`, above the page reset (`@layer reset`) and below the
  page's own rules.

## 3. Local engine patches

`src/lib/scroll-world.js` is the skill's engine plus these changes, each tagged
`PATCH n` in the file so it can be re-synced:

1. ES module export; returns `{ jumpTo(indexOrId, { instant }), setSnap(on),
   destroy(), sectionIds }` (`destroy` stops the loop and removes listeners
   and media).
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
13. `initialSection` positions the page before the first render (deep links don't
    fetch the clips around the top first).
14. Stills load in the clips' load window (`loading=lazy` never deferred them in
    a fixed stage); the first visible still is prioritised and gates the clips.
15. Connector pacing: `connScroll` per clip (array; capped at 1 viewport under
    reduced motion) and `connectorTimeMaps` (per-clip scroll → time tables,
    linear if absent or malformed).
16. *(Superseded by 17.)* The per-video lerp advanced every frame and was
    frame-rate independent.
17. One spring-damped position (`vy`; `damping: { smoothTime, touchSmoothTime,
    maxSpeed }`) renders layers, copy, route, progress and video frames in a
    single rAF loop (scheduled first, so an exception costs one frame). The
    scroll listener only stamps time.
18. Whole-frame seeks (`fps`): issued only when the frame index changes, aimed
    at the frame's middle.
19. Jumps fade (veil) instead of smooth-scrolling through the flight;
    `api.jumpTo(id, { instant })`. A gap wider than `teleportGap` opened faster
    than `teleportSpeed` fades too.
20. Directional soft snap (`snap: { idle, range }` or `false`) to the nearest
    stop ahead; `api.setSnap(false)` pauses it; nothing snaps before the
    visitor's first input (a restored position on reload is not a direction).
21. Copy plateau (see Copy above).
22. Sequential clip loading in the scroll direction, abort on moving away,
    30 s timeout, retry backoff 2/4/8 s, origin → destination dissolve while a
    clip isn't painted, clips fade in over it once painted.
23. Resize/rotation keeps the segment and progress; `orientationchange`
    forces the next resize through.

## 4. Degradation

| Condition | Behaviour |
| --- | --- |
| `prefers-reduced-motion` | No clip is downloaded and nothing is smoothed, snapped or faded: the position is the scroll. Each stop's still dissolves into the next across the clip's band (bands capped at 1 viewport). |
| JavaScript disabled, the module fails to load, or the engine fails to mount | `html.js` is absent or removed (inline check at `DOMContentLoaded`, plus the mount `catch`): a stacked static version of the five stops, with the h1 and a language link, is shown instead. |
| A clip fails to load | Retried after 2, 4 and 8 s; meanwhile its band dissolves between the two stills, and the rest of the flight keeps working. |

## 5. QA

```
pnpm build && pnpm check && pnpm qa
```

`scripts/qa.mjs` serves `dist/`, drives the page in Chrome (or Playwright's
Chromium) and prints pass/fail for: frames skipped at each clip→stop cut when
scrolling stop to stop at 1, 2 and 4 viewports/s; presented frame = target
frame at rest; load order and retry backoff; the dissolve when a clip never
arrives; menu jump (fade, lands on the stop, fetches only the destination clip);
End key; snap (finishes a move, never pulls back, paused behind the menu);
reduced motion (no clip requests, dissolve, no snap); menu keyboard and focus;
deep links; resize; copy on screen and phone clips at 1440×900, 390×844 and
844×390; the no-JS story. The `robust` group replays what an adversarial
review reproduced against the first version of these patches (all six failed
there): a fast continuous scroll never fades, a late clip never shows the
background, scrolling up into a missing clip keeps its origin still, a slow
download doesn't hold up a jump, a reload doesn't snap by itself, and clicking
the current stop doesn't blink. `--dist` points it at another build (e.g. master) to
compare, `--only` runs some groups, `--json` saves the raw numbers.

Headless Chromium builds lack an H.264 decoder, so the script then serves VP9
copies of the same encoded clips (same frames, timing and GOP; made with ffmpeg
and cached in the OS temp dir) in place of the MP4s. Real Chrome, Safari and
Firefox play the H.264 files directly. Check the Vercel preview on a real phone
(iOS Safari especially) before calling a change done.

## 6. References

What the pacing borrows from sites known for scroll-driven 3D and video, and
why the picture is still a video rather than an image sequence:

- **Spring instead of lerp.** drei's `ScrollControls` (pmndrs) damps the scroll
  offset with `maath`'s `easing.damp` — Unity's `SmoothDamp`, a critically
  damped spring with an optional `maxSpeed`. Patch 17 ports those ~15 lines.
  Lenis smooths wheel input with a per-frame lerp (0.1 by default, roughly a
  0.17 s time constant at 60 Hz) and leaves touch to the browser by default,
  which is why touch gets a shorter `smoothTime` here.
- **Move between stops, don't scrub everything.** Jesse Zhou's portfolio moves
  the camera between sections with eased, timed tweens rather than a raw
  scrub; Wawa Sensei's scroll lessons slow the scroll near sections. Here that
  became the per-clip time maps (ease out of and into each stop), the fade
  jumps and the soft snap.
- **Snap direction.** GSAP ScrollTrigger's `snap` goes in the direction of the
  last scroll by default (`directional`), after a short delay, with a minimum
  and maximum duration: the same three rules as patch 20.
- **Weight from a physical model.** Bruno Simon's site is driven by a physics
  car, not the scrollbar; the lesson used here is only that perceived weight
  comes from a damped model with a speed limit, not from a linear mapping.
- **Image sequences (Apple-style canvas).** Measured on these clips: a WebP
  sequence at 1280 px, quality 72, weighs 41.5 MB for the 388 frames — 1.3–2.2×
  the MP4s — and every decoded frame costs width × height × 4 bytes of memory.
  Not adopted. If an iPhone still stutters after these patches, the next
  experiment is a canvas fed by WebCodecs (`VideoDecoder`, Safari 16.4+).

Sources: github.com/pmndrs/drei (ScrollControls), github.com/pmndrs/maath
(easing.damp), docs.unity3d.com (Mathf.SmoothDamp),
github.com/darkroomengineering/lenis, gsap.com/docs/v3/Plugins/ScrollTrigger
(snap), jesse-zhou.com, wawasensei.dev, bruno-simon.com.
