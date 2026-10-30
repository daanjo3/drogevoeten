import type { ReactNode } from "react";
import type { Mode, PlaceData } from "../data/place";
import type { Scenario } from "../lib/scenario";
import { calcScenario, nl, nlRaw } from "../lib/scenario";
import { Icon } from "./Icons";
import { Tip } from "./Tip";
import { TERMS } from "../data/place";

/* The living room. The team's 3D room will be embedded here as an iframe.
   In risk mode the water rises and the explanation card appears. */
export function HuiskamerPanel({ place, mode, scenario }: { place: PlaceData; mode: Mode; scenario: Scenario }) {
  const risk = mode === "risk";
  const r = calcScenario(scenario, place.areaKm2, risk);

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
        per minuut. Na ongeveer <b>{nl(r.hours)} uur</b> is alles weg. Jullie voeten blijven droog.
      </>
    );
  }

  return (
    <section className={`panel${risk ? " risk" : ""}`} id="p-huis">
      <div className="room">
        {/* placeholder for the team's 3D room */}
        <img className="scene" src="/img/huiskamer-3d.png" alt="" />
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
          +{nl(place.nap)} m
          <br />
          <Tip kind="term" tip={TERMS.peilgebied}>
            peilgebied
          </Tip>{" "}
          {place.waterArea}
        </span>
        <div className="iframe" style={{ color: "#fff" }}>placeholder · hier komt de 3D-huiskamer</div>
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
