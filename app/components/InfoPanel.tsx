import type { Mode, PlaceData } from "../data/place";
import { TERMS } from "../data/place";
import { nl, type Scenario } from "../lib/scenario";
import { Icon } from "./Icons";
import { ScenarioControls } from "./ScenarioControls";
import { Tip } from "./Tip";

/* Panel next to the living room. Mode "info" tells the story of the address,
   mode "risk" shows the scenario buttons. The css crossfades between them. */
export function InfoPanel({
  place,
  mode,
  scenario,
  onScenario,
  onClose,
}: {
  place: PlaceData;
  mode: Mode;
  scenario: Scenario;
  onScenario: (s: Scenario) => void;
  /* the cross on the scenario panel: back to info mode */
  onClose: () => void;
}) {
  return (
    <section className="panel" id="p-info" data-mode={mode}>
      <div className="mode m-info" aria-hidden={mode !== "info"}>
        <span className="meta">
          <Tip kind="bron" tip="Hoogte: Actueel Hoogtebestand Nederland (AHN). Gemaal: waterschapsregister (IMWA). Jaartal: Provincie Zeeland.">
            bronnen
          </Tip>
        </span>
        <h2 id="huisAdres" style={{ paddingRight: 120 }}>
          {place.address}
        </h2>
        <p>
          Je voordeur ligt {nl(Math.abs(place.nap))} meter {place.nap >= 0 ? "boven" : "onder"} de zee.
        </p>
        <p>
          Elke dag pompt{" "}
          <Tip kind="term" tip={TERMS.gemaal}>
            gemaal
          </Tip>{" "}
          {place.pumpName} het water uit jouw{" "}
          <Tip kind="term" tip={TERMS.polder}>
            polder
          </Tip>
          . Dat gemaal is van{" "}
          <Tip kind="term" tip={TERMS.waterschap}>
            waterschap
          </Tip>{" "}
          {place.waterBoard}.
        </p>
        <p>Dit land werd rond {place.drainedYear} droog gemaakt. In de tijdreis zie je hoe.</p>
      </div>
      <div className="mode m-risk" aria-hidden={mode !== "risk"}>
        <button type="button" className="close" aria-label="Sluiten" onClick={onClose}>
          <Icon name="close" />
        </button>
        <h2>
          <Icon name="drop" />
          Kies wat er gebeurt
        </h2>
        <p className="lead">Kijk daarna naar de waterlijn.</p>
        <ScenarioControls place={place} scenario={scenario} onChange={onScenario} />
      </div>
    </section>
  );
}
