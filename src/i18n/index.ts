/**
 * Minimal i18n. The Spanish source text is the key; English and Catalan are looked up in
 * dictionaries. The language is fixed at startup from the system language:
 *   ca* -> Catalan, es* -> Spanish, anything else -> English.
 * (Start the app with --lang=ca / --lang=es / --lang=en to force it for testing.)
 */
import { en } from './en';
import { ca } from './ca';

export type Lang = 'es' | 'ca' | 'en';

export function detectLang(locale?: string): Lang {
  const l = (locale || '').toLowerCase();
  if (l.startsWith('ca')) return 'ca';
  if (l.startsWith('es')) return 'es';
  return 'en';
}

export const lang: Lang = detectLang(
  typeof navigator !== 'undefined' ? navigator.language : 'en'
);

const dict: Record<string, string> | null = lang === 'en' ? en : lang === 'ca' ? ca : null;

/** Translate a Spanish source string. `{name}` placeholders are filled from `vars`. */
export function tr(key: string, vars?: Record<string, string | number>): string {
  let out = dict ? dict[key] ?? key : key;
  if (vars) {
    for (const k of Object.keys(vars)) out = out.split(`{${k}}`).join(String(vars[k]));
  }
  return out;
}
