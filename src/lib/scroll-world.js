/* ============================================================================
   scroll-world — portable scroll-scrubbed camera-flight engine
   ----------------------------------------------------------------------------
   Framework-agnostic. Vanilla JS, zero dependencies. It builds its own DOM and
   injects its own (namespaced) CSS into a container you give it, so it drops into
   plain HTML, Next.js (call from a ref/useEffect), Vue (onMounted), a server-
   rendered page, anything.

   USAGE
     mountScrollWorld(document.getElementById('world'), {
       brand: { name: 'Pearl & Co.', href: '#top' },
       diveScroll: 1.3,   // viewport-heights of scroll per dive clip
       connScroll: 0.9,   // ...per connector clip
       hint: 'scroll to fly in',
       nav: true,         // show the top section nav
       atmosphere: true,  // subtle gradient + drifting particles behind the clips
       sections: [
         { id, label, still, stillMobile, clip, clipMobile, accent,
           scroll: 1.6,   // optional per-section override of diveScroll — more scroll
                          // distance = a slower, longer dwell in this scene
           linger: 0.5,   // optional 0..1 — remaps time so the camera settles mid-scene
                          // (exactly where the copy peaks) and moves quicker at the
                          // edges. 0 = linear (default). Keep ≤ 0.6; 1 = full pause.
           eyebrow, title, body, tags:[…],
           cta:{ primary:{label,href}, secondary:{label,href} } }, // last section only
         …
       ],
       connectors: [clipUrl, …],          // length = sections.length - 1 (nulls allowed)
       connectorsMobile: [clipUrl, …],    // optional lighter connectors for phones (same length)
       // Local patches (see the list below):
       connScroll: [2, 2.4, …],           // or one length per connector (PATCH 15)
       connectorTimeMaps: [[0, …, 1], …], // per-connector scroll→time tables (PATCH 15)
       damping: { smoothTime: 0.45, touchSmoothTime: 0.3, maxSpeed: 3,
                  teleportGap: 4, teleportSpeed: 15 },          // PATCH 17, 19
       snap: { idle: 400, range: 0.5 },   // or false (PATCH 20)
       fps: 24,                           // clip frame rate (PATCH 18)
       initialSection: 'id', onActive(index) {}, // PATCH 13, 6
       stillMotion: false,                // PATCH 2; sections also take focus: [x, y] (4)
                                          // and titleTag: 'h1' (5)
       crossfade: 0.12,                   // viewports a layer is kept under the next at a seam

   MOBILE (the clipMobile/connectorsMobile variants are the opt-in mobile version;
   the rest of the phone handling below is always on)
     The engine is phone-aware out of the box: on a coarse-pointer / ≤860px viewport it
       - loads `clipMobile` / `connectorsMobile` when provided (encode these smaller +
         tighter-GOP — seek cost on a phone decoder is dominated by frames-from-keyframe,
         so a 720p, -g 4 file scrubs far smoother than the 1080p desktop master; see
         pipeline.md). Falls back to the desktop `clip` if no mobile variant is given.
       - uses `stillMobile` as the scene poster when provided (pair it with native 9:16
         clipMobile renders so the poster matches the portrait video's first frame instead
         of flashing from a landscape crop). Chosen once at mount; a desktop resize into
         phone width keeps the desktop poster (clips still switch via isMobile()).
       - coalesces seeks (never issues a new currentTime while the decoder is still
         `seeking`) so fast flicks can't pile up and freeze the video.
       - keeps the still as a live poster until the clip actually paints its first frame,
         and primes each video (muted play→pause) on first touch — this is what stops iOS
         from showing a blank scene before the first seek.
       - drops the drifting particles and ignores URL-bar-only resizes (no scroll jump).
     Nothing here is required — a config with only `clip`/`connectors` still works on
     phones; the mobile variants just make it lighter and smoother.

   THEME (CSS custom properties; set on the container or :root to override)
     --sw-bg         page background (match your scene bg for seamless posters)
     --sw-ink        primary text
     --sw-ink-soft   secondary text
     --sw-accent     default accent (each section overrides via its `accent`)
     --sw-font-display / --sw-font-body

   REQUIREMENTS ON YOUR ASSETS
     - clips encoded native-res, crf~20, -g 8, +faststart, no audio (see pipeline.md)
     - connectors' endpoints are the neighbouring dives' ACTUAL frames (see SKILL Step 5)
     - (optional) mobile variants at ~720p, -g 4 for smoother phone scrubbing
   The engine loads each clip as a Blob (always seekable) and scrubs currentTime; it does
   NOT depend on HTTP byte-range support.

   LOCAL PATCHES (Libertad Buildings) — copied from the scroll-world skill's
   references/scrub-engine.js. Every change is tagged `PATCH` so the file can be
   re-synced with the skill:
     1. ES module: `export function mountScrollWorld`, returns { jumpTo, setSnap,
        destroy, sectionIds }; destroy() stops the loop and removes listeners
        and media.
     2. `stillMotion: false` turns off the Ken-Burns scale/offset on stills. Needed
        when stills are real video frames (stops between connectors): any scale
        on the still would pop against the unscaled clip at each seam.
     3. `atmosphere: false` also skips the drifting particles (it only dropped
        the gradient before).
     4. Per-section `focus: [x, y]` (percent) sets object-position; connectors
        interpolate from the origin stop's focus to the destination's, so the
        mobile crop of a 16:9 clip stays seamless at both ends.
     5. Per-section `titleTag` (e.g. 'h1' on the hero — one h1 per page).
     6. `onActive(index)` callback when the active section changes.
     7. Empty topbar (no brand / nav / cta) is not added to the DOM.
     8. Jumping to the first section scrolls to the top, where its copy is visible.
     9. A clip that finishes loading mid-segment starts on the scrolled-to frame
        (it used to lerp up from frame 0 and visibly replay the flight).
    10. Route dots get aria-label (their label is display:none on phones) and
        aria-current on the active stop.
    11. Copy drift is a CSS custom property (--sw-copy-dy), so desktop keeps its
        translateY(-50%) centring instead of hanging from the 50% line.
    12. The decorative stage is aria-hidden (no unnamed <video> nodes).
    13. `initialSection` (id) positions the page before the first render, so a
        deep link only fetches the clips around its target.
    14. Stills load lazily in the clip load window (lazy-loading never deferred
        them in a fixed stage); the first visible still gets high priority and
        clips wait for it (or for window load).
    15. Connector pacing: `connScroll` may be an array (one length per clip; capped
        at 1 viewport under reduced motion, where a band only holds a still) and
        `connectorTimeMaps` gives each clip a scroll→time table (built from its
        measured motion, with zero speed at both seams).
    16. (Superseded by 17: the per-video lerp is gone.)
    17. One smoothed scroll position drives everything. `vy` follows the
        browser's scroll through a critically damped spring with a speed cap
        that loosens with the square of the lag past 2 viewports (`damping: {
        smoothTime, touchSmoothTime, maxSpeed }`), and
        layers, copy, route, progress bar and video frames are all rendered from
        it in a single rAF loop. Before, layers and copy followed the raw scroll
        while the video lagged behind a lerp, so every seam cut to the next layer
        before the video had arrived (7–38 frames skipped at 1–4 viewports/s).
    18. Whole-frame seeks: the frame index comes straight from `vy` (`fps`,
        default 24) and a seek is issued only when it changes, aimed at the
        middle of the frame.
    19. Jumps (route dots, `api.jumpTo`, and a gap wider than `teleportGap`
        viewports while the scroll moves faster than `teleportSpeed` viewports/s,
        i.e. End key or scrollbar, never a hand) fade the stage out, move, and
        fade back in, instead of smooth-scrolling through every clip in between
        (which also downloaded all of them).
    20. Directional soft snap (`snap: { idle, range }` or `false`): after a
        pause, a resting point near a stop finishes the move toward that stop,
        never against the last scroll direction (learned only from the
        visitor's own scrolling since the page loaded). Off under reduced
        motion, while touching or dragging and while `api.setSnap(false)`
        (e.g. a menu is open).
    21. Copy holds a plateau: middle stops are fully visible over the central
        60 % of their band, the hero over its first 30 %.
    22. Clips load one at a time, nearest first and ahead in the scroll
        direction, retrying with backoff (2/4/8 s) instead of every frame; a
        download is aborted when the visitor moves away or when nothing arrives
        for 30 s (a slow but steady one is never cut). A connector whose clip
        hasn't painted dissolves origin → destination still (also the
        reduced-motion behaviour), and a clip fades in once painted, over that
        dissolve.
    23. Resizing or rotating keeps the visitor at the same point of the story.
   ========================================================================== */

// PATCH 1: ES module export (was a global + CommonJS shim at the bottom).
export function mountScrollWorld(container, config) {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Phone detection. `coarse` is captured once (input type doesn't change mid-session);
  // the ≤860px query is read live via isMobile() so a desktop resize/DevTools toggle
  // switches sources and seek behaviour without a reload.
  const coarse = window.matchMedia('(hover: none) and (pointer: coarse)').matches;
  const smallMQ = window.matchMedia('(max-width: 860px)');
  const isMobile = () => coarse || smallMQ.matches;
  const SECTIONS = config.sections || [];
  const CONNECTORS = config.connectors || [];
  const CONNECTORS_M = config.connectorsMobile || [];
  const DIVE_W = config.diveScroll || 1.3;
  // PATCH 15: a number for every connector, or one length per connector. Under
  // reduced motion a connector band only holds the next still, so keep it short.
  const connW = i => {
    const w = (Array.isArray(config.connScroll) ? config.connScroll[i] : config.connScroll) || 0.9;
    return reduce ? Math.min(w, 1) : w;
  };
  // PATCH 15: optional per-connector scroll→time table (samples of a monotone map
  // from 0 to 1). Anything malformed falls back to the linear mapping.
  const timeMap = i => {
    const t = Array.isArray(config.connectorTimeMaps) ? config.connectorTimeMaps[i] : null;
    const ok = Array.isArray(t) && t.length >= 2 && t[0] === 0 && t[t.length - 1] === 1 &&
      t.every((v, k) => typeof v === 'number' && (k === 0 || v >= t[k - 1]));
    return ok ? t : null;
  };
  const posNum = (v, d) => (typeof v === 'number' && v > 0) ? v : d;
  // PATCH 17: spring time (s), speed cap (viewports/s) and the gap (viewports)
  // beyond which the stage fades to the scroll position instead of flying there.
  const DAMP = config.damping || {};
  const SMOOTH_TIME = posNum(coarse ? DAMP.touchSmoothTime : 0, posNum(DAMP.smoothTime, 0.45));
  const MAX_SPEED = posNum(DAMP.maxSpeed, Infinity);
  const TELEPORT_GAP = posNum(DAMP.teleportGap, 4);
  // A jump is a discontinuity: the gap must be wide AND the scroll must be moving
  // faster than any hand does (End key, scrollbar click or fast drag, anchors).
  const TELEPORT_SPEED = posNum(DAMP.teleportSpeed, 15);
  // Past this lag (viewports) the speed cap loosens with the square of the lag, so a
  // fast but continuous scroll stays one flight and the lag stays bounded (≈4 vh at
  // 12 vh/s) instead of growing until the visitor stops.
  const CATCH_UP = 2;
  const FPS = posNum(config.fps, 24);                                       // PATCH 18
  const SNAP = (config.snap === false || reduce) ? null : {                 // PATCH 20
    idle: posNum(config.snap && config.snap.idle, 400),
    range: posNum(config.snap && config.snap.range, 0.5),
  };
  const CROSSFADE = (config.crossfade != null) ? config.crossfade : 0.12;  // seam dissolve width (vh)
  const STILL_MOTION = config.stillMotion !== false;                       // PATCH 2
  const DEFAULT_FOCUS = [50, 42];                                          // PATCH 4
  const N = SECTIONS.length;
  if (!N) return null;

  injectCSS();
  container.classList.add('sw-root');

  // ---- build the interleaved segment chain: dive0, conn0, dive1, … diveN-1 ----
  const SEGMENTS = [];
  SECTIONS.forEach((s, i) => {
    const dive = { kind: 'dive', si: i, clip: s.clip, clipM: s.clipMobile, still: s.still, stillM: s.stillMobile,
                   accent: s.accent, w: s.scroll || DIVE_W, linger: s.linger || 0,
                   focusA: s.focus || DEFAULT_FOCUS, focusB: s.focus || DEFAULT_FOCUS };   // PATCH 4
    SEGMENTS.push(dive);
    s._seg = dive;
    // A connector is optional: if connectors[i] is falsy, the two dives simply
    // crossfade directly (no fly-over). Lets a page complete even when a
    // connector can't be generated (e.g. a content-filter false-positive).
    if (i < N - 1 && CONNECTORS[i]) {
      SEGMENTS.push({ kind: 'conn', si: i, clip: CONNECTORS[i], clipM: CONNECTORS_M[i],
                      still: SECTIONS[i + 1].still, stillM: SECTIONS[i + 1].stillMobile,
                      accent: SECTIONS[i + 1].accent, w: connW(i), timeMap: timeMap(i),   // PATCH 15
                      // PATCH 4: the connector's crop travels from the origin stop's focus
                      // to the destination's, matching both seams.
                      focusA: s.focus || DEFAULT_FOCUS, focusB: SECTIONS[i + 1].focus || DEFAULT_FOCUS });
    }
  });
  const NSEG = SEGMENTS.length;

  // ---- DOM ----
  const sky = el('div', 'sw-sky');
  if (config.atmosphere !== false) {
    sky.appendChild(el('div', 'sw-sky__grad'));
    sky.appendChild(el('div', 'sw-sky__glow'));
  }
  // PATCH 3: no particles when atmosphere is off (photoreal clips).
  const particles = config.atmosphere !== false ? el('div', 'sw-particles') : null;
  if (particles) sky.appendChild(particles);

  const scrollbar = el('div', 'sw-scrollbar');
  const scrollbarFill = el('span'); scrollbar.appendChild(scrollbarFill);

  const topbar = el('div', 'sw-topbar');
  if (config.brand) {
    const brand = el('a', 'sw-brand'); brand.href = (config.brand.href || '#');
    brand.appendChild(el('span', 'sw-brand__mark'));
    const nm = el('span', 'sw-brand__name'); nm.textContent = config.brand.name || ''; brand.appendChild(nm);
    topbar.appendChild(brand);
  }
  const nav = el('nav', 'sw-nav'); if (config.nav !== false) topbar.appendChild(nav);
  if (config.cta && config.cta.label) {
    const c = el('a', 'sw-topcta'); c.href = config.cta.href || '#'; c.textContent = config.cta.label;
    topbar.appendChild(c);
  }

  const stage = el('div', 'sw-stage');
  // PATCH 12: the stage is decorative (stills have alt="", videos are muted scrub
  // surfaces) — keep its <video> elements out of the accessibility tree.
  stage.setAttribute('aria-hidden', 'true');
  const copylayer = el('div', 'sw-copylayer');
  const route = el('div', 'sw-route');
  const hint = el('div', 'sw-hint');
  const hintText = el('span'); hintText.textContent = config.hint || 'scroll'; hint.appendChild(hintText);
  hint.appendChild(el('i'));
  const track = el('div', 'sw-track');
  // PATCH 19: covers the stage and copy while a jump moves the camera.
  const veil = el('div', 'sw-veil');

  // PATCH 7: skip the topbar when it has nothing in it (the page brings its own header).
  [sky, scrollbar, topbar, stage, copylayer, veil, route, hint, track]
    .filter(n => n !== topbar || topbar.childNodes.length)
    .forEach(n => container.appendChild(n));

  // segment scenes
  SEGMENTS.forEach(s => {
    const scene = el('div', 'sw-scene'); scene.style.setProperty('--sw-accent', s.accent || '');
    const img = el('img', 'sw-scene__still'); img.alt = ''; img.decoding = 'async';
    // PATCH 14: every still sits in a fixed full-viewport stage, so loading="lazy"
    // never deferred anything — all of them downloaded at first paint, competing
    // with the hero. The URL is kept here and assigned by render() only when the
    // segment is inside the same load window as its clip.
    s.poster = (isMobile() && s.stillM) ? s.stillM : s.still;
    img.style.objectPosition = focusAt(s, 0);   // PATCH 4
    scene.appendChild(img); stage.appendChild(scene);
    s.el = scene; s.img = img; s.video = null; s.hasClip = false;
    s.ready = false; s.painted = false; s.target = 0;
    s.frame = -1; s.frames = 2; s.failed = 0; s.retryAt = 0;   // PATCH 18, 22
  });

  // per-section copy / route / nav
  const copies = [], dots = [];
  SECTIONS.forEach((s, i) => {
    const c = el('article', 'sw-copy'); c.style.setProperty('--sw-accent', s.accent || '');
    c.innerHTML =
      `<span class="sw-copy__num">${pad(i + 1)} / ${pad(N)}</span>` +
      (s.eyebrow ? `<span class="sw-copy__eyebrow">${esc(s.eyebrow)}</span>` : '') +
      // PATCH 5: configurable heading level (h1 on the hero).
      (s.title ? `<${titleTag(s)} class="sw-copy__title">${esc(s.title)}</${titleTag(s)}>` : '') +
      (s.body ? `<p class="sw-copy__body">${esc(s.body)}</p>` : '') +
      (s.tags && s.tags.length ? `<ul class="sw-copy__tags">${s.tags.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : '') +
      (s.cta ? `<div class="sw-copy__cta">${ctaBtns(s.cta)}</div>` : '');
    copylayer.appendChild(c); copies.push(c);

    const dot = el('button', 'sw-route__dot'); dot.style.setProperty('--sw-accent', s.accent || '');
    // PATCH 10: name the dot directly — its visible label is display:none at ≤860px,
    // which would leave five unnamed buttons on phones.
    dot.type = 'button';
    if (s.label) dot.setAttribute('aria-label', s.label);
    dot.innerHTML = `<span class="sw-route__label" aria-hidden="true">${esc(s.label || '')}</span><i></i>`;
    dot.addEventListener('click', () => jumpTo(i)); route.appendChild(dot); dots.push(dot);

    if (config.nav !== false) {
      const b = el('button', 'sw-nav__item'); b.textContent = s.label || '';
      b.addEventListener('click', () => jumpTo(i)); nav.appendChild(b);
    }
  });

  // ---- math ----
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const smooth = x => { x = clamp(x); return x * x * (3 - 2 * x); };
  // Per-section dwell: monotone remap of scroll→time so the camera settles mid-scene
  // (where the copy peaks) and moves quicker near the seams. L=0 linear, L=1 full
  // mid-scene pause. f(0)=0, f(1)=1 always, so seam frames are untouched.
  const lingerEase = (x, L) => { L = clamp(L); const c = x - 0.5; return (1 - L) * x + L * (4 * c * c * c + 0.5); };
  // PATCH 15: piecewise-linear lookup in a connector's time map.
  const mapTime = (table, x) => {
    const p = clamp(x) * (table.length - 1);
    const k = Math.min(Math.floor(p), table.length - 2);
    return table[k] + (table[k + 1] - table[k]) * (p - k);
  };
  let vh = window.innerHeight, stageX = 0, totalW = 0, activeIndex = -1;
  let laidOutW = window.innerWidth;   // width the current layout was computed at (see onResize)
  // PATCH 14: clips wait until the still on screen at mount has loaded (or the page
  // has), so the first image the visitor sees doesn't share bandwidth with a clip.
  let postersReady = false, heroArmed = false;
  function onHeroPoster() { if (postersReady) return; postersReady = true; dirty = true; }

  // PATCH 17: `rawY` is the browser's scroll position, `vy` the smoothed one that
  // everything on screen is rendered from; `vel` is the spring's velocity (px/s).
  // Until the page has loaded (or the visitor touches anything) vy just mirrors
  // rawY, so a restored scroll position or a deep link doesn't fly in from the top.
  let rawY = window.scrollY || window.pageYOffset || 0, lastRawY = rawY, scrollDir = 1;
  // PATCH 20: the snap needs a direction learned from the visitor's own scrolling.
  let dirKnown = false;
  let vy = rawY, vel = 0, renderedY = NaN, dirty = true, booting = true;
  // PATCH 19: jump state ({ phase: 'out' | 'hold' | 'in', t0, from, si }).
  let jump = null, veilOpacity = 0;
  // PATCH 20: snap state.
  let snapAnim = null, snapEnabled = true, snapCheckedAt = NaN;
  let lastInputAt = 0, lastScrollAt = 0, touching = false, mouseDown = false;
  let rawSpeed = 0;   // PATCH 19: smoothed speed of the browser's scroll (px/s)
  // PATCH 22: the one clip being downloaded ({ s, ctrl, timer, aborted }).
  let inflight = null;
  let rafId = 0, stopped = false;

  // PATCH 13: `skipRender` lets mount position the page before the first render,
  // so a deep link doesn't start loading the clips around the top first.
  // PATCH 23: a relayout (resize, rotation) keeps both positions at the same point
  // of the story instead of the same pixel offset.
  function layout(skipRender) {
    const keep = SEGMENTS[0].end != null
      ? { raw: storyPos(window.scrollY || window.pageYOffset || 0), v: storyPos(vy) } : null;
    vh = window.innerHeight;
    laidOutW = window.innerWidth;
    stageX = window.innerWidth > 860 ? 4 : 0;
    let off = 0;
    SEGMENTS.forEach(s => { s.start = off * vh; off += s.w; s.end = off * vh; });
    totalW = off;
    track.style.height = (totalW * vh + vh) + 'px';   // +1vh so the last flight completes
    if (keep) {
      const y = Math.round(fromStory(keep.raw));
      if (Math.abs(y - (window.scrollY || 0)) > 1) window.scrollTo(0, y);
      rawY = lastRawY = window.scrollY || 0;
      vy = fromStory(keep.v); vel = 0;
      cancelSnap();
    }
    dirty = true;
    if (skipRender !== true) render(vy);
  }
  function storyPos(y) {
    let i = 0;
    for (let k = 0; k < NSEG; k++) if (y >= SEGMENTS[k].start) i = k;
    const s = SEGMENTS[i];
    return { i, p: (y - s.start) / ((s.end - s.start) || 1) };
  }
  function fromStory(pos) {
    const s = SEGMENTS[pos.i];
    return s.start + clamp(pos.p) * (s.end - s.start);
  }

  // PATCH 19: route dots and the page's menu move with a fade, not a scroll.
  function jumpTo(i) { startJump(i); }

  // PATCH 8: the hero's copy greets on landing and is already fading by mid-scene,
  // so jumping to the first section goes to the very top instead of its midpoint.
  function jumpTarget(i) {
    if (i === 0) return 0;
    const seg = SECTIONS[i]._seg;
    return seg.start + (seg.end - seg.start) * 0.5;
  }

  // PATCH 19: fade the stage out, move both positions at once while it is covered
  // (so nothing scrubs through the clips in between, and only the destination's
  // media loads), wait for the destination still, fade back in. `si` is the
  // section to land on (its offset is read at the covered moment, so a resize
  // mid-jump still lands right); null = the browser already scrolled (End key,
  // scrollbar): just catch vy up.
  const JUMP_OUT = 200, JUMP_IN = 320, JUMP_HOLD_MAX = 1200;
  function startJump(si) {
    cancelSnap();
    // Already reading that stop: no fade. Off-centre within its plateau, glide to it.
    if (si != null && !jump && Math.abs(vy - rawY) < 2 && copyOpacity(si, rawY) > 0.98) {
      const to = Math.round(jumpTarget(si));
      if (!reduce && Math.abs(to - rawY) > 2) snapAnim = { from: rawY, to, t0: performance.now(), dur: 600, last: rawY };
      return;
    }
    if (reduce) {
      if (si != null) window.scrollTo(0, Math.round(jumpTarget(si)));
      rawY = lastRawY = window.scrollY || 0; vy = rawY; vel = 0; dirty = true;
      return;
    }
    jump = { phase: 'out', t0: performance.now(), from: veilOpacity, si };
  }
  function stepJump(now) {
    if (jump.phase === 'out') {
      const k = clamp((now - jump.t0) / JUMP_OUT);
      setVeil(jump.from + (1 - jump.from) * k);
      if (k < 1) return;
      if (jump.si != null) window.scrollTo(0, Math.round(jumpTarget(jump.si)));
      rawY = lastRawY = window.scrollY || 0; vy = rawY; vel = 0;
      abortStaleLoad(vy);
      render(vy);
      jump = { phase: 'hold', t0: now };
    }
    if (jump.phase === 'hold') {
      // The images the landing shows: its own still and, for a connector whose
      // clip hasn't painted, the origin still it dissolves from. A broken image
      // counts as done (`complete` is true for it too).
      const ci = segmentAt(vy), s = SEGMENTS[ci];
      const imgs = [s.img];
      if (s.kind === 'conn' && !s.painted && ci > 0) imgs.push(SEGMENTS[ci - 1].img);
      const loaded = imgs.every(img => !img.getAttribute('src') || img.complete);
      if (!loaded && now - jump.t0 < JUMP_HOLD_MAX) return;
      jump = { phase: 'in', t0: now };
    }
    const k = clamp((now - jump.t0) / JUMP_IN);
    setVeil(1 - smooth(k));
    if (k >= 1) jump = null;
  }
  function setVeil(op) {
    veilOpacity = op;
    veil.style.opacity = op > 0.001 ? op.toFixed(3) : '0';
  }

  // PATCH 17: critically damped spring (Unity's SmoothDamp, the same maths as
  // maath's easing.damp used by drei/R3F scroll sites). Unlike a lerp it eases
  // into every scroll input instead of starting at full speed, it never
  // overshoots, and capping the change caps the speed at MAX_SPEED viewports/s.
  function damp(cur, target, dt) {
    const omega = 2 / SMOOTH_TIME, x = omega * dt;
    const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
    const lag = Math.abs(target - cur) / (CATCH_UP * vh);
    const maxChange = MAX_SPEED * Math.max(1, lag * lag) * vh * SMOOTH_TIME;
    const change = clamp(cur - target, -maxChange, maxChange);
    const temp = (vel + omega * change) * dt;
    vel = (vel - omega * temp) * exp;
    let out = cur - change + (change + temp) * exp;
    if ((target - cur > 0) === (out > target)) { out = target; vel = 0; }
    return out;
  }

  function segmentAt(y) {
    let ci = 0;
    for (let i = 0; i < NSEG; i++) if (y >= SEGMENTS[i].start) ci = i;
    return ci;
  }

  // PATCH 21: copy opacity for section i at position y. Middle stops are fully
  // visible over the central 60 % of their band (it used to peak at a single
  // point), the hero over its first 30 %, the last stop from 40 % to the end.
  function copyOpacity(i, y) {
    const seg = SECTIONS[i]._seg;
    const pr = clamp((y - seg.start) / (seg.end - seg.start), 0, 1);
    const before = y < seg.start, after = y > seg.end;
    if (i === 0) return after ? 0 : (pr <= 0.3 ? 1 : smooth(1 - (pr - 0.3) / 0.32));   // greets on landing
    if (i === N - 1) return before ? 0 : smooth(pr / 0.4);                             // holds CTA at the end
    return (before || after) ? 0 : smooth((0.5 - Math.abs(pr - 0.5)) / 0.2);
  }

  function loadClip(s) {
    // Under prefers-reduced-motion we never load the clips at all — the stills stay up
    // and simply cross-dissolve as you scroll. No scrubbed video motion, no decode cost.
    if (reduce || s.hasClip || !s.clip) return;
    // PATCH 22: abortable (the visitor jumped away) and with a stall timeout: a
    // request that receives nothing for LOAD_TIMEOUT must not block every other
    // clip, but a slow, steady download is never cut (on a 2 Mbps line a desktop
    // clip takes ~35 s).
    const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    const load = inflight = { s, ctrl, timer: 0, aborted: false };
    const arm = () => {
      clearTimeout(load.timer);
      load.timer = setTimeout(() => { if (ctrl) ctrl.abort(); }, LOAD_TIMEOUT);
    };
    arm();
    // Serve the lighter mobile encode on phones when one was provided.
    const url = (isMobile() && s.clipM) ? s.clipM : s.clip;
    fetch(url, ctrl ? { signal: ctrl.signal } : undefined)
      .then(r => {
        if (!r.ok) throw new Error(String(r.status));
        if (!r.body || typeof r.body.getReader !== 'function') return r.blob();
        const reader = r.body.getReader(), parts = [];
        const type = r.headers.get('content-type') || 'video/mp4';
        const pump = () => reader.read().then(({ done, value }) => {
          if (done) return new Blob(parts, { type });
          parts.push(value);
          arm();
          return pump();
        });
        arm();
        return pump();
      })
      .then(blob => {
        clearTimeout(load.timer);
        if (inflight === load) inflight = null;
        if (stopped) return;
        const v = document.createElement('video');
        v.className = 'sw-scene__video';
        v.muted = true; v.playsInline = true; v.preload = 'auto';
        v.setAttribute('muted', ''); v.setAttribute('playsinline', '');
        v.src = URL.createObjectURL(blob);
        v.style.objectPosition = focusAt(s, s.target);   // PATCH 4
        v.addEventListener('loadedmetadata', () => {
          // PATCH 9 + 18: the next frame seeks straight to the frame vy asks for, so a
          // clip that lands mid-connector never replays the flight from frame 0.
          const d = isFinite(v.duration) && v.duration > 0 ? v.duration : 1;
          s.frames = Math.max(2, Math.round(d * FPS));
          s.frame = -1; s.ready = true; dirty = true;
        });
        // Reveal the video only once a real frame has painted — on iOS a
        // seeked-but-never-played muted video stays blank. PATCH 22: it fades in
        // over the still (CSS, 0.25 s); a dissolve underneath keeps its origin
        // still until the fade is over, or the screen would dip to the background.
        v.addEventListener('seeked', () => {
          s.el.classList.add('has-clip');
          setTimeout(() => { s.painted = true; dirty = true; }, REVEAL_MS);
        }, { once: true });
        v.addEventListener('loadeddata', () => { try { v.pause(); } catch (e) {} if (userReady) primeVideo(v, s); });
        s.el.appendChild(v); s.video = v; s.hasClip = true;
        blobUrls.push(v.src);
      }).catch(() => {
        clearTimeout(load.timer);
        if (inflight === load) inflight = null;
        // Aborted because the visitor moved away: not a failure, it loads again
        // when they come back.
        if (load.aborted) return;
        // PATCH 22: back off (2, 4, 8 s) instead of retrying on every frame; after
        // the third retry the still simply stays up.
        s.failed++;
        s.retryAt = performance.now() + 1000 * Math.pow(2, s.failed);
      });
  }
  // PATCH 22: drop the download in flight when its clip is no longer near vy.
  function abortStaleLoad(y) {
    const load = inflight;
    if (!load || !load.ctrl) return;
    const s = load.s, margin = (LOAD_WINDOW + 0.5) * vh;
    if (y > s.start - margin && y < s.end + margin) return;
    load.aborted = true;
    inflight = null;
    clearTimeout(load.timer);
    load.ctrl.abort();
  }

  // PATCH 22: one download at a time. Among the clips within 1.6 viewports of vy,
  // the nearest goes first, and a clip behind the scroll direction waits for one
  // ahead at a similar distance.
  const LOAD_WINDOW = 1.6, MAX_RETRIES = 3, LOAD_TIMEOUT = 30000, REVEAL_MS = 300;
  const blobUrls = [];
  function pumpLoads(y, now) {
    if (reduce || !postersReady) return;
    abortStaleLoad(y);
    if (inflight) return;
    let best = null, bestScore = Infinity;
    for (let i = 0; i < NSEG; i++) {
      const s = SEGMENTS[i];
      if (!s.clip || s.hasClip || s.failed > MAX_RETRIES || now < s.retryAt) continue;
      if (y <= s.start - LOAD_WINDOW * vh || y >= s.end + LOAD_WINDOW * vh) continue;
      const d = y < s.start ? s.start - y : y > s.end ? y - s.end : 0;
      const behind = scrollDir > 0 ? y > s.end : y < s.start;
      const score = d + (behind ? 0.75 * vh : 0);
      if (score < bestScore) { bestScore = score; best = s; }
    }
    if (best) loadClip(best);
  }

  // PATCH 17: everything visible is a function of one position, y = vy.
  function render(y) {
    renderedY = y; dirty = false;
    const fade = CROSSFADE * vh;
    const ci = segmentAt(y);
    // PATCH 22: a connector on screen whose clip hasn't painted keeps its origin
    // stop underneath and dissolves its destination still in over the band.
    const cur = SEGMENTS[ci];
    const dissolve = cur.kind === 'conn' && !cur.painted ? ci : -1;

    for (let i = 0; i < NSEG; i++) {
      const s = SEGMENTS[i];
      if (y > s.start - LOAD_WINDOW * vh && y < s.end + LOAD_WINDOW * vh) {
        // PATCH 14: stills load in the same window as clips; the one on screen first
        // gets high priority and gates the clip downloads.
        if (s.poster && !s.img.getAttribute('src')) {
          if (i === ci) s.img.fetchPriority = 'high';
          s.img.src = s.poster;
        }
        // PATCH 22: an unpainted connector dissolves from its origin still, which
        // can sit further than the window (long bands): load it with the connector.
        const o = i > 0 ? SEGMENTS[i - 1] : null;
        // (After the first still, so a deep link's hero isn't slowed by it.)
        if (s.kind === 'conn' && !s.painted && o && o.poster && !o.img.getAttribute('src') && (postersReady || i === ci)) o.img.src = o.poster;
        if (!heroArmed && i === ci) {
          heroArmed = true;
          if (s.img.getAttribute('src')) {
            s.img.addEventListener('load', onHeroPoster, { once: true });
            s.img.addEventListener('error', onHeroPoster, { once: true });
          } else postersReady = true;
        }
      }
      const local = clamp((y - s.start) / (s.end - s.start), 0, 1);
      // PATCH 15: a connector's time map spreads its motion evenly over the band and
      // starts/lands at rest. f(0)=0 and f(1)=1, so the seam frames are untouched.
      s.target = s.linger ? lingerEase(local, s.linger) : s.timeMap ? mapTime(s.timeMap, local) : local;
      let outside = 0;
      if (y < s.start) outside = s.start - y; else if (y > s.end) outside = y - s.end;
      let op = smooth(1 - outside / fade);
      let z = (i === ci) ? 120 : 100 + Math.round(op * 10);
      if (i === dissolve - 1) { op = 1; z = 119; }
      s.el.style.opacity = op;
      s.el.style.zIndex = String(z);
      if (s.kind === 'conn' && !s.painted) s.img.style.opacity = smooth(local).toFixed(3);   // PATCH 22
      if (!s.painted) {
        // PATCH 2: with stillMotion off the still is a real video frame and must sit
        // exactly where the clip will paint it — no offset, no zoom.
        if (STILL_MOTION) {
          const sc = reduce ? 1 : 1.03 + local * 0.14;
          s.img.style.transform = `translateX(${stageX - 2}vw) scale(${sc.toFixed(3)})`;
        }
        // PATCH 4: a connector's poster is the destination still, so it takes the
        // destination focus; a stop's focus is constant.
        s.img.style.objectPosition = focusAt(s, s.kind === 'conn' ? 1 : 0);
      }
    }

    for (let i = 0; i < N; i++) {
      const seg = SECTIONS[i]._seg;
      const pr = clamp((y - seg.start) / (seg.end - seg.start), 0, 1);
      const cop = copyOpacity(i, y);
      const c = copies[i];
      c.style.opacity = cop;
      // PATCH 11: drift via a custom property so the CSS keeps each layout's base
      // transform (desktop centres the copy with translateY(-50%); an inline
      // transform used to replace it and the copy hung from the 50% line).
      c.style.setProperty('--sw-copy-dy', reduce ? '0vh' : `${((0.5 - pr) * 4).toFixed(3)}vh`);
      c.style.pointerEvents = cop > 0.5 ? 'auto' : 'none';
    }

    const near = clamp(cur.kind === 'dive' ? cur.si
      : (((y - cur.start) / (cur.end - cur.start)) > 0.5 ? cur.si + 1 : cur.si), 0, N - 1);
    if (near !== activeIndex) {
      activeIndex = near;
      dots.forEach((d, k) => {
        d.classList.toggle('is-active', k === near);
        // PATCH 10: expose the active stop to assistive tech too.
        if (k === near) d.setAttribute('aria-current', 'step'); else d.removeAttribute('aria-current');
      });
      nav.querySelectorAll('.sw-nav__item').forEach((n, k) => n.classList.toggle('is-active', k === near));
      container.style.setProperty('--sw-accent', SECTIONS[near].accent || '');
      // PATCH 6; a throwing host callback must not stop the flight.
      if (typeof config.onActive === 'function') { try { config.onActive(near); } catch (e) { console.error(e); } }
    }
    scrollbarFill.style.transform = `scaleX(${clamp(y / (totalW * vh))})`;
    hint.style.opacity = clamp(1 - y / (0.5 * vh));
    if (particles) particles.style.transform = `translate3d(0, ${-y * 0.05}px, 0)`;
  }

  // PATCH 18: seek whole frames. The frame comes straight from vy (no second
  // smoothing stage); a seek goes out only when the frame changes, aimed at the
  // frame's middle so rounding can't land on a neighbour. Never queue a seek while
  // the decoder is still resolving the last one: on phones a fast flick would
  // otherwise pile up seeks and freeze the clip; the next free frame seeks
  // straight to the latest target.
  function scrub() {
    for (let i = 0; i < NSEG; i++) {
      const s = SEGMENTS[i], v = s.video;
      if (!s.ready || !v || v.seeking) continue;
      const f = Math.round(clamp(s.target) * (s.frames - 1));
      if (f === s.frame) continue;
      s.frame = f;
      try { v.currentTime = (f + 0.5) / FPS; } catch (e) {}
      // PATCH 4: follow the frame actually requested, so the crop lands on the
      // origin focus at the first frame and on the destination focus at the last.
      if (s.kind === 'conn') v.style.objectPosition = focusAt(s, f / (s.frames - 1));
    }
  }

  // PATCH 20: after SNAP.idle ms without input, once the camera has nearly come to rest, a
  // position near a stop whose copy isn't fully shown glides to that stop — but
  // only forward along the last scroll direction, so it finishes a move and never
  // pulls a visitor back. Ranges are in viewports beyond the stop's own band.
  function maybeSnap(now) {
    // No snap until the visitor has scrolled since the page loaded: a restored
    // position (reload, Back) is not a direction, nor is a click or a Tab.
    if (!SNAP || !snapEnabled || snapAnim || jump || touching || mouseDown || booting || !dirKnown) return;
    if (now - Math.max(lastInputAt, lastScrollAt) < SNAP.idle) return;
    // Nearly arrived is enough: the spring's last pixels take a second or more,
    // and the glide simply carries its remaining drift on (same direction).
    if (Math.abs(rawY - vy) > 0.05 * vh) return;
    if (snapCheckedAt === rawY) return;   // already judged this resting point
    snapCheckedAt = rawY;
    const R = SNAP.range * vh;
    let to = null;
    for (let i = 0; i < N; i++) {
      const seg = SECTIONS[i]._seg;
      if (rawY < seg.start - R || rawY > seg.end + R) continue;
      if (copyOpacity(i, rawY) > 0.98) return;   // reading a stop: leave it
      const t = Math.round(jumpTarget(i));
      if ((t - rawY) * scrollDir <= 2) continue;   // behind: never pull back
      if (to == null || Math.abs(t - rawY) < Math.abs(to - rawY)) to = t;
    }
    if (to == null) return;
    const dist = Math.abs(to - rawY) / vh;
    snapAnim = { from: rawY, to, t0: now, dur: 1000 * clamp(0.5 + 0.35 * dist, 0.6, 1.2), last: rawY };
  }
  function stepSnap(now) {
    const a = snapAnim;
    if (Math.abs(rawY - a.last) > 2) { snapAnim = null; return; }   // something else moved the page
    const k = clamp((now - a.t0) / a.dur);
    const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(2 - 2 * k, 3) / 2;   // ease in-out
    window.scrollTo(0, Math.round(a.from + (a.to - a.from) * e));
    rawY = lastRawY = a.last = window.scrollY || 0;
    if (k >= 1) { snapAnim = null; snapCheckedAt = rawY; }
  }
  function cancelSnap() { snapAnim = null; }
  function onInput() { lastInputAt = performance.now(); booting = false; cancelSnap(); }

  // PATCH 17: the only loop. It reads the scroll position once per frame, moves
  // vy, renders from vy and seeks the videos to match.
  let lastFrame = 0;
  function frame(now) {
    if (stopped) return;
    // Scheduled first: an exception below costs one frame, not the whole flight.
    rafId = requestAnimationFrame(frame);
    // Real elapsed time for the scroll's speed; capped for the spring, so a stalled
    // main thread doesn't make it jump.
    const elapsed = lastFrame ? Math.max(0.001, (now - lastFrame) / 1000) : 1 / 60;
    const dt = Math.min(0.1, elapsed);
    lastFrame = now;
    rawY = window.scrollY || window.pageYOffset || 0;
    if (snapAnim) stepSnap(now);
    const step = rawY - lastRawY;
    rawSpeed += (Math.abs(step) / elapsed - rawSpeed) * (1 - Math.exp(-elapsed / 0.1));   // ~100 ms average
    if (step) {
      // A restored position is not a direction; a step after the visitor's input is.
      if (!booting) { scrollDir = step > 0 ? 1 : -1; if (lastInputAt) dirKnown = true; }
      lastRawY = rawY;
    }
    if (jump) stepJump(now);
    if (reduce || booting) { vy = rawY; vel = 0; }
    else if (!jump && Math.abs(rawY - vy) > TELEPORT_GAP * vh && rawSpeed > TELEPORT_SPEED * vh) startJump(null);
    else if (jump && jump.phase === 'out') vel = 0;   // hold the picture until the veil covers it
    else vy = damp(vy, rawY, dt);
    if (dirty || Math.abs(vy - renderedY) > 0.05) render(vy);
    pumpLoads(vy, now);
    scrub();
    maybeSnap(now);
  }

  // iOS needs a user gesture before a muted video will decode/paint reliably. On the
  // first touch we prime every loaded clip (muted play→pause) so the first seek is
  // instant instead of showing a blank frame. `userReady` also makes freshly-loaded
  // clips prime themselves (see loadClip).
  let userReady = false;
  function primeVideo(v, s) {
    if (!isMobile() || !v) return;
    // play() may advance the clip a little: re-seek to the target frame afterwards.
    try { const p = v.play(); if (p && p.then) p.then(() => { try { v.pause(); } catch (e) {} if (s) s.frame = -1; }).catch(() => {}); }
    catch (e) {}
  }
  function onFirstGesture() {
    if (userReady) return;
    userReady = true;
    SEGMENTS.forEach(s => primeVideo(s.video, s));
  }
  // PATCH 1: every window listener goes through on(), so destroy() can remove it
  // (since patches 19–20 an orphaned instance would otherwise keep scrolling the page).
  const offs = [];
  function on(type, fn, opts) {
    window.addEventListener(type, fn, opts);
    offs.push(() => window.removeEventListener(type, fn, opts));
  }
  on('pointerdown', onFirstGesture, { once: true, passive: true });
  on('touchstart', onFirstGesture, { once: true, passive: true });

  // PATCH 20: input bookkeeping for the snap (and to end `booting`). Scroll events
  // only stamp the time: the frame loop reads the position itself.
  on('wheel', onInput, { passive: true });
  on('keydown', onInput);
  on('touchstart', e => { onInput(); touching = e.touches.length > 0; }, { passive: true });
  const touchEnd = e => { lastInputAt = performance.now(); touching = e.touches.length > 0; };
  on('touchend', touchEnd, { passive: true });
  on('touchcancel', touchEnd, { passive: true });
  on('pointerdown', e => { if (e.pointerType === 'mouse') { onInput(); mouseDown = true; } }, { passive: true });
  const mouseUp = () => { mouseDown = false; lastInputAt = performance.now(); };
  on('pointerup', e => { if (e.pointerType === 'mouse') mouseUp(); }, { passive: true });
  // A native drag (a link, selected text) ends in pointercancel/dragend, not pointerup.
  on('pointercancel', e => { if (e.pointerType === 'mouse') mouseUp(); }, { passive: true });
  on('dragend', mouseUp, { passive: true });
  on('blur', () => { mouseDown = false; touching = false; });
  on('scroll', () => { if (!snapAnim) lastScrollAt = performance.now(); }, { passive: true });

  // Particles are a per-frame cost we can't afford alongside video scrubbing on a phone.
  seedParticles(particles, reduce || coarse);
  // Mobile browsers fire `resize` every time the URL bar slides in/out. Re-running
  // layout() there rebuilds the track height and yanks the scroll position, so on
  // touch we ignore height-only changes and only relayout when the width actually
  // changes. layout() records the width it laid out at.
  function onResize() {
    if (stopped || (coarse && window.innerWidth === laidOutW)) return;
    layout();
  }
  on('resize', onResize);
  // PATCH 23: some browsers fire orientationchange before the viewport has its new
  // size; force the next resize through, with a timed fallback.
  on('orientationchange', () => { laidOutW = -1; setTimeout(onResize, 400); });
  // PATCH 14: fallback gate for the clips; PATCH 17: also ends `booting`. If the
  // page has already loaded (module run late, bfcache), do it now.
  const onLoad = () => { postersReady = true; booting = false; layout(); };
  if (document.readyState === 'complete') { postersReady = true; booting = false; }
  else on('load', onLoad);
  // PATCH 13: start at `initialSection` (e.g. from a URL hash) before the first
  // render, so only the clips around that section are fetched.
  const initial = SECTIONS.findIndex(s => s.id === config.initialSection);
  if (initial > 0) {
    layout(true);
    window.scrollTo(0, jumpTarget(initial));
    rawY = lastRawY = window.scrollY || 0; vy = rawY;
    render(vy);
  } else {
    layout();
  }
  rafId = requestAnimationFrame(frame);

  // PATCH 1: a small public API so the page's own menu can drive the flight.
  return {
    sectionIds: SECTIONS.map(s => s.id),
    // Accepts a section index or id. PATCH 19: fades to the stop; `instant` moves
    // there at once (deep links on load).
    jumpTo(target, opts) {
      if (stopped) return false;
      const i = typeof target === 'number' ? target : SECTIONS.findIndex(s => s.id === target);
      if (i < 0 || i >= N) return false;
      if (opts && opts.instant) {
        cancelSnap(); jump = null; setVeil(0);
        window.scrollTo(0, Math.round(jumpTarget(i)));
        rawY = lastRawY = window.scrollY || 0; vy = rawY; vel = 0; dirty = true;
      } else startJump(i);
      return true;
    },
    // PATCH 20: pause the snap while something covers the page (e.g. a menu).
    setSnap(enabled) { if (stopped) return; snapEnabled = !!enabled; if (!enabled) cancelSnap(); },
    // PATCH 1: stop the loop, remove the listeners and media, empty the container
    // (client-side routers, hot reload, StrictMode double mounts).
    destroy() {
      if (stopped) return;
      stopped = true;
      cancelAnimationFrame(rafId);
      offs.forEach(off => off());
      if (inflight) {
        inflight.aborted = true;
        clearTimeout(inflight.timer);
        if (inflight.ctrl) inflight.ctrl.abort();
        inflight = null;
      }
      SEGMENTS.forEach(s => { if (s.video) { s.video.removeAttribute('src'); try { s.video.load(); } catch (e) {} } });
      blobUrls.forEach(u => URL.revokeObjectURL(u));
      container.innerHTML = '';
      container.classList.remove('sw-root');
      container.style.removeProperty('--sw-accent');
    },
  };

  // ---- helpers ----
  function el(tag, cls) { const n = document.createElement(tag); if (cls) n.className = cls; return n; }
  function pad(n) { return String(n).padStart(2, '0'); }
  // PATCH 5: only real heading tags are accepted.
  function titleTag(s) { return /^h[1-6]$/.test(s.titleTag || '') ? s.titleTag : 'h2'; }
  // PATCH 4: object-position for segment `s` at progress t (0 = start, 1 = end).
  function focusAt(s, t) {
    const a = s.focusA || DEFAULT_FOCUS, b = s.focusB || DEFAULT_FOCUS;
    // Not `clamp`: this runs while the scenes are built, before `clamp` is initialised.
    const k = Math.min(1, Math.max(0, t));
    return `${(a[0] + (b[0] - a[0]) * k).toFixed(2)}% ${(a[1] + (b[1] - a[1]) * k).toFixed(2)}%`;
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  function ctaBtns(cta) {
    let h = '';
    if (cta.primary) h += `<a class="sw-btn sw-btn--primary" href="${esc(cta.primary.href || '#')}">${esc(cta.primary.label)}</a>`;
    if (cta.secondary) h += `<a class="sw-btn sw-btn--ghost" href="${esc(cta.secondary.href || '#')}">${esc(cta.secondary.label)}</a>`;
    return h;
  }
}

function seedParticles(host, reduce) {
  if (!host || reduce) return;
  const kinds = ['dot', 'dot', 'ring'];
  const seeds = [7, 23, 41, 58, 71, 88, 12, 34, 52, 66, 83, 95, 18, 29, 47, 63, 77, 91, 5, 38, 55, 69, 82, 97];
  for (let k = 0; k < 20; k++) {
    const s = document.createElement('span');
    s.className = 'sw-pt sw-pt--' + kinds[k % kinds.length];
    s.style.left = seeds[k % seeds.length] + 'vw';
    s.style.top = ((seeds[(k * 3) % seeds.length] * 1.3) % 100) + 'vh';
    s.style.setProperty('--sw-sc', (0.5 + ((seeds[(k * 5) % seeds.length] % 60) / 60) * 1.1).toFixed(2));
    const dur = 14 + (seeds[(k * 7) % seeds.length] % 22);
    s.style.animationDuration = dur + 's';
    s.style.animationDelay = (-(seeds[(k * 2) % seeds.length] % dur)) + 's';
    host.appendChild(s);
  }
}

function injectCSS() {
  if (document.getElementById('sw-css')) return;
  const css = `
  .sw-root{--sw-bg:#F5EDE0;--sw-ink:#241d2b;--sw-ink-soft:#6a6072;--sw-accent:#8a7bb5;
    --sw-font-display:ui-rounded,"SF Pro Rounded","Segoe UI",system-ui,sans-serif;
    --sw-font-body:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,system-ui,sans-serif;
    color:var(--sw-ink);font-family:var(--sw-font-body);}
  html,body{margin:0;background:var(--sw-bg,#F5EDE0);overflow-x:hidden;}
  .sw-sky{position:fixed;inset:0;z-index:0;overflow:hidden;pointer-events:none;background:var(--sw-bg);}
  .sw-sky__grad{position:absolute;inset:-10%;background:linear-gradient(178deg,color-mix(in srgb,var(--sw-accent) 12%,var(--sw-bg)) 0%,var(--sw-bg) 55%,color-mix(in srgb,var(--sw-accent) 6%,var(--sw-bg)) 100%);}
  .sw-sky__glow{position:absolute;inset:0;background:radial-gradient(60% 42% at 74% 16%,color-mix(in srgb,var(--sw-accent) 22%,transparent),transparent 70%),radial-gradient(46% 34% at 50% 50%,color-mix(in srgb,#fff 45%,transparent),transparent 70%);}
  .sw-particles{position:absolute;inset:-6% -2%;will-change:transform;}
  .sw-pt{position:absolute;width:13px;height:13px;transform:scale(var(--sw-sc,1));opacity:0;animation:sw-drift linear infinite;}
  .sw-pt::before{content:"";position:absolute;inset:0;border-radius:50%;}
  .sw-pt--dot::before{background:radial-gradient(circle at 34% 30%,color-mix(in srgb,var(--sw-accent) 60%,#000),#000 82%);}
  .sw-pt--ring::before{background:transparent;border:2px solid color-mix(in srgb,var(--sw-accent) 55%,transparent);}
  @keyframes sw-drift{0%{opacity:0;transform:scale(var(--sw-sc)) translate(0,12vh) rotate(0)}12%{opacity:.5}88%{opacity:.45}100%{opacity:0;transform:scale(var(--sw-sc)) translate(4vw,-22vh) rotate(210deg)}}
  .sw-scrollbar{position:fixed;top:0;left:0;right:0;height:3px;z-index:60;background:color-mix(in srgb,var(--sw-accent) 14%,transparent);}
  .sw-scrollbar span{display:block;height:100%;width:100%;transform-origin:0 50%;transform:scaleX(0);background:var(--sw-accent);}
  .sw-topbar{position:fixed;top:0;left:0;right:0;z-index:50;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:clamp(14px,2.4vw,26px) clamp(18px,5vw,64px);}
  .sw-brand{display:flex;align-items:center;gap:10px;text-decoration:none;color:var(--sw-ink);}
  .sw-brand__mark{width:24px;height:28px;border-radius:7px 7px 10px 10px;background:linear-gradient(160deg,var(--sw-accent),color-mix(in srgb,var(--sw-accent) 60%,#000));box-shadow:0 6px 14px color-mix(in srgb,var(--sw-accent) 40%,transparent);}
  .sw-brand__name{font-family:var(--sw-font-display);font-weight:700;font-size:1.1rem;}
  .sw-nav{display:flex;gap:4px;padding:5px;background:color-mix(in srgb,#fff 55%,transparent);backdrop-filter:blur(10px);border:1px solid color-mix(in srgb,var(--sw-accent) 16%,transparent);border-radius:999px;}
  .sw-nav__item{font:inherit;font-size:.82rem;color:var(--sw-ink-soft);border:0;background:transparent;cursor:pointer;padding:7px 14px;border-radius:999px;transition:color .25s,background .25s;}
  .sw-nav__item:hover{color:var(--sw-ink);} .sw-nav__item.is-active{color:#fff;background:var(--sw-accent);}
  .sw-topcta{text-decoration:none;font-weight:600;font-size:.9rem;color:#fff;background:var(--sw-ink);padding:10px 20px;border-radius:999px;white-space:nowrap;}
  .sw-stage{position:fixed;inset:0;z-index:10;pointer-events:none;}
  .sw-scene{position:absolute;inset:0;opacity:0;overflow:hidden;will-change:opacity;}
  .sw-scene__video,.sw-scene__still{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:center 42%;}
  .sw-scene__still{will-change:transform;} .sw-scene__video{z-index:1;opacity:0;transition:opacity .25s linear;}
  .sw-scene.has-clip .sw-scene__video{opacity:1;} .sw-scene.has-clip .sw-scene__still{visibility:hidden;transition:visibility 0s .3s;}
  .sw-veil{position:fixed;inset:0;z-index:35;background:var(--sw-bg);opacity:0;pointer-events:none;}
  .sw-copylayer{position:fixed;inset:0;z-index:20;pointer-events:none;}
  .sw-copylayer::before{content:"";position:absolute;inset:0;width:min(58vw,780px);background:linear-gradient(90deg,var(--sw-bg) 0%,color-mix(in srgb,var(--sw-bg) 82%,transparent) 34%,color-mix(in srgb,var(--sw-bg) 40%,transparent) 62%,transparent 100%);}
  .sw-copy{position:absolute;left:clamp(18px,5vw,64px);top:50%;transform:translateY(calc(-50% + var(--sw-copy-dy,0vh)));width:min(42vw,460px);opacity:0;will-change:opacity,transform;}
  .sw-copy__num{font-family:ui-monospace,Menlo,monospace;font-size:.74rem;letter-spacing:.12em;color:var(--sw-ink-soft);}
  .sw-copy__eyebrow{display:block;margin-top:18px;font-family:var(--sw-font-display);font-weight:700;font-size:.8rem;letter-spacing:.16em;text-transform:uppercase;color:var(--sw-accent);}
  .sw-copy__title{font-family:var(--sw-font-display);font-weight:700;color:var(--sw-ink);font-size:clamp(2rem,4.4vw,3.5rem);line-height:1.03;margin:12px 0 0;letter-spacing:-.01em;text-shadow:0 2px 20px color-mix(in srgb,var(--sw-bg) 70%,transparent);}
  .sw-copy__body{margin-top:18px;font-size:clamp(1rem,1.25vw,1.14rem);line-height:1.55;color:color-mix(in srgb,var(--sw-ink) 78%,var(--sw-ink-soft));max-width:40ch;text-shadow:0 1px 12px color-mix(in srgb,var(--sw-bg) 90%,transparent);}
  .sw-copy__tags{list-style:none;display:flex;flex-wrap:wrap;gap:8px;margin:24px 0 0;padding:0;}
  .sw-copy__tags li{font-size:.82rem;font-weight:600;color:color-mix(in srgb,var(--sw-accent) 70%,#000);padding:7px 14px;border-radius:999px;background:color-mix(in srgb,var(--sw-accent) 14%,#fff);border:1px solid color-mix(in srgb,var(--sw-accent) 30%,transparent);}
  .sw-copy__cta{display:flex;flex-wrap:wrap;gap:12px;margin-top:28px;pointer-events:auto;}
  .sw-btn{text-decoration:none;font-weight:600;font-size:.95rem;padding:13px 24px;border-radius:999px;transition:transform .2s;}
  .sw-btn--primary{color:#fff;background:var(--sw-ink);} .sw-btn--primary:hover{transform:translateY(-2px);}
  .sw-btn--ghost{color:var(--sw-ink);border:1.5px solid color-mix(in srgb,var(--sw-ink) 25%,transparent);} .sw-btn--ghost:hover{transform:translateY(-2px);}
  .sw-route{position:fixed;right:clamp(14px,2.4vw,30px);top:50%;z-index:40;transform:translateY(-50%);display:flex;flex-direction:column;gap:22px;padding:18px 10px;}
  .sw-route::before{content:"";position:absolute;left:50%;top:22px;bottom:22px;width:2px;transform:translateX(-50%);background:var(--sw-accent);opacity:.28;}
  .sw-route__dot{position:relative;border:0;background:transparent;cursor:pointer;width:14px;height:14px;display:grid;place-items:center;}
  .sw-route__dot i{width:9px;height:9px;border-radius:50%;background:color-mix(in srgb,var(--sw-accent) 40%,transparent);transition:transform .3s,background .3s,box-shadow .3s;}
  .sw-route__dot:hover i{transform:scale(1.25);background:var(--sw-accent);}
  .sw-route__dot.is-active i{background:var(--sw-accent);transform:scale(1.4);box-shadow:0 0 0 5px color-mix(in srgb,var(--sw-accent) 22%,transparent);}
  .sw-route__label{position:absolute;right:24px;top:50%;transform:translateY(-50%) translateX(6px);white-space:nowrap;font-size:.78rem;font-weight:600;color:var(--sw-ink);background:color-mix(in srgb,#fff 85%,transparent);backdrop-filter:blur(6px);padding:5px 11px;border-radius:999px;opacity:0;pointer-events:none;transition:opacity .25s,transform .25s;border:1px solid color-mix(in srgb,var(--sw-accent) 14%,transparent);}
  .sw-route__dot:hover .sw-route__label,.sw-route__dot.is-active .sw-route__label{opacity:1;transform:translateY(-50%) translateX(0);}
  .sw-hint{position:fixed;left:50%;bottom:26px;z-index:30;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:10px;font-size:.76rem;letter-spacing:.14em;text-transform:uppercase;color:var(--sw-ink-soft);transition:opacity .3s;}
  .sw-hint i{width:22px;height:34px;border-radius:12px;border:2px solid color-mix(in srgb,var(--sw-ink) 28%,transparent);position:relative;}
  .sw-hint i::after{content:"";position:absolute;left:50%;top:7px;width:4px;height:7px;border-radius:2px;background:var(--sw-accent);transform:translateX(-50%);animation:sw-wheel 1.7s ease-in-out infinite;}
  @keyframes sw-wheel{0%{opacity:0;top:6px}40%{opacity:1}100%{opacity:0;top:17px}}
  .sw-track{position:relative;z-index:1;width:100%;pointer-events:none;}
  @media (max-width:860px){
    .sw-nav{display:none;}
    .sw-copylayer::before{width:100%;height:60%;top:auto;bottom:0;background:linear-gradient(0deg,var(--sw-bg) 8%,color-mix(in srgb,var(--sw-bg) 70%,transparent) 46%,transparent 100%);}
    /* Anchor copy to the bottom, clear of the home indicator / collapsing URL bar.
       dvh + env() are progressive: browsers that lack them keep the vh fallback line. */
    .sw-copy{left:clamp(18px,5vw,64px);right:clamp(18px,5vw,64px);top:auto;bottom:clamp(64px,14vh,120px);transform:translateY(var(--sw-copy-dy,0vh));width:auto;max-width:560px;}
    .sw-copy{bottom:calc(clamp(56px,12dvh,110px) + env(safe-area-inset-bottom));}
    .sw-copy__title{font-size:clamp(1.9rem,7.5vw,2.7rem);}
    .sw-copy__body{max-width:none;font-size:clamp(.98rem,3.6vw,1.1rem);} .sw-scene__video,.sw-scene__still{object-position:center 46%;}
    .sw-hint{bottom:calc(20px + env(safe-area-inset-bottom));}
    .sw-route{gap:16px;right:6px;} .sw-route__label{display:none;}
  }
  /* Portrait phones crop a 16:9 clip hard; keep the framing centred so the focal
     subject (which the camera dives toward) stays in view. */
  @media (max-width:860px) and (orientation:portrait){
    .sw-scene__video,.sw-scene__still{object-position:center 44%;}
  }
  /* Touch: give the route dots a finger-sized hit area without growing the visible dot. */
  @media (hover:none) and (pointer:coarse){
    .sw-route{padding:14px 6px;}
    .sw-route__dot{width:28px;height:28px;}
    .sw-btn{padding:15px 26px;}
  }
  @media (prefers-reduced-motion:reduce){ .sw-hint i::after{animation:none;} .sw-pt{display:none;} }
  `;
  // Wrap in a cascade layer so the page's own theme tokens (unlayered
  // :root / .sw-root { --sw-bg / --sw-ink / --sw-accent … }) always win over
  // these defaults, regardless of injection order. Enables clean dark themes.
  const style = document.createElement('style'); style.id = 'sw-css';
  style.textContent = '@layer sw {\n' + css + '\n}';
  document.head.appendChild(style);
}

// PATCH 1: exported above as an ES module; the global/CommonJS shim is gone.
