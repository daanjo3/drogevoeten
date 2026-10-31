import { nl } from "../lib/scenario";
import { Tip } from "./Tip";
import { TERMS } from "../data/place";

/* Height map of the Netherlands (image in public/img, 758 x 900) with a pin
   on the address and the height of the address under it. */

/* WGS84 to image pixels: the image stretches from 3.36 to 7.227 east and
   from 53.555 to 50.75 north (the extreme points of the country), 177.4 px
   per degree of longitude and 285.2 per degree of latitude. The image's own
   georeference is unknown; checked by eye on twelve cities and both ends of
   the Afsluitdijk: within about 10 px. */
const IMG_W = 758;
const IMG_H = 900;
const LON_SCALE = 177.4;
const LON_OFFSET = 46 - 3.36 * 177.4;
const LAT_SCALE = -285.2;
const LAT_OFFSET = 76 + 53.555 * 285.2;

/* Abdij 4, Middelburg: shown until an address is known */
const DEFAULT_PIN: [number, number] = [90, 662];

/* Parse a Locatieserver centroide_ll ("POINT(lon lat)") into image pixels. */
export function pinFor(centroide?: string): [number, number] {
  const m = centroide?.match(/POINT\(\s*(-?[\d.]+)\s+(-?[\d.]+)\s*\)/);
  if (!m) return DEFAULT_PIN;
  const lon = Number(m[1]);
  const lat = Number(m[2]);
  return [lon * LON_SCALE + LON_OFFSET, lat * LAT_SCALE + LAT_OFFSET];
}

/* nap: ground level in m NAP, undefined while unknown */
export function NlMap({ centroide, nap }: { centroide?: string; nap?: number }) {
  const [x, y] = pinFor(centroide);
  return (
    <section className="panel" id="p-map">
      <h2>Een kwart van Nederland ligt onder zeeniveau, op het laagste punt bijna 7 meter.</h2>
      <div className="kaartrij">
        <svg className="nl" viewBox={`0 0 ${IMG_W} ${IMG_H}`} aria-label="Hoogtekaart van Nederland met jouw locatie" role="img">
          <image href={`${import.meta.env.BASE_URL}img/nederland-hoogte.png`} width={IMG_W} height={IMG_H} />
          <g id="mapPin" transform={`translate(${x} ${y})`}>
            <circle className="ping" r="26" fill="none" stroke="#FFA654" strokeWidth="7" />
            <circle r="20" fill="#FFA654" stroke="#242424" strokeWidth="6" />
          </g>
        </svg>
      </div>
      <p className="kaartcap">
        {nap === undefined ? (
          "Hoe hoog woon je?"
        ) : (
          <>
            {Math.round(Math.abs(nap) * 10) === 0
              ? "Je woont precies op "
              : `Je woont ${nl(Math.abs(nap))} meter ${nap >= 0 ? "boven" : "onder"} `}
            <Tip kind="term" tip={TERMS.zeeniveau}>
              zeeniveau
            </Tip>
            .
          </>
        )}
      </p>
      <p className="src">
        <Tip kind="bron" tip="Planbureau voor de Leefomgeving (2010): 26 procent van Nederland ligt onder zeeniveau, 59 procent kan overstromen. Laagste punt: Rijkswaterstaat, 6,76 meter onder NAP.">
          bron
        </Tip>
      </p>
    </section>
  );
}
