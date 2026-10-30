import { useEffect, type ReactNode } from "react";
import { Icon } from "./Icons";

/* Card with the story behind the app and the list of sources. Opens from
   the Over button. Links open in a new tab. */

const SOURCES: { label: string; name: string; href: string }[] = [
  { label: "Hoogte", name: "Actueel Hoogtebestand Nederland", href: "https://www.ahn.nl" },
  { label: "Gemalen en peilgebieden", name: "waterschapsregister, via PDOK", href: "https://www.pdok.nl" },
  { label: "Overstromingen", name: "LIWO, Rijkswaterstaat", href: "https://basisinformatie-overstromingen.nl" },
  { label: "Dijken en polders", name: "Provincie Zeeland", href: "https://opengeodata.zeeland.nl" },
  { label: "Regen", name: "KNMI", href: "https://www.knmi.nl" },
  { label: "Molens", name: "Molendatabase", href: "https://www.molendatabase.nl" },
  { label: "Monumenten", name: "Rijksdienst voor het Cultureel Erfgoed", href: "https://linkeddata.cultureelerfgoed.nl" },
  { label: "Beelden", name: "Rijksmuseum", href: "https://www.rijksmuseum.nl" },
  { label: "Koppelingen", name: "Wikidata", href: "https://www.wikidata.org" },
];

function Ext({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  );
}

export function AboutCard({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div id="about" onClick={onClose}>
      <div className="card" role="dialog" aria-modal="true" aria-labelledby="aboutTitle" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="close" aria-label="Sluiten" onClick={onClose}>
          <Icon name="close" />
        </button>
        <h2 id="aboutTitle">
          <Icon name="info" />
          Droog wonen voelt normaal. Dat is het niet.
        </h2>
        <p className="lead">
          Een kwart van Nederland ligt lager dan de zee. Dijken, molens en gemalen houden ons droog, dag en nacht. Ze staan om de
          hoek, maar bijna niemand kijkt er nog naar.
        </p>
        <p>
          Daarom koppelden we open data aan elkaar. Actuele cijfers over hoogte, regen en gemalen, en de collecties van
          erfgoedinstellingen. Samen vertellen ze wie jouw plek droog houdt, en sinds wanneer.
        </p>
        <p>
          We maakten het voor de klas. Op het digibord typt de juf of meester het adres van de school. De groep ziet wat er gebeurt
          als het gemaal stilvalt.
        </p>
        <p>Wat we zelf aan elkaar knoopten, geven we open terug. Zo bouwt de volgende verder waar wij stopten.</p>

        <h3>Bronnen</h3>
        <ul className="sources">
          {SOURCES.map((s) => (
            <li key={s.label}>
              <span className="label">{s.label}</span>
              <Ext href={s.href}>{s.name}</Ext>
            </li>
          ))}
        </ul>

        <p className="colophon">
          Bekijk de code en onze data op <Ext href="https://github.com/daanjo3/drogevoeten">GitHub</Ext>.
          <br />
          Gemaakt in 24 uur tijdens HackaLOD 2026 van het{" "}
          <Ext href="https://netwerkdigitaalerfgoed.nl">Netwerk Digitaal Erfgoed</Ext>.
        </p>
      </div>
    </div>
  );
}
