import { useRef, useState } from "react";
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
import { StartScreen, type StartPhase } from "../components/StartScreen";
import type { SearchBarHandle } from "../components/SearchBar";
import { abdijLocatieDoc } from "../data/abdij4";

/* Start screen plus the canvas for one address. State at app level: the
   address (in the url as ?q=), the mode (info or risk) and the scenario
   choices. */
export default function Home() {
  const [params, setParams] = useSearchParams();
  const address = params.get("q") ?? "";
  /* TODO: fetch the place for this address from the data layer */
  const place = address ? { ...MIDDELBURG, address } : MIDDELBURG;
  
  /* with an address in the url we skip the start screen */
  const [phase, setPhase] = useState<StartPhase>(address ? "hidden" : "idle");
  const [away, setAway] = useState(false);
  /* remount the start screen on Begin, so the landscape resets without animating */
  const [startKey, setStartKey] = useState(0);
  const search = useRef<SearchBarHandle>(null);
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

  /* the leaving transition: text slides up, the pin drops, we dive into
     the landscape, then the start screen fades and the grid zooms in */
  function begin(q: string) {
    const next = q || "Adres placeholder";
    setParams({ q: next }, { replace: true });
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

  /* Begin: back to the start screen without animation, field empty and focused */
  function onBack() {
    setStartKey((k) => k + 1);
    setPhase("idle");
    setParams({}, { replace: true });
    window.setTimeout(() => search.current?.reset(), 0);
  }

  const placeLocatieDoc = abdijLocatieDoc

  return (
    <>
      <SvgSymbols />

      <StartScreen key={startKey} phase={phase} onSearch={begin} searchHandle={search} />

      <div id="where">
        jullie plek <b id="whereTxt">{place.address}</b>
      </div>

      <FloatingNav active={canvas.active} mode={mode} onGo={onGo} onBack={onBack} />
      <MiniMap panels={canvas.panels} canvas={canvas.canvasSize} view={canvas.view} onPick={canvas.goPanel} />

      <Canvas worldRef={canvas.worldRef} canvasRef={canvas.canvasRef} away={away}>
        <HuiskamerPanel place={place} mode={mode} scenario={scenario} />
        <InfoPanel place={place} mode={mode} scenario={scenario} onScenario={setScenario} />
        <NlMap address={place.address} />
        <TijdreisPanel place={place} />
        <BuurtPanel place={placeLocatieDoc} />

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
    </>
  );
}
