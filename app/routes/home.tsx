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
import { BoreelArt, ImageTile, PrentArt } from "../components/ImageTile";
import { FloatingNav, type NavTarget } from "../components/FloatingNav";
import { MiniMap } from "../components/MiniMap";
import { AboutCard } from "../components/AboutCard";
import { Icon } from "../components/Icons";
import { StartScreen, type StartPhase } from "../components/StartScreen";
import type { SearchBarHandle } from "../components/SearchBar";
import { freeQueryOptions, useLookup, type LocatieserverDoc } from "../lib/locatieserver";

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
      setSearchMsg("Dit adres is niet (meer) te vinden. Typ het opnieuw.");
      setPhase("idle");
      setParams({}, { replace: true });
    }
  }, [id, lookup.isError, lookup.isSuccess, locatie, setParams]);

  /* look up the typed address in the Locatieserver (addresses only, best
     match) and put its id in the url, so the link can be shared */
  async function begin(q: string) {
    if (searching) return;
    if (!q) {
      setSearchMsg("Typ een adres, bijvoorbeeld Abdij 4, Middelburg.");
      return;
    }
    setSearching(true);
    setSearchMsg(null);
    let found: string | undefined;
    try {
      const res = await queryClient.fetchQuery(freeQueryOptions({ q, fq: ["type:adres"], rows: 1, fl: "id" }));
      found = res.response.docs[0]?.id;
    } catch {
      setSearchMsg("De adreszoeker gaf geen antwoord. Probeer het later nog eens.");
      return;
    } finally {
      setSearching(false);
    }
    if (!found) {
      setSearchMsg(`Geen adres gevonden voor "${q}". Typ straat, huisnummer en plaats.`);
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
        <HuiskamerPanel place={place} mode={mode} scenario={scenario} loadRoom={phase !== "idle"} />
        <InfoPanel place={place} mode={mode} scenario={scenario} onScenario={setScenario} onClose={() => setMode("info")} />
        <NlMap centroide={locatie?.centroide_ll} nap={place.nap} />
        <TijdreisPanel place={place} />
        <BuurtPanel place={locatie} />

        <ImageTile
          id="i-asselijn"
          title="Dijkherstel na een doorbraak"
          caption="foto · jaar en bron nog invullen"
          src="/img/dijkherstel.jpg"
          alt="Mannen met schoppen herstellen een doorgebroken dijk, met ondergelopen land en kale bomen op de achtergrond"
        />
        <ImageTile
          id="i-molen"
          title="Molen"
          caption="pentekening · bron nog invullen"
          src="/img/molen-tekening.jpg"
          alt="Pentekening van een stellingmolen met wolken erachter"
        />
        <ImageTile
          id="i-elisabeth"
          title="Stadsgezicht met molen"
          caption="schilderij · maker en bron nog invullen"
          src="/img/stadsgezicht-molen.jpg"
          alt="Geschilderd stadsgezicht aan het water met huizen, een rokende schoorsteen en een grote molen"
        />
        <ImageTile
          id="i-prent"
          badge="placeholder · beeld via IIIF"
          title="Watersnood na dijkdoorbraken bij de grote rivieren"
          caption="prent, 1740-1741 · Rijksmuseum"
          art={<PrentArt />}
        />
        <ImageTile
          id="i-boreel"
          badge="placeholder · foto"
          title="Gemaal Boreel, 1929"
          caption="RCE beeldbank · Gemalenstichting"
          art={<BoreelArt />}
        />
      </Canvas>

      <TooltipLayer scrollRef={canvas.worldRef} />
      {about && <AboutCard onClose={() => setAbout(false)} />}
    </>
  );
}
