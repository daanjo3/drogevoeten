import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import { MIDDELBURG, type Mode } from "../data/place";
import type { Scenario } from "../lib/scenario";
import { Canvas, useCanvas } from "../components/Canvas";
import { SvgSymbols } from "../components/Icons";
import { TooltipLayer } from "../components/Tip";
import { HuiskamerPanel } from "../components/HuiskamerPanel";
import { InfoPanel } from "../components/InfoPanel";
import { TijdreisPanel } from "../components/TijdreisPanel";
import { BuurtPanel } from "../components/BuurtPanel";
import { NlMap } from "../components/NlMap";
import { RijksTile, worksFor, type RijksWork } from "../components/ImageTile";
import { FloatingNav, type NavTarget } from "../components/FloatingNav";
import { MiniMap } from "../components/MiniMap";
import { AboutCard } from "../components/AboutCard";
import { Icon } from "../components/Icons";
import { StartScreen, type StartPhase } from "../components/StartScreen";
import type { SearchBarHandle } from "../components/SearchBar";
import { PLACE_FILTER, freeQueryOptions, useLookup, type LocatieserverDoc } from "../lib/locatieserver";
import { useAddressHeight } from "../lib/ahn";

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
  /* general: four featured works, spread over the grid, shown for every address */
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
  
  /* TODO: fetch the rest of the place from the data layer; only the address is real now */
  const place = { ...MIDDELBURG, address: locatie?.weergavenaam ?? (id ? "…" : MIDDELBURG.address) };
  /* ground level at the address (AHN); the panels read the same cached query */
  const height = useAddressHeight(locatie);

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
  const [scenario, setScenario] = useState<Scenario>({
    rain: place.rain.record,
    pump: place.pumpCapacity,
    dike: 0,
  });
  const canvas = useCanvas();
  const woonplaats = locatie?.woonplaatsnaam;
  useEffect(() => {
    canvas.measure();
  }, [woonplaats, canvas.measure]);

  function onGo(t: NavTarget) {
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
      return;
    }
    setAway(true);
    setPhase("going");
    window.setTimeout(() => {
      setPhase("hidden");
      setAway(false);
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
        jouw straat <b id="whereTxt">{place.address}</b>
      </div>
      <button type="button" className="corner" id="shareBtn" onClick={share}>
        <Icon name="share" /> {copied ? "Link gekopieerd" : "Deel"}
      </button>

      <FloatingNav active={canvas.active} mode={mode} onGo={onGo} onBack={onBack} />
      <MiniMap panels={canvas.panels} canvas={canvas.canvasSize} worldRef={canvas.worldRef} onPick={canvas.goPanel} />

      <Canvas worldRef={canvas.worldRef} canvasRef={canvas.canvasRef} away={away}>
        <HuiskamerPanel place={place} locatie={locatie} mode={mode} scenario={scenario} loadRoom={phase !== "idle"} />
        <InfoPanel
          place={place}
          locatie={locatie}
          mode={mode}
          scenario={scenario}
          onScenario={setScenario}
          onClose={() => setMode("info")}
        />
        <NlMap centroide={locatie?.centroide_ll} nap={height.data?.ground?.value} />
        <TijdreisPanel place={place} />
        <BuurtPanel place={locatie} />

        {worksFor(WORKS, locatie?.woonplaatsnaam).map((w) => (
          <RijksTile key={w.id} id={w.id} work={w} />
        ))}
      </Canvas>

      <TooltipLayer scrollRef={canvas.worldRef} />
      {about && <AboutCard onClose={() => setAbout(false)} />}
    </>
  );
}
