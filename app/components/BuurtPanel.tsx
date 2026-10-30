import { useState } from "react";
import type { PlaceData } from "../data/place";
import { Icon } from "./Icons";
import { RichText, Tip } from "./Tip";

/* Pumping stations and mills nearby. Dots on the map and rows in the list
   are linked: pick one and both highlight, and the details show. */
export function BuurtPanel({ place }: { place: PlaceData }) {
  const [picked, setPicked] = useState<number | null>(null);
  const g = picked === null ? null : place.nearby[picked];

  return (
    <section className="panel" id="p-buurt">
      <span className="meta">binnen 10 km</span>
      <h2>
        <Icon name="buurt" />
        Gemalen in de buurt
      </h2>
      <p className="sub">Klik op een stip of een naam. Dan zie je wat het doet en of het nog werkt.</p>
      <div className="buurt">
        <div className="map" id="map">
          <span className="you" style={{ left: "48%", top: "50%" }} title="dit adres" />
          {place.nearby.map((n, i) => (
            <button
              key={n.name}
              type="button"
              aria-label={n.name}
              aria-pressed={picked === i}
              style={{ left: `${n.x}%`, top: `${n.y}%` }}
              onClick={() => setPicked(i)}
            />
          ))}
        </div>
        <div>
          <ul id="list">
            {place.nearby.map((n, i) => (
              <li key={n.name}>
                <button type="button" aria-pressed={picked === i} onClick={() => setPicked(i)}>
                  <span>
                    <b>{n.name}</b> · {n.distance}
                  </span>
                  <span className="pill">{n.status}</span>
                </button>
              </li>
            ))}
          </ul>
          <div id="detail">
            {g ? (
              <>
                <b>{g.name}</b>
                <RichText text={g.text} />
                <small>
                  status · {g.status} &nbsp;{" "}
                  <Tip kind="bron" tip={`Bron: ${g.source}`}>
                    bron
                  </Tip>
                </small>
              </>
            ) : (
              "Kies een gemaal of molen."
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
