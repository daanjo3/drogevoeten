import type { LiwoMap } from "./liwo";

/* "What if it goes wrong": how high the water from outside comes in the
   living room. No prediction; the heights come from open data:
   - a flood: the LIWO water depth for the chosen probability class (liwo.ts);
   - no dikes: the sea at its mean level, NAP 0 m, against the AHN ground level.
   The rain and pump sum of the prototype is left out here: it says nothing
   about the water level. */

export interface Scenario {
  /* a flood (LIWO), or no dikes at all (sea level, NAP) */
  outside: Outside;
  /* the LIWO probability class for a flood, 1 (largest chance) to 5 (smallest) */
  liwoMap: LiwoMap;
}

export type Outside = "flood" | "nodikes";

export interface WaterInRoom {
  /* water in the living room in m, capped at the room height */
  level: number;
  /* the same, not capped; can be higher than the room */
  depth: number;
}

const MAX_LEVEL = 2.4;

/* depth: water above the floor in m, null when unknown (counts as dry) */
export function waterInRoom(depth: number | null): WaterInRoom {
  const d = Math.max(0, depth ?? 0);
  return { level: Math.min(MAX_LEVEL, d), depth: d };
}

/* Dutch number formatting with a comma, one decimal. */
export function nl(n: number): string {
  return n.toFixed(1).replace(".", ",");
}

/* Like nl, with a sign: "+2,0" or "−3,5". */
export function nlSigned(n: number): string {
  const r = Math.round(n * 10) / 10;
  return `${r < 0 ? "−" : "+"}${nl(Math.abs(r))}`;
}
