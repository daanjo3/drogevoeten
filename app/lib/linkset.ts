// Links between the two gemalen datasets about the same object. Heuristic,
// so every match carries how it was made (the distance), for the "bron" tooltip.

import { distanceM } from "./landschapsatlas";
import type { AtlasStation, ImwaStation } from "./gemalen";

/* Max distance between the IMWA point and the Landschapsatlas point. Same
   rule as the prototype's linkset (historic gemaal <-> IMWA, <= 300 m). */
export const MATCH_MAX_M = 300;

// words that say what an object is, not which one, so they don't count as a match
const GENERIC = new Set([
  "gemaal", "poldergemaal", "boezemgemaal", "hulpgemaal", "stoomgemaal", "hulpstoomgemaal",
  "molen", "windmolen", "watermolen", "polder", "watergang", "weg",
  "de", "het", "van", "der", "den", "en", "bij", "aan", "op",
  // from names the conversion built: "Gemaal 30099GM (naam onbekend)"
  "naam", "onbekend",
]);

function nameWords(name: string | null | undefined): Set<string> {
  const words = (name ?? "").toLowerCase().match(/\p{L}+/gu) ?? [];
  return new Set(words.filter((w) => w.length >= 3 && !GENERIC.has(w)));
}

interface Match {
  atlas: AtlasStation;
  /* metres between the two points */
  distance: number;
}

/* Links IMWA gemalen to Landschapsatlas gemalen, keyed by IMWA id.
   A pair qualifies when the points are at most MATCH_MAX_M apart and the
   names share a distinctive word. Links are one-to-one, closest pairs first,
   so a sluice or a second pump next to a gemaal doesn't take its record.
   Pass every IMWA gemaal in the area, not only the ones shown: otherwise a
   neighbour that isn't shown can't claim its own record. */
function linkLandschapsatlas(imwa: ImwaStation[], candidates: AtlasStation[]): Map<string, Match> {
  const pairs: { imwa: ImwaStation; match: Match }[] = [];
  const candidateWords = candidates.map((c) => nameWords(c.name));
  for (const f of imwa) {
    const words = nameWords(f.name);
    if (words.size === 0) continue;
    candidates.forEach((c, i) => {
      const d = distanceM(f.lat, f.lon, c.lat, c.lon);
      if (d <= MATCH_MAX_M && [...words].some((w) => candidateWords[i].has(w))) {
        pairs.push({ imwa: f, match: { atlas: c, distance: d } });
      }
    });
  }
  pairs.sort((a, b) => a.match.distance - b.match.distance);

  const links = new Map<string, Match>();
  const taken = new Set<string>();
  for (const { imwa: f, match } of pairs) {
    if (links.has(f.id) || taken.has(match.atlas.id)) continue;
    links.set(f.id, match);
    taken.add(match.atlas.id);
  }
  return links;
}

/* One gemaal from either dataset, or both when they are linked. */
export interface CombinedGemaal {
  /* the IMWA record IRI when present, else the Landschapsatlas one */
  id: string;
  /* metres to the search point; from IMWA when present, the current register */
  distance: number;
  imwa?: ImwaStation;
  atlas?: AtlasStation;
  /* metres between the two points, when linked */
  linkDistance?: number;
}

/* The union of both searches: linked pairs become one entry, everything else
   stays as it is. Sorted by distance. Landschapsatlas gemalen beyond radius
   (metres) are dropped; they are only fetched to link IMWA gemalen near the edge. */
export function combineGemalen(imwa: ImwaStation[], atlas: AtlasStation[], radius: number): CombinedGemaal[] {
  const links = linkLandschapsatlas(imwa, atlas);
  const linked = new Set([...links.values()].map((m) => m.atlas.id));

  const fromImwa = imwa.map((f): CombinedGemaal => {
    const m = links.get(f.id);
    return { id: f.id, distance: f.distance, imwa: f, atlas: m?.atlas, linkDistance: m?.distance };
  });
  const atlasOnly = atlas
    .filter((f) => !linked.has(f.id) && f.distance <= radius)
    .map((f): CombinedGemaal => ({ id: f.id, distance: f.distance, atlas: f }));

  return [...fromImwa, ...atlasOnly].sort((a, b) => a.distance - b.distance);
}
