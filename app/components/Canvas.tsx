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

  const go = useCallback(
    (key: SectionKey, smooth = true) => {
      const world = worldRef.current;
      const R = sectionRect(key);
      if (!world || !R) return;
      const vw = world.clientWidth;
      const vh = world.clientHeight;
      const left = (R.l + R.r) / 2 - vw / 2;
      /* the time travel starts at the top, the rest is centred */
      const top = key === "tijd" ? R.t - TOP_OFFSET_TIJD : (R.t + R.b) / 2 - vh / 2;
      world.scrollTo({ left, top, behavior: smooth ? "smooth" : "auto" });
    },
    [sectionRect],
  );

  const goPanel = useCallback((id: string) => {
    const world = worldRef.current;
    const el = canvasRef.current?.querySelector<HTMLElement>(`#${id}`);
    if (!world || !el) return;
    world.scrollTo({
      left: el.offsetLeft + el.offsetWidth / 2 - world.clientWidth / 2,
      top: el.offsetTop + el.offsetHeight / 2 - world.clientHeight / 2,
      behavior: "smooth",
    });
  }, []);

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

  useEffect(() => {
    const world = worldRef.current;
    if (!world) return;
    world.addEventListener("scroll", onScroll, { passive: true });
    const onResize = () => {
      measure();
      onScroll();
    };
    window.addEventListener("resize", onResize);
    return () => {
      world.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
    };
  }, [measure, onScroll]);

  return { worldRef, canvasRef, panels, canvasSize, active, go, goPanel };
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
