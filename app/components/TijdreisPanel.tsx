import type { PlaceData } from "../data/place";
import { Icon } from "./Icons";
import { RichText, Tip } from "./Tip";

/* The time travel: a long vertical column, read from top to bottom. */
export function TijdreisPanel({ place }: { place: PlaceData }) {
  return (
    <section className="panel" id="p-tijd">
      <span className="meta">1200 → nu</span>
      <h2>
        <Icon name="tijd" />
        Tijdreis
      </h2>
      <p className="lead">Hoe werd dit land droog? Lees van boven naar beneden.</p>
      <div className="tl">
        <div className="axis" />
        <ol>
          {place.timeline.map((step) => (
            <li key={step.year}>
              <h3>{step.year}</h3>
              <p>
                <RichText text={step.text} />
              </p>
              <Tip kind="bron" tip={step.source}>
                bron
              </Tip>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
