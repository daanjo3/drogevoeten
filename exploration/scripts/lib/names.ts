import type { Village } from './types.ts';

/** Lowercase without diacritics, hyphens and repeated whitespace, for comparing names. */
export const normalize = (name: string): string =>
  name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[-\s]+/g, ' ')
    .trim();

/**
 * All names of a village: its name and alternative names, also without the number the backbone
 * adds to villages with several locations ("Agger 1" -> "Agger").
 */
export const nameVariants = (village: Village): string[] => {
  const all = [village.name, ...(village.altNames ?? [])];
  return [...new Set([...all, ...all.map((n) => n.replace(/\s+\d+$/, ''))])];
};

/** The name without a leading "Oud-" or "Nieuw-" ("Oud-Hontenisse" -> "Hontenisse"), or null. */
export const stem = (name: string): string | null => {
  const stripped = name.replace(/^(Oud|Nieuw)[-\s]+/i, '');
  return stripped !== name && stripped.length > 0 ? stripped : null;
};

export const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Escapes text for use inside a double-quoted SPARQL string literal. */
export const escapeSparqlString = (text: string): string => text.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
