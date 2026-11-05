import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Icon } from "./Icons";

/* The team's 3D living room, a Unity WebGL build (public, not in git). There
   are two builds: /woonkamer-desktop/ for desktops and /woonkamer-mobile/ for phones
   and tablets, with lighter graphics and smaller textures. They are tens of
   MB, so loading starts only when `active` becomes true: after someone chose
   an address. While it loads a drop fills up with the progress. If loading
   fails the render png shows instead. */

const DESKTOP_EMBED_URL = `${import.meta.env.BASE_URL}woonkamer-desktop/unity-embed.js`;
const MOBILE_EMBED_URL = `${import.meta.env.BASE_URL}woonkamer-mobile/unity-embed.js`;
const PLACEHOLDER = `${import.meta.env.BASE_URL}img/huiskamer-3d.png`;

/* Phones render at most at this many pixels per css pixel: at a phone's
   native 3x the room is far too slow, at 1.5x it runs smoothly */
const MOBILE_MAX_PIXEL_RATIO = 1.5;

/* Phones and tablets get the mobile build. ?kamer=mobiel or ?kamer=desktop
   forces one, for testing. iPads ask for desktop sites by default and then
   look like a Mac, except that a Mac has no touchscreen. */
function wantsMobileBuild(): boolean {
  const forced = new URLSearchParams(window.location.search).get("kamer");
  if (forced === "mobiel") return true;
  if (forced === "desktop") return false;
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod|Android/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

/* the module lives in public/, so Vite must not bundle or rewrite it: a full
   url with origin makes the browser import it as is */
function importEmbed(url: string): Promise<UnityEmbed> {
  return import(/* @vite-ignore */ new URL(url, window.location.origin).href) as Promise<UnityEmbed>;
}

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
    options?: { onProgress?: (p: number) => void; fullscreenElement?: HTMLElement; devicePixelRatio?: number },
  ) => Promise<UnityPlayer>;
}

type State = "idle" | "loading" | "ready" | "failed";

export type RoomView = "room" | "house";

/* waterLevel: water in meters above the floor, 0 is dry. Not capped at the
   ceiling: Unity does that for the room view, the house view shows it all.
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
        /* when this deploy has no mobile build, phones fall back to the desktop one */
        let mobile = wantsMobileBuild();
        let embed: UnityEmbed;
        try {
          embed = await importEmbed(mobile ? MOBILE_EMBED_URL : DESKTOP_EMBED_URL);
        } catch (err) {
          if (!mobile) throw err;
          console.warn("[woonkamer] no mobile build, using the desktop build", err);
          mobile = false;
          embed = await importEmbed(DESKTOP_EMBED_URL);
        }
        const unity = await embed.mount(canvas.current!, {
          onProgress: setProgress,
          fullscreenElement: wrap.current ?? undefined,
          devicePixelRatio: mobile ? Math.min(window.devicePixelRatio, MOBILE_MAX_PIXEL_RATIO) : undefined,
        });
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

  /* Unity only lets you look around while the room fills the screen. It sees the
     browser's fullscreen itself, but not our window-filling fallback, so tell it */
  useEffect(() => {
    if (state === "ready") player.current?.send("SetLookEnabled", full || faux ? 1 : 0);
  }, [state, full, faux]);

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

  /* the page asks for fullscreen. While the room is still loading the request
     waits, and the room opens fullscreen as soon as it is ready; it's not
     dropped. Browsers only allow real fullscreen right after a tap, so a
     late request falls back to filling the window. */
  const lastRequest = useRef(fullRequest);
  useEffect(() => {
    if (fullRequest === lastRequest.current || state !== "ready") return;
    lastRequest.current = fullRequest;
    enterFullscreen();
  }, [fullRequest, state]);

  /* Pause the room while nobody can see it, so it doesn't take the phone's
     GPU from the rest of the page: scrolled away, or behind the start screen
     (then `active` is false; the start screen covers the room, which the
     observer can't see). Fullscreen always counts as visible. */
  const [onScreen, setOnScreen] = useState(true);
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setOnScreen(entry.isIntersecting));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (state === "ready") player.current?.send("SetPaused", (active && onScreen) || full || faux ? 0 : 1);
  }, [state, active, onScreen, full, faux]);

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
