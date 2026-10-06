export interface ScrollStageOptions {
  video?: HTMLVideoElement | null;
  loader?: HTMLElement | null;
  sceneSelector?: string;
}

interface SceneState {
  el: HTMLElement;
  start: number;
  end: number;
  opacity: number;
  translateY: number;
}

const SEEK_JITTER = 1 / 30;
const SEEK_STALL_FRAMES = 30;
const SEEK_MAX_ATTEMPTS = 3;
const FADE_IN_RATIO = 0.3;
const FADE_OUT_RATIO = 0.7;
const RISE_PX = 30;
const LOADER_TIMEOUT_MS = 8000;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export function initScrollStage(options: ScrollStageOptions = {}) {
  const root = document.documentElement;
  const video =
    options.video !== undefined
      ? options.video
      : document.querySelector<HTMLVideoElement>('#scrollVideo');
  const loader =
    options.loader !== undefined
      ? options.loader
      : document.querySelector<HTMLElement>('#loader');
  const selector = options.sceneSelector ?? '.scene';
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  const scenes: SceneState[] = Array.from(
    document.querySelectorAll<HTMLElement>(selector),
  ).map((el) => ({
    el,
    start: Number.parseFloat(el.dataset.start ?? '0'),
    end: Number.parseFloat(el.dataset.end ?? '1'),
    opacity: -1,
    translateY: Number.NaN,
  }));

  let maxScroll = 1;
  let frameId = 0;
  let seekInFlight = false;
  let seekStall = 0;
  let seekTarget = Number.NaN;
  let seekAttempts = 0;
  let targetTime = 0;

  const measure = () => {
    maxScroll = Math.max(1, root.scrollHeight - window.innerHeight);
  };

  const onTimeUpdate = () => {
    if (!seekInFlight || !video) return;
    if (Math.abs(video.currentTime - targetTime) <= SEEK_JITTER) {
      seekInFlight = false;
      seekStall = 0;
    }
  };

  const onSeeked = () => {
    seekInFlight = false;
    seekStall = 0;
  };

  const renderScenes = (fraction: number) => {
    const reduced = reduceMotion.matches;

    for (const scene of scenes) {
      const span = scene.end - scene.start;
      const inRange = span > 0 && fraction >= scene.start && fraction <= scene.end;
      let opacity = 0;
      let translateY = reduced ? 0 : RISE_PX;

      if (inRange) {
        const progress = (fraction - scene.start) / span;
        if (reduced) {
          opacity = 1;
        } else {
          opacity =
            progress < FADE_IN_RATIO
              ? progress / FADE_IN_RATIO
              : progress > FADE_OUT_RATIO
                ? (1 - progress) / (1 - FADE_OUT_RATIO)
                : 1;
          translateY =
            (1 - Math.min(progress / FADE_IN_RATIO, 1)) * RISE_PX;
        }
      }

      if (opacity !== scene.opacity) {
        scene.el.style.opacity = opacity.toFixed(3);
        scene.el.setAttribute('aria-hidden', opacity <= 0.01 ? 'true' : 'false');
        scene.opacity = opacity;
      }
      if (translateY !== scene.translateY) {
        scene.el.style.transform = `translate3d(0, ${translateY.toFixed(2)}px, 0)`;
        scene.translateY = translateY;
      }
    }
  };

  const tick = () => {
    frameId = requestAnimationFrame(tick);

    const scrollTop = window.scrollY;
    const fraction = clamp(scrollTop / maxScroll, 0, 1);

    // Scrubbing is the content itself, not decoration: it must keep running
    // under prefers-reduced-motion too, otherwise a reduced-motion reader
    // gets scene 5's copy over the frozen first frame.
    if (video) {
      const duration = video.duration;
      if (Number.isFinite(duration) && duration > 0) {
        const target = fraction * duration;
        targetTime = target;
        const delta = Math.abs(video.currentTime - target);

        if (seekInFlight && seekStall >= SEEK_STALL_FRAMES) {
          seekInFlight = false;
          seekStall = 0;
        }

        // The media element can clamp a seek to a frame boundary, leaving
        // |currentTime - target| permanently above the jitter threshold.
        // Retrying a frozen target forever would spin; cap it and wait for the
        // next distinct target (i.e. the next scroll movement).
        if (delta <= SEEK_JITTER) {
          seekInFlight = false;
          seekStall = 0;
        } else if (!seekInFlight && target !== seekTarget) {
          seekTarget = target;
          seekAttempts = 1;
          seekInFlight = true;
          seekStall = 0;
          video.currentTime = target;
        } else if (!seekInFlight && seekAttempts < SEEK_MAX_ATTEMPTS) {
          seekAttempts += 1;
          seekInFlight = true;
          seekStall = 0;
          video.currentTime = target;
        } else if (seekInFlight) {
          seekStall += 1;
        }
      }
    }

    renderScenes(fraction);
  };

  const hideLoader = () => loader?.classList.add('is-hidden');

  const onVideoError = () => {
    hideLoader();
    document.body.classList.add('is-fallback');
  };

  measure();
  root.classList.add('is-enhanced');

  if (video) {
    if (video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) hideLoader();
    video.addEventListener('canplaythrough', hideLoader, { once: true });
    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('seeked', onSeeked);
    video.addEventListener('error', onVideoError, { once: true });
    if (video.error) onVideoError();
  } else {
    onVideoError();
  }

  const timeoutId = window.setTimeout(hideLoader, LOADER_TIMEOUT_MS);

  const onResize = () => measure();
  window.addEventListener('resize', onResize, { passive: true });
  window.addEventListener('orientationchange', onResize, { passive: true });
  const resizeObserver = new ResizeObserver(measure);
  resizeObserver.observe(root);

  frameId = requestAnimationFrame(tick);

  return () => {
    cancelAnimationFrame(frameId);
    window.clearTimeout(timeoutId);
    window.removeEventListener('resize', onResize);
    window.removeEventListener('orientationchange', onResize);
    resizeObserver.disconnect();
    video?.removeEventListener('timeupdate', onTimeUpdate);
    video?.removeEventListener('seeked', onSeeked);
    root.classList.remove('is-enhanced');
    loader?.classList.remove('is-hidden');
  };
}
