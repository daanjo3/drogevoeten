import type { ReactNode } from "react";
import type { Mode } from "../data/place";
import type { Scenario } from "../lib/scenario";
import { nl, nlSigned, waterInRoom } from "../lib/scenario";
import { useAddressHeight } from "../lib/ahn";
import type { LocatieserverDoc } from "../lib/locatieserver";
import { usePeilgebied } from "../lib/waterbeheergebieden";
import { locationOf } from "../lib/rijksmuseum";
import { liwoClass, useLiwo } from "../lib/liwo";
import { Icon } from "./Icons";
import { FullscreenSheet } from "./FullscreenSheet";
import { ScenarioControls } from "./ScenarioControls";
import { Tip } from "./Tip";
import { UnityRoom, type RoomView } from "./UnityRoom";
import { TERMS } from "../data/place";

/* The living room: the team's 3D Unity room. In risk mode the water in the
   room rises to the scenario's level and the explanation card appears. */
export function HuiskamerPanel({
  locatie,
  mode,
  onMode,
  scenario,
  onScenario,
  loadRoom,
  view,
}: {
  /* the chosen address; its height comes from the AHN */
  locatie?: LocatieserverDoc;
  mode: Mode;
  /* the sheet in the fullscreen room (phones) switches to risk mode when it opens */
  onMode: (m: Mode) => void;
  scenario: Scenario;
  /* the scenario buttons also live in the fullscreen view of the room */
  onScenario: (s: Scenario) => void;
  /* start loading the 3D room (only after an address was chosen) */
  loadRoom: boolean;
  /* camera view in the 3D room (temporary switch in the risk panel) */
  view: RoomView;
}) {
  const risk = mode === "risk";
  const here = locationOf(locatie);
  const height = useAddressHeight(locatie);
  const ground = height.data?.ground;
  // the LIWO map for the chosen probability class
  const liwo = useLiwo(scenario.liwoMap, here?.lat, here?.lon);
  const kans = liwoClass(scenario.liwoMap);
  const outside =
    scenario.outside === "flood" ? (liwo.data ?? null) : scenario.outside === "nodikes" && ground ? -ground.value : null;
  const r = waterInRoom(outside);
  const { peilgebied } = usePeilgebied(here?.lat, here?.lon);
  const pg = peilgebied?.properties;
  const pgName = pg ? pg.code || pg.naam || "zonder naam" : here ? "onbekend" : "…";
  const nap = ground ? `${nlSigned(ground.value)} m` : height.isError || height.isSuccess ? "onbekend" : "…";

  let explanation: ReactNode;
  const deep = (
    <>
      <b>{nl(r.depth)} meter</b> hoog{r.depth > r.level ? ", hoger dan het plafond van de huiskamer" : ""}.
    </>
  );
  if (scenario.outside === "flood") {
    const chance = (
      <Tip kind="term" tip={TERMS.kans}>
        kans
      </Tip>
    );
    const which = kans.odds ? (
      <>
        Bij overstromingen met een {chance} van {kans.map === 1 ? "meer dan " : ""}1 op {kans.odds} per jaar
        {kans.map === 1 ? "" : " of groter"}
      </>
    ) : (
      <>Bij alle overstromingen die hier kunnen voorkomen, ook die met de kleinste {chance},</>
    );
    if (liwo.isPending) explanation = <>We kijken op de overstromingskaart hoe hoog het water komt…</>;
    else if (liwo.isError) explanation = <>De overstromingskaart gaf geen antwoord. Probeer het later nog eens.</>;
    else if (!r.depth)
      explanation = <>{which} blijft het hier volgens de overstromingskaart droog.</>;
    else
      explanation = (
        <>
          {which} staat het water volgens de overstromingskaart in je huiskamer {deep} Zo'n overstroming kan ontstaan door
          een zware storm, een hoge rivier of een dijkdoorbraak.
        </>
      );
  } else if (scenario.outside === "nodikes") {
    const sea = (
      <Tip kind="term" tip={TERMS.zeeniveau}>
        zeeniveau
      </Tip>
    );
    if (!ground)
      explanation = height.isPending ? (
        <>We zoeken op hoe hoog je huiskamer ligt…</>
      ) : (
        <>De hoogte van je huiskamer is niet bekend. Daarom kunnen we niet laten zien hoe hoog het water zonder dijken zou komen.</>
      );
    else if (r.depth > 0)
      explanation = (
        <>
          Zonder dijken komt het water tot {sea}. Je huiskamer ligt lager, dus het water staat daar {deep}
        </>
      );
    else
      explanation = (
        <>
          Zonder dijken komt het water tot {sea}. Je huiskamer ligt hoger en blijft dus droog. Bij storm kan het water wel
          hoger komen.
        </>
      );
  }

  /* the scenario choices and the water depth, in the fullscreen room */
  const fsBody = (
    <>
      <ScenarioControls scenario={scenario} onChange={onScenario} />
      <p className="fs-out" aria-live="polite">
        {scenario.outside === "flood" && liwo.isPending ? (
          "We kijken hoe hoog het water komt…"
        ) : r.depth ? (
          <>
            Water in je huiskamer: <b>{nl(r.depth)} meter</b>
          </>
        ) : (
          "Hier blijft het droog."
        )}
      </p>
    </>
  );

  return (
    <section className={`panel${risk ? " risk" : ""}`} id="p-huis">
      <div className="room">
        {/* in info mode the room is dry */}
        <UnityRoom
          active={loadRoom}
          waterLevel={risk ? r.level : 0}
          view={view}
          overlay={
            <>
              {/* desktop: panel top left, in risk mode only */}
              {risk && (
                <div className="fs-panel">
                  <strong className="fs-title">
                    <Icon name="drop" /> Als het misgaat
                  </strong>
                  {fsBody}
                </div>
              )}
              {/* phones: bar at the bottom that slides the same choices up */}
              <FullscreenSheet onOpen={() => onMode("risk")}>{fsBody}</FullscreenSheet>
            </>
          }
        />
        <span className="tag" id="huisTag">{risk ? "WELKOM THUIS · als het misgaat" : "WELKOM THUIS"}</span>
        <Icon name="huis" className="icon" />
        <span className="meta">
          <Tip kind="term" tip={TERMS.NAP}>
            NAP
          </Tip>{" "}
          {nap}
          <br />
          <Tip kind="term" tip={TERMS.peilgebied}>
            peilgebied
          </Tip>{" "}
          {pgName}
        </span>
        <div id="out" aria-live="polite">
          {explanation}
          <small>
            <Tip
              kind="bron"
              tip={
                scenario.outside === "flood"
                  ? `Dit is geen voorspelling. De hoogte komt van de overstromingskaart LIWO van Rijkswaterstaat (gemaakt door Deltares), kaart "${kans.name}" (${kans.probability}). Die kaart toont de grootste waterdiepte boven de grond uit alle doorgerekende overstromingen met deze kans of een grotere: door storm of hoog water buiten de dijken, een dijk die doorbreekt, of sloten en kanalen die overlopen. Die gebeuren nooit allemaal tegelijk. Het water kan hoger komen dan zeeniveau, want bij storm of een hoge rivier staat het water buiten de dijk veel hoger dan normaal. De kaart geldt voor nu; klimaatverandering zit er niet in. Je drempel ligt vaak iets hoger dan de grond.`
                  : `Dit is geen voorspelling. Zonder dijken staat de zee op gemiddeld zeeniveau, NAP 0 m. Je huiskamer ligt op ${ground ? `${nlSigned(ground.value)} m NAP` : "een onbekende hoogte"} (Actueel Hoogtebestand Nederland, AHN). Het verschil is de waterhoogte. Eb, vloed en storm rekenen we niet mee.`
              }
            >
              hoe rekenen we dit?
            </Tip>
          </small>
        </div>
      </div>
    </section>
  );
}
