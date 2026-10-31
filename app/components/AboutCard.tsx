import { Fragment, useEffect, useRef, type ReactNode } from "react";
import { Icon } from "./Icons";

/* Card with the story behind the app and the list of sources. Opens from
   the Over button. Links open in a new tab. */

/* Each dataset links to its own description: the PDOK page, or the record in
   the Nationaal Georegister */
const PDOK = "https://www.pdok.nl/introductie/-/article/";
const NGR = "https://nationaalgeoregister.nl/geonetwork/srv/dut/catalog.search#/metadata/";

const SOURCES: { label: string; datasets: { name: string; href: string }[]; by: string }[] = [
  { label: "Adressen", datasets: [{ name: "Locatieserver", href: `${PDOK}pdok-locatieserver-1` }], by: "Kadaster via PDOK" },
  {
    label: "Kaart",
    datasets: [{ name: "BRT-achtergrondkaart", href: `${PDOK}basisregistratie-topografie-achtergrondkaarten-brt-a-` }],
    by: "Kadaster via PDOK",
  },
  {
    label: "Hoogte",
    datasets: [{ name: "Actueel Hoogtebestand Nederland (AHN)", href: `${PDOK}actueel-hoogtebestand-nederland-ahn` }],
    by: "Rijkswaterstaat en waterschappen via PDOK",
  },
  {
    label: "Gemalen, peilgebieden en waterschappen nu",
    datasets: [
      { name: "Kunstwerken (IMWA)", href: `${PDOK}waterschappen-kunstwerken-imwa` },
      { name: "Waterbeheergebieden (IMWA): peil- en afvoergebieden", href: `${PDOK}waterschappen-waterbeheergebieden-imwa` },
    ],
    by: "Het Waterschapshuis via PDOK",
  },
  {
    label: "Gemalen door de tijd",
    datasets: [{ name: "Gemalen", href: `${NGR}c81e0dd2-3e91-44af-aaeb-4dcfed4b8b56` }],
    by: "Rijksdienst voor het Cultureel Erfgoed, met de Nederlandse Gemalenstichting",
  },
  {
    label: "Molens",
    datasets: [
      { name: "Molens", href: `${NGR}291afe4b-4f4b-497c-8026-fb437c4e9c7e` },
      { name: "Verdwenen molens", href: `${NGR}7e41f6fa-936d-4fbe-b3b7-fb40dfe1283d` },
    ],
    by: "Rijksdienst voor het Cultureel Erfgoed, verdwenen molens uit de Molendatabase",
  },
  {
    label: "Landschap",
    datasets: [
      { name: "Droogmakerijen", href: `${NGR}cd53d540-f499-4850-8053-e1172c97372e` },
      { name: "Landinrichting in Nederland (1924–2015)", href: `${NGR}ceb8c100-6ce8-4bb1-8084-2b5b215064e9` },
      { name: "Wielen", href: `${NGR}a1f41210-4f4b-4821-abe3-fd74efc580d4` },
    ],
    by: "Rijksdienst voor het Cultureel Erfgoed",
  },
  {
    label: "Polders in Zeeland",
    datasets: [
      { name: "vóór 1300", href: `${NGR}6c6f9ceb-e273-4cb5-b6dc-10020ca0d93f` },
      { name: "1300–1421", href: `${NGR}263b3270-30a2-4e3a-b200-9fb22485a6c6` },
      { name: "1422–1532", href: `${NGR}2dd16541-d8bd-46ef-a56d-b83ded9149d7` },
      { name: "1533–1648", href: `${NGR}f184ad12-78bc-4525-9abd-febc03a82857` },
      { name: "1649–1808", href: `${NGR}66b91518-bf55-4103-8b79-8e0feb4a5975` },
      { name: "1809–1953", href: `${NGR}bfcfbdbf-0c42-4333-93eb-742ab69b9a75` },
      { name: "na 1953", href: `${NGR}dab8ef56-9013-4cb8-96ee-32a2cbe2dc48` },
    ],
    by: "Provincie Zeeland",
  },
  {
    label: "Dijken en dorpen in Zeeland",
    datasets: [
      { name: "Bestaande en verdwenen dijken", href: `${NGR}e5c91c39-8cff-435f-a45d-3218e4584d5c` },
      { name: "Verdronken dorpen", href: `${NGR}6eb9a0b2-b751-40a3-9a7d-5f3ed9d78a8b` },
      { name: "Geschenkwoningen watersnoodramp 1953", href: `${NGR}a04a860d-296d-45c2-8fc0-2e34750c5c90` },
    ],
    by: "Provincie Zeeland",
  },
  {
    label: "Overstromingen",
    datasets: [{ name: "LIWO", href: "https://basisinformatie-overstromingen.nl" }],
    by: "Rijkswaterstaat en Deltares",
  },
  {
    label: "Watersnood 1953",
    datasets: [{ name: "Historische Inundatie Ramp 1953", href: `${NGR}dc382a09-6677-48fd-975e-dee283cea4ad` }],
    by: "Provincie Noord-Brabant",
  },
  {
    label: "Beelden",
    datasets: [{ name: "Collectie Rijksmuseum", href: "https://data.rijksmuseum.nl" }],
    by: "Rijksmuseum",
  },
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

export function AboutCard({ onClose, onTour }: { onClose: () => void; onTour: () => void }) {
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
        <button type="button" className="tour-start" onClick={onTour}>
          Rondleiding opnieuw
        </button>

        <h3>Bronnen</h3>
        <ul className="sources">
          {SOURCES.map((s) => (
            <li key={s.label}>
              <span className="label">{s.label}</span>
              <span>
                {s.datasets.map((d, i) => (
                  <Fragment key={d.href}>
                    {i > 0 && ", "}
                    <Ext href={d.href}>{d.name}</Ext>
                  </Fragment>
                ))}
                . {s.by}
              </span>
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
