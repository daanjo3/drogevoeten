import type { ReactNode } from "react";
import type { Mode } from "../data/place";
import type { Scenario } from "../lib/scenario";
import { nl, nlSigned, waterInRoom } from "../lib/scenario";
import { useAddressHeight } from "../lib/ahn";
import type { LocatieserverDoc } from "../lib/locatieserver";
import { locationOf } from "../lib/rijksmuseum";
import { liwoClass, useLiwo } from "../lib/liwo";
import { Icon } from "./Icons";
import { FullscreenSheet } from "./FullscreenSheet";
import { ScenarioControls, ViewSegment } from "./ScenarioControls";
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
  onView,
  fullRequest,
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
  /* camera view in the 3D room: the room or the whole house (risk panel and fullscreen room) */
  view: RoomView;
  onView: (v: RoomView) => void;
  /* goes up by one when the page wants the room fullscreen */
  fullRequest: number;
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
  /* the water height is known: the flood map answered, or (no dikes) the ground level is known */
  const known = scenario.outside === "flood" ? liwo.isSuccess : !!ground;

  /* The card over the room: first what happens to your living room, in bold,
     then why. Active and short, so it reads well on the digibord. */
  let explanation: ReactNode;
  const ceiling = r.depth > r.level ? " Dat is hoger dan het plafond." : "";
  const sea = (
    <Tip kind="term" tip={TERMS.zeeniveau}>
      zeeniveau
    </Tip>
  );
  if (scenario.outside === "flood") {
    const often = (
      <Tip kind="term" tip={TERMS.kans}>
        gemiddeld {kans.often}
      </Tip>
    );
    if (liwo.isPending) explanation = <>We kijken op de overstromingskaart hoe hoog het water hier komt…</>;
    else if (liwo.isError) explanation = <>De overstromingskaart gaf geen antwoord. Probeer het later nog eens.</>;
    else if (!r.depth)
      explanation = (
        <>
          <b>Je huiskamer blijft droog.</b> Ook bij een {kans.adj} overstroming komt het water niet tot hier. Zo'n overstroming
          gebeurt {often}.
        </>
      );
    else
      explanation = (
        <>
          <b>Het water staat {nl(r.depth)} meter hoog in je huiskamer.</b>
          {ceiling} Dat gebeurt bij een {kans.adj} overstroming, door een zware storm, een hoge rivier of een dijk die breekt.
          Zo'n overstroming gebeurt {often}.
        </>
      );
  } else {
    if (!ground)
      explanation = height.isPending ? (
        <>We zoeken op hoe hoog je huiskamer ligt…</>
      ) : (
        <>We weten niet hoe hoog je huiskamer ligt. Daarom kunnen we niet laten zien hoe hoog het water zonder dijken komt.</>
      );
    else if (r.depth > 0)
      explanation = (
        <>
          <b>Zonder dijken staat het water {nl(r.depth)} meter hoog in je huiskamer.</b>
          {ceiling} De zee komt dan tot {sea}, en je huiskamer ligt lager.
        </>
      );
    else
      explanation = (
        <>
          <b>Zonder dijken blijft je huiskamer droog.</b> De zee komt tot {sea}, en je huiskamer ligt hoger. Bij storm kan het
          water wel hoger komen.
        </>
      );
  }

  /* how high the water is, in one line, for the fullscreen room */
  const fsOut = (
    <p className="fs-out" aria-live="polite">
      {!known ? (
        "We kijken hoe hoog het water komt…"
      ) : r.depth ? (
        <>
          Het water staat <b>{nl(r.depth)} meter</b> hoog in je huiskamer.
        </>
      ) : (
        "Je huiskamer blijft droog."
      )}
    </p>
  );

  return (
    <section className={`panel${risk ? " risk" : ""}`} id="p-huis">
      <div className="room">
        {/* in info mode the room is dry */}
        <UnityRoom
          active={loadRoom}
          waterLevel={risk ? r.level : 0}
          view={view}
          fullRequest={fullRequest}
          overlay={
            <>
              {/* desktop: panel top left, in risk mode only */}
              {risk && (
                <div className="fs-panel">
                  <strong className="fs-title">
                    <Icon name="drop" /> Als het misgaat
                  </strong>
                  {fsOut}
                  <ViewSegment view={view} onView={onView} />
                  <ScenarioControls scenario={scenario} onChange={onScenario} />
                </div>
              )}
              {/* phones: the water height and the camera at the top, the choices in a sheet at the bottom */}
              <div className="fs-top">
                {risk && fsOut}
                <ViewSegment view={view} onView={onView} />
              </div>
              <FullscreenSheet onOpen={() => onMode("risk")}>
                <ScenarioControls scenario={scenario} onChange={onScenario} />
              </FullscreenSheet>
            </>
          }
        />
        {/* the heading of the room: a question, and in risk mode the answer once we know it */}
        <span className="tag" id="huisTag">
          {!risk || !known
            ? "Hoe hoog komt het water in je huiskamer?"
            : r.depth
              ? "Zo hoog komt het water in je huiskamer"
              : "Hier blijft je huiskamer droog"}
        </span>
        <Icon name="huis" className="icon" />
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
              hoe berekenen we dit?
            </Tip>
          </small>
        </div>
      </div>
    </section>
  );
}
