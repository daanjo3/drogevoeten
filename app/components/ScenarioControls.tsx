import type { PlaceData } from "../data/place";
import type { Drainage } from "../lib/drainage";
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
      {/* on phones the css shows this dropdown instead of the buttons */}
      <select className="pick" aria-label={label} value={value} onChange={(e) => onPick(Number(e.target.value))}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
            {o.sub ? ` · ${o.sub}` : ""}
          </option>
        ))}
      </select>
    </div>
  );
}

/* Segment buttons, one choice per row. The calculation updates at once. */
export function ScenarioControls({
  place,
  drainage,
  scenario,
  onChange,
}: {
  place: PlaceData;
  /* the 1-2 pumps that drain the area of the address */
  drainage: Drainage;
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
          { label: "Gewone dag", sub: mm(place.rain.normal), value: place.rain.normal },
          { label: "Flinke bui", sub: mm(place.rain.heavy), value: place.rain.heavy },
          { label: "Wolkbreuk", sub: mm(place.rain.record), value: place.rain.record },
        ]}
      />
      {drainage.pumps.map((p) => (
        <Segment
          key={p.id}
          label={`gemaal ${p.name}`}
          value={scenario.pumpsOff.includes(p.id) ? 0 : 1}
          onPick={(on) =>
            onChange({
              ...scenario,
              pumpsOff: on ? scenario.pumpsOff.filter((id) => id !== p.id) : [...scenario.pumpsOff, p.id],
            })
          }
          options={[
            { label: "Aan", sub: `${Math.round(p.capacity)} kuub/min`, value: 1 },
            { label: "Valt uit", value: 0 },
          ]}
        />
      ))}
      {drainage.pumps.length === 0 && (
        <div className="row">
          <small>gemaal</small>
          <p>
            {drainage.isPending
              ? "We zoeken welk gemaal hier het water wegpompt…"
              : drainage.isError
                ? "Het waterschapsregister gaf geen antwoord. Probeer het later nog eens."
                : "We vonden geen gemaal dat water uit jouw gebied wegpompt."}
          </p>
        </div>
      )}
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
