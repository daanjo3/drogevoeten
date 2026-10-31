import type { Outside, Scenario } from "../lib/scenario";
import { LIWO_CLASSES, liwoClass, type LiwoMap } from "../lib/liwo";

interface Option<T> {
  label: string;
  sub?: string;
  /* shorter version of sub for the phone dropdown */
  short?: string;
  value: T;
}

export function Segment<T extends string | number>({
  label,
  options,
  value,
  onPick,
  stacked = false,
}: {
  label: string;
  /* one button per line, for options with a long small line */
  stacked?: boolean;
  options: Option<T>[];
  value: T;
  onPick: (v: T) => void;
}) {
  return (
    <div className="row">
      <small>{label}</small>
      <div className={stacked ? "seg stack" : "seg"} role="group" aria-label={label}>
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
            {o.short ?? o.sub ? ` · ${o.short ?? o.sub}` : ""}
          </option>
        ))}
      </select>
    </div>
  );
}

/* Segment buttons, one choice per row. The water in the room follows at once. */
export function ScenarioControls({ scenario, onChange }: { scenario: Scenario; onChange: (s: Scenario) => void }) {
  const kans = liwoClass(scenario.liwoMap);
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
            label="hoe vaak gebeurt het?"
            stacked
            value={scenario.liwoMap}
            onPick={(liwoMap: LiwoMap) => onChange({ ...scenario, liwoMap })}
            options={LIWO_CLASSES.map((c) => ({
              label: c.label,
              sub: c.sub,
              short: c.short,
              value: c.map,
            }))}
          />
          <p className="hint">
            Zo'n overstroming gebeurt gemiddeld {kans.often}. Dat betekent niet dat je zo lang veilig bent. Het kan ook volgend jaar
            gebeuren.
          </p>
        </>
      )}
    </>
  );
}
