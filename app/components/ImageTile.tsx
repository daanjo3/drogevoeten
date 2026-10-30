import type { ReactNode } from "react";

/* A work from the Rijksmuseum, served through IIIF (micr.io). 800 px wide
   is plenty for a tile and much faster than /full/max/. */
export interface RijksWork {
  title: string;
  maker: string;
  year: string;
  objectNumber: string;
  iiif: string;
}

export function rijksSrc(w: RijksWork): string {
  return `${w.iiif}/full/800,/0/default.jpg`;
}

export function rijksUrl(w: RijksWork): string {
  return `https://www.rijksmuseum.nl/nl/collectie/${w.objectNumber}`;
}

/* Tile for a Rijksmuseum work: title, maker and year, museum and object
   number with a link to the collection page. */
export function RijksTile({ id, work }: { id: string; work: RijksWork }) {
  return (
    <ImageTile
      id={id}
      title={work.title}
      src={rijksSrc(work)}
      alt={`${work.title}, ${work.maker}, ${work.year}`}
      caption={
        <>
          {work.maker}, {work.year} · Rijksmuseum ·{" "}
          <a href={rijksUrl(work)} target="_blank" rel="noreferrer">
            {work.objectNumber}
          </a>
        </>
      }
    />
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

/* Drawn placeholder for the pumping station photo (RCE beeldbank). */
export function BoreelArt() {
  return (
    <svg className="art" viewBox="0 0 400 260" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="gb1" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8aa283" />
          <stop offset="1" stopColor="#e8e2d6" />
        </linearGradient>
      </defs>
      <rect width="400" height="260" fill="url(#gb1)" />
      <rect y="200" width="400" height="60" fill="#0087D8" opacity=".85" />
      <rect x="120" y="96" width="170" height="104" fill="#9b5a3c" />
      <polygon points="110,98 300,98 205,52" fill="#242424" />
      <rect x="262" y="40" width="14" height="50" fill="#7a432c" />
      <g fill="#f4efeb">
        <path d="M146 186 v-46 a12 12 0 0 1 24 0 v46z" />
        <path d="M193 186 v-46 a12 12 0 0 1 24 0 v46z" />
        <path d="M240 186 v-46 a12 12 0 0 1 24 0 v46z" />
      </g>
      <rect x="170" y="72" width="70" height="14" fill="#f4efeb" />
      <path d="M290 192 h40 v8 h-40z" fill="#242424" />
      <path
        d="M330 200 q14 8 28 0 q14 8 28 0 M300 214 q14 8 28 0 q14 8 28 0"
        stroke="#fff"
        strokeWidth="2.5"
        fill="none"
        opacity=".8"
      />
    </svg>
  );
}
