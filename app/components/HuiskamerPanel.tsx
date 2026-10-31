import type { ReactNode } from "react";
import type { Mode } from "../data/place";
import type { Scenario } from "../lib/scenario";
import { calcScenario, nl, nlRaw, nlSigned } from "../lib/scenario";
import { useAddressHeight } from "../lib/ahn";
import type { LocatieserverDoc } from "../lib/locatieserver";
import type { Drainage } from "../lib/drainage";
import { usePeilgebied } from "../lib/waterbeheergebieden";
import { locationOf } from "../lib/rijksmuseum";
import { useLiwo } from "../lib/liwo";
import { Icon } from "./Icons";
import { Tip } from "./Tip";
import { UnityRoom } from "./UnityRoom";
import { TERMS } from "../data/place";

/* The living room: the team's 3D Unity room. In risk mode the water in the
   room rises to the scenario's level and the explanation card appears. */
export function HuiskamerPanel({
  locatie,
  drainage,
  mode,
  scenario,
  loadRoom,
}: {
  /* the chosen address; its height comes from the AHN */
  locatie?: LocatieserverDoc;
  /* the drainage area and its 1-2 pumps; the scenario uses their capacity */
  drainage: Drainage;
  mode: Mode;
  scenario: Scenario;
  /* start loading the 3D room (only after an address was chosen) */
  loadRoom: boolean;
}) {
  const risk = mode === "risk";
  const running = drainage.pumps.filter((p) => !scenario.pumpsOff.includes(p.id));
  const known = !!drainage.area && drainage.pumps.length > 0;
  const capacity = running.reduce((sum, p) => sum + p.capacity, 0);
  const here = locationOf(locatie);
  const height = useAddressHeight(locatie);
  const ground = height.data?.ground;
  // the extreme LIWO map: the dike-break button
  const liwo = useLiwo(here?.lat, here?.lon);
  const outside =
    scenario.dike === "breaks" ? (liwo.data ?? null) : scenario.dike === "none" && ground ? -ground.value : null;
  const r = calcScenario(scenario, {
    areaM2: known ? drainage.area!.areaM2 : null,
    capacity: known ? capacity : null,
    outside,
  });
  const { peilgebied } = usePeilgebied(here?.lat, here?.lon);
  const pg = peilgebied?.properties;
  const pgName = pg ? pg.code || pg.naam || "zonder naam" : here ? "onbekend" : "…";
  const names = (ps: { name: string }[]) => ps.map((p) => p.name).join(" en ");
  const nap = ground ? `${nlSigned(ground.value)} m` : height.isError || height.isSuccess ? "onbekend" : "…";

  let explanation: ReactNode;
  const deep = (
    <>
      <b>{nl(r.depth)} meter</b> hoog.{r.depth > r.level && " Dat is hoger dan je huiskamer!"}
    </>
  );
  if (scenario.dike === "breaks") {
    if (liwo.isPending) explanation = <>We kijken op de overstromingskaart hoe hoog het water komt…</>;
    else if (liwo.isError) explanation = <>De overstromingskaart gaf geen antwoord. Probeer het later nog eens.</>;
    else if (!r.depth)
      explanation = (
        <>
          De dijk breekt. Toch komt het water niet tot hier. Volgens de overstromingskaart blijft jouw huis droog, ook als het
          heel erg misgaat.
        </>
      );
    else
      explanation = (
        <>
          De dijk breekt en het water stroomt de polder in. In de huiskamer staat het {deep} Een gemaal helpt dan niet meer.
        </>
      );
  } else if (scenario.dike === "none") {
    const sea = (
      <Tip kind="term" tip={TERMS.zeeniveau}>
        zeeniveau
      </Tip>
    );
    if (!ground)
      explanation = height.isPending ? (
        <>We zoeken op hoe hoog je huiskamer ligt…</>
      ) : (
        <>We weten niet hoe hoog je huiskamer ligt. Daarom weten we niet hoe hoog de zee hier zou komen.</>
      );
    else if (r.depth > 0)
      explanation = (
        <>
          Stel dat er geen dijken zijn. Dan komt de zee tot {sea}. Je huiskamer ligt lager, dus het water staat {deep}
        </>
      );
    else
      explanation = (
        <>
          Stel dat er geen dijken zijn. Je huiskamer ligt hoger dan {sea}, dus je voeten blijven droog. Bij storm kan de zee
          wel hoger komen.
        </>
      );
  } else if (!known) {
    explanation = drainage.isPending ? (
      <>We zoeken welk gemaal hier het water wegpompt…</>
    ) : (
      <>
        We weten niet welk gemaal het water hier wegpompt. Daarom rekenen we niet uit wat de regen doet.
      </>
    );
  } else if (!running.length) {
    explanation = (
      <>
        {drainage.pumps.length > 1 ? "De gemalen vallen uit" : "Het gemaal valt uit"}. Er valt {nlRaw(scenario.rain)} mm regen en niets pompt het weg. Het water in de polder stijgt. In
        de huiskamer staat het op <b>{nl(r.level)} meter</b>.
      </>
    );
  } else {
    explanation = (
      <>
        Er valt {nlRaw(scenario.rain)}{" "}
        <Tip kind="term" tip={TERMS.mm}>
          mm
        </Tip>{" "}
        regen. {running.length > 1 ? "De gemalen" : "Gemaal"} {names(running)}{" "}
        {running.length > 1 ? "pompen samen" : "pompt"} {Math.round(capacity)}{" "}
        <Tip kind="term" tip={TERMS.kuub}>
          kuub
        </Tip>{" "}
        per minuut. Na ongeveer <b>{nl(r.hours)} uur</b> is alles weg. Jouw voeten blijven droog.
      </>
    );
  }

  return (
    <section className={`panel${risk ? " risk" : ""}`} id="p-huis">
      <div className="room">
        {/* in info mode the room is dry */}
        <UnityRoom active={loadRoom} waterLevel={risk ? r.level : 0} />
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
                scenario.dike === "breaks"
                  ? "Dit is geen voorspelling. De hoogte komt van de overstromingskaart LIWO van Rijkswaterstaat (gemaakt door Deltares): de grootste waterdiepte hier bij een dijkdoorbraak, uit veel doorgerekende doorbraken die nooit allemaal tegelijk gebeuren. We nemen de kaart voor de zwaarste overstromingen, met een kans van minder dan 1 op 30.000 per jaar (dezelfde kaart als overstroomik.nl). We rekenen vanaf de grond; je drempel ligt vaak iets hoger."
                  : scenario.dike === "none"
                    ? `Dit is geen voorspelling. Zonder dijken staat de zee op gemiddeld zeeniveau, NAP 0 m. Je huiskamer ligt op ${ground ? `${nlSigned(ground.value)} m NAP` : "een onbekende hoogte"} (Actueel Hoogtebestand Nederland, AHN). Het verschil is de waterhoogte. Eb, vloed en storm rekenen we niet mee.`
                    : `Dit is een rekensom, geen voorspelling. Regen: KNMI, weerstation Vlissingen. ${
                        known
                          ? `De regen valt op ${drainage.area!.kind === "peilgebied" ? "peilgebied" : "afwateringsgebied"} ${drainage.area!.naam || drainage.area!.code || "zonder naam"} (${nl(drainage.area!.areaM2 / 1e6)} km²). We tellen ${drainage.pumps.length > 1 ? "de twee grootste gemalen" : "het gemaal"} die water uit dit gebied afvoeren, in het gebied of op de rand${drainage.pumpsFound > drainage.pumps.length ? ` (er staan er ${drainage.pumpsFound})` : ""}. Dat een gemaal bij het gebied hoort, leiden wij af: het register legt dat niet vast.`
                          : "Voor dit adres vonden we geen gebied met een gemaal dat het water afvoert."
                      } Pompkracht en gebied: waterschapsregister (IMWA, PDOK).`
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
