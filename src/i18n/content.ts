// All visible copy, per language. Concept project: no figures, no prices, no
// claims about a real building — the imagery is AI-generated and labelled so.

export const locales = ['es', 'en'] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'es';

export interface StopCopy {
  label: string;
  eyebrow: string;
  title: string;
  body: string;
}

export interface Content {
  /** BCP 47 tag for <html lang>. */
  htmlLang: string;
  ogLocale: string;
  path: string;
  meta: { title: string; description: string };
  brand: string;
  concept: string;
  hint: string;
  menu: {
    open: string;
    close: string;
    heading: string;
    languageLabel: string;
  };
  /** Same order and ids as `stops` in src/data/world.ts. */
  stops: Record<string, StopCopy>;
}

const brand = 'Libertad Buildings';

export const content: Record<Locale, Content> = {
  es: {
    htmlLang: 'es',
    ogLocale: 'es_419',
    path: '/',
    meta: {
      title: `${brand} — Proyecto conceptual`,
      description:
        'Recorre con el scroll la historia de Libertad Buildings, del terreno al penthouse. Proyecto conceptual con imágenes generadas con IA.',
    },
    brand,
    concept: 'Proyecto conceptual · Imágenes generadas con IA',
    hint: 'Desliza para recorrer',
    menu: {
      open: 'Abrir menú',
      close: 'Cerrar menú',
      heading: 'Recorrido',
      languageLabel: 'English',
    },
    stops: {
      terreno: {
        label: 'El terreno',
        eyebrow: 'El terreno',
        title: brand,
        body: 'Todo empieza aquí: un terreno sobre el océano y la última luz de la tarde.',
      },
      plano: {
        label: 'El plano',
        eyebrow: 'El plano',
        title: 'Primero, la idea.',
        body: 'Las líneas del proyecto se levantan desde el terreno y dibujan la torre antes de que exista.',
      },
      obra: {
        label: 'La obra',
        eyebrow: 'La obra',
        title: 'Después, la estructura.',
        body: 'Hormigón, acero y oficio: la torre crece planta por planta.',
      },
      torre: {
        label: 'La torre',
        eyebrow: 'La torre',
        title: 'Vidrio que guarda la última luz.',
        body: 'Al caer la noche, la fachada se enciende piso a piso frente al mar.',
      },
      penthouse: {
        label: 'El penthouse',
        eyebrow: 'El penthouse',
        title: 'El horizonte, sin interrupciones.',
        body: 'Del salón al ventanal, el océano como única vista.',
      },
    },
  },
  en: {
    htmlLang: 'en',
    ogLocale: 'en_US',
    path: '/en/',
    meta: {
      title: `${brand} — Concept project`,
      description:
        'Scroll through the story of Libertad Buildings, from empty plot to penthouse. A concept project with AI-generated imagery.',
    },
    brand,
    concept: 'Concept project · AI-generated imagery',
    hint: 'Scroll to explore',
    menu: {
      open: 'Open menu',
      close: 'Close menu',
      heading: 'Journey',
      languageLabel: 'Español',
    },
    stops: {
      terreno: {
        label: 'The plot',
        eyebrow: 'The plot',
        title: brand,
        body: 'It all starts here: a plot above the ocean and the last light of the afternoon.',
      },
      plano: {
        label: 'The plan',
        eyebrow: 'The plan',
        title: 'First, the idea.',
        body: "The project's lines rise from the ground and draw the tower before it exists.",
      },
      obra: {
        label: 'The build',
        eyebrow: 'The build',
        title: 'Then, the structure.',
        body: 'Concrete, steel and craft: the tower rises floor by floor.',
      },
      torre: {
        label: 'The tower',
        eyebrow: 'The tower',
        title: 'Glass that holds the last light.',
        body: 'As night falls, the façade lights up floor by floor above the sea.',
      },
      penthouse: {
        label: 'The penthouse',
        eyebrow: 'The penthouse',
        title: 'The horizon, uninterrupted.',
        body: 'From the living room to the glass, the ocean is the only view.',
      },
    },
  },
};

export const otherLocale = (locale: Locale): Locale => (locale === 'es' ? 'en' : 'es');
