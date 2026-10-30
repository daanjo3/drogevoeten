import type { ReactNode } from "react";

/* A work from the Rijksmuseum, served through IIIF (micr.io). 800 px wide
   is plenty for a tile and much faster than /full/max/. */
export interface RijksWork {
  title: string;
  maker: string;
  year: string;
  objectNumber: string;
  iiif: string;
  /* the place this work belongs to, matched against the Locatieserver woonplaats */
  place: string;
  /* one sentence that ties the work to the block it sits next to */
  context: string;
}

/* Does this work belong to the address? A work without a place belongs
   everywhere; "beemster" also matches Middenbeemster. */
export function worksFor<T extends RijksWork>(works: T[], woonplaats?: string): T[] {
  const w = (woonplaats ?? "").toLowerCase();
  return works.filter((x) => !x.place || w.includes(x.place.toLowerCase()));
}

export function rijksSrc(w: RijksWork): string {
  return `${w.iiif}/full/800,/0/default.jpg`;
}

export function rijksUrl(w: RijksWork): string {
  return `https://www.rijksmuseum.nl/nl/collectie/${w.objectNumber}`;
}

/* Tile for a Rijksmuseum work: one context sentence, then the museum
   caption (title, maker, year, museum, object number with a link). */
export function RijksTile({ id, work }: { id: string; work: RijksWork }) {
  return (
    <figure className="panel img" id={id}>
      <div className="ph">
        <img
          src={rijksSrc(work)}
          alt={[work.title, work.maker, work.year].filter(Boolean).join(", ")}
          loading="lazy"
          onLoad={() => window.dispatchEvent(new Event("resize"))}
        />
      </div>
      <figcaption className="cap">
        <p className="context">{work.context}</p>
        <span className="museum">
          {work.title} · {work.maker}
          {work.year ? `, ${work.year}` : ""} · Rijksmuseum ·{" "}
          <a href={rijksUrl(work)} target="_blank" rel="noreferrer">
            {work.objectNumber}
          </a>
        </span>
      </figcaption>
    </figure>
  );
}

/* An image tile in the grid. Real works load through IIIF at the source;
   a tile without `src` shows a drawn placeholder with a badge. */
export function ImageTile({
  id,
  badge,
  title,
  caption,
  src,
  alt,
  art,
}: {
  id: string;
  /* small label in the corner, only for placeholders */
  badge?: string;
  title: string;
  caption: ReactNode;
  src?: string;
  alt?: string;
  /* drawn placeholder when there is no image yet */
  art?: ReactNode;
}) {
  return (
    <figure className="panel img" id={id}>
      <div className="ph">
        {badge && <span className="badge">{badge}</span>}
        {src ? <img src={src} alt={alt ?? ""} loading="lazy" /> : art}
      </div>
      <figcaption className="cap">
        <b>{title}</b>
        {caption}
      </figcaption>
    </figure>
  );
}

