import type { Mode, PlaceData } from "../data/place";
import { TERMS } from "../data/place";
import { useAddressHeight } from "../lib/ahn";
import type { LocatieserverDoc } from "../lib/locatieserver";
import { nl, nlSigned, type Scenario } from "../lib/scenario";
import { Icon } from "./Icons";
import { ScenarioControls } from "./ScenarioControls";
import { Tip } from "./Tip";

/* Panel next to the living room. Mode "info" tells the story of the address,
   mode "risk" shows the scenario buttons. The css crossfades between them. */
export function InfoPanel({
  place,
  locatie,
  mode,
  scenario,
  onScenario,
  onClose,
}: {
  place: PlaceData;
  /* the chosen address; its height comes from the AHN */
  locatie?: LocatieserverDoc;
  mode: Mode;
  scenario: Scenario;
  onScenario: (s: Scenario) => void;
  /* the cross on the scenario panel: back to info mode */
  onClose: () => void;
}) {
  const height = useAddressHeight(locatie);
  const ground = height.data?.ground;

  let heightText: string;
  if (ground) {
    heightText = `Je huiskamer ligt ${nl(Math.abs(ground.value))} meter ${ground.value >= 0 ? "boven" : "onder"} de zee.`;
  } else if (height.isError) {
    heightText = "Het hoogtebestand gaf geen antwoord. Probeer het later nog eens.";
  } else if (height.isSuccess) {
    heightText = "Hoe hoog je huiskamer ligt, konden we hier niet vinden.";
  } else {
    heightText = "We zoeken op hoe hoog je huiskamer ligt…";
  }
  const heightSource = ground
    ? `Hoogte: Actueel Hoogtebestand Nederland (AHN), ${nlSigned(ground.value)} m NAP. Gemeten op de grond ${nl(ground.distance)} meter van je adres, want onder een huis meet het AHN de grond niet. Je drempel ligt vaak iets hoger.`
    : "Hoogte: Actueel Hoogtebestand Nederland (AHN).";

  return (
    <section className="panel" id="p-info" data-mode={mode}>
      <div className="mode m-info" aria-hidden={mode !== "info"}>
        <h2 id="huisAdres">{place.address}</h2>
        <p>{heightText}</p>
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
        <p className="src">
          <Tip kind="bron" tip={`${heightSource} Gemaal: waterschapsregister (IMWA). Jaartal: Provincie Zeeland.`}>
            bron
          </Tip>
        </p>
      </div>
      <div className="mode m-risk" aria-hidden={mode !== "risk"}>
        <button type="button" className="close" aria-label="Sluiten" onClick={onClose}>
          <Icon name="close" />
        </button>
        <h2>
          <Icon name="drop" />
          Als het misgaat
        </h2>
        <p className="lead">Laat het hard regenen, zet het gemaal uit of breek de dijk. Dan zie je hoe hoog het water in je huiskamer komt.</p>
        <ScenarioControls place={place} scenario={scenario} onChange={onScenario} />
      </div>
    </section>
  );
}
