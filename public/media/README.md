# `public/media/` — runtime assets

Drop the final render output here. This directory is served as-is by Astro at
`/media/…`, so filenames below are exactly what the page references.

| File         | Spec                                                                            |
| ------------ | ------------------------------------------------------------------------------- |
| `video.mp4`  | 2560×1440, 30 fps, 16.17 s, **silent** (no audio track), H.264, `faststart`     |
| `poster.jpg` | 2560×1440 still, derived from `media/frames/f1-plot.png` (frame 1 of the chain) |

Referenced by `src/components/ScrollStage.astro` as:

- `src="/media/video.mp4"`
- `poster="/media/poster.jpg"`

The poster doubles as the **fallback** background: if `video.mp4` is missing or
fails to decode, `scroll.ts` adds `is-fallback` to `<body>` and the poster is
shown full-bleed while the scroll-driven copy keeps working.

Do not commit the source frames or intermediate clips here — they live in
`media/` at the project root (see `../../media/README.md`).
