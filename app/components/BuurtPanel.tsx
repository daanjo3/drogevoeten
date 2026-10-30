import { useState } from "react";
import { CircleMarker, Tooltip } from "react-leaflet";
import { Icon } from "./Icons";
import { Tip } from "./Tip";
import LeafletMap from "./leaflet-map";
import type { LocatieserverDoc } from "../lib/locatieserver";
import { featureUrl, useNear, type Gemaal, type NearFeature } from "../lib/landschapsatlas";

interface Props {
  /* undefined until the address lookup is done */
  place?: LocatieserverDoc;
}

const RADIUS_M = 5000;
const PER_LAYER = 5;
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
  /* the gemalen.nl page, if any */
  source?: string;
  /* the raw WFS feature as GeoJSON */
  metadata: string;
  photo?: { src: string; tip: string };
}

function fromGemaal(f: NearFeature<Gemaal>): Poi {
  const p = f.properties;
  const since = p.stichtingsjaar ? `, gesticht in ${p.stichtingsjaar}` : "";
  return {
    id: f.id,
    name: p.naam_gemaal,
    lat: f.geometry.coordinates[1],
    lon: f.geometry.coordinates[0],
    distance: f.distance,
    status: p.status || "onbekend",
    text: `${p.functie}${since}. Loost op ${p.lozend_op || "onbekend"}.`,
    source: p.infolink || undefined,
    metadata: featureUrl("landschapsatlas:gemalen", f.id),
    photo: isAllowedPhoto(p.foto_thumb)
      ? { src: p.foto_thumb, tip: p.fotograaf ? `${p.naam_gemaal} · foto: ${p.fotograaf}` : p.naam_gemaal }
      : undefined,
  };
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

  const gemalen = useNear({ typeName: "landschapsatlas:gemalen", lat, lon, radius: RADIUS_M, limit: PER_LAYER });

  const pois = [...(gemalen.data ?? []).map(fromGemaal)].sort(
    (a, b) => a.distance - b.distance,
  );
  const loading = gemalen.isLoading;
  const failed = gemalen.isError;

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
      </p>
      <div className="buurt">
        <div className="map" id="map">
          <LeafletMap center={here ?? FALLBACK} zoom={13} style={{}}>
            {here && (
              <CircleMarker center={here} radius={7} pathOptions={{ color: "#16324f", weight: 3, fillColor: "#fff", fillOpacity: 1 }}>
                <Tooltip>dit adres</Tooltip>
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
            {failed && <li>De Landschapsatlas gaf geen antwoord. Probeer het later nog eens.</li>}
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
                      <Tip kind="bron" tip="Bron: Nederlandse Gemalenstichting, via de RCE Landschapsatlas">
                        <a href={g.source} target="_blank" rel="noreferrer">bron</a>
                      </Tip>
                    )}{" "}
                    <Tip kind="bron" tip="Alle gegevens van dit gemaal zoals de RCE Landschapsatlas ze levert (WFS, GeoJSON)">
                      <a href={g.metadata} target="_blank" rel="noreferrer">metadata</a>
                    </Tip>
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
