// Builds src/data/time-maps.json: for each connector clip, a table that maps
// scroll progress (0–1) to clip time (0–1) so the camera moves at an even
// visual speed through the clip and starts/lands at rest on the seams.
//
//   node scripts/time-maps.mjs        (needs ffmpeg on PATH)
//
// Re-run it whenever a clip in public/media/clips/ changes.
//
// How: ffmpeg measures how much the picture changes between consecutive frames
// (mean absolute difference, grayscale, 320 px wide) on the desktop encodes. A
// light blur first keeps compression noise (which jumps at every keyframe) from
// counting as motion: with it, the tables come out within 0.4 % of the same
// measurement on the raw, unencoded clips. The cumulative motion, blended with
// plain time, gives where each moment of the clip should fall along the scroll;
// a trapezoid ease (velocity ramps over the first and last RAMP of the band)
// brings the speed to zero at both ends.

import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLIPS = ['c1', 'c2', 'c3', 'c4'];
const ALPHA = 0.75; // weight of measured motion vs plain time (1 = motion only)
const FLOOR = 0.25; // fraction of the mean motion added to every frame, so still parts still advance
const RAMP = 0.12; // share of the band used to accelerate (and, at the end, to brake)
const SAMPLES = 65; // table resolution; the engine interpolates linearly between samples

function frameMotion(file) {
  const out = execFileSync(
    'ffmpeg',
    [
      '-v', 'error', '-i', file,
      '-vf', 'scale=320:-2,format=gray,gblur=sigma=1.5,tblend=all_mode=difference,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-',
      '-f', 'null', '-',
    ],
    { encoding: 'utf8', maxBuffer: 1 << 24 },
  );
  return [...out.matchAll(/YAVG=([0-9.]+)/g)].map((m) => Number(m[1]));
}

// Normalised trapezoid velocity profile: area 1, zero speed at u = 0 and u = 1.
function trapezoid(u, r) {
  const peak = 1 / (1 - r);
  if (u < r) return (peak * u * u) / (2 * r);
  if (u > 1 - r) return 1 - (peak * (1 - u) ** 2) / (2 * r);
  return peak * (r / 2 + (u - r));
}

function timeMap(motion) {
  const n = motion.length; // differences between n + 1 frames
  const mean = motion.reduce((a, b) => a + b, 0) / n;
  const cumulative = [0];
  for (const m of motion) cumulative.push(cumulative.at(-1) + m + FLOOR * mean);
  const total = cumulative.at(-1);
  // G(t): where clip time t should sit along the band, before easing.
  const g = cumulative.map((c, i) => ALPHA * (c / total) + (1 - ALPHA) * (i / n));
  const inverse = (v) => {
    for (let i = 0; i < n; i++) {
      if (g[i + 1] >= v) return (i + (v - g[i]) / (g[i + 1] - g[i] || 1)) / n;
    }
    return 1;
  };
  return Array.from({ length: SAMPLES }, (_, k) =>
    Number(inverse(trapezoid(k / (SAMPLES - 1), RAMP)).toFixed(4)),
  );
}

const maps = {};
for (const clip of CLIPS) {
  const file = path.join(ROOT, 'public/media/clips', `${clip}.mp4`);
  const motion = frameMotion(file);
  maps[clip] = timeMap(motion);
  const mean = motion.reduce((a, b) => a + b, 0) / motion.length;
  console.log(`${clip}: ${motion.length + 1} frames, mean motion ${mean.toFixed(2)}`);
}

const out = path.join(ROOT, 'src/data/time-maps.json');
writeFileSync(
  out,
  JSON.stringify({ generatedBy: 'scripts/time-maps.mjs', alpha: ALPHA, floor: FLOOR, ramp: RAMP, maps }, null, 2) + '\n',
);
console.log(`wrote ${path.relative(ROOT, out)}`);
