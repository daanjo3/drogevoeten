import { useEffect, useRef, type CSSProperties } from "react";
import type { PlaceData } from "../data/place";
import { Icon } from "./Icons";
import { RichText, Tip } from "./Tip";

/* The time travel: a long vertical column, read from top to bottom. */
/* The steps slide in one by one (css, keyed on the index) once the canvas
   marks the block as seen. */
export function TijdreisPanel({ place }: { place: PlaceData }) {
  // the first year in the line, e.g. "840" from "840–900" or "1300" from "Vóór 1300"
  const first = place.timeline[0]?.year.match(/\d{3,4}/)?.[0];
  const ref = useRef<HTMLElement>(null);
  // share the block's height with the canvas, so the tile below can follow it
  useEffect(() => {
    const el = ref.current;
    const canvas = el?.parentElement;
    if (!el || !canvas) return;
    const ro = new ResizeObserver(() => canvas.style.setProperty("--tijd-h", `${el.offsetHeight}px`));
    ro.observe(el);
    return () => {
      ro.disconnect();
      canvas.style.removeProperty("--tijd-h");
    };
  }, []);
  return (
    <section className="panel" id="p-tijd" ref={ref}>
      <span className="meta">{first ? `${first} → nu` : "tot nu"}</span>
      <h2>
        <Icon name="tijd" />
        Tijdreis
      </h2>
      <p className="lead">Hoe werd dit land droog? Lees van boven naar beneden.</p>
      <div className="tl">
        <div className="axis" />
        <ol>
          {place.timeline.map((step, i) => (
            // years can repeat (two pumping stations in one year), so the key includes the text
            <li key={`${step.year} ${step.text}`} style={{ "--i": i } as CSSProperties}>
              <h3>{step.year}</h3>
              <p>
                <RichText text={step.text} />
              </p>
              <p className="src">
                <Tip kind="bron" tip={step.source}>
                  bron
                </Tip>
                {/* one link per step: the object's own page first, else its source layer */}
                {step.links?.[0] && (
                  <a className="step-link" href={step.links[0].href} target="_blank" rel="noreferrer">
                    Link ↗
                  </a>
                )}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
