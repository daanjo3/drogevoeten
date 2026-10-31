import type { Outside, Scenario } from "../lib/scenario";
import { LIWO_CLASSES, liwoClass, type LiwoMap } from "../lib/liwo";

interface Option<T> {
  label: string;
  sub?: string;
  value: T;
}

function Segment<T extends string | number>({
  label,
  options,
  value,
  onPick,
}: {
  label: string;
  options: Option<T>[];
  value: T;
  onPick: (v: T) => void;
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
      <select
        className="pick"
        aria-label={label}
        value={options.findIndex((o) => o.value === value)}
        onChange={(e) => onPick(options[Number(e.target.value)].value)}
      >
        {options.map((o, i) => (
          <option key={o.value} value={i}>
            {o.label}
            {o.sub ? ` · ${o.sub}` : ""}
          </option>
        ))}
      </select>
    </div>
  );
}

/* Segment buttons, one choice per row. The water in the room follows at once. */
export function ScenarioControls({ scenario, onChange }: { scenario: Scenario; onChange: (s: Scenario) => void }) {
  const odds = liwoClass(scenario.liwoMap).odds;
  return (
    <>
      <Segment
        label="wat als…"
        value={scenario.outside}
        onPick={(outside: Outside) => onChange({ ...scenario, outside })}
        options={[
          { label: "Overstroming", value: "flood" },
          { label: "Geen dijken", sub: "zeeniveau", value: "nodikes" },
        ]}
      />
      {scenario.outside === "flood" && (
        <>
          <Segment
            label="kans per jaar"
            value={scenario.liwoMap}
            onPick={(liwoMap: LiwoMap) => onChange({ ...scenario, liwoMap })}
            options={LIWO_CLASSES.map((c) => ({
              label: c.label,
              sub: c.map === 1 ? `meer dan 1 op ${c.odds}` : c.odds ? `1 op ${c.odds}` : "nog kleiner",
              value: c.map,
            }))}
          />
          <p className="hint">
            {odds
              ? `Elk jaar is er een kans van ${scenario.liwoMap === 1 ? "meer dan " : ""}1 op ${odds} op zo'n overstroming. Gemiddeld komt die eens in de ${odds} jaar${scenario.liwoMap === 1 ? " of vaker" : ""} voor, maar hij kan ook twee keer kort na elkaar komen, of eeuwenlang niet.`
              : "De kans is kleiner dan 1 op 30.000 per jaar. Zo'n overstroming komt bijna nooit voor. Dit is dezelfde kaart als op overstroomik.nl."}
          </p>
        </>
      )}
    </>
  );
}
