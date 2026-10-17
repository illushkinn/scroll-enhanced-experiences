// Browser QA for the scroll flight. Serves dist/ (run `pnpm build` first),
// drives the page in Chromium and prints a pass/fail table.
//
//   pnpm qa                       all checks
//   pnpm qa -- --only seams       one group (seams, rest, loading, jump, snap,
//                                 robust, reduced, menu, deeplink, resize,
//                                 viewports, nojs)
//   pnpm qa -- --dist other/dist  test another build (e.g. master, to compare)
//   pnpm qa -- --json out.json    also write the raw results
//
// Browser: Google Chrome if installed (channel "chrome"), else Playwright's
// Chromium (`pnpm exec playwright-core install chromium` downloads it once);
// CHROME_PATH overrides both. Chromium builds without an H.264
// decoder (most headless ones) get VP9 copies of the clips, made with ffmpeg
// on the fly and cached in the OS temp dir, served in place of the MP4s. They
// keep the frame count, timing and GOP, so frame and seam numbers still hold;
// colour and sharpness are not what visitors see.
//
// What "frames skipped at a seam" means: the engine cuts from a clip to the
// next stop's still (the next clip's first frame, which the clip's last frame
// was generated to match). If the clip is still showing frame 90 of 96 when the
// cut happens, six frames are skipped and the picture jumps.

import { createServer } from 'node:http';
import { readFile, mkdir, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { chromium } from 'playwright-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const arg = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const DIST = path.resolve(ROOT, arg('dist') ?? 'dist');
const ONLY = arg('only')?.split(',');
const JSON_OUT = arg('json');

const results = [];
const raw = {};
function check(group, name, pass, detail = '') {
  results.push({ group, name, pass: !!pass, detail: String(detail) });
  console.log(`${pass ? 'PASS' : 'FAIL'}  [${group}] ${name}${detail ? ` — ${detail}` : ''}`);
}
const GROUPS = ['seams', 'rest', 'loading', 'jump', 'snap', 'robust', 'reduced', 'menu', 'deeplink', 'resize', 'viewports', 'nojs'];
const unknown = (ONLY ?? []).filter((g) => !GROUPS.includes(g));
if (unknown.length) {
  console.error(`unknown group: ${unknown.join(', ')} (groups: ${GROUPS.join(', ')})`);
  process.exit(2);
}
const want = (group) => !ONLY || ONLY.includes(group);
// A group that throws (a timeout, a missing element) records a failure and the
// run carries on with the next group.
async function group(name, fn) {
  if (!want(name)) return;
  try {
    await fn();
  } catch (error) {
    check(name, 'group ran to the end', false, String(error.message).split('\n')[0]);
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- static server ------------------------------------------------------------

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png',
  '.mp4': 'video/mp4', '.json': 'application/json', '.txt': 'text/plain', '.xml': 'application/xml',
};
async function serve(dir) {
  if (!existsSync(path.join(dir, 'index.html'))) throw new Error(`${dir}/index.html missing — run pnpm build`);
  const server = createServer(async (req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const file = path.join(dir, path.normalize(p));
    if (!file.startsWith(dir)) { res.writeHead(403).end(); return; }
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404).end('not found');
    }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { server, base: `http://127.0.0.1:${server.address().port}` };
}

// ---- browser + codec fallback ---------------------------------------------------

async function launch() {
  const args = ['--autoplay-policy=no-user-gesture-required', '--mute-audio'];
  if (process.env.CHROME_PATH) return chromium.launch({ executablePath: process.env.CHROME_PATH, args });
  try { return await chromium.launch({ channel: 'chrome', args }); } catch {}
  try { return await chromium.launch({ args }); } catch {}
  throw new Error('No browser found: install Google Chrome, run `pnpm exec playwright-core install chromium`, or set CHROME_PATH');
}

async function vp9Proxies(clipsDir) {
  const cache = path.join(tmpdir(), 'libertad-qa-proxies');
  await mkdir(cache, { recursive: true });
  const map = {};
  for (const name of ['c1', 'c2', 'c3', 'c4', 'c1-m', 'c2-m', 'c3-m', 'c4-m']) {
    const src = path.join(clipsDir, `${name}.mp4`);
    const gop = name.endsWith('-m') ? '4' : '8';
    const args = ['-an', '-vf', 'scale=-2:480', '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '36',
      '-g', gop, '-keyint_min', gop, '-deadline', 'realtime', '-cpu-used', '8', '-row-mt', '1', '-f', 'webm'];
    // Keyed on the clip's bytes and the encode settings (a rebuild copies the
    // clips with new timestamps but the same content).
    const key = createHash('sha1').update(await readFile(src)).update(args.join(' ')).digest('hex').slice(0, 12);
    const out = path.join(cache, `${name}-${key}.webm`);
    if (!existsSync(out)) {
      // Written aside and renamed, so an interrupted encode is never reused.
      execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', src, ...args, `${out}.tmp`]);
      await rename(`${out}.tmp`, out);
    }
    map[name] = out;
  }
  return map;
}

// ---- page helpers ----------------------------------------------------------------

// Runs in the page before any script: records, once per animation frame, which
// scene is on top and which frame each clip last presented
// (requestVideoFrameCallback → mediaTime). It registers first, so each tick runs
// BEFORE the engine's frame and shows what the previous frame put on screen.
function instrument() {
  const qa = (window.__qa = { ticks: [], recording: false });
  // Opacity of the jump veil (0 if this build has none).
  window.veil = () => { const v = document.querySelector('.sw-veil'); return v ? +getComputedStyle(v).opacity : 0; };
  // How much of the screen the film covers (1 = fully; less = background shows
  // through): layers composited from their computed opacities.
  window.coverage = () => {
    let clear = 1;
    for (const sc of document.querySelectorAll('.sw-scene')) {
      const so = +getComputedStyle(sc).opacity;
      if (!so) continue;
      const img = sc.querySelector('img'), v = sc.querySelector('video');
      const io = img && img.complete && img.naturalWidth && getComputedStyle(img).visibility !== 'hidden' ? +getComputedStyle(img).opacity : 0;
      const vo = v && v.__frame != null ? +getComputedStyle(v).opacity : 0;
      clear *= 1 - so * (1 - (1 - io) * (1 - vo));
    }
    return 1 - clear;
  };
  // Lowest coverage and highest veil seen since the last reset, sampled every frame.
  qa.cov = { min: 1, veil: 0 };
  const sample = () => {
    if (document.querySelector('.sw-scene')) {
      qa.cov.min = Math.min(qa.cov.min, window.coverage());
      qa.cov.veil = Math.max(qa.cov.veil, window.veil());
    }
    requestAnimationFrame(sample);
  };
  requestAnimationFrame(sample);
  const loop = (now) => {
    const scenes = document.querySelectorAll('.sw-scene');
    if (scenes.length) {
      let top = -1;
      const frames = [];
      scenes.forEach((s, i) => {
        if (s.style.zIndex === '120') top = i;
        const v = s.querySelector('video');
        if (v && !v.__qa) {
          v.__qa = true;
          const cb = (_, md) => { v.__frame = Math.round(md.mediaTime * 24); v.requestVideoFrameCallback(cb); };
          v.requestVideoFrameCallback(cb);
        }
        frames.push(v && v.__frame != null ? v.__frame : null);
      });
      if (qa.recording) qa.ticks.push({ t: now, y: window.scrollY, top, frames });
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  // Scroll at a constant speed (px/s) from one offset to another, one step per frame.
  qa.drive = (from, to, speed) => new Promise((done) => {
    window.scrollTo(0, from);
    const t0 = performance.now(), dist = to - from, dur = Math.abs(dist) / speed * 1000;
    const step = (now) => {
      const k = Math.min(1, (now - t0) / dur);
      window.scrollTo(0, Math.round(from + dist * k));
      if (k < 1) requestAnimationFrame(step); else done();
    };
    requestAnimationFrame(step);
  });
}

// Mirrors the engine's layout (src/lib/scroll-world.js layout()).
async function geometry(page) {
  return page.evaluate(() => {
    const cfg = JSON.parse(document.getElementById('world').dataset.config);
    const vh = window.innerHeight;
    // Under reduced motion the engine caps every clip band at one viewport.
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const segs = [];
    let off = 0;
    cfg.sections.forEach((s, i) => {
      segs.push({ kind: 'dive', si: i, id: s.id, start: off * vh, end: (off += s.scroll || 1.3) * vh });
      if (i < cfg.sections.length - 1) {
        const w0 = Array.isArray(cfg.connScroll) ? cfg.connScroll[i] : cfg.connScroll;
        const w = reduce ? Math.min(w0, 1) : w0;
        segs.push({ kind: 'conn', si: i, map: cfg.connectorTimeMaps?.[i] ?? null, start: off * vh, end: (off += w) * vh });
      }
    });
    const center = (i) => (i === 0 ? 0 : (segs[2 * i].start + segs[2 * i].end) / 2);
    return { vh, segs, ids: cfg.sections.map((s) => s.id), centers: cfg.sections.map((_, i) => center(i)), max: off * vh };
  });
}
const mapTime = (table, x) => {
  if (!table) return x;
  const p = Math.min(1, Math.max(0, x)) * (table.length - 1);
  const k = Math.min(Math.floor(p), table.length - 2);
  return table[k] + (table[k + 1] - table[k]) * (p - k);
};

async function openPage(ctx, base, url = '/') {
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(base + url, { waitUntil: 'load' });
  return { page, errors };
}

// Wait until every clip within reach has a presented frame.
async function waitClips(page, n, timeout = 20000) {
  await page.waitForFunction((k) => {
    const vs = [...document.querySelectorAll('.sw-scene video')];
    return vs.length >= k && vs.every((v) => v.__frame != null);
  }, n, { timeout });
}

// Wait until the picture stops changing — the spring (and any snap) has come to
// rest: scroll offset, presented frames and copy styles unchanged for 600 ms.
async function settle(page, max = 8000) {
  const state = () => page.evaluate(() => JSON.stringify([
    window.scrollY,
    [...document.querySelectorAll('.sw-scene video')].map((v) => v.__frame),
    [...document.querySelectorAll('.sw-copy')].map((c) => c.getAttribute('style')),
    document.querySelector('.sw-veil')?.style.opacity,
  ]));
  const t0 = Date.now();
  let last = await state(), since = Date.now();
  while (Date.now() - t0 < max) {
    await sleep(100);
    const cur = await state();
    if (cur !== last) { last = cur; since = Date.now(); } else if (Date.now() - since >= 600) return;
  }
}

async function preloadAll(page, geo) {
  // Park on each stop briefly so the load queue fetches every clip.
  for (const c of geo.centers) {
    await page.evaluate((y) => window.scrollTo(0, y), c);
    await sleep(900);
  }
  await waitClips(page, 4, 40000);
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(1500);
}

// ---- main ---------------------------------------------------------------------

const { server, base } = await serve(DIST);
const browser = await launch();
const probe = await browser.newPage();
const h264 = await probe.evaluate(() => document.createElement('video').canPlayType('video/mp4; codecs="avc1.640028"'));
await probe.close();
const proxies = h264 ? null : await vp9Proxies(path.join(DIST, 'media/clips'));
console.log(`browser ${browser.version()} · H.264 ${h264 ? 'native' : 'missing → VP9 proxies'} · ${DIST}`);

// `fail`: clip names answered with HTTP 500; `delay`: { 'c1.mp4': ms, 's1.webp': ms }.
async function context(opts = {}) {
  const { fail, delay = {}, ...rest } = opts;
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...rest });
  await ctx.addInitScript(instrument);
  await ctx.route('**/media/**', async (route) => {
    const file = path.basename(new URL(route.request().url()).pathname);
    if (delay[file]) await sleep(delay[file]);
    const clip = /^(c\d(-m)?)\.mp4$/.exec(file)?.[1];
    if (clip && fail && fail.includes(clip)) return route.fulfill({ status: 500, body: 'fail' });
    if (clip && proxies) return route.fulfill({ path: proxies[clip], contentType: 'video/webm' }).catch(() => {});
    return route.continue().catch(() => {});
  });
  return ctx;
}
const resetCov = (page) => page.evaluate(() => { window.__qa.cov = { min: 1, veil: 0 }; });
const cov = (page) => page.evaluate(() => window.__qa.cov);

try {
  // -- seams: frames skipped when the top layer changes, scrolling stop → stop ---------
  await group('seams', async () => {
    const ctx = await context();
    const { page, errors } = await openPage(ctx, base);
    const geo = await geometry(page);
    await preloadAll(page, geo);
    raw.seams = {};
    for (const speed of [1, 2, 4]) {
      const skips = [], jumps = [];
      for (let k = 0; k < geo.ids.length - 1; k++) {
        const from = geo.centers[k], to = geo.centers[k + 1];
        await page.evaluate((y) => window.scrollTo(0, y), from);
        await sleep(1200);
        await page.evaluate(() => { window.__qa.ticks = []; window.__qa.recording = true; });
        await page.evaluate(([a, b, v]) => window.__qa.drive(a, b, v), [from, to, speed * geo.vh]);
        await sleep(1500);
        const ticks = await page.evaluate(() => { window.__qa.recording = false; return window.__qa.ticks; });
        const conn = 2 * k + 1;
        // Last clip frame on screen before the stop's still took over: tick `cut`
        // is the first to show the still, so the tick before it shows that frame.
        const cut = ticks.findIndex((t, i) => i > 0 && ticks[i - 1].top === conn && t.top === conn + 1);
        const last = cut > 0 ? ticks[cut - 1].frames[conn] : null;
        skips.push(last == null ? null : 96 - last);
        // Largest frame advance between two consecutive animation frames inside the clip.
        let maxJump = 0;
        for (let i = 1; i < ticks.length; i++) {
          if (ticks[i].top !== conn || ticks[i - 1].top !== conn) continue;
          const a = ticks[i - 1].frames[conn], b = ticks[i].frames[conn];
          if (a != null && b != null) maxJump = Math.max(maxJump, b - a);
        }
        jumps.push(maxJump);
      }
      raw.seams[speed] = { skips, jumps };
      const worst = Math.max(...skips.map((s) => (s == null ? 99 : s)));
      // A frozen clip would also "skip nothing" if it happened to rest on its last frame.
      const played = jumps.every((j) => j > 0);
      check('seams', `frames skipped at clip→stop cuts, ${speed} viewports/s`, worst <= 1 && played,
        `per clip [${skips.join(', ')}]; largest advance per screen frame [${jumps.join(', ')}]`);
    }
    check('seams', 'no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
    await ctx.close();
  });

  // -- rest: at rest the presented frame is exactly the frame the scroll asks for ----
  await group('rest', async () => {
    const ctx = await context();
    const { page } = await openPage(ctx, base);
    const geo = await geometry(page);
    await preloadAll(page, geo);
    const off = [];
    for (const [k, frac] of [[0, 0.3], [1, 0.5], [2, 0.7], [3, 0.4], [3, 0.85]]) {
      const s = geo.segs[2 * k + 1];
      const y = Math.round(s.start + (s.end - s.start) * frac);
      await page.evaluate((v) => window.scrollTo(0, v), y);
      await settle(page);
      const realY = await page.evaluate(() => window.scrollY);
      const expect = Math.round(mapTime(s.map, (realY - s.start) / (s.end - s.start)) * 96);
      // The spring's last pixels can take a second after the picture looks still.
      let shown = null;
      for (let t = 0; t < 40; t++) {
        shown = await page.evaluate((i) => document.querySelectorAll('.sw-scene')[i].querySelector('video')?.__frame, 2 * k + 1);
        if (shown === expect) break;
        await sleep(100);
      }
      off.push(shown == null ? 'none' : shown - expect);
    }
    check('rest', 'presented frame = target frame at rest (5 positions)', off.every((d) => d === 0), `differences [${off.join(', ')}]`);
    await ctx.close();
  });

  // -- loading: one download at a time; failures back off ----------------------------
  await group('loading', async () => {
    // From a fresh page at "plano", both neighbouring clips load — one at a time
    // (c1 is slowed so two parallel downloads would visibly overlap).
    const ctx = await context({ delay: { 'c1.mp4': 1500, 'c2.mp4': 1500 } });
    const reqs = new Map();
    ctx.on('request', (r) => { if (/\/media\/clips\//.test(r.url())) reqs.set(r, { name: path.basename(r.url()), start: Date.now(), end: Infinity }); });
    const done = (r) => { const q = reqs.get(r); if (q) q.end = Date.now(); };
    ctx.on('requestfinished', done);
    ctx.on('requestfailed', done);
    const { page } = await openPage(ctx, base, '/#plano');
    await sleep(6000);
    const list = [...reqs.values()];
    const names = list.map((q) => q.name);
    check('loading', 'from a stop, the clips on both sides load', names.includes('c1.mp4') && names.includes('c2.mp4'), names.join(', '));
    const overlap = list.some((a, i) => list.some((b, j) => i < j && a.start < b.end && b.start < a.end));
    check('loading', 'one clip download at a time', list.length >= 2 && !overlap,
      list.map((q) => `${q.name} ${q.start - list[0].start}–${q.end === Infinity ? '…' : q.end - list[0].start} ms`).join(', '));
    await ctx.close();

    // A failing clip: tries at about 0, +2 and +6 s and no more, even while the
    // visitor keeps scrolling near it.
    const ctx2 = await context({ fail: ['c1'] });
    let failed = 0;
    ctx2.on('request', (r) => { if (/\/clips\/c1\.mp4$/.test(r.url())) failed++; });
    const p2 = await openPage(ctx2, base);
    const g2 = await geometry(p2.page);
    for (let i = 0; i < 16; i++) {
      await p2.page.evaluate((y) => window.scrollTo(0, y), Math.round((i % 2 ? 0.2 : 0.4) * g2.vh));
      await sleep(470);
    }
    check('loading', 'a failing clip is retried with backoff (3 tries in 7.5 s)', failed === 3, `${failed} requests`);
    const mid = g2.segs[1];
    await p2.page.evaluate((y) => window.scrollTo(0, y), Math.round((mid.start + mid.end) / 2));
    await settle(p2.page);
    const dissolve = await p2.page.evaluate(() => {
      const sc = document.querySelectorAll('.sw-scene');
      return { origin: +getComputedStyle(sc[0]).opacity, dest: +getComputedStyle(sc[1].querySelector('img')).opacity };
    });
    check('loading', 'a clip that never arrives dissolves origin → destination still', dissolve.origin > 0.99 && dissolve.dest > 0.2 && dissolve.dest < 0.8,
      `origin ${dissolve.origin.toFixed(2)}, destination still ${dissolve.dest.toFixed(2)} at mid-clip`);
    await ctx2.close();
  });

  // -- jump: menu jump fades and fetches only the destination's media -------------------
  await group('jump', async () => {
    const ctx = await context();
    const { page, errors } = await openPage(ctx, base);
    const geo = await geometry(page);
    await sleep(2500);
    const after = [];
    page.on('request', (r) => after.push(path.basename(new URL(r.url()).pathname)));
    let veilMax = 0;
    await page.click('[data-menu-open]');
    await page.click('.menu__item[data-stop="penthouse"]');
    for (let i = 0; i < 20; i++) {
      veilMax = Math.max(veilMax, await page.evaluate(() => veil()));
      await sleep(25);
    }
    await sleep(2500);
    const y = await page.evaluate(() => window.scrollY);
    const veilEnd = await page.evaluate(() => veil());
    const clips = after.filter((n) => /^c\d/.test(n));
    check('jump', 'menu → penthouse lands on the stop', Math.abs(y - geo.centers[4]) <= 2, `scrollY ${y}, stop ${Math.round(geo.centers[4])}`);
    check('jump', 'the stage fades out and back in', veilMax > 0.9 && veilEnd === 0, `veil peak ${veilMax.toFixed(2)}, end ${veilEnd}`);
    check('jump', 'only the destination clip is fetched (c4, no c2/c3)', clips.includes('c4.mp4') && !clips.some((n) => /^c[23]/.test(n)), clips.join(', ') || 'none');
    check('jump', 'menu aria-current follows', await page.evaluate(() => document.querySelector('.menu__item[aria-current]')?.dataset.stop) === 'penthouse');
    // End key: a gap wider than teleportGap fades instead of flying through.
    await page.evaluate(() => window.scrollTo(0, 0));
    await sleep(1500);
    veilMax = 0;
    await page.keyboard.press('End');
    for (let i = 0; i < 30; i++) {
      veilMax = Math.max(veilMax, await page.evaluate(() => veil()));
      await sleep(25);
    }
    await sleep(2000);
    const lastCopy = await page.evaluate(() => +getComputedStyle([...document.querySelectorAll('.sw-copy')].at(-1)).opacity);
    check('jump', 'End key fades to the end instead of flying through', veilMax > 0.9 && lastCopy > 0.99, `veil peak ${veilMax.toFixed(2)}, last copy ${lastCopy}`);
    check('jump', 'no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
    await ctx.close();
  });

  // -- snap: finishes a move toward a stop, never pulls back ------------------------------
  await group('snap', async () => {
    const ctx = await context();
    const { page } = await openPage(ctx, base);
    const geo = await geometry(page);
    await sleep(2000);
    const c1 = geo.segs[1];
    await page.mouse.wheel(0, 1);   // the snap waits for a first real input
    // Down into the last 0.3 viewports of clip 1, stop: glides on to "plano".
    await page.evaluate(([a, b, v]) => window.__qa.drive(a, b, v), [c1.start, Math.round(c1.end - 0.3 * geo.vh), geo.vh]);
    await sleep(1500); // idle time + the spring's approach, then the glide
    await settle(page);
    let y = await page.evaluate(() => window.scrollY);
    check('snap', 'stopping near a stop (moving toward it) glides onto it', Math.abs(y - geo.centers[1]) <= 2, `scrollY ${y}, stop ${Math.round(geo.centers[1])}`);
    // Up from "plano" into the same zone: the stop is behind, so nothing moves.
    const zoneY = Math.round(c1.end - 0.3 * geo.vh);
    await page.evaluate(([a, b, v]) => window.__qa.drive(a, b, v), [Math.round(geo.centers[1]), zoneY, geo.vh]);
    await settle(page);
    await sleep(800);
    y = await page.evaluate(() => window.scrollY);
    check('snap', 'moving away from a stop is never pulled back', Math.abs(y - zoneY) <= 2, `scrollY ${y}, left at ${zoneY}`);
    // Middle of a clip: out of range, nothing moves.
    const mid = Math.round((geo.segs[3].start + geo.segs[3].end) / 2);
    await page.evaluate(([a, b, v]) => window.__qa.drive(a, b, v), [mid - 200, mid, geo.vh]);
    await settle(page);
    await sleep(800);
    y = await page.evaluate(() => window.scrollY);
    check('snap', 'mid-clip positions stay put', Math.abs(y - mid) <= 2, `scrollY ${y}, left at ${mid}`);
    // Open menu pauses the snap.
    await page.evaluate(([a, b, v]) => window.__qa.drive(a, b, v), [c1.start, zoneY, geo.vh]);
    await page.click('[data-menu-open]');
    await sleep(2500);
    y = await page.evaluate(() => window.scrollY);
    check('snap', 'no snap behind the open menu', Math.abs(y - zoneY) <= 2, `scrollY ${y}`);
    await page.keyboard.press('Escape');
    // Closing the menu turns the snap back on.
    await page.evaluate(([a, b, v]) => window.__qa.drive(a, b, v), [c1.start, zoneY, geo.vh]);
    await sleep(1500);
    await settle(page);
    y = await page.evaluate(() => window.scrollY);
    check('snap', 'the snap is back after the menu closes', Math.abs(y - geo.centers[1]) <= 2, `scrollY ${y}, stop ${Math.round(geo.centers[1])}`);
    await ctx.close();
  });

  // -- robustness: the cases an adversarial review reproduced -------------------------
  await group('robust', async () => {
    // A fast but continuous scroll stays a flight: no fade.
    {
      const ctx = await context();
      const { page } = await openPage(ctx, base);
      const geo = await geometry(page);
      await preloadAll(page, geo);
      await page.mouse.wheel(0, 1);   // a real input, as a visitor would give
      await resetCov(page);
      await page.evaluate(([a, b, v]) => window.__qa.drive(a, b, v), [0, Math.round(6 * geo.vh * 1.5), 6 * geo.vh]);
      await settle(page);
      const c = await cov(page);
      check('robust', 'a fast continuous scroll (6 viewports/s) never fades', c.veil < 0.05 && c.min > 0.99, `veil peak ${c.veil.toFixed(2)}, lowest coverage ${c.min.toFixed(2)}`);
      await ctx.close();
    }
    // A clip arriving mid-dissolve fades in over it, never through the background.
    {
      const ctx = await context({ delay: { 'c1.mp4': 3500 } });
      const { page } = await openPage(ctx, base);
      const geo = await geometry(page);
      const c1 = geo.segs[1];
      await page.evaluate((y) => window.scrollTo(0, y), Math.round(c1.start + 0.3 * (c1.end - c1.start)));
      await settle(page);
      await resetCov(page);
      await page.waitForFunction(() => document.querySelectorAll('.sw-scene')[1].querySelector('video')?.__frame != null, null, { timeout: 15000 });
      await sleep(800);
      const c = await cov(page);
      check('robust', 'a clip that lands mid-dissolve never shows the background', c.min > 0.95, `lowest coverage ${c.min.toFixed(2)}`);
      await ctx.close();
    }
    // Scrolling up into a clip that never arrives: the origin still is there.
    {
      const ctx = await context({ fail: ['c2'], delay: { 's1.webp': 400 } });
      const { page } = await openPage(ctx, base, '/#obra');
      const geo = await geometry(page);
      await settle(page);
      await page.mouse.wheel(0, -1);
      await resetCov(page);
      await page.evaluate(([a, b, v]) => window.__qa.drive(a, b, v), [Math.round(geo.centers[2]), Math.round(geo.centers[1]), 1.2 * geo.vh]);
      await settle(page);
      const c = await cov(page);
      check('robust', 'scrolling up into a missing clip dissolves over its origin still', c.min > 0.95, `lowest coverage ${c.min.toFixed(2)}`);
      await ctx.close();
    }
    // A slow download is dropped when the visitor jumps away.
    {
      const ctx = await context({ delay: { 'c1.mp4': 8000 } });
      const reqs = [];
      ctx.on('request', (r) => reqs.push({ t: Date.now(), name: path.basename(new URL(r.url()).pathname) }));
      const { page } = await openPage(ctx, base);
      await page.waitForTimeout(600);
      const t0 = Date.now();
      await page.evaluate(() => document.querySelectorAll('.sw-route__dot')[4].click());
      await sleep(2500);
      const c4 = reqs.find((r) => r.name === 'c4.mp4' && r.t >= t0);
      check('robust', 'a slow clip download does not hold up the destination', !!c4, c4 ? `c4 requested ${c4.t - t0} ms after the jump` : 'c4 never requested');
      await ctx.close();
    }
    // A reload just above a stop (last move: up) doesn't glide on by itself.
    {
      const ctx = await context();
      const { page } = await openPage(ctx, base);
      const geo = await geometry(page);
      const y = Math.round(geo.segs[2].start - 0.25 * geo.vh);
      await page.mouse.wheel(0, 1);
      await page.evaluate(([a, b, v]) => window.__qa.drive(a, b, v), [Math.round(geo.centers[1]), y, geo.vh]);
      await settle(page);
      await page.reload({ waitUntil: 'load' });
      await sleep(2500);
      const after = await page.evaluate(() => window.scrollY);
      check('robust', 'a reload does not snap by itself', Math.abs(after - y) <= 2, `left at ${y}, after reload ${after}`);
      await ctx.close();
    }
    // Clicking the stop you are on does nothing.
    {
      const ctx = await context();
      const { page } = await openPage(ctx, base, '/#obra');
      await settle(page);
      await resetCov(page);
      await page.evaluate(() => document.querySelectorAll('.sw-route__dot')[2].click());
      await sleep(800);
      const c = await cov(page);
      check('robust', 'jumping to the current stop does not blink', c.veil < 0.05, `veil peak ${c.veil.toFixed(2)}`);
      await ctx.close();
    }
  });

  // -- reduced motion -----------------------------------------------------------
  await group('reduced', async () => {
    const ctx = await context({ reducedMotion: 'reduce' });
    const reqs = [];
    const { page } = await openPage(ctx, base);
    page.on('request', (r) => reqs.push(r.url()));
    const geo = await geometry(page);
    for (let y = 0; y <= geo.max; y += geo.vh / 2) {
      await page.evaluate((v) => window.scrollTo(0, v), Math.round(y));
      await sleep(120);
    }
    check('reduced', 'no clip is downloaded', !reqs.some((u) => /\/clips\//.test(u)), `${reqs.filter((u) => /\/clips\//.test(u)).length} clip requests`);
    const s = geo.segs[1];
    await page.evaluate((v) => window.scrollTo(0, v), Math.round((s.start + s.end) / 2));
    await sleep(400);
    const op = await page.evaluate(() => +getComputedStyle(document.querySelectorAll('.sw-scene')[1].querySelector('img')).opacity);
    check('reduced', 'stills dissolve across a clip band', op > 0.3 && op < 0.7, `destination still ${op.toFixed(2)} at mid-band`);
    await page.evaluate((v) => window.scrollTo(0, v), Math.round(s.end - 0.1 * geo.vh));
    await sleep(1500);
    const y = await page.evaluate(() => window.scrollY);
    check('reduced', 'no snap', Math.abs(y - Math.round(s.end - 0.1 * geo.vh)) <= 2);
    await ctx.close();
  });

  // -- menu: keyboard and focus ---------------------------------------------------------
  await group('menu', async () => {
    const ctx = await context();
    const { page } = await openPage(ctx, base);
    await page.focus('[data-menu-open]');
    await page.keyboard.press('Enter');
    const open = await page.evaluate(() => ({
      hidden: document.getElementById('site-menu').hidden,
      focus: document.activeElement?.className,
      inert: document.querySelector('main').inert,
    }));
    check('menu', 'Enter opens the dialog, focuses a stop, makes the page inert', !open.hidden && /menu__item/.test(open.focus) && open.inert, JSON.stringify(open));
    for (let i = 0; i < 12; i++) await page.keyboard.press('Tab');
    const inside = await page.evaluate(() => !!document.activeElement?.closest('#site-menu'));
    check('menu', 'Tab stays inside the dialog', inside);
    await page.keyboard.press('Escape');
    const closed = await page.evaluate(() => ({ hidden: document.getElementById('site-menu').hidden, focus: document.activeElement?.hasAttribute('data-menu-open') }));
    check('menu', 'Escape closes and returns focus', closed.hidden && closed.focus);
    await ctx.close();
  });

  // -- deep link ----------------------------------------------------------------------
  await group('deeplink', async () => {
    const ctx = await context();
    const reqs = [];
    ctx.on('request', (r) => reqs.push(path.basename(new URL(r.url()).pathname)));
    const { page } = await openPage(ctx, base, '/en/#torre');
    await sleep(3000);
    const geo = await geometry(page);
    const y = await page.evaluate(() => window.scrollY);
    check('deeplink', '/en/#torre starts at the tower stop', Math.abs(y - geo.centers[3]) <= 2, `scrollY ${y}, stop ${Math.round(geo.centers[3])}`);
    check('deeplink', 'no clip from the top of the flight is fetched', !reqs.some((n) => /^c1/.test(n)), reqs.filter((n) => /^c\d/.test(n)).join(', '));
    check('deeplink', 'the language link keeps the stop', await page.evaluate(() => document.querySelector('[data-lang-switch]').getAttribute('href')) === '/#torre');
    await ctx.close();
  });

  // -- resize keeps the point of the story ----------------------------------------------
  await group('resize', async () => {
    const ctx = await context();
    const { page } = await openPage(ctx, base, '/#obra');
    await sleep(2000);
    await page.setViewportSize({ width: 1000, height: 640 });
    await settle(page);
    const geo = await geometry(page);
    const y = await page.evaluate(() => window.scrollY);
    check('resize', 'resizing stays on the same stop', Math.abs(y - geo.centers[2]) <= 2, `scrollY ${y}, stop ${Math.round(geo.centers[2])}`);
    await ctx.close();
  });

  // -- viewports: copy on screen, no sideways scroll, phone clips on phones -------------------
  await group('viewports', async () => {
    for (const vp of [{ width: 1440, height: 900 }, { width: 390, height: 844, mobile: true }, { width: 844, height: 390, mobile: true }]) {
      const ctx = await context({ viewport: { width: vp.width, height: vp.height }, isMobile: !!vp.mobile, hasTouch: !!vp.mobile });
      const reqs = [];
      ctx.on('request', (r) => reqs.push(path.basename(new URL(r.url()).pathname)));
      const { page, errors } = await openPage(ctx, base);
      const geo = await geometry(page);
      const bad = [];
      for (let i = 0; i < geo.ids.length; i++) {
        await page.evaluate((v) => window.scrollTo(0, v), Math.round(geo.centers[i]));
        await settle(page);
        const r = await page.evaluate((k) => {
          const c = document.querySelectorAll('.sw-copy')[k];
          const b = c.getBoundingClientRect();
          return { op: +getComputedStyle(c).opacity, top: b.top, bottom: b.bottom, left: b.left, right: b.right, w: innerWidth, h: innerHeight };
        }, i);
        if (r.op < 0.99 || r.top < 0 || r.bottom > r.h || r.left < 0 || r.right > r.w) bad.push(`${geo.ids[i]}(${r.op.toFixed(2)}, ${Math.round(r.top)}–${Math.round(r.bottom)})`);
      }
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
      const label = `${vp.width}×${vp.height}`;
      check('viewports', `${label}: every stop's copy fully visible and on screen`, bad.length === 0, bad.join(' '));
      check('viewports', `${label}: no sideways scroll`, !overflow);
      const clips = reqs.filter((n) => /^c\d/.test(n));
      check('viewports', `${label}: ${vp.mobile ? 'phone' : 'desktop'} clips`, clips.length > 0 && clips.every((n) => /-m\.mp4$/.test(n) === !!vp.mobile), clips.join(', '));
      check('viewports', `${label}: no page errors`, errors.length === 0, errors.slice(0, 3).join(' | '));
      await ctx.close();
    }
  });

  // -- no JavaScript ---------------------------------------------------------------------
  await group('nojs', async () => {
    const ctx = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(base + '/');
    const s = await page.evaluate(() => ({
      shown: getComputedStyle(document.querySelector('.story-static')).display !== 'none',
      stops: document.querySelectorAll('.story-static__stop').length,
      h1: document.querySelectorAll('h1').length,
    }));
    check('nojs', 'static story with five stops and one h1', s.shown && s.stops === 5 && s.h1 === 1, JSON.stringify(s));
    await ctx.close();
  });
} finally {
  await browser.close();
  server.close();
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (!results.length) {
  console.error('nothing ran');
  process.exit(1);
}
if (JSON_OUT) {
  const { writeFileSync } = await import('node:fs');
  writeFileSync(JSON_OUT, JSON.stringify({ dist: DIST, h264: !!h264, results, raw }, null, 2));
}
process.exit(failed.length ? 1 : 0);
