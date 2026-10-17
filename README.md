# Libertad Buildings — scroll-world concept

A concept project by The Brand Crew: a bilingual landing page (Spanish at `/`,
English at `/en/`) where scrolling flies a camera through the life of a
seafront tower, from the empty plot to the penthouse. Five stops joined by four
AI-generated clips; all imagery is AI-generated and labelled as such on the page.

Built with Astro 5 and the `scroll-world` engine (vendored, with tagged patches,
in `src/lib/scroll-world.js`).

## Run it

```
pnpm install
pnpm dev            # http://localhost:4321
pnpm build          # static site in dist/
pnpm check          # Astro/TypeScript diagnostics
pnpm qa             # browser QA against dist/ (build first)
pnpm time-maps      # re-measure clip motion after changing a clip (needs ffmpeg)
```

`pnpm qa` uses Google Chrome if installed, otherwise Playwright's Chromium
(download it once with `pnpm exec playwright-core install chromium`;
`CHROME_PATH` overrides both). Without an H.264 decoder it needs `ffmpeg` to
make test copies of the clips.

## Where things are

| Path | What |
| --- | --- |
| `src/data/world.ts` | Stops, clips, focus and pacing (scroll lengths, spring, snap) |
| `src/i18n/content.ts` | All copy, per language |
| `src/components/Experience.astro` | Header, menu, no-JS story, engine mount |
| `src/lib/scroll-world.js` | The scroll engine |
| `public/media/` | Encoded clips and stills ([how they're made](docs/architecture.md#1-media-pipeline)) |
| `scripts/` | `time-maps.mjs` (pacing tables), `qa.mjs` (browser QA) |
| `docs/architecture.md` | How it all fits, engine patches, degradation, QA, references |
| `prompts/` | Generation record for frames and clips (from the first build) |

Deploys: Vercel builds a preview for every pull request and deploys `master`.
