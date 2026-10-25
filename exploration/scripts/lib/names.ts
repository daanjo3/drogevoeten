/** Lowercase without diacritics, hyphens and repeated whitespace, for comparing names. */
export const normalize = (name: string): string =>
  name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[-\s]+/g, ' ')
    .trim();

/**
 * A key that is the same for common spelling variants of historical Dutch names, for comparing names
 * from different sources: "Beoostenbly" and "Beoostenblij", "Saeftinghe" and "Saefthinge", "Kreke" and
 * "Creke". Doubled consonants count as one, doubled vowels don't ("Weele" and "Welle" stay apart).
 * Only for comparing; it's not a readable name.
 */
export const spellingKey = (name: string): string =>
  normalize(name)
    .replace(/'/g, '')
    .replace(/ij/g, 'y')
    .replace(/ae/g, 'a')
    .replace(/gh/g, 'g')
    .replace(/th/g, 't')
    .replace(/ph/g, 'f')
    .replace(/ck/g, 'k')
    .replace(/c/g, 'k')
    .replace(/dt\b/g, 't')
    .replace(/d\b/g, 't')
    .replace(/([b-df-hj-np-tv-z])\1+/g, '$1');

/** The name without the number the backbone adds to villages with several locations ("Agger 1" -> "Agger"). */
export const numberless = (name: string): string => name.replace(/\s+\d+$/, '');

/** The name without a leading "Oud-" or "Nieuw-" ("Oud-Hontenisse" -> "Hontenisse"), or null. */
export const stem = (name: string): string | null => {
  const stripped = name.replace(/^(Oud|Nieuw)[-\s]+/i, '');
  return stripped !== name && stripped.length > 0 ? stripped : null;
};

/** Levenshtein distance. */
export function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    previous = current;
  }
  return previous[b.length];
}

export const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Escapes text for use inside a double-quoted SPARQL string literal. */
export const escapeSparqlString = (text: string): string => text.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
