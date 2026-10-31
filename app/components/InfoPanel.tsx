import type { ReactNode } from "react";
import type { Mode, PlaceData } from "../data/place";
import { TERMS } from "../data/place";
import { useAddressHeight } from "../lib/ahn";
import type { LocatieserverDoc } from "../lib/locatieserver";
import type { Drainage } from "../lib/drainage";
import { nl, nlSigned, type Scenario } from "../lib/scenario";
import { Icon } from "./Icons";
import { ScenarioControls } from "./ScenarioControls";
import { Tip } from "./Tip";

/* Panel next to the living room. Mode "info" tells the story of the address,
   mode "risk" shows the scenario buttons. The css crossfades between them. */
export function InfoPanel({
  place,
  locatie,
  drainage,
  mode,
  scenario,
  onScenario,
  onClose,
}: {
  place: PlaceData;
  /* the chosen address; its height comes from the AHN */
  locatie?: LocatieserverDoc;
  /* the drainage area and its 1-2 pumps (IMWA) */
  drainage: Drainage;
  mode: Mode;
  scenario: Scenario;
  onScenario: (s: Scenario) => void;
  /* the cross on the scenario panel: back to info mode */
  onClose: () => void;
}) {
  const height = useAddressHeight(locatie);
  const ground = height.data?.ground;

  let heightText: ReactNode;
  if (ground) {
    const m = Math.round(Math.abs(ground.value) * 10) / 10;
    heightText = (
      <>
        {m === 0 ? "Je huiskamer ligt precies op " : `Je huiskamer ligt ${nl(m)} meter ${ground.value >= 0 ? "boven" : "onder"} `}
        <Tip kind="term" tip={TERMS.zeeniveau}>
          zeeniveau
        </Tip>
        .
      </>
    );
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

  const pumps = drainage.pumps;
  const board = (pumps[0]?.waterbeheerder ?? drainage.area?.waterbeheerder)?.replace(/^Waterschap\s+/i, "");
  const gemaal = (
    <Tip kind="term" tip={TERMS.gemaal}>
      {pumps.length > 1 ? "gemalen" : "gemaal"}
    </Tip>
  );
  const waterschap = (
    <Tip kind="term" tip={TERMS.waterschap}>
      waterschap
    </Tip>
  );
  let pumpText: ReactNode;
  if (pumps.length) {
    pumpText = (
      <>
        Elke dag {pumps.length > 1 ? "pompen" : "pompt"} {gemaal} {pumps.map((p) => p.name).join(" en ")} het water uit jouw{" "}
        <Tip kind="term" tip={TERMS.polder}>
          polder
        </Tip>
        .{board && (
          <>
            {" "}
            {pumps.length > 1 ? "Ze zijn" : "Dat gemaal is"} van {waterschap} {board}.
          </>
        )}
      </>
    );
  } else if (drainage.isPending) {
    pumpText = "We zoeken welk gemaal het water hier wegpompt…";
  } else if (drainage.isError) {
    pumpText = "Het waterschapsregister gaf geen antwoord. Probeer het later nog eens.";
  } else {
    pumpText = (
      <>
        We vonden geen {gemaal} dat het water uit jouw gebied wegpompt
        {board && (
          <>
            . Het water valt onder {waterschap} {board}
          </>
        )}
        .
      </>
    );
  }

  return (
    <section className="panel" id="p-info" data-mode={mode}>
      <div className="mode m-info" aria-hidden={mode !== "info"}>
        <h2 id="huisAdres">{place.address}</h2>
        <p>{heightText}</p>
        <p>{pumpText}</p>
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
        <ScenarioControls place={place} drainage={drainage} scenario={scenario} onChange={onScenario} />
      </div>
    </section>
  );
}
