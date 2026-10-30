import { useState } from "react";
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

/* The canvas view for one address. State at app level: the address, the mode
   (info or risk) and the scenario choices. The start screen comes later. */
export default function Home() {
  /* TODO: read the address from ?q= and fetch the place from the data layer */
  const place = MIDDELBURG;
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

  function onBack() {
    /* TODO: show the start screen again */
    setMode("info");
    canvas.go("huis");
  }

  return (
    <>
      <SvgSymbols />

      <div id="where">
        jullie plek <b id="whereTxt">{place.address}</b>
      </div>

      <FloatingNav active={canvas.active} mode={mode} onGo={onGo} onBack={onBack} />
      <MiniMap panels={canvas.panels} canvas={canvas.canvasSize} view={canvas.view} onPick={canvas.goPanel} />

      <Canvas worldRef={canvas.worldRef} canvasRef={canvas.canvasRef}>
        <HuiskamerPanel place={place} mode={mode} scenario={scenario} />
        <InfoPanel place={place} mode={mode} scenario={scenario} onScenario={setScenario} />
        <NlMap address={place.address} />
        <TijdreisPanel place={place} />
        <BuurtPanel place={place} />

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
