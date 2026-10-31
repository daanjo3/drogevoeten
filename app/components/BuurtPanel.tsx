import { Fragment, useState } from "react";
import { CircleMarker, Polygon, Tooltip } from "react-leaflet";
import { Icon } from "./Icons";
import { Tip } from "./Tip";
import LeafletMap from "./leaflet-map";
import type { LocatieserverDoc } from "../lib/locatieserver";
import { isBuiltName, useGemalen } from "../lib/gemalen";
import { combineGemalen, MATCH_MAX_M, type CombinedGemaal } from "../lib/linkset";
import { toLatLngs, usePeilgebied } from "../lib/waterbeheergebieden";
import { TERMS } from "../data/place";

interface Props {
  /* undefined until the address lookup is done */
  place?: LocatieserverDoc;
}

const RADIUS_M = 5000;
// number of gemalen in the list and on the map
const MAX_SHOWN = 5;
// used until the address has a coordinate
const FALLBACK: [number, number] = [51.4987105, 3.6138756];
// Only photos from the RCE image bank. foto_thumb also points to gemalen.nl
// (no open licence), watertorens.eu (licence unknown) and a "no photo" placeholder.
const PHOTO_HOSTS = ["images.memorix.nl"];

function isAllowedPhoto(url: string): boolean {
  try {
    return PHOTO_HOSTS.includes(new URL(url).hostname);
  } catch {
    return false;
  }
}

/* One row in the list and one dot on the map, from either layer. */
interface Poi {
  id: string;
  name: string;
  lat: number;
  lon: number;
  distance: number;
  status: string;
  text: string;
  /* a web page about the object, if any */
  source?: { href: string; tip: string };
  /* one page with all fields per source the gemaal comes from */
  metadata: { label: string; href: string; tip: string }[];
  /* from the Landschapsatlas */
  photo?: { src: string; tip: string };
}

/* A gemaal from IMWA, the Landschapsatlas or both, as linked data. IMWA
   gives the current register (position, function, water board), the
   Landschapsatlas the history (founding year, drive, status, gemalen.nl
   page, photo). */
function fromCombined(c: CombinedGemaal): Poi {
  const im = c.imwa;
  const la = c.atlas;
  // the position from the register when we have it
  const { lat, lon } = (im ?? la)!;
  // a name the conversion built ("... (naam onbekend)") only when there is no other
  const name = im && !(isBuiltName(im.name) && la && !isBuiltName(la.name)) ? im.name : la!.name;
  const driveThen = la?.driveThen?.toLowerCase();
  const driveNow = la?.driveNow?.toLowerCase();
  const drive = driveThen && driveNow && driveThen !== driveNow ? `eerst ${driveThen}, nu ${driveNow}` : driveNow || driveThen;
  const fn = im?.function || la?.functions.join(" en ");
  const parts = [
    la?.founded ? `Gesticht in ${la.founded}.` : "",
    fn ? `Functie: ${fn.toLowerCase()}.` : "",
    la?.outlets.length ? `Loost op ${la.outlets.join(" en ")}.` : "",
    drive ? `Aandrijving: ${drive}.` : "",
    im?.maintainer ? `Beheerd door ${im.maintainer}.` : "",
  ];

  const linked = c.linkDistance !== undefined ? ` Gekoppeld aan het register van de waterschappen op naam en afstand (${Math.round(c.linkDistance)} m).` : "";
  const source = la?.url
    ? { href: la.url, tip: `Bron: Nederlandse Gemalenstichting (gemalen.nl), via de RCE Landschapsatlas en de Droge Voeten linked data.${linked}` }
    : undefined;

  const metadata: Poi["metadata"] = [];
  if (im?.derivedFrom) {
    metadata.push({ label: "imwa", href: htmlUrl(im.derivedFrom), tip: "Het bronobject in IMWA, het register van de waterschappen (PDOK), waar dit linked-datarecord uit gemaakt is" });
  }
  if (la?.derivedFrom) {
    metadata.push({ label: "rce", href: la.derivedFrom, tip: "Het bronobject in de RCE Landschapsatlas (WFS, GeoJSON), waar dit linked-datarecord uit gemaakt is" });
  }

  return {
    id: c.id,
    name,
    lat,
    lon,
    distance: c.distance,
    // the Landschapsatlas says whether it still works ("In bedrijf", "Gesloopt"); IMWA only "gerealiseerd"
    status: la?.status || im?.status || "onbekend",
    text: parts.filter(Boolean).join(" ") || "Geen verdere gegevens.",
    source,
    metadata,
    photo:
      la?.photo && isAllowedPhoto(la.photo.thumb)
        ? { src: la.photo.thumb, tip: la.photo.credit ? `${la.name} · ${la.photo.credit}` : la.name }
        : undefined,
  };
}

/* The OGC API item as a web page instead of JSON */
function htmlUrl(href: string): string {
  try {
    const url = new URL(href);
    url.searchParams.set("f", "html");
    return url.toString();
  } catch {
    return href;
  }
}

/* "POINT(lon lat)" -> [lat, lon] */
function parsePoint(wkt?: string): [number, number] | undefined {
  const m = wkt?.match(/POINT\(([-\d.]+) ([-\d.]+)\)/);
  return m ? [Number(m[2]), Number(m[1])] : undefined;
}

function formatDistance(m: number): string {
  return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1).replace(".", ",")} km`;
}

/* Pumping stations and mills nearby. Dots on the map and rows in the list
   are linked: pick one and both highlight, and the details show. */
export function BuurtPanel({ place }: Props) {
  const here = parsePoint(place?.centroide_ll);
  const [lat, lon] = here ?? [undefined, undefined];

  // Both datasets in parallel from the linked data, everything in the circle:
  // combining needs them all, we show the nearest MAX_SHOWN of the union.
  // The Landschapsatlas a bit wider, so IMWA gemalen near the edge can still be linked.
  const { imwa, atlas } = useGemalen(here && { lat: here[0], lon: here[1] }, RADIUS_M / 1000, MATCH_MAX_M / 1000);

  // the area around the address where one water level is kept
  const { peilgebied } = usePeilgebied(lat, lon);
  const pg = peilgebied?.properties;
  const pgName = pg?.naam?.trim() || pg?.code || "zonder naam";

  // wait for both, so the list doesn't reshuffle; a failed source counts as empty
  const loading = imwa.isLoading || atlas.isLoading;
  const failed = imwa.isError && atlas.isError;
  const partial = imwa.isError !== atlas.isError;
  const pois = loading
    ? []
    : combineGemalen(imwa.data ?? [], atlas.data ?? [], RADIUS_M).slice(0, MAX_SHOWN).map(fromCombined);

  const [picked, setPicked] = useState<string | null>(null);
  const g = pois.find((p) => p.id === picked) ?? null;
  // photo urls that failed to load, so we don't show an empty square
  const [broken, setBroken] = useState<ReadonlySet<string>>(new Set());
  const photo = g?.photo && !broken.has(g.photo.src) ? g.photo : undefined;

  return (
    <section className="panel" id="p-buurt">
      <span className="meta">binnen {RADIUS_M / 1000} km</span>
      <h2>
        <Icon name="buurt" />
        Zij houden je voeten droog
      </h2>
      <p className="lead">
        Een gemaal is een gebouw met grote pompen. Het pompt water uit de polder naar de rivier of de zee. Vroeger deden molens dat,
        op de wind. Klik op een stip en zie wie hier nog meedoet.
        {pg && (
          <>
            {" "}
            De lijn is jouw{" "}
            <Tip kind="term" tip={TERMS.peilgebied}>
              peilgebied
            </Tip>{" "}
            {pgName}
            {pg.waterbeheerder ? `, van ${pg.waterbeheerder}` : ""}.
          </>
        )}
      </p>
      <div className="buurt">
        <div className="map" id="map">
          <LeafletMap center={here ?? FALLBACK} zoom={13} style={{}}>
            {peilgebied && (
              <Polygon
                key={peilgebied.id}
                positions={toLatLngs(peilgebied.geometry)}
                pathOptions={{ color: "#16324f", weight: 3, dashArray: "6 6", fillColor: "#16324f", fillOpacity: 0.08 }}
              >
                <Tooltip sticky>
                  peilgebied {pgName}
                  {pg?.code && pg.code !== pgName ? ` (${pg.code})` : ""}
                  {pg?.waterbeheerder ? ` · ${pg.waterbeheerder}` : ""}
                </Tooltip>
              </Polygon>
            )}
            {here && (
              <CircleMarker center={here} radius={7} pathOptions={{ color: "#16324f", weight: 3, fillColor: "#fff", fillOpacity: 1 }}>
                <Tooltip>{place?.type === "woonplaats" ? "deze plaats" : "dit adres"}</Tooltip>
              </CircleMarker>
            )}
            {pois.map((p) => (
              <CircleMarker
                key={p.id}
                center={[p.lat, p.lon]}
                radius={picked === p.id ? 10 : 8}
                pathOptions={{
                  color: picked === p.id ? "#16324f" : "#fff",
                  weight: 3,
                  fillColor: picked === p.id ? "#f5b82e" : "#16324f",
                  fillOpacity: 1,
                }}
                eventHandlers={{ click: () => setPicked(p.id) }}
              >
                <Tooltip>{p.name}</Tooltip>
              </CircleMarker>
            ))}
          </LeafletMap>
        </div>
        <div className="side">
          <ul id="list">
            {loading && <li>Gemalen en molens zoeken…</li>}
            {failed && <li>De bronnen gaven geen antwoord. Probeer het later nog eens.</li>}
            {partial && <li>Een van de bronnen gaf geen antwoord, dus de lijst is misschien niet compleet.</li>}
            {!loading && !failed && here && pois.length === 0 && <li>Geen gemalen of molens binnen {RADIUS_M / 1000} km.</li>}
            {pois.map((p) => (
              <li key={p.id}>
                <button type="button" aria-pressed={picked === p.id} onClick={() => setPicked(p.id)}>
                  <span>
                    <b>{p.name}</b> · {formatDistance(p.distance)}
                  </span>
                  <span className="pill" data-status={p.status}>
                    {p.status}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <div id="detail" className={photo ? "with-foto" : undefined}>
            {g ? (
              <>
                {photo && (
                  <Tip kind="foto" tip={photo.tip}>
                    <img
                      src={photo.src}
                      alt={`Foto van ${g.name}`}
                      loading="lazy"
                      onError={() => setBroken((b) => new Set(b).add(photo.src))}
                    />
                  </Tip>
                )}
                <div>
                  <b>{g.name}</b>
                  {g.text}
                  <small>
                    status · {g.status} &nbsp;{" "}
                    {g.source && (
                      <Tip kind="bron" tip={g.source.tip}>
                        <a href={g.source.href} target="_blank" rel="noreferrer">bron</a>
                      </Tip>
                    )}{" "}
                    {g.metadata.map((m) => (
                      <Fragment key={m.label}>
                        {" "}
                        <Tip kind="bron" tip={m.tip}>
                          <a href={m.href} target="_blank" rel="noreferrer">metadata · {m.label}</a>
                        </Tip>
                      </Fragment>
                    ))}
                  </small>
                </div>
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
