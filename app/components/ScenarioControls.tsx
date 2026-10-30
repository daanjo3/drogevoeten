import type { PlaceData } from "../data/place";
import type { Scenario } from "../lib/scenario";

interface Option {
  label: string;
  sub?: string;
  value: number;
}

function Segment({
  label,
  options,
  value,
  onPick,
}: {
  label: string;
  options: Option[];
  value: number;
  onPick: (v: number) => void;
}) {
  return (
    <div className="row">
      <small>{label}</small>
      <div className="seg" role="group" aria-label={label}>
        {options.map((o) => (
          <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onPick(o.value)}>
            {o.label}
            {o.sub && <span>{o.sub}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

/* Segment buttons, one choice per row. The calculation updates at once. */
export function ScenarioControls({
  place,
  scenario,
  onChange,
}: {
  place: PlaceData;
  scenario: Scenario;
  onChange: (s: Scenario) => void;
}) {
  const mm = (n: number) => `${Math.round(n)} mm`;
  return (
    <>
      <Segment
        label="regen"
        value={scenario.rain}
        onPick={(rain) => onChange({ ...scenario, rain })}
        options={[
          { label: "Gewoon", sub: mm(place.rain.normal), value: place.rain.normal },
          { label: "Flinke bui", sub: mm(place.rain.heavy), value: place.rain.heavy },
          { label: "Record", sub: mm(place.rain.record), value: place.rain.record },
        ]}
      />
      <Segment
        label={`gemaal ${place.pumpName}`}
        value={scenario.pump}
        onPick={(pump) => onChange({ ...scenario, pump })}
        options={[
          { label: "Aan", value: place.pumpCapacity },
          { label: "Valt uit", value: 0 },
        ]}
      />
      <Segment
        label="dijk"
        value={scenario.dike}
        onPick={(dike) => onChange({ ...scenario, dike })}
        options={[
          { label: "Houdt", value: 0 },
          { label: "Lekt", value: 0.5 },
          { label: "Breekt", value: 2 },
        ]}
      />
    </>
  );
}
