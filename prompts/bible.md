# Style Bible — identity lock for all 5 frames

Apply to every frame without exception. This is what stops the building from drifting.

- **Lens:** 24mm architectural, f/2.8, no ultra-wide distortion
- **Camera:** 1.6m height, slight Low Angle on the tower (authority)
- **Palette progression:** amber golden hour -> blueprint cyan -> concrete grey -> dusk indigo -> warm interior tungsten
- **Light progression:** golden hour -> dusk -> night interior
- **Render:** photoreal architectural visualization, cinematic color grading, Haze/Atmosphere
- **FORBIDDEN:** people, text in the image, logos, watermarks
- **Frame:** 16:9, same horizon line across all 5 frames

## Subject
Luxury pre-construction tower on a cleared coastal hillside lot with ocean view. Property name: **Maravilla**. Coastal California / Mediterranean climate.

## Generation model
- Frames: `gpt_image_2_5`, quality `medium`, resolution `2k`, aspect_ratio `16:9` (1 credit each)
- Chaining: each frame passes the PREVIOUS frame's job_id as `medias:[{value:"<job_id>", role:"image"}]` — this is what locks identity (verified: horizon, survey stakes, vegetation preserved exactly)
- Clips: `kling3_0`, duration `4`, `sound:"off"`, `mode:"pro"` (1080p), aspect_ratio `16:9` (7 credits each), roles `start_image` + `end_image`

## Clip chain
`f1 --c1--> f2 --c2--> f3-alt --c3--> f4 --c4--> f5` then ffmpeg concat to one `video.mp4`.
The chain f3 is `f3-alt-hologram` (`media/frames/f3-alt-hologram.png`); its prompt text was not preserved — see `frames.md`. `f3-structure.png` is an unused alternate.
