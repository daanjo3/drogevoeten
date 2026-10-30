import { useEffect, useRef, type ReactNode } from "react";
import { Icon } from "./Icons";

/* Card with the story behind the app and the list of sources. Opens from
   the Over button. Links open in a new tab. */

const SOURCES: { label: string; name: string; href: string }[] = [
  { label: "Hoogte", name: "Actueel Hoogtebestand Nederland (AHN), Rijkswaterstaat", href: "https://www.ahn.nl" },
  { label: "Adressen en kaart", name: "Locatieserver, BAG en Basisregistratie Topografie, Kadaster via PDOK", href: "https://www.pdok.nl" },
  { label: "Gemalen, peilgebieden en waterschappen", name: "waterschapsregister (IMWA), Het Waterschapshuis", href: "https://www.pdok.nl" },
  {
    label: "Gemalen door de tijd en verdwenen molens",
    name: "Landschapsatlas, Rijksdienst voor het Cultureel Erfgoed, met de Nederlandse Gemalenstichting",
    href: "https://services.rce.geovoorziening.nl/landschapsatlas/wfs?request=GetCapabilities",
  },
  { label: "Monumenten", name: "Rijksmonumenten, Rijksdienst voor het Cultureel Erfgoed", href: "https://linkeddata.cultureelerfgoed.nl" },
  { label: "Molens", name: "Nederlandse Molendatabase", href: "https://www.molendatabase.nl" },
  { label: "Dijken, polders en oude kaarten", name: "Provincie Zeeland", href: "https://opengeodata.zeeland.nl" },
  {
    label: "Overstromingen",
    name: "LIWO (Rijkswaterstaat, Deltares), waterstanden 1953 (Rijkswaterstaat), inundatiekaart 1953 (Provincie Noord-Brabant)",
    href: "https://basisinformatie-overstromingen.nl",
  },
  { label: "Regen", name: "KNMI daggegevens en Klimaateffectatlas", href: "https://www.daggegevens.knmi.nl" },
  { label: "Beelden", name: "Rijksmuseum", href: "https://www.rijksmuseum.nl" },
  { label: "Koppelingen", name: "Wikidata", href: "https://www.wikidata.org" },
];

const TEAM: { role: string; name: string }[] = [
  { role: "design", name: "Wendy van der Waal" },
  { role: "development", name: "Daan Meijers" },
  { role: "development", name: "Jari Maijenburg" },
  { role: "3D-development", name: "Wouter de Bruijn" },
];

function Ext({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  );
}

export function AboutCard({ onClose }: { onClose: () => void }) {
  const card = useRef<HTMLDivElement>(null);

  /* focus moves into the card, stays inside while it is open (Tab wraps
     around), and goes back to the Over button when it closes */
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const el = card.current;
    el?.querySelector<HTMLElement>("button")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab" || !el) return;
      const items = [...el.querySelectorAll<HTMLElement>("button, a[href]")];
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      opener?.focus();
    };
  }, [onClose]);

  return (
    <div id="about" onClick={onClose}>
      <div className="card" role="dialog" aria-modal="true" aria-labelledby="aboutTitle" ref={card} onClick={(e) => e.stopPropagation()}>
        <button type="button" className="close" aria-label="Sluiten" onClick={onClose}>
          <Icon name="close" />
        </button>
        <h2 id="aboutTitle">
          Droog wonen voelt normaal. Dat is het niet.
        </h2>
        <p className="lead">
          Een kwart van Nederland ligt onder zeeniveau. Dijken, molens en gemalen houden ons droog, dag en nacht. Ze staan om de
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

        <h3>Gemaakt door</h3>
        <ul className="sources">
          {TEAM.map((t) => (
            <li key={t.name}>
              <span className="label">{t.role}</span>
              <span>{t.name}</span>
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
