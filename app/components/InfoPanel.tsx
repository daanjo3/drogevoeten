import type { Mode, PlaceData } from "../data/place";
import { TERMS } from "../data/place";
import type { Scenario } from "../lib/scenario";
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
}: {
  place: PlaceData;
  mode: Mode;
  scenario: Scenario;
  onScenario: (s: Scenario) => void;
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
        <p>Dit is de huiskamer op dit adres. De vloer ligt 2 meter boven de zee. Dat klinkt veilig. Maar het land eromheen ligt lager.</p>
        <p>
          Elke dag pompt{" "}
          <Tip kind="term" tip={TERMS.gemaal}>
            gemaal
          </Tip>{" "}
          {place.pumpName} het water weg. Het gemaal is van{" "}
          <Tip kind="term" tip={TERMS.waterschap}>
            waterschap
          </Tip>{" "}
          Scheldestromen. Zonder dat gemaal loopt de{" "}
          <Tip kind="term" tip={TERMS.polder}>
            polder
          </Tip>{" "}
          langzaam vol.
        </p>
        <p>Dit land werd rond het jaar 1200 droog gemaakt. Kijk bij Tijdreis hoe dat ging.</p>
      </div>
      <div className="mode m-risk" aria-hidden={mode !== "risk"}>
        <h2>
          <Icon name="pomp" />
          Kies wat er gebeurt
        </h2>
        <p className="sub">Kijk daarna naar de waterlijn.</p>
        <ScenarioControls place={place} scenario={scenario} onChange={onScenario} />
      </div>
    </section>
  );
}
