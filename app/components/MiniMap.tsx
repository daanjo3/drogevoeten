import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import { useView, type Rect } from "./Canvas";

/* names for the blocks, read out by screen readers */
const NAMES: Record<string, string> = {
  "p-huis": "Huiskamer",
  "p-info": "Uitleg en scenario",
  "p-map": "Kaart",
  "p-tijd": "Tijdreis",
  "p-buurt": "Gemalen",
};

const COLORS: Record<string, string> = {
  "p-huis": "#9fcdee",
  "p-info": "#F8BD83",
  "p-map": "#0074BA",
  "p-tijd": "#D28AE1",
  "p-buurt": "#657546",
};

/* Small overview at the bottom right: every block to scale, plus a frame
   of what is on screen. Click a block to scroll to it. The canvas is drawn
   with one scale for both directions (like object-fit: contain), so the
   gaps between the blocks look the same as in the real layout. */
export function MiniMap({
  panels,
  canvas,
  worldRef,
  onPick,
}: {
  panels: { id: string; rect: Rect }[];
  canvas: { width: number; height: number };
  /* the scrolling element, to track what is on screen */
  worldRef: RefObject<HTMLDivElement | null>;
  onPick: (id: string) => void;
}) {
  const view = useView(worldRef);
  const box = useRef<HTMLElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  /* the inner size of the minimap, also when css changes it per breakpoint */
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const update = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (!canvas.width || !canvas.height) return <nav id="mini" ref={box} aria-label="Overzicht van de blokken" />;

  const pad = 6;
  const s = Math.min((size.w - 2 * pad) / canvas.width, (size.h - 2 * pad) / canvas.height);
  const ox = pad + (size.w - 2 * pad - canvas.width * s) / 2;
  const oy = pad + (size.h - 2 * pad - canvas.height * s) / 2;
  const fit = (r: Rect) => ({ left: ox + r.l * s, top: oy + r.t * s, width: (r.r - r.l) * s, height: (r.b - r.t) * s });

  return (
    <nav id="mini" ref={box} aria-label="Overzicht van de blokken">
      {panels.map((p) => (
        <button
          key={p.id}
          type="button"
          style={{ ...fit(p.rect), background: COLORS[p.id] ?? "#e6e0da" }}
          onClick={() => onPick(p.id)}
          aria-label={`Ga naar ${NAMES[p.id] ?? "beeld"}`}
        />
      ))}
      <div className="view" style={fit(view)} />
    </nav>
  );
}
