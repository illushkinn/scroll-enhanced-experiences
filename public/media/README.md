# `public/media/` — runtime assets

Served as-is by Astro at `/media/…`. Paths are referenced from
`src/data/world.ts`; how each file is produced is in `docs/architecture.md` §1.

| Path | What |
| --- | --- |
| `clips/c1.mp4` … `c4.mp4` | The four connector clips, desktop: 1912×1080, H.264, CRF 20, GOP 8, no B-frames, BT.709 tags, silent, faststart. |
| `clips/c1-m.mp4` … `c4-m.mp4` | Same clips for phones: 720p, CRF 23, GOP 4. |
| `stops/s0.webp` … `s4.webp` | The five stops — real frames of the encoded clips (stop k = first frame of clip k+1; stop 4 = last frame of clip 4). |
| `stops/s0-m.webp` … `s4-m.webp` | The same frames from the phone encodes. |
| `og.jpg` | 1200×630 social preview (from the tower stop). |

Do not replace a still with the original generated image: it would not match the
clip pixel-for-pixel and every seam would pop. Re-extract it from the clip, with
the colour conversion given in the architecture doc. After changing a clip, run
`pnpm time-maps` and `pnpm qa`.

Source frames and raw clips live outside the repo (`/media/` is git-ignored).
