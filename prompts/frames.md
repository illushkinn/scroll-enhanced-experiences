# Frames — gpt_image_2_5 / medium / 2k / 16:9 / 1 credit each

Chain: `f1 → f2 → f3-alt → f4 → f5` — 5 frames, 6 jobs (f3-structure is an unused alternate).

## f1-plot — The Plot
Establishing Shot. Cleared empty urban lot on a coastal hillside at golden hour, packed dirt and wooden survey stakes, distant ocean horizon, long soft shadows, warm amber light, Haze and Atmosphere with volumetric sunbeams, photoreal architectural visualization, 24mm lens, slight low angle, horizon line at 45 percent of frame, cinematic color grading. No people, no text, no logos, no watermarks.

> job_id: `94f01a3e-c636-4deb-9851-caa478c320b4` — 01:01:25 — DONE, `media/frames/f1-plot.png`

## f2-blueprint — The Vision
Same exact camera position, lens and horizon as the reference. Magical Realism with Digital Overlay: cyan and white holographic blueprint lines extruding upward from the cleared dirt lot, tracing the footprint and floor grid of a luxury glass tower, thin volumetric light beams, survey stakes still in place, golden hour light, photoreal architectural visualization, 24mm slight low angle, cinematic color grading. No people, no text, no logos, no watermarks.

> job_id: `28dfcbf5-834d-4c16-814b-e62f359bedb3` — 01:02:08 — DONE, `media/frames/f2-blueprint.png`
> medias: [f1 `94f01a3e…`, role "image"]

## f3-alt-hologram — The Build (this is the chain f3)
Alt re-roll of the f3 beat. Prompt text for this variant was not preserved in this file (the base structure prompt is below).

> job_id: `6cc9b216-1723-4418-8752-90cd2998d21a` — 01:13:04 — DONE, `media/frames/f3-alt-hologram.png`
> medias: [f2 `28dfcbf5…`, role "image"]
> md5-verified against the remote job URL — **this** is the f3 feeding c2 and c3.

## f4-tower — The Tower
Establishing Shot + Low Angle. Same exact camera position, lens and horizon as the reference. Completed luxury glass tower at dusk, warm interior lights glowing floor by floor, deep indigo sky with a last amber band at the horizon, landscaped plaza at the base, photoreal architectural visualization, 24mm, Haze and Atmosphere, cinematic color grading. No people, no text, no logos, no watermarks.

> job_id: `95ff434d-b516-4fc6-a5e1-4d90298fe85d` — 01:13:43 — DONE, `media/frames/f4-tower.png`
> medias: [f3-alt `6cc9b216…`, role "image"]

## f5-penthouse — The Penthouse
Wide Shot + Shallow Focus + Practical Light. Interior of a finished penthouse at night, floor-to-ceiling glass with dark ocean and distant city lights beyond, warm tungsten practicals, travertine and walnut surfaces, photoreal architectural visualization, 24mm, cinematic color grading. No people, no text, no logos, no watermarks.

> job_id: `6f553a0e-96b5-4901-a32a-f1cf13f9cedf` — 01:15:51 — DONE, `media/frames/f5-penthouse.png`
> medias: [f4 `95ff434d…`, role "image"]
> **RETOUCH** — original had a white "×" renderer UI mark baked in. ImageMagick bbox `x=51..88, y=50..83` in the 2688×1520 image.
> `ffmpeg -i media/frames/f5-penthouse.png -vf "delogo=x=46:y=45:w=48:h=44" …`
> Verify: white connected-components scan over the whole image = **zero UI blobs** (only 3 natural window highlights remain).
> Backup `/tmp/opencode/f5fix/f5-penthouse.ORIG.png` md5 `9871b5323f0b40ae5be7faeeb695c40f` → fixed md5 `a97bfad30497a627cffca0a9ec7453da`.
> Fixed file also uploaded to Higgsfield as media `2d50d375-1530-40ec-aed6-61c8e819d033` — end_image anchors resolve **server-side**, so the local fix alone would not have applied to c4.

## f3-structure — The Build (alternate, NOT in the chain)
Time Lapse still. Same exact camera position, lens and horizon as the reference. The site mid-construction: bare concrete core and floor slabs partially stacked, exposed rebar and a tower crane, scaffolding, late afternoon light shifting cooler, photoreal architectural visualization, Haze and Atmosphere, cinematic color grading. No people, no text, no logos, no watermarks.

> job_id: `3960edcf-f969-4d28-9072-0ae9d98b98fa` — 01:17:41 — DONE, `media/frames/f3-structure.png`
> medias: [f1 `94f01a3e…`, role "image"] — not referenced by any clip.
