// Media + pacing for the scroll-world flight. Language-independent: the copy for
// each stop lives in src/i18n/content.ts, keyed by the same `id`.
//
// Shape: 5 stops (stills, camera at rest while the copy reads) joined by the 4
// generated clips as connectors. Every still is a real frame of the clips
// (scroll-world SKILL Step 5): stop k = first frame of clip k+1, the last stop =
// last frame of clip 4. See docs/architecture.md for the extraction commands.

export interface Stop {
  id: string;
  still: string;
  stillMobile: string;
  /** object-position in percent [x, y]; mainly decides the portrait crop on phones. */
  focus: [number, number];
  /** viewport-heights of scroll spent resting on this stop. */
  scroll: number;
  accent: string;
}

const media = (path: string) => `/media/${path}`;

export const stops: Stop[] = [
  {
    id: 'terreno',
    still: media('stops/s0.webp'),
    stillMobile: media('stops/s0-m.webp'),
    focus: [50, 45],
    scroll: 1.3,
    accent: 'var(--color-amber)',
  },
  {
    id: 'plano',
    still: media('stops/s1.webp'),
    stillMobile: media('stops/s1-m.webp'),
    focus: [54, 45],
    scroll: 1,
    accent: 'var(--color-cyan)',
  },
  {
    id: 'obra',
    still: media('stops/s2.webp'),
    stillMobile: media('stops/s2-m.webp'),
    focus: [52, 45],
    scroll: 1,
    accent: 'var(--color-amber)',
  },
  {
    id: 'torre',
    still: media('stops/s3.webp'),
    stillMobile: media('stops/s3-m.webp'),
    focus: [54, 45],
    scroll: 1,
    accent: 'var(--color-amber-soft)',
  },
  {
    id: 'penthouse',
    still: media('stops/s4.webp'),
    stillMobile: media('stops/s4-m.webp'),
    focus: [44, 50],
    scroll: 1.4,
    accent: 'var(--color-amber)',
  },
];

// clip k flies from stop k-1 to stop k. Desktop: native 1912×1080, GOP 8.
// Mobile: 720p, GOP 4 — a centre crop of the landscape film, not a native 9:16
// chain (that needs a second, portrait render; see docs/architecture.md).
export const connectors = [1, 2, 3, 4].map((n) => media(`clips/c${n}.mp4`));
export const connectorsMobile = [1, 2, 3, 4].map((n) => media(`clips/c${n}-m.mp4`));

export const pacing = {
  /** viewport-heights of scroll per 4 s clip. */
  connScroll: 1.6,
  /**
   * Seam window (viewport-heights): how far before a seam the next layer is kept
   * in sync underneath. Layers swap with a cut — the seams are frame-matched, so
   * no dissolve is needed or visible.
   */
  crossfade: 0.08,
};
