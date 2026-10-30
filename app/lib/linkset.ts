// Links between sources about the same object. Heuristic, so every match
// carries how it was made (the distance), for the "bron" tooltip.

import { distanceM, type Feature, type Gemaal, type NearFeature } from "./landschapsatlas";
import type { ImwaGemaal } from "./imwa";

/* Max distance between the IMWA point and the Landschapsatlas point. Same
   rule as the prototype's linkset (historic gemaal <-> IMWA, <= 300 m). */
export const MATCH_MAX_M = 300;

// words that say what an object is, not which one, so they don't count as a match
const GENERIC = new Set([
  "gemaal", "poldergemaal", "boezemgemaal", "hulpgemaal", "stoomgemaal", "hulpstoomgemaal",
  "molen", "windmolen", "watermolen", "polder", "watergang", "weg",
  "de", "het", "van", "der", "den", "en", "bij", "aan", "op",
]);

function nameWords(name: string | null | undefined): Set<string> {
  const words = (name ?? "").toLowerCase().match(/\p{L}+/gu) ?? [];
  return new Set(words.filter((w) => w.length >= 3 && !GENERIC.has(w)));
}

export interface GemaalMatch {
  feature: Feature<Gemaal>;
  /* metres between the two points */
  distance: number;
}

/* Links IMWA gemalen to Landschapsatlas gemalen, keyed by IMWA feature id.
   A pair qualifies when the points are at most MATCH_MAX_M apart and the
   names share a distinctive word. Links are one-to-one, closest pairs first,
   so a sluice or a second pump next to a gemaal doesn't take its record.
   Pass every IMWA gemaal in the area, not only the ones shown: otherwise a
   neighbour that isn't shown can't claim its own record. */
function linkLandschapsatlas(
  imwa: Feature<ImwaGemaal>[],
  candidates: Feature<Gemaal>[],
): Map<string, GemaalMatch> {
  const pairs: { imwa: Feature<ImwaGemaal>; match: GemaalMatch }[] = [];
  const candidateWords = candidates.map((c) => nameWords(c.properties.naam_gemaal));
  for (const f of imwa) {
    const words = nameWords(f.properties.naam);
    if (words.size === 0) continue;
    const [lon, lat] = f.geometry.coordinates;
    candidates.forEach((c, i) => {
      const d = distanceM(lat, lon, c.geometry.coordinates[1], c.geometry.coordinates[0]);
      if (d <= MATCH_MAX_M && [...words].some((w) => candidateWords[i].has(w))) {
        pairs.push({ imwa: f, match: { feature: c, distance: d } });
      }
    });
  }
  pairs.sort((a, b) => a.match.distance - b.match.distance);

  const links = new Map<string, GemaalMatch>();
  const taken = new Set<string>();
  for (const { imwa: f, match } of pairs) {
    if (links.has(f.id) || taken.has(match.feature.id)) continue;
    links.set(f.id, match);
    taken.add(match.feature.id);
  }
  return links;
}

/* One gemaal from either source, or both when they are linked. */
export interface CombinedGemaal {
  /* the IMWA id when present, else the Landschapsatlas id */
  id: string;
  /* metres to the search point; from IMWA when present, the current register */
  distance: number;
  imwa?: NearFeature<ImwaGemaal>;
  atlas?: NearFeature<Gemaal>;
  /* metres between the two points, when linked */
  linkDistance?: number;
}

/* The union of both searches: linked pairs become one entry, everything else
   stays as it is. Sorted by distance. Landschapsatlas gemalen beyond radius
   are dropped; they are only fetched to link IMWA gemalen near the edge. */
export function combineGemalen(
  imwa: NearFeature<ImwaGemaal>[],
  atlas: NearFeature<Gemaal>[],
  radius: number,
): CombinedGemaal[] {
  const links = linkLandschapsatlas(imwa, atlas);
  const linked = new Set([...links.values()].map((m) => m.feature.id));
  const atlasById = new Map(atlas.map((f) => [f.id, f]));

  const fromImwa = imwa.map((f): CombinedGemaal => {
    const m = links.get(f.id);
    return { id: f.id, distance: f.distance, imwa: f, atlas: m && atlasById.get(m.feature.id), linkDistance: m?.distance };
  });
  const atlasOnly = atlas
    .filter((f) => !linked.has(f.id) && f.distance <= radius)
    .map((f): CombinedGemaal => ({ id: f.id, distance: f.distance, atlas: f }));

  return [...fromImwa, ...atlasOnly].sort((a, b) => a.distance - b.distance);
}

/* IMWA's url field is mostly not a web link: network paths of the water
   boards ("V:\...", "\\server\...") and HTML anchors ('<a href="...">').
   Returns an http(s) url or undefined. */
export function webUrl(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  const href = raw.match(/href\s*=\s*["']([^"']+)["']/i)?.[1] ?? raw.trim();
  try {
    const url = new URL(href);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}
