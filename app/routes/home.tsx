import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import { MIDDELBURG, type Mode } from "../data/place";
import type { Scenario } from "../lib/scenario";
import { Canvas, useCanvas } from "../components/Canvas";
import { SvgSymbols } from "../components/Icons";
import { TooltipLayer } from "../components/Tip";
import { HuiskamerPanel } from "../components/HuiskamerPanel";
import { InfoPanel } from "../components/InfoPanel";
import type { RoomView } from "../components/UnityRoom";
import { TijdreisPanel } from "../components/TijdreisPanel";
import { BuurtPanel } from "../components/BuurtPanel";
import { GemaalPanel } from "../components/GemaalPanel";
import { NlMap } from "../components/NlMap";
import { RijksTile, worksFor, type RijksWork } from "../components/ImageTile";
import { FloatingNav, type NavTarget } from "../components/FloatingNav";
import { MiniMap } from "../components/MiniMap";
import { AboutCard } from "../components/AboutCard";
import { Rondleiding, TOUR_BUTTONS, TOUR_PULSE } from "../components/Rondleiding";
import { Icon } from "../components/Icons";
import { StartScreen, type StartPhase } from "../components/StartScreen";
import type { SearchBarHandle } from "../components/SearchBar";
import { PLACE_FILTER, freeQueryOptions, useLookup, type LocatieserverDoc } from "../lib/locatieserver";
import { useAddressHeight } from "../lib/ahn";
import { endpointImagesQueryOptions, locationOf, type RijksImage, type Theme } from "../lib/rijksmuseum";
import { addressOf, timelineQueryOptions } from "../lib/timeline";
import { useDrainage } from "../lib/drainage";

/* Works from the Rijksmuseum, each next to the block it belongs to. Works
   with a place show only when the address lies there; works without a
   place show for every address. The id picks the spot in the grid (see
   app.css). */
const WORKS: (RijksWork & { id: string })[] = [
  {
    id: "i-getijdenmolen",
    place: "Middelburg",
    title: "Gezicht op het Spin- en Rasphuis, Getijdenmolen en Stadsschuur te Middelburg",
    maker: "anoniem",
    year: "1696",
    objectNumber: "RP-P-AO-15-141K-2",
    iiif: "https://iiif.micr.io/ySnWZ",
    context:
      "Zo zag het hier eruit in 1696. De getijdenmolen draaide op het water dat met eb en vloed in en uit stroomde. Bij de Stadsschuur ligt nu nog een sluis die meedoet.",
  },
  {
    id: "i-stadswallen",
    place: "Middelburg",
    title: "Stadswallen van Middelburg met de Koepoort, de Oostkerk en een molen",
    maker: "anoniem",
    year: "1700-1800",
    objectNumber: "RP-T-1894-A-2959",
    iiif: "https://iiif.micr.io/tOijd",
    context: "Op de stadswallen stonden molens. Die maalden graan, geen water. Niet elke molen hield je voeten droog.",
  },
  {
    id: "i-beemster",
    place: "Beemster",
    title: "Tweede eeuwfeest van de droogmaking van de Beemster",
    maker: "Willem de Wijs",
    year: "1712",
    objectNumber: "NG-VG-1-2060",
    iiif: "https://iiif.micr.io/MjziZ",
    context: "In 1712 was de Beemster honderd jaar droog. Daarvoor werd deze penning gemaakt.",
  },
  {
    id: "i-nieuwerkerk",
    place: "Nieuwerkerk",
    title: "Nieuwerkerk te Duiveland",
    maker: "Cornelis Pronk",
    year: "1735",
    objectNumber: "RP-T-1921-17",
    iiif: "https://iiif.micr.io/WSNzD",
    context: "Zo zag Nieuwerkerk eruit in 1735. In 1953 liep het dorp onder water.",
  },
  /* general: four featured works, spread over the grid, shown for every address.
     Fallbacks: their spots get images from our SPARQL endpoint when it answers. */
  {
    id: "i-keere",
    place: "",
    title: "Poldermolen en visserij in Holland. Onderhoud Hondsbosse zeewering bij Petten, ca. 1600",
    maker: "Pieter van der Keere",
    year: "1608-1610",
    objectNumber: "RP-P-OB-6719",
    iiif: "https://iiif.micr.io/qRmsD",
    context: "Een poldermolen achter de zeedijk bij Petten. Molens zoals deze pompten het water uit de polder.",
  },
  {
    id: "i-kinderdijk",
    place: "",
    title: "Windmolens bij Kinderdijk",
    maker: "Adolf le Comte",
    year: "",
    objectNumber: "RP-T-1963-39",
    iiif: "https://iiif.micr.io/rDJMg",
    context:
      "De molens van Kinderdijk kent bijna iedereen, tot ver buiten Nederland. Samen pompten deze 19 molens het water uit de polder naar de rivier. Sinds 1997 zijn ze werelderfgoed.",
  },
  {
    id: "i-cruquius",
    place: "",
    title: "Stoomgemaal De Cruquius in Haarlemmermeer",
    maker: "Willem Hekking jr.",
    year: "",
    objectNumber: "RP-P-OB-28.402",
    iiif: "https://iiif.micr.io/iZtis",
    context: "Stoomgemaal De Cruquius. Het hielp de Haarlemmermeer droog te pompen, met stoom in plaats van wind.",
  },
  {
    id: "i-dongepolders",
    place: "",
    title: "Bemaling van de Dongepolders. Electrische Centrale",
    maker: "Pistoor & Zoon",
    year: "1901",
    objectNumber: "NG-1976-34-H-1",
    iiif: "https://iiif.micr.io/HHrDg",
    context: "Een elektrische centrale om water weg te pompen uit de Dongepolders, in 1901.",
  },
];

const LOCAL = WORKS.filter((w) => w.place);
const FEATURED = WORKS.filter((w) => !w.place);

/* Two per theme for the four featured spots, out of a few more candidates,
   so there is something to vary between visits */
const LIMITS: Record<Theme, number> = { flood: 8, infrastructure: 8 };

/* How many places an image can move up or down in its list: enough for some
   variety, while nearby images still tend to win */
const JITTER = 3;

/* Keep the order of the list, but with a little noise. */
function jitter<T>(list: T[]): T[] {
  return list
    .map((x, i) => ({ x, score: i + Math.random() * JITTER }))
    .sort((a, b) => a.score - b.score)
    .map(({ x }) => x);
}

/* Endpoint images for the featured spots, flood and infrastructure in turn,
   each list roughly nearest first (as the query orders them, plus jitter). */
function pickFeatured(images: RijksImage[], shown: Set<string>): RijksImage[] {
  const free = images.filter((img) => !img.objectNumber || !shown.has(img.objectNumber));
  const flood = jitter(free.filter((img) => img.theme === "flood"));
  const infrastructure = jitter(free.filter((img) => img.theme === "infrastructure"));
  const out: RijksImage[] = [];
  for (let i = 0; i < Math.max(flood.length, infrastructure.length); i++) {
    if (flood[i]) out.push(flood[i]);
    if (infrastructure[i]) out.push(infrastructure[i]);
  }
  return out.slice(0, FEATURED.length);
}

/* The context sentence only says what the data says: the theme, the
   depicted places and how they relate to the address. */
function toWork(img: RijksImage): RijksWork {
  const where =
    img.rank === 1
      ? "in jouw woonplaats of gemeente"
      : img.rank === 2
        ? img.km !== undefined
          ? `op zo'n ${Math.max(1, Math.round(img.km))} km van je adres`
          : "in de buurt"
        : img.rank === 3
          ? "in jouw provincie"
          : "";
  const what = img.theme === "flood" ? "Hoog water" : "Waterwerken";
  return {
    place: "",
    title: img.title,
    maker: "",
    year: img.year ? String(img.year) : "",
    objectNumber: img.objectNumber ?? "",
    iiif: img.iiif,
    url: img.page ?? img.object,
    context: `${what}${img.depicts ? ` in ${img.depicts}` : ""}${where ? ` (${where})` : ""}.`,
  };
}

/* Start screen plus the canvas for one address. State at app level: the
   address (in the url as ?id=, a Locatieserver id), the mode (info or risk)
   and the scenario choices. */
export default function Home() {
  const [params, setParams] = useSearchParams();
  const queryClient = useQueryClient();
  const id = params.get("id") ?? "";
  
  /* the full Locatieserver record for the id in the url */
  const lookup = useLookup({ id });
  const locatie = lookup.data?.response.docs[0];
  
  /* The time line from the linked data at the endpoint. Empty while it
     answers; when it fails (or is not running), the hardcoded example. */
  const timeline = useQuery(timelineQueryOptions(locationOf(locatie), addressOf(locatie)));
  const steps =
    timeline.data ?? (timeline.fetchStatus === "fetching" ? [] : MIDDELBURG.timeline);

  /* TODO: fetch the rest of the place from the data layer; only the address and the time line are real now */
  const place = { ...MIDDELBURG, address: locatie?.weergavenaam ?? (id ? "…" : MIDDELBURG.address), timeline: steps };
  /* ground level at the address (AHN); the panels read the same cached query */
  const height = useAddressHeight(locatie);
  /* the drainage area and the 1-2 pumps that drain it (IMWA) */
  const here = locationOf(locatie);
  const drainage = useDrainage(here?.lat, here?.lon);

  /* Rijksmuseum works: the local ones for this woonplaats, and the featured
     spots from the endpoint. While it answers the featured spots stay empty;
     when it fails (or is not running), or has too few images, the fallbacks. */
  const local = worksFor(LOCAL, locatie?.woonplaatsnaam);
  const endpoint = useQuery(endpointImagesQueryOptions(locationOf(locatie), { limits: LIMITS }));
  /* picked once per result and woonplaats, so the random pick holds between renders */
  const woonplaatsnaam = locatie?.woonplaatsnaam;
  const fetched = useMemo(
    () =>
      endpoint.data
        ? pickFeatured(endpoint.data, new Set(worksFor(LOCAL, woonplaatsnaam).map((w) => w.objectNumber)))
        : [],
    [endpoint.data, woonplaatsnaam],
  );
  const featured =
    endpoint.fetchStatus === "fetching" && !endpoint.isSuccess
      ? []
      : FEATURED.map((fallback, i) => (fetched[i] ? { ...toWork(fetched[i]), id: fallback.id } : fallback));

  /* with an address in the url we skip the start screen */
  const [phase, setPhase] = useState<StartPhase>(id ? "hidden" : "idle");
  const [searching, setSearching] = useState(false);
  const [searchMsg, setSearchMsg] = useState<string | null>(null);
  const [away, setAway] = useState(false);
  /* remount the start screen on Begin, so the landscape resets without animating */
  const [startKey, setStartKey] = useState(0);
  const search = useRef<SearchBarHandle>(null);
  const [about, setAbout] = useState(false);
  const [copied, setCopied] = useState(false);
  const [mode, setMode] = useState<Mode>("info");
  /* TEMPORARY: camera view in the 3D room, switched in the risk panel */
  const [view, setView] = useState<RoomView>("room");
  const [scenario, setScenario] = useState<Scenario>({ outside: "flood", liwoMap: 5 });
  /* the tour after a search: run is the key (a restart remounts it), step lights up a menu button */
  const [tour, setTour] = useState<{ run: number; step: number } | null>(null);
  const canvas = useCanvas();
  const woonplaats = locatie?.woonplaatsnaam;
  useEffect(() => {
    canvas.measure();
  }, [woonplaats, steps.length, canvas.measure]);

  function startTour() {
    setTour({ run: performance.now(), step: 0 });
  }

  /* a click on a menu button, Begin or a new search: the tour just stops, wherever the grid is */
  function stopTour() {
    canvas.setInset(0);
    setTour(null);
  }

  /* each step scrolls the grid to its block; the card covers `inset` px at the bottom */
  function onTourStep(step: number, inset: number) {
    canvas.setInset(inset);
    setTour((t) => (t && t.step !== step ? { ...t, step } : t));
    setMode("info");
    if (step === 0) canvas.goPanel("p-map");
    else if (step === 1) canvas.go("tijd");
    else if (step === 2) canvas.go("buurt");
    else canvas.go("huis");
  }

  function onTourEnd(how: "skip" | "try") {
    canvas.setInset(0);
    setTour(null);
    setMode(how === "try" ? "risk" : "info");
    canvas.go("huis");
  }

  function onGo(t: NavTarget) {
    if (tour) stopTour();
    if (t.mode) setMode(t.mode);
    canvas.go(t.key);
  }

  /* a shared link with an id that no longer exists (or a failed lookup):
     back to the start screen with a message */
  useEffect(() => {
    if (!id) return;
    if (lookup.isError) {
      setSearchMsg("De adreszoeker gaf geen antwoord. Probeer het later nog eens.");
      setPhase("idle");
    } else if (lookup.isSuccess && !locatie) {
      setSearchMsg("Deze plek is niet (meer) te vinden. Typ hem opnieuw.");
      setPhase("idle");
      setParams({}, { replace: true });
    }
  }, [id, lookup.isError, lookup.isSuccess, locatie, setParams]);

  /* look up the typed address or town in the Locatieserver (best match) and put its id in the url, so the link can be shared */
  async function begin(q: string) {
    if (searching) return;
    if (!q) {
      setSearchMsg("Typ een adres of plaats, bijvoorbeeld Abdij 4, Middelburg.");
      return;
    }
    setSearching(true);
    setSearchMsg(null);
    let found: string | undefined;
    try {
      const res = await queryClient.fetchQuery(freeQueryOptions({ q, fq: PLACE_FILTER, rows: 1, fl: "id" }));
      found = res.response.docs[0]?.id;
    } catch {
      setSearchMsg("De adreszoeker gaf geen antwoord. Probeer het later nog eens.");
      return;
    } finally {
      setSearching(false);
    }
    if (!found) {
      setSearchMsg(`Niets gevonden voor "${q}". Typ een plaats, of straat, huisnummer en plaats.`);
      return;
    }
    setParams({ id: found }, { replace: true });
    dive();
  }

  /* a suggestion already has its id: no search needed */
  function pick(doc: LocatieserverDoc) {
    if (searching) return;
    setSearchMsg(null);
    setParams({ id: doc.id }, { replace: true });
    dive();
  }

  /* the leaving transition: text slides up, the pin drops, we dive into
     the landscape, then the start screen fades and the grid zooms in */
  function dive() {
    setMode("info");
    canvas.go("huis", false);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setPhase("hidden");
      startTour();
      return;
    }
    setAway(true);
    setPhase("going");
    window.setTimeout(() => {
      setPhase("hidden");
      setAway(false);
      startTour();
    }, 1150);
  }

  /* share: copy the link with the address, or use the share sheet */
  async function share() {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: "Droge Voeten", url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* the user cancelled, nothing to do */
    }
  }

  /* Begin: back to the start screen without animation, field empty and focused */
  function onBack() {
    stopTour();
    setStartKey((k) => k + 1);
    setPhase("idle");
    setSearchMsg(null);
    setParams({}, { replace: true });
    window.setTimeout(() => search.current?.reset(), 0);
  }

  return (
    <>
      <SvgSymbols />

      <StartScreen
        key={startKey}
        phase={phase}
        onSearch={begin}
        onPick={pick}
        searchHandle={search}
        busy={searching}
        message={searchMsg}
      />

      <button type="button" className="corner" id="infoBtn" onClick={() => setAbout(true)}>
        <Icon name="info" /> Over
      </button>
      <div id="where">
        <span className="where-lbl">jouw locatie</span> <b id="whereTxt">{place.address}</b>
      </div>
      <button type="button" className="corner" id="shareBtn" onClick={share}>
        <Icon name="share" /> {copied ? "Link gekopieerd" : "Deel"}
      </button>

      <FloatingNav
        active={canvas.active}
        mode={mode}
        onGo={onGo}
        onBack={onBack}
        touring={!!tour}
        tourButton={tour ? TOUR_BUTTONS[tour.step] : undefined}
        tourPulse={tour ? TOUR_PULSE[tour.step] : undefined}
      />
      <MiniMap panels={canvas.panels} canvas={canvas.canvasSize} worldRef={canvas.worldRef} onPick={canvas.goPanel} />

      <Canvas worldRef={canvas.worldRef} canvasRef={canvas.canvasRef} away={away}>
        <HuiskamerPanel
          locatie={locatie}
          mode={mode}
          scenario={scenario}
          onScenario={setScenario}
          loadRoom={phase !== "idle"}
          view={view}
        />
        <InfoPanel
          place={place}
          locatie={locatie}
          drainage={drainage}
          mode={mode}
          scenario={scenario}
          onScenario={setScenario}
          onClose={() => setMode("info")}
          view={view}
          onView={setView}
        />
        <NlMap centroide={locatie?.centroide_ll} nap={height.data?.ground?.value} />
        <TijdreisPanel place={place} />
        <BuurtPanel place={locatie} />
        <GemaalPanel />

        {[...local, ...featured].map((w) => (
          <RijksTile key={w.id} id={w.id} work={w} />
        ))}
      </Canvas>

      <TooltipLayer scrollRef={canvas.worldRef} />
      {tour && (
        <Rondleiding
          key={tour.run}
          paused={about}
          onChange={onTourStep}
          onEnd={onTourEnd}
        />
      )}
      {about && (
        <AboutCard
          onClose={() => setAbout(false)}
          onTour={() => {
            setAbout(false);
            startTour();
          }}
        />
      )}
    </>
  );
}
