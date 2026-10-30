/* The "what if it goes wrong" calculation. A sum, not a prediction.
   Ported from the prototype; the dike-breach height is still a placeholder
   and should come from LIWO. */

export interface Scenario {
  /* rain in mm */
  rain: number;
  /* pump capacity in m3/min, 0 when the pump fails */
  pump: number;
  /* extra water in m from the dike: 0 holds, 0.5 leaks, 2 breaks */
  dike: number;
}

export interface ScenarioResult {
  /* water level in the living room, in m */
  level: number;
  /* hours until the pump has removed the rain, 0 when the pump is off */
  hours: number;
}

const MAX_LEVEL = 2.4;

export function calcScenario(s: Scenario, areaKm2: number): ScenarioResult {
  const m3 = (s.rain / 1000) * areaKm2 * 1e6;
  const hours = s.pump ? m3 / (s.pump * 60) : 0;
  const fromRain = s.pump ? Math.max(0, (s.rain - 393) / 1000) : s.rain / 1000;
  const level = Math.min(MAX_LEVEL, s.dike + fromRain);
  return { level, hours };
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
