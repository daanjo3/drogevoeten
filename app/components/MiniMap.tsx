import type { Rect } from "./Canvas";

const SIZE = 140;

const COLORS: Record<string, string> = {
  "p-huis": "#9fcdee",
  "p-info": "#d9d4cf",
  "p-map": "#5fb4ec",
  "p-tijd": "#D28AE1",
  "p-buurt": "#617E5A",
};

/* Small overview at the bottom right: every block to scale, plus a frame
   of what is on screen. Click a block to scroll to it. */
export function MiniMap({
  panels,
  canvas,
  view,
  onPick,
}: {
  panels: { id: string; rect: Rect }[];
  canvas: { width: number; height: number };
  view: Rect;
  onPick: (id: string) => void;
}) {
  if (!canvas.width || !canvas.height) return <div id="mini" aria-label="Overzicht" />;
  const sx = SIZE / canvas.width;
  const sy = SIZE / canvas.height;
  const box = (r: Rect) => ({ left: r.l * sx, top: r.t * sy, width: (r.r - r.l) * sx, height: (r.b - r.t) * sy });

  return (
    <div id="mini" aria-label="Overzicht">
      {panels.map((p) => (
        <i
          key={p.id}
          style={{ ...box(p.rect), background: COLORS[p.id] ?? "#e6e0da" }}
          onClick={() => onPick(p.id)}
          role="button"
          aria-label={p.id}
        />
      ))}
      <div className="view" style={box(view)} />
    </div>
  );
}
