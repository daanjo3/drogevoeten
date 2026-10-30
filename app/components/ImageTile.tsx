import type { ReactNode } from "react";

/* An image tile in the grid. Placeholder images for now; the real app loads
   the image through IIIF at the source (Rijksmuseum, RCE beeldbank). */
export function ImageTile({
  id,
  badge = "placeholder",
  title,
  caption,
  src,
  alt,
  art,
}: {
  id: string;
  badge?: string;
  title: string;
  caption: string;
  src?: string;
  alt?: string;
  /* drawn placeholder when there is no image yet */
  art?: ReactNode;
}) {
  return (
    <figure className="panel img" id={id}>
      <div className="ph">
        <span className="badge">{badge}</span>
        {src ? <img src={src} alt={alt ?? ""} loading="lazy" /> : art}
      </div>
      <figcaption className="cap">
        <b>{title}</b>
        {caption}
      </figcaption>
    </figure>
  );
}

/* Drawn placeholders from the prototype. */
export function PrentArt() {
  return (
    <svg className="art" viewBox="0 0 400 260" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <pattern id="hp1" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(-20)">
          <line x1="0" y1="0" x2="0" y2="6" stroke="#242424" strokeWidth=".8" />
        </pattern>
        <pattern id="hp2" width="4" height="4" patternUnits="userSpaceOnUse">
          <line x1="0" y1="2" x2="4" y2="2" stroke="#242424" strokeWidth="1" />
        </pattern>
      </defs>
      <rect width="400" height="260" fill="#f2ece2" />
      <rect width="400" height="120" fill="url(#hp1)" opacity=".35" />
      <path
        d="M0 160 L120 150 L140 168 L170 168 L190 146 L400 138 L400 150 L196 158 L176 178 L134 178 L116 160 L0 172Z"
        fill="#242424"
      />
      <rect y="172" width="400" height="88" fill="url(#hp2)" opacity=".8" />
      <g fill="#f2ece2" stroke="#242424" strokeWidth="2">
        <path d="M40 182 v-24 l18 -16 l18 16 v24" />
        <path d="M230 186 v-18 l14 -12 l14 12 v18" />
        <path d="M300 180 v-26 l20 -18 l20 18 v26" />
      </g>
      <path d="M150 200 q10 -10 20 0 q10 -10 20 0" stroke="#242424" strokeWidth="1.5" fill="none" />
      <rect x="6" y="6" width="388" height="248" fill="none" stroke="#242424" strokeWidth="2" />
    </svg>
  );
}

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
