import { useId, type ReactNode } from "react";
import type { Scenario } from "../lib/scenario";
import { LIWO_CLASSES, liwoClass, type LiwoMap } from "../lib/liwo";
import type { RoomView } from "./UnityRoom";
import { Icon } from "./Icons";

interface Option<T> {
  label: string;
  sub?: string;
  /* shown before the label, e.g. drops for the size of a flood */
  icon?: ReactNode;
  value: T;
}

export function Segment<T extends string | number>({
  label,
  options,
  value,
  onPick,
  stacked = false,
  light = false,
}: {
  label: string;
  options: Option<T>[];
  value: T;
  onPick: (v: T) => void;
  /* one button per line, for options with a long small line */
  stacked?: boolean;
  /* the chosen button is white instead of orange */
  light?: boolean;
}) {
  return (
    <div className="row">
      <small>{label}</small>
      <div className={["seg", stacked && "stack", light && "light"].filter(Boolean).join(" ")} role="group" aria-label={label}>
        {options.map((o) => (
          <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onPick(o.value)}>
            {o.icon}
            {o.label}
            {o.sub && <span>{o.sub}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

/* The first choice in the risk panel: look at the room, or at the whole house. */
export function ViewSegment({ view, onView }: { view: RoomView; onView: (v: RoomView) => void }) {
  return (
    <Segment
      label="bekijk"
      light
      options={[
        { label: "Kamer", value: "room" },
        { label: "Huis", value: "house" },
      ]}
      value={view}
      onPick={onView}
    />
  );
}

/* One to five drops: how big a flood is. */
function Drops({ n }: { n: number }) {
  return (
    <i className="drops" aria-hidden="true">
      {Array.from({ length: n }, (_, i) => (
        <Icon key={i} name="drop" />
      ))}
    </i>
  );
}

/* The scenario choices. The water in the room follows at once.
   Larger screens: two rows of buttons that read as one sentence ("wat
   als… het overstroomt"), the size of the flood with drops.
   Phones: a switch for the dikes and a slider with five steps.
   The css shows one of the two. */
export function ScenarioControls({ scenario, onChange }: { scenario: Scenario; onChange: (s: Scenario) => void }) {
  const kans = liwoClass(scenario.liwoMap);
  const flood = scenario.outside === "flood";
  const id = useId();
  const setSize = (liwoMap: LiwoMap) => onChange({ ...scenario, liwoMap });

  return (
    <>
      <div className="desk">
        <Segment
          label="wat als…"
          value={scenario.outside}
          onPick={(outside) => onChange({ ...scenario, outside })}
          options={[
            { label: "het overstroomt", value: "flood" },
            { label: "er geen dijken zijn", value: "nodikes" },
          ]}
        />
        {flood && (
          <Segment
            label="hoe groot is de overstroming?"
            stacked
            value={scenario.liwoMap}
            onPick={setSize}
            options={LIWO_CLASSES.map((c) => ({ label: c.label, sub: c.sub, icon: <Drops n={c.map} />, value: c.map }))}
          />
        )}
      </div>

      <div className="mob">
        <div className="row switch-row">
          <span id={`${id}-dikes`}>Dijken</span>
          <button
            type="button"
            role="switch"
            className="switch"
            aria-checked={flood}
            aria-labelledby={`${id}-dikes`}
            onClick={() => onChange({ ...scenario, outside: flood ? "nodikes" : "flood" })}
          >
            <i />
            <span>{flood ? "aan" : "uit"}</span>
          </button>
        </div>
        {flood && (
          <div className="row">
            <small id={`${id}-size`}>hoe groot is de overstroming?</small>
            {/* the five steps as ticks on the track, under the thumb */}
            <div className="slider">
              <div className="ticks" aria-hidden="true">
                {LIWO_CLASSES.map((c) => (
                  <i key={c.map} />
                ))}
              </div>
              <input
                type="range"
                className="size"
                min={1}
                max={5}
                step={1}
                value={scenario.liwoMap}
                aria-labelledby={`${id}-size`}
                aria-valuetext={`${kans.label}, ${kans.often}`}
                onChange={(e) => setSize(Number(e.target.value) as LiwoMap)}
              />
            </div>
            <div className="tick-labels" aria-hidden="true">
              <span>klein</span>
              <span>extreem</span>
            </div>
            <p className="toast size-toast" aria-live="polite">
              <Drops n={kans.map} />
              <span>
                <b>{kans.label}.</b> Zo'n overstroming gebeurt gemiddeld {kans.often}, maar kan ook volgend jaar komen.
              </span>
            </p>
          </div>
        )}
      </div>

      {flood ? (
        <p className="hint">
          Hoe groter de overstroming, hoe zeldzamer. Deze gebeurt gemiddeld {kans.often}, maar kan ook volgend jaar komen.
        </p>
      ) : (
        <p className="toast" role="status">
          <Icon name="info" />
          <span>
            Zonder dijken komt de zee tot zeeniveau, NAP 0 meter. Ligt je huiskamer lager, dan staat er water in.
          </span>
        </p>
      )}
    </>
  );
}
