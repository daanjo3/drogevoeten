/* The "what if it goes wrong" calculation. A sum, not a prediction.
   Ported from the prototype. Water from outside comes from real data:
   - the dike breaks: the LIWO water depth, extreme class (see liwo.ts);
   - no dike: the sea at its mean level, NAP 0 m, against the AHN ground level. */

export interface Scenario {
  /* rain in mm */
  rain: number;
  /* ids of the pumps (IMWA) that fail */
  pumpsOff: string[];
  /* holds; breaks (LIWO); or there is no dike at all (sea level, NAP) */
  dike: Dike;
}

export type Dike = "holds" | "breaks" | "none";

export interface ScenarioResult {
  /* water in the living room in m, capped at the room height */
  level: number;
  /* the same, not capped; can be higher than the room */
  depth: number;
  /* hours until the pump has removed the rain, 0 when the pump is off */
  hours: number;
}

const MAX_LEVEL = 2.4;

export interface ScenarioInput {
  /* the drainage area in m2, null when unknown */
  areaM2: number | null;
  /* m3/min of the pumps that still run, null when no pump is known */
  capacity: number | null;
  /* water from outside above the floor in m for the chosen dike (LIWO or
     sea level), null when unknown */
  outside: number | null;
}

export function calcScenario(s: Scenario, { areaM2, capacity, outside }: ScenarioInput): ScenarioResult {
  // with water from outside the rain no longer matters
  if (s.dike !== "holds") return result(Math.max(0, outside ?? 0), 0);
  if (areaM2 === null || capacity === null) return result(0, 0);
  const m3 = (s.rain / 1000) * areaM2;
  const hours = capacity ? m3 / (capacity * 60) : 0;
  const fromRain = capacity ? Math.max(0, (s.rain - 393) / 1000) : s.rain / 1000;
  return result(fromRain, hours);
}

function result(depth: number, hours: number): ScenarioResult {
  return { level: Math.min(MAX_LEVEL, depth), depth, hours };
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

export function nlRaw(n: number): string {
  return String(n).replace(".", ",");
}
