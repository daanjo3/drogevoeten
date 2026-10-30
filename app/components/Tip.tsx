import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { TERMS } from "../data/place";

/* Inline element with a tooltip. kind "term" explains a difficult word,
   kind "bron" shows a source. The tooltip itself is rendered once by
   <TooltipLayer /> and opens on hover, focus and tap. */
export function Tip({ kind, tip, children }: { kind: "term" | "bron"; tip: string; children: ReactNode }) {
  return (
    <span className={`tip ${kind}`} tabIndex={0} data-tip={tip}>
      {children}
    </span>
  );
}

/* Renders a text where words between [brackets] become term tooltips. */
export function RichText({ text }: { text: string }) {
  const parts = text.split(/(\[[^\]]+\])/);
  return (
    <>
      {parts.map((p, i) => {
        const m = p.match(/^\[([^\]]+)\]$/);
        if (!m) return p;
        const word = m[1];
        const tip = TERMS[word] ?? TERMS[word.toLowerCase()];
        return tip ? (
          <Tip key={i} kind="term" tip={tip}>
            {word}
          </Tip>
        ) : (
          word
        );
      })}
    </>
  );
}

/* One tooltip for the whole page, positioned above the element or below
   when there is no room. Closes on Escape, a second tap, or scrolling. */
export function TooltipLayer({ scrollRef }: { scrollRef: RefObject<HTMLElement | null> }) {
  const tt = useRef<HTMLDivElement>(null);
  const [text, setText] = useState("");
  const [show, setShow] = useState(false);
  const cur = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = tt.current;
    if (!el) return;

    function open(target: HTMLElement) {
      cur.current = target;
      setText(target.dataset.tip ?? "");
      setShow(true);
      target.setAttribute("aria-describedby", "tooltip");
      /* measure after the text is in the DOM */
      requestAnimationFrame(() => {
        if (!el) return;
        const r = target.getBoundingClientRect();
        const w = el.offsetWidth;
        const h = el.offsetHeight;
        const x = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), window.innerWidth - w - 8);
        let y = r.top - h - 10;
        if (y < 8) y = r.bottom + 10;
        el.style.left = `${x}px`;
        el.style.top = `${y}px`;
      });
    }
    function close() {
      cur.current?.removeAttribute("aria-describedby");
      cur.current = null;
      setShow(false);
    }
    const tipOf = (e: Event) => (e.target as HTMLElement | null)?.closest?.(".tip") as HTMLElement | null;

    const onOver = (e: Event) => {
      const t = tipOf(e);
      if (t) open(t);
    };
    const onOut = (e: Event) => {
      if (tipOf(e)) close();
    };
    const onFocus = (e: Event) => {
      const t = tipOf(e);
      t ? open(t) : close();
    };
    const onClick = (e: Event) => {
      const t = tipOf(e);
      if (t) cur.current === t ? close() : open(t);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };

    document.addEventListener("mouseover", onOver);
    document.addEventListener("mouseout", onOut);
    document.addEventListener("focusin", onFocus);
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey);
    const scroller = scrollRef.current;
    scroller?.addEventListener("scroll", close);
    return () => {
      document.removeEventListener("mouseover", onOver);
      document.removeEventListener("mouseout", onOut);
      document.removeEventListener("focusin", onFocus);
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKey);
      scroller?.removeEventListener("scroll", close);
    };
  }, [scrollRef]);

  return (
    <div id="tooltip" role="tooltip" ref={tt} className={show ? "show" : undefined}>
      {text}
    </div>
  );
}
