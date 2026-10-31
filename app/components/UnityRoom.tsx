import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icons";

/* The team's 3D living room, a Unity WebGL build served from
   /woonkamer/ (public, not in git). It is about 88 MB, so loading starts
   only when `active` becomes true: after someone chose an address. While
   it loads the render png stays in view with a progress bar. If loading
   fails the png simply stays. */

const EMBED_URL = "/woonkamer/unity-embed.js";
const PLACEHOLDER = `${import.meta.env.BASE_URL}img/huiskamer-3d.png`;

/* the part of the api of unity-embed.js we use */
interface UnityPlayer {
  setFullscreen: (on?: boolean) => void;
  /* calls a public method on the C# WebBridge */
  send: (method: string, value?: string | number) => void;
  quit: () => Promise<void>;
}
interface UnityEmbed {
  mount: (
    canvas: HTMLCanvasElement,
    options?: { onProgress?: (p: number) => void; fullscreenElement?: HTMLElement },
  ) => Promise<UnityPlayer>;
}

type State = "idle" | "loading" | "ready" | "failed";

/* waterLevel: water in the room in meters above the floor, 0 is dry */
export function UnityRoom({ active, waterLevel }: { active: boolean; waterLevel: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  /* wrapper that goes fullscreen, so our own exit button can sit on top of the room */
  const wrap = useRef<HTMLDivElement>(null);
  const [full, setFull] = useState(false);
  /* when the browser refuses real fullscreen (embedded views), the room fills the window instead */
  const [faux, setFaux] = useState(false);
  const player = useRef<UnityPlayer | null>(null);
  const [state, setState] = useState<State>("idle");
  const [progress, setProgress] = useState(0);

  /* guard with a ref, not state: in dev React runs effects twice and Unity
     must never be mounted twice on the same canvas */
  const started = useRef(false);

  useEffect(() => {
    if (!active || started.current || !canvas.current) return;
    started.current = true;
    setState("loading");
    (async () => {
      try {
        /* the module lives in public/, so Vite must not bundle or rewrite
           it: a full url with origin makes the browser import it as is */
        const url = new URL(EMBED_URL, window.location.origin).href;
        const embed = (await import(/* @vite-ignore */ url)) as UnityEmbed;
        const unity = await embed.mount(canvas.current!, { onProgress: setProgress, fullscreenElement: wrap.current ?? undefined });
        player.current = unity;
        setState("ready");
      } catch (err) {
        console.warn("[woonkamer] could not load the Unity build", err);
        setState("failed");
      }
    })();
  }, [active]);

  /* Unity moves its water to the new level; the first level after loading is applied at once */
  useEffect(() => {
    if (state === "ready") player.current?.send("SetWaterHeight", waterLevel);
  }, [state, waterLevel]);

  useEffect(() => {
    const onChange = () => setFull(document.fullscreenElement === wrap.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  /* the browser's own fullscreen api on the wrapper; Unity's SetFullscreen as fallback */
  function enterFullscreen() {
    const el = wrap.current;
    if (el?.requestFullscreen) {
      el.requestFullscreen().catch(() => setFaux(true));
    } else {
      setFaux(true);
    }
  }
  function exitFullscreen() {
    if (document.fullscreenElement) void document.exitFullscreen();
    setFaux(false);
  }

  /* Escape also leaves the window-filling fallback */
  useEffect(() => {
    if (!faux) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFaux(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [faux]);

  /* stop the player when the panel goes away */
  useEffect(
    () => () => {
      void player.current?.quit();
      player.current = null;
    },
    [],
  );

  const ready = state === "ready";
  return (
    <>
      {/* pointer events stay off so the grid keeps scrolling over the room */}
      <div className={`scene-wrap${faux ? " faux" : ""}`} ref={wrap}>
        <canvas id="unity-canvas" className="scene-canvas" ref={canvas} aria-label="3D-huiskamer" style={{ opacity: ready ? 1 : 0 }} />
        {(full || faux) && (
          <button type="button" className="fs exit" onClick={exitFullscreen}>
            <Icon name="close" /> sluit volledig scherm
          </button>
        )}
      </div>
      {!ready && <img className="scene" src={PLACEHOLDER} alt="" />}
      {state === "loading" && (
        <div className="loadbar" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
          <i style={{ width: `${Math.round(progress * 100)}%` }} />
          <span className="label">huiskamer laden · {Math.round(progress * 100)}%</span>
        </div>
      )}
      {ready && (
        <button type="button" className="fs" onClick={enterFullscreen}>
          <Icon name="fullscreen" /> volledig scherm
        </button>
      )}
    </>
  );
}
