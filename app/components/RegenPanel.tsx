import { useState, type ReactNode } from "react";
import type { Drainage } from "../lib/drainage";
import type { LocatieserverDoc } from "../lib/locatieserver";
import { locationOf } from "../lib/rijksmuseum";
import { nl } from "../lib/scenario";
import { KNMI_URL, RAIN_STATIONS, type RainStation } from "../data/rain";
import { TERMS } from "../data/place";
import { Icon } from "./Icons";
import { Segment } from "./ScenarioControls";
import { Tip } from "./Tip";

/* "What if it rains hard": a sum, not a model. Ported from the prototype's
   rekenvoorbeeld (renderSim in prototype/app/main.js): rain on the drainage
   area divided by the capacity of the pumps that still run gives the time
   to pump it all away. How high the water comes in the street is left out:
   that needs target levels, open water, soil and a hydrological model. */

type RainPick = "year" | "ever" | "own";

const OWN_MIN = 5;
const OWN_MAX = 150;

function km(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = Math.PI / 180;
  const a =
    Math.sin(((lat2 - lat1) * rad) / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lon2 - lon1) * rad) / 2) ** 2;
  return 12_742 * Math.asin(Math.sqrt(a));
}

function nearestStation(lat: number, lon: number): { station: RainStation; km: number } {
  return RAIN_STATIONS.map((station) => ({ station, km: km(lat, lon, station.lat, station.lon) })).sort(
    (a, b) => a.km - b.km,
  )[0];
}

function mm(n: number): string {
  return `${String(n).replace(".", ",")} mm`;
}

function date(iso: string): string {
  return new Date(iso).toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" });
}

function whole(n: number): string {
  return Math.round(n).toLocaleString("nl-NL");
}

/* "Gemaal Boreel" stays as it is, "Boreel" becomes "gemaal Boreel" */
function gemaal(name: string, cap = false): string {
  if (/^(stoom|electrisch |elektrisch )?gemaal\b/i.test(name)) return name;
  return `${cap ? "Gemaal" : "gemaal"} ${name}`;
}

/* hours as minutes, hours or days, whichever reads best */
function duration(hours: number): string {
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} minuten`;
  if (hours < 48) return `${nl(hours)} uur`;
  return `${nl(hours / 24)} dagen`;
}

export function RegenPanel({
  locatie,
  drainage,
}: {
  /* the chosen address; the nearest KNMI station is picked from it */
  locatie?: LocatieserverDoc;
  /* the drainage area and its 1-2 pumps (IMWA) */
  drainage: Drainage;
}) {
  const [pick, setPick] = useState<RainPick>("ever");
  const [own, setOwn] = useState(30);
  /* ids of the pumps that fail; ids of other addresses are simply ignored */
  const [pumpsOff, setPumpsOff] = useState<string[]>([]);

  const here = locationOf(locatie);
  const near = here ? nearestStation(here.lat, here.lon) : undefined;
  const rain = !near || pick === "own" ? own : pick === "ever" ? near.station.wettestDay.mm : near.station.wettestDayLastYear.mm;

  const { area, pumps } = drainage;
  const running = pumps.filter((p) => !pumpsOff.includes(p.id));
  const capacity = running.reduce((sum, p) => sum + p.capacity, 0);

  const kuub = (
    <Tip kind="term" tip={TERMS.kuub}>
      kuub
    </Tip>
  );

  let result: ReactNode;
  if (!here || drainage.isPending) result = <>We zoeken welk gemaal hier het water wegpompt…</>;
  else if (drainage.isError) result = <>Het waterschapsregister gaf geen antwoord. Probeer het later nog eens.</>;
  else if (!area)
    result = (
      <>
        Het waterschap geeft voor deze plek geen gebied op dat het water afvoert. Dan weten we niet op hoeveel grond de regen
        valt, dus rekenen we niets uit.
      </>
    );
  else if (!pumps.length)
    result = <>We vonden geen gemaal dat water uit jouw gebied wegpompt. Daarom rekenen we niet uit hoe lang het duurt.</>;
  else {
    const m3 = (rain / 1000) * area.areaM2;
    const intro = (
      <>
        Er valt {mm(rain)} regen op {nl(area.areaM2 / 1e6)} km². Dat is <b>{whole(m3)}</b> {kuub} water.
      </>
    );
    if (!running.length)
      result = (
        <>
          {intro} {pumps.length > 1 ? "De gemalen vallen uit" : "Het gemaal valt uit"}, dus niets pompt het weg. Het water
          blijft liggen: gemiddeld {mm(rain)} over het hele gebied, in sloten en lage plekken meer. Hoe hoog het in jouw
          straat komt, rekenen we niet uit.
        </>
      );
    else {
      const hours = m3 / (capacity * 60);
      // what the running pumps can remove in a day, as mm over the area
      const mmPerDay = ((capacity * 1440) / area.areaM2) * 1000;
      result = (
        <>
          {intro} {running.length > 1 ? "De gemalen pompen samen" : `${gemaal(running[0].name, true)} pompt`} {whole(capacity)}{" "}
          {kuub} per minuut. Na ongeveer <b>{duration(hours)}</b> is alles weggepompt.
          {rain > mmPerDay && (
            <> Dat is meer dan de gemalen in een dag aankunnen. Tot het weg is, staat het water hoger in de sloten.</>
          )}
        </>
      );
    }
  }

  const areaKind = area?.kind === "peilgebied" ? "peilgebied" : "afwateringsgebied";
  const source = [
    "Dit is een rekensom, geen voorspelling of model.",
    near
      ? `Regen: KNMI, weerstation ${near.station.name} (${whole(near.km)} km van je adres), dagsommen van ${date(near.station.since)} tot ${date(near.station.until)}.`
      : "Regen: KNMI.",
    area
      ? `De regen valt op ${areaKind} ${area.naam || area.code || "zonder naam"} (${nl(area.areaM2 / 1e6)} km²). We tellen ${pumps.length > 1 ? "de twee grootste gemalen" : "het gemaal"} die water uit dit gebied afvoeren, in het gebied of op de rand${drainage.pumpsFound > pumps.length ? ` (er staan er ${drainage.pumpsFound})` : ""}. Dat een gemaal bij het gebied hoort, leiden wij af: het register legt dat niet vast. Gebied en pompkracht: waterschapsregister (IMWA, PDOK).`
      : "Gebied en pompkracht: waterschapsregister (IMWA, PDOK).",
    "De gemalen pompen op volle kracht en de regen valt overal even hard. Water dat verdampt of in de grond zakt rekenen we niet mee (dan valt het mee), grondwater dat omhoog komt ook niet (dan valt het tegen).",
  ].join(" ");

  return (
    <section className="panel" id="p-regen">
      <span className="meta">rekenvoorbeeld</span>
      <h2>
        <Icon name="pomp" />
        Als het hard regent
      </h2>
      <p className="lead">
        Hoe lang doet {pumps.length > 1 ? "de gemalen" : "het gemaal"} erover om een flinke bui weg te pompen? Kies de regen en
        zet een gemaal uit.
        {area && (
          <>
            {" "}
            Jouw huis ligt in {areaKind === "peilgebied" ? (
              <Tip kind="term" tip={TERMS.peilgebied}>
                peilgebied
              </Tip>
            ) : (
              areaKind
            )}{" "}
            {area.naam || area.code || "zonder naam"}.
          </>
        )}
      </p>

      <Segment
        label="regen op één dag"
        value={near ? pick : "own"}
        onPick={setPick}
        options={[
          ...(near
            ? [
                { label: "Natste dag afgelopen jaar", sub: mm(near.station.wettestDayLastYear.mm), value: "year" as const },
                { label: "Natste dag ooit", sub: mm(near.station.wettestDay.mm), value: "ever" as const },
              ]
            : []),
          { label: "Zelf kiezen", sub: mm(own), value: "own" as const },
        ]}
      />
      {near && pick !== "own" ? (
        <p className="hint">
          Gemeten door het KNMI in {near.station.name}, {whole(near.km)} km van je adres, op{" "}
          {date(pick === "ever" ? near.station.wettestDay.date : near.station.wettestDayLastYear.date)}.{" "}
          <Tip kind="term" tip={TERMS.mm}>
            Wat is een mm?
          </Tip>
        </p>
      ) : (
        <p className="hint">
          <input
            type="range"
            className="mm"
            min={OWN_MIN}
            max={OWN_MAX}
            step={5}
            value={own}
            aria-label="Regen in millimeter"
            onChange={(e) => setOwn(Number(e.target.value))}
          />
        </p>
      )}

      {pumps.map((p) => (
        <Segment
          key={p.id}
          label={gemaal(p.name)}
          value={pumpsOff.includes(p.id) ? 0 : 1}
          onPick={(on) => setPumpsOff((off) => (on ? off.filter((id) => id !== p.id) : [...off, p.id]))}
          options={[
            { label: "Aan", sub: `${whole(p.capacity)} kuub/min`, value: 1 },
            { label: "Valt uit", value: 0 },
          ]}
        />
      ))}

      <div className="uitkomst" aria-live="polite">
        {result}
        <small>
          <Tip kind="bron" tip={source}>
            hoe rekenen we dit?
          </Tip>{" "}
          <a href={near ? `${KNMI_URL}?stns=${near.station.stn}&vars=RH` : KNMI_URL} target="_blank" rel="noreferrer">
            KNMI
          </a>
        </small>
      </div>
    </section>
  );
}
