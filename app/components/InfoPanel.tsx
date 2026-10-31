import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Mode, PlaceData } from "../data/place";
import { TERMS } from "../data/place";
import { useAddressHeight } from "../lib/ahn";
import type { LocatieserverDoc } from "../lib/locatieserver";
import type { Drainage } from "../lib/drainage";
import { useFlood1953 } from "../lib/flood1953";
import { locationOf } from "../lib/rijksmuseum";
import { drainedQueryOptions } from "../lib/timeline";
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

  /* only when the 1953 flood map says this place flooded; elsewhere nothing */
  const flood = useFlood1953(locatie).data;
  const watersnoodramp = (
    <Tip kind="term" tip={TERMS.watersnoodramp}>
      watersnoodramp
    </Tip>
  );
  const floodText = flood && (
    <>
      In 1953 liep jouw adres onder water. Bij de {watersnoodramp}{" "}
      {flood.salt === "zout"
        ? "stroomde hier zout zeewater het land in."
        : flood.salt === "zoet"
          ? "stond hier zoet water."
          : "stond hier water."}
    </>
  );
  const floodSource = flood
    ? ` Watersnoodramp: kaart "Historische Inundatie Ramp 1953" van de ${flood.publisher} (${flood.metadata}). Die kaart dekt alleen Noord-Brabant en zegt niet hoe diep het water stond.`
    : "";

  /* only when the linked data has an embankment or reclamation with a year
     for the polder this address lies in; elsewhere nothing */
  const drained = useQuery(drainedQueryOptions(locationOf(locatie))).data;
  const drainedText = drained && (
    <>
      Dit land werd {drained.when} {drained.kind === "indijking" ? "ingedijkt" : "drooggemaakt"}. In de tijdreis zie je
      hoe.
    </>
  );
  const drainedSource = drained ? ` Jaartal: ${drained.source}` : "";

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
  if (locatie?.type === "woonplaats") {
    // a town gives its centre point, often on canal or boezem water, so no pump can be tied to it
    pumpText = (
      <>
        Om te zien welke{" "}
        <Tip kind="term" tip={TERMS.gemaal}>
          gemalen
        </Tip>{" "}
        je voeten droog houden, vul je hele adres in.
      </>
    );
  } else if (pumps.length) {
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
        {drainedText && <p>{drainedText}</p>}
        {floodText && <p>{floodText}</p>}
        <p className="src">
          <Tip kind="bron" tip={`${heightSource} Gemaal: waterschapsregister (IMWA).${drainedSource}${floodSource}`}>
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
        <p className="lead">Kies een overstroming of kijk wat er zonder dijken gebeurt. Je ziet dan hoe hoog het water in je huiskamer kan komen.</p>
        <ScenarioControls scenario={scenario} onChange={onScenario} />
      </div>
    </section>
  );
}
