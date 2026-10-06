# Pipeline

## 1. Frames (6 jobs, 1 credit each)
Sequential — each depends on the previous:
```
generate_image model=gpt_image_2_5 quality=medium resolution=2k aspect_ratio=16:9
  prompt=<from frames.md>
  medias=[{value: <prev_job_id>, role: "image"}]   # omit for f1
```
Jobs: f1, f2, f3-alt (the chain f3), f4, f5 — plus f3-structure as an unused alternate.

## 2. Clips (28 credits)
Sequential — each depends on the previous frame:
```
generate_video model=kling3_0 duration=4 sound=off mode=pro aspect_ratio=16:9
  prompt=<from clips.md>
  medias=[{value: <fN_job_id>, role: "start_image"},
          {value: <fN+1_job_id>, role: "end_image"}]
```
c4's end_image is the **re-uploaded** fixed-f5 media `2d50d375-1530-40ec-aed6-61c8e819d033`, not the f5 job id.

## 3. Poll
`job_status { jobId, sync:true }` — or loop every 20s until `completed`.

## 4. f5 retouch (BEFORE any encoding)
The renderer baked a white "×" UI mark into f5 (ImageMagick bbox `x=51..88, y=50..83`, 2688×1520).
```
# backup first: /tmp/opencode/f5fix/f5-penthouse.ORIG.png (md5 9871b5323f0b40ae5be7faeeb695c40f)
ffmpeg -i media/frames/f5-penthouse.png -vf "delogo=x=46:y=45:w=48:h=44" /tmp/opencode/f5fix/f5-fixed.png
mv /tmp/opencode/f5fix/f5-fixed.png media/frames/f5-penthouse.png   # md5 a97bfad30497a627cffca0a9ec7453da
# verify: white connected-components scan = 0 UI blobs (3 natural window highlights remain)
```
Then re-upload the fixed file as media `2d50d375-1530-40ec-aed6-61c8e819d033` and use **that id** as c4's end_image — anchors resolve server-side, a local-only fix does not reach the clip.

## 5. Concat (ffmpeg) — FINAL
`media/concat.txt`, one absolute path per clip, in order c1→c4:
```
file '/abs/path/media/clips/c1.mp4'
file '/abs/path/media/clips/c2.mp4'
file '/abs/path/media/clips/c3.mp4'
file '/abs/path/media/clips/c4.mp4'
```
```
ffmpeg -f concat -safe 0 -i media/concat.txt \
  -vf "scale=2560:1440:flags=lanczos,fps=30" \
  -c:v libx264 -profile:v high -pix_fmt yuv420p \
  -crf 17 -preset slow -an -movflags +faststart \
  public/media/video.mp4
```
Target: **2560×1440 / 30 fps / CRF 17 / preset slow / no audio / faststart**.
No per-clip normalize pass — the concat demuxer feeds the four pro clips straight into this single encode. No `-ac 2` or any audio flag: `-an` only.

## 6. Poster
```
ffmpeg -i media/frames/f1-plot.png -vf "scale=2560:1440:flags=lanczos" -q:v 2 public/media/poster.jpg
```

## 7. Budget
| item | qty | unit | total |
|---|---|---|---|
| frames (medium / 2k) | 6 | 1 | 6 |
| clips (mode:pro, sound:off) | 4 | 7 | 28 |
| **TOTAL** | | | **34** |

Account: **plus plan, 98 credits**.
Clips are the real cost: **28 spent** (4 × 7 at `mode:pro` / `sound:off`). `mode:pro` is required — `mode:std` is 6 credits but only 720p.
Frames: `gpt_image_2_5` at quality `medium`, resolution `2k`, 1 credit each (5 chain frames + the f3-structure alternate = 6 jobs).
