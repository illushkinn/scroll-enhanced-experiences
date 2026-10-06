# Architecture

A static Astro 5 site that scrubs one MP4 with the scroll position. No client
framework — vanilla TypeScript only.

## 1. Generation pipeline

```
5 frames  →  4 clips  →  ffmpeg concat  →  public/media/video.mp4
 f1..f5      c1..c4      concat.txt            one silent ~16s file
```

| Stage    | Input              | Output           | Notes                                   |
| -------- | ------------------ | ---------------- | --------------------------------------- |
| Frames   | scene prompts      | `media/frames/f1..f5`  | 1920×1080 keyframes, the art direction |
| Clips    | two consecutive frames | `media/clips/c1..c4` | ~4 s interpolation, silent          |
| Concat   | `concat.txt`       | `public/media/video.mp4` | clip order == narrative order      |

The five frames carry the story: golden-hour plot → blueprint → structure →
dusk tower → penthouse. Concatenation order is narrative order, so the video's
timeline and the page's scroll timeline are the same timeline.

## 2. Runtime

```
fixed <video>  ── z-index 0, object-fit: cover, no autoplay/controls
scroll overlay ── position: relative, z-index 1, holds the 5 .scene blocks
body           ── height: 500vh  (≈ 4 viewports of scroll travel)
nav            ── position: fixed, z-index 10, transparent, 40px padding
loader         ── z-index 20, hidden on `canplaythrough`
```

The core mechanic (`src/lib/scroll.ts`):

```
fraction = scrollY / (scrollHeight - innerHeight)
video.currentTime = fraction * video.duration
```

Everything runs in **one** `requestAnimationFrame` loop:

- `window.scrollY` is read **once** per frame; `scrollHeight`/`innerHeight` are
  measured on init and on resize/`ResizeObserver`, never inside the loop.
- A seek is only issued when `|currentTime - target| > 1/30 s`, so sub-frame
  noise does not trigger a write storm.
- A `timeupdate`/`seeked` guard marks a seek as in flight and suppresses
  handling until the media element settles — otherwise the browser's own
  `timeupdate` echo re-triggers a write and the element oscillates.
- Scene visibility is computed in the same pass from `data-start`/`data-end`
  (scroll fractions) using a fade-in / hold / fade-out ramp plus a 30px
  `translateY` rise, written only when the value actually changed.
- `will-change: transform, opacity` sits on `.scene` for a stable GPU layer.

## 3. Degradation

| Condition                | Behaviour                                                     |
| ------------------------ | ------------------------------------------------------------- |
| `prefers-reduced-motion` | No `currentTime` writes. Scenes flip on/off at their window with no transform. |
| Video missing / error    | `body.is-fallback` hides the `<video>` and shows `poster.jpg` full-bleed. Scenes keep animating. |
| `canplaythrough` never   | Loader auto-hides after 8 s.                                  |
| JavaScript disabled      | `html.is-enhanced` is never added: `body` collapses to `auto` height and all five scenes render as a normal stacked page. |

## 4. Files

```
src/
├── layouts/Layout.astro        head: SEO, OG/Twitter, JSON-LD slot
├── pages/index.astro           nav, 5 scene blocks, bootstrap script
├── components/ScrollStage.astro video + fallback + overlay + loader markup
├── lib/scroll.ts               the rAF scrub driver
└── styles/
    ├── tokens.css              OKLCH palette, type scale, spacing
    └── global.css              doc-driven structural CSS
```
