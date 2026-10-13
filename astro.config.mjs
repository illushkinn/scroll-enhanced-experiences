import { defineConfig } from 'astro/config';

export default defineConfig({
  output: 'static',
  // The live Vercel deployment. Keep in sync with the project's domain if it is
  // renamed (canonical, hreflang and og:url are built from it).
  site: 'https://maravilla-residences.vercel.app',
  i18n: {
    defaultLocale: 'es',
    locales: ['es', 'en'],
    routing: { prefixDefaultLocale: false },
  },
});
