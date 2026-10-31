import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

/* Phone version of the scenario panel in the fullscreen room: a bar at the
   bottom ("Als het misgaat") that slides a panel up. The room moves up with
   it: the height of the sheet goes into --sheet-h on the fullscreen wrapper,
   and the css shifts the canvas up by half of that, so the water stays in
   view above the panel. Hidden above 600px (the css decides). Closed again
   whenever fullscreen ends, because the whole overlay unmounts then. */
export function FullscreenSheet({ onOpen, children }: { onOpen: () => void; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const sheet = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = sheet.current;
    const wrap = el?.parentElement;
    if (!el || !wrap) return;
    const update = () => wrap.style.setProperty("--sheet-h", `${el.offsetHeight}px`);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      ro.disconnect();
      wrap.style.removeProperty("--sheet-h");
    };
  }, []);

  function toggle() {
    const next = !open;
    setOpen(next);
    /* the water only shows in risk mode */
    if (next) onOpen();
  }

  return (
    <div className={`fs-sheet${open ? " open" : ""}`} ref={sheet}>
      <button type="button" className="fs-bar" aria-expanded={open} aria-controls="fs-sheet-body" onClick={toggle}>
        {open ? "Klaar" : "Als het misgaat"} <span aria-hidden="true">{open ? "▼" : "▲"}</span>
      </button>
      <div className="fs-sheet-body" id="fs-sheet-body">
        {children}
      </div>
    </div>
  );
}
