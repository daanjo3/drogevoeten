import type { ReactNode } from "react";
import type { Mode, PlaceData } from "../data/place";
import type { Scenario } from "../lib/scenario";
import { calcScenario, nl, nlRaw, nlSigned } from "../lib/scenario";
import { useAddressHeight } from "../lib/ahn";
import type { LocatieserverDoc } from "../lib/locatieserver";
import { Icon } from "./Icons";
import { Tip } from "./Tip";
import { UnityRoom } from "./UnityRoom";
import { TERMS } from "../data/place";

/* The living room. The team's 3D room will be embedded here as an iframe.
   In risk mode the water rises and the explanation card appears. */
export function HuiskamerPanel({
  place,
  locatie,
  mode,
  scenario,
  loadRoom,
}: {
  place: PlaceData;
  /* the chosen address; its height comes from the AHN */
  locatie?: LocatieserverDoc;
  mode: Mode;
  scenario: Scenario;
  /* start loading the 3D room (only after an address was chosen) */
  loadRoom: boolean;
}) {
  const risk = mode === "risk";
  const r = calcScenario(scenario, place.areaKm2, risk);
  const height = useAddressHeight(locatie);
  const ground = height.data?.ground;
  const nap = ground ? `${nlSigned(ground.value)} m` : height.isError || height.isSuccess ? "onbekend" : "…";

  let explanation: ReactNode;
  if (scenario.dike >= 2) {
    explanation = (
      <>
        De dijk breekt. Het water komt tot <b>{nl(r.level)} meter</b> in de huiskamer. Dat is tot aan de bank of hoger. Een
        gemaal helpt dan niet meer.
      </>
    );
  } else if (!scenario.pump) {
    explanation = (
      <>
        Het gemaal valt uit. Er valt {nlRaw(scenario.rain)} mm regen en niets pompt het weg. Het water in de polder stijgt. In
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
        regen. Gemaal {place.pumpName} pompt {scenario.pump}{" "}
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
        <UnityRoom active={loadRoom} />
        <div className="water" id="water" style={{ height: `${r.percent}%` }} />
        <div className="line" id="line" style={{ bottom: `${r.percent}%` }}>
          waterlijn <b id="lineTxt">{nl(r.level)} m</b>
        </div>
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
          {place.waterArea}
        </span>
        <div id="out" aria-live="polite">
          {explanation}
          <small>
            <Tip
              kind="bron"
              tip="Dit is een rekensom, geen voorspelling. Regen: KNMI, weerstation Vlissingen. Pompkracht: waterschapsregister. De hoogte bij een dijkbreuk is nog een placeholder."
            >
              hoe rekenen we dit?
            </Tip>
          </small>
        </div>
      </div>
    </section>
  );
}
