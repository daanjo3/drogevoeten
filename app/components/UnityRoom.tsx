import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Icon } from "./Icons";

/* The team's 3D living room, a Unity WebGL build served from
   /woonkamer/ (public, not in git). It is about 88 MB, so loading starts
   only when `active` becomes true: after someone chose an address. While
   it loads a drop fills up with the progress. If loading fails the render
   png shows instead. */

const EMBED_URL = `${import.meta.env.BASE_URL}woonkamer/unity-embed.js`;
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

export type RoomView = "room" | "house";

/* waterLevel: water in the room in meters above the floor, 0 is dry.
   view: camera view in Unity (temporary, for testing the house view).
   overlay: shown on top of the room in fullscreen (the scenario panel). */
export function UnityRoom({
  active,
  waterLevel,
  view,
  overlay,
  fullRequest = 0,
}: {
  active: boolean;
  /* goes up by one when the page asks for fullscreen (Als het misgaat on phones) */
  fullRequest?: number;
  waterLevel: number;
  view: RoomView;
  overlay?: ReactNode;
}) {
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

  /* Unity starts in the room view; only send changes, because SetView always flies (room -> room arcs up and back) */
  const sentView = useRef<RoomView>("room");
  useEffect(() => {
    if (state !== "ready" || view === sentView.current) return;
    player.current?.send("SetView", view);
    sentView.current = view;
  }, [state, view]);

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

  /* the page asks for fullscreen; the room must be ready, else nothing happens */
  const lastRequest = useRef(fullRequest);
  useEffect(() => {
    if (fullRequest === lastRequest.current) return;
    lastRequest.current = fullRequest;
    if (state === "ready") enterFullscreen();
  }, [fullRequest, state]);

  /* Escape also leaves the window-filling fallback */
  useEffect(() => {
    if (!faux) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFaux(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [faux]);

  /* the window-filling fallback sits inside the grid, so the page's own buttons would float over it: hide them */
  useEffect(() => {
    document.body.classList.toggle("room-full", faux);
    return () => document.body.classList.remove("room-full");
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
  const pct = Math.round(progress * 100);
  const clip = useId();
  return (
    <>
      {/* pointer events stay off so the grid keeps scrolling over the room */}
      <div className={`scene-wrap${faux ? " faux" : ""}`} ref={wrap}>
        <canvas id="unity-canvas" className="scene-canvas" ref={canvas} aria-label="3D-huiskamer" style={{ opacity: ready ? 1 : 0 }} />
        {(full || faux) && (
          <>
            <button type="button" className="fs exit" aria-label="Sluiten" onClick={exitFullscreen}>
              <Icon name="close" /> <span className="fs-exit-text">sluit volledig scherm</span>
            </button>
            {overlay}
          </>
        )}
      </div>
      {state === "failed" && <img className="scene" src={PLACEHOLDER} alt="" />}
      {(state === "idle" || state === "loading") && (
        <div className="room-loader" role="progressbar" aria-label="Huiskamer laden" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <clipPath id={clip}>
              <path d="M12 3s-6 7-6 11a6 6 0 0 0 12 0c0-4-6-11-6-11z" />
            </clipPath>
            {/* the water in the drop rises with the progress */}
            <rect className="fill" clipPath={`url(#${CSS.escape(clip)})`} x="0" y={3 + 17 * (1 - progress)} width="24" height="24" />
            <path d="M12 3s-6 7-6 11a6 6 0 0 0 12 0c0-4-6-11-6-11z" />
          </svg>
          <span className="label">huiskamer laden{state === "loading" ? ` · ${pct}%` : ""}</span>
        </div>
      )}
      {ready && (
        <button type="button" className="fs" onClick={enterFullscreen}>
          <Icon name="fullscreen" /> <span className="fs-short">volledig scherm</span>
          <span className="fs-long">Bekijk je huiskamer</span>
        </button>
      )}
    </>
  );
}
