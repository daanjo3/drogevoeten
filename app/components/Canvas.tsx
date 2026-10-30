import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";

/* The bento grid: absolutely positioned blocks in vw/vh, scrollable in two
   directions. Edges fade out through the css mask on #world. The panels
   keep the ids from the design prototype so the css applies one to one. */

export type SectionKey = "huis" | "tijd" | "buurt";

export interface Rect {
  l: number;
  t: number;
  r: number;
  b: number;
}

export interface PanelBox {
  id: string;
  rect: Rect;
}

/* Which panel ids belong to each navigation target. The living room and
   the info panel are centred together. */
const SECTION_IDS: Record<SectionKey, string[]> = {
  huis: ["p-huis", "p-info"],
  tijd: ["p-tijd"],
  buurt: ["p-buurt"],
};

const TOP_OFFSET_TIJD = 90;
/* how close (as a share of the viewport) a section must be to snap into place */
const SNAP_REACH = 0.3;

function rectOfEl(el: HTMLElement): Rect {
  return { l: el.offsetLeft, t: el.offsetTop, r: el.offsetLeft + el.offsetWidth, b: el.offsetTop + el.offsetHeight };
}

function union(rects: Rect[]): Rect {
  return {
    l: Math.min(...rects.map((r) => r.l)),
    t: Math.min(...rects.map((r) => r.t)),
    r: Math.max(...rects.map((r) => r.r)),
    b: Math.max(...rects.map((r) => r.b)),
  };
}

export interface CanvasApi {
  /* scroll so a section sits at its fixed position */
  go: (key: SectionKey, smooth?: boolean) => void;
  /* scroll so one panel is centred */
  goPanel: (id: string) => void;
}

export function useCanvas() {
  const worldRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [panels, setPanels] = useState<PanelBox[]>([]);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [active, setActive] = useState<SectionKey>("huis");

  const measure = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return [] as PanelBox[];
    const boxes = [...canvas.querySelectorAll<HTMLElement>(":scope > .panel")].map((el) => ({ id: el.id, rect: rectOfEl(el) }));
    setPanels(boxes);
    setCanvasSize({ width: canvas.offsetWidth, height: canvas.offsetHeight });
    return boxes;
  }, []);

  const sectionRect = useCallback((key: SectionKey): Rect | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const els = SECTION_IDS[key].map((id) => canvas.querySelector<HTMLElement>(`#${id}`)).filter(Boolean) as HTMLElement[];
    if (!els.length) return null;
    return union(els.map(rectOfEl));
  }, []);

  /* the scroll position at which a section sits in its place: the time
     travel starts at the top, the rest is centred */
  const targetFor = useCallback(
    (key: SectionKey): { left: number; top: number } | null => {
      const world = worldRef.current;
      const R = sectionRect(key);
      if (!world || !R) return null;
      const vw = world.clientWidth;
      const vh = world.clientHeight;
      const left = (R.l + R.r) / 2 - vw / 2;
      const top = key === "tijd" ? R.t - TOP_OFFSET_TIJD : (R.t + R.b) / 2 - vh / 2;
      return { left, top };
    },
    [sectionRect],
  );

  /* a programmatic scroll that is still on its way; the snap leaves it alone
     until it arrives, or until this expires (the user took over) */
  const pending = useRef<{ left: number; top: number; until: number } | null>(null);
  const scrollWorld = useCallback((left: number, top: number, smooth: boolean) => {
    const world = worldRef.current;
    if (!world) return;
    pending.current = smooth ? { left, top, until: performance.now() + 1500 } : null;
    world.scrollTo({ left, top, behavior: smooth ? "smooth" : "auto" });
  }, []);

  const go = useCallback(
    (key: SectionKey, smooth = true) => {
      const t = targetFor(key);
      if (t) scrollWorld(t.left, t.top, smooth);
    },
    [targetFor, scrollWorld],
  );

  /* snap: when scrolling stops close to a section's place, finish the move.
     Not on narrow screens, where the blocks are a plain column. */
  const snap = useCallback(() => {
    const world = worldRef.current;
    if (!world || world.clientWidth < 900) return;
    const p = pending.current;
    if (p) {
      const arrived = Math.hypot(p.left - world.scrollLeft, p.top - world.scrollTop) < 2;
      if (!arrived && performance.now() < p.until) return;
      pending.current = null;
      if (arrived) return;
    }
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const maxLeft = world.scrollWidth - world.clientWidth;
    const maxTop = world.scrollHeight - world.clientHeight;
    let best: { left: number; top: number } | null = null;
    let bd = Infinity;
    (["huis", "tijd", "buurt"] as SectionKey[]).forEach((k) => {
      const t = targetFor(k);
      if (!t) return;
      /* the browser clamps, so compare with what is reachable */
      t.left = Math.max(0, Math.min(t.left, maxLeft));
      t.top = Math.max(0, Math.min(t.top, maxTop));
      const d = Math.hypot(t.left - world.scrollLeft, t.top - world.scrollTop);
      if (d < bd) {
        bd = d;
        best = t;
      }
    });
    const reach = Math.min(world.clientWidth, world.clientHeight) * SNAP_REACH;
    if (!best || bd < 2 || bd > reach) return;
    const to: { left: number; top: number } = best;
    scrollWorld(to.left, to.top, !reduce);
  }, [targetFor, scrollWorld]);

  const goPanel = useCallback((id: string) => {
    const world = worldRef.current;
    const el = canvasRef.current?.querySelector<HTMLElement>(`#${id}`);
    if (!world || !el) return;
    scrollWorld(el.offsetLeft + el.offsetWidth / 2 - world.clientWidth / 2, el.offsetTop + el.offsetHeight / 2 - world.clientHeight / 2, true);
  }, [scrollWorld]);

  /* track the section closest to the centre. The viewport itself is tracked
     by useView in the minimap only: it changes every scroll frame, and as
     state here it would re-render every panel. */
  const onScroll = useCallback(() => {
    const world = worldRef.current;
    if (!world) return;
    const cx = world.scrollLeft + world.clientWidth / 2;
    const cy = world.scrollTop + world.clientHeight / 2;
    let best: SectionKey = "huis";
    let bd = Infinity;
    (["huis", "tijd", "buurt"] as SectionKey[]).forEach((k) => {
      const R = sectionRect(k);
      if (!R) return;
      const dx = Math.max(R.l - cx, 0, cx - R.r);
      const dy = Math.max(R.t - cy, 0, cy - R.b);
      const d = Math.hypot(dx, dy);
      if (d < bd) {
        bd = d;
        best = k;
      }
    });
    setActive(best);
  }, [sectionRect]);

  useLayoutEffect(() => {
    measure();
    go("huis", false);
    onScroll();
  }, [measure, go, onScroll]);

  /* reveal: a block gets `seen` (and keeps it) once a quarter of it is in view */
  useEffect(() => {
    const world = worldRef.current;
    const canvas = canvasRef.current;
    if (!world || !canvas) return;
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && e.target.classList.add("seen")),
      { root: world, threshold: 0.25 },
    );
    const observeAll = () => canvas.querySelectorAll(":scope > .panel:not(.seen)").forEach((el) => io.observe(el));
    observeAll();
    /* tiles can be added later (works per address) */
    const mo = new MutationObserver(observeAll);
    mo.observe(canvas, { childList: true });
    return () => {
      io.disconnect();
      mo.disconnect();
    };
  }, []);

  useEffect(() => {
    const world = worldRef.current;
    if (!world) return;
    world.addEventListener("scroll", onScroll, { passive: true });
    /* scrollend where the browser has it, otherwise a short pause in scroll events */
    const hasScrollEnd = "onscrollend" in world;
    let timer = 0;
    const onScrollIdle = () => {
      if (hasScrollEnd) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(snap, 160);
    };
    world.addEventListener("scroll", onScrollIdle, { passive: true });
    world.addEventListener("scrollend", snap);
    const onResize = () => {
      measure();
      onScroll();
    };
    window.addEventListener("resize", onResize);
    return () => {
      world.removeEventListener("scroll", onScroll);
      world.removeEventListener("scroll", onScrollIdle);
      world.removeEventListener("scrollend", snap);
      window.clearTimeout(timer);
      window.removeEventListener("resize", onResize);
    };
  }, [measure, onScroll, snap]);

  return { worldRef, canvasRef, panels, canvasSize, active, go, goPanel, measure };
}

/* The visible part of the canvas, updated on scroll and resize. Use it only
   in small components: whoever calls it re-renders every scroll frame. */
export function useView(worldRef: RefObject<HTMLDivElement | null>): Rect {
  const [view, setView] = useState<Rect>({ l: 0, t: 0, r: 0, b: 0 });

  useEffect(() => {
    const world = worldRef.current;
    if (!world) return;
    const update = () =>
      setView({ l: world.scrollLeft, t: world.scrollTop, r: world.scrollLeft + world.clientWidth, b: world.scrollTop + world.clientHeight });
    update();
    world.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      world.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [worldRef]);

  return view;
}

export function Canvas({
  worldRef,
  canvasRef,
  away,
  children,
}: {
  worldRef: RefObject<HTMLDivElement | null>;
  canvasRef: RefObject<HTMLDivElement | null>;
  /* true while the start screen is leaving: the grid zooms in from 0.92 */
  away?: boolean;
  children: ReactNode;
}) {
  return (
    <div id="world" ref={worldRef} className={away ? "away" : undefined}>
      <div id="canvas" ref={canvasRef}>
        {children}
      </div>
    </div>
  );
}
