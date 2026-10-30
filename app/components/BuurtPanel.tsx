import { useState } from "react";
import { CircleMarker, Tooltip } from "react-leaflet";
import { Icon } from "./Icons";
import { Tip } from "./Tip";
import LeafletMap from "./leaflet-map";
import type { LocatieserverDoc } from "../lib/locatieserver";
import { featureUrl, useNear, type Gemaal, type Molen, type NearFeature } from "../lib/landschapsatlas";

interface Props {
  place: LocatieserverDoc
}

const RADIUS_M = 5000;
const PER_LAYER = 5;
// used until the address has a coordinate
const FALLBACK: [number, number] = [51.4987105, 3.6138756];

/* One row in the list and one dot on the map, from either layer. */
interface Poi {
  id: string;
  name: string;
  lat: number;
  lon: number;
  distance: number;
  status: string;
  text: string;
  source: string;
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
    source: featureUrl("landschapsatlas:gemalen", f.id),
  };
}

function fromMolen(f: NearFeature<Molen>): Poi {
  const p = f.properties;
  const built = p.BOUWJAAR ? `, gebouwd in ${p.BOUWJAAR}` : "";
  return {
    id: f.id,
    name: p.NAAM || "Molen zonder naam",
    lat: f.geometry.coordinates[1],
    lon: f.geometry.coordinates[0],
    distance: f.distance,
    status: p.STAAT || "onbekend",
    text: `${p.TYPE} (${p.FUNCTIE})${built}.`,
    source: featureUrl("landschapsatlas:Molens", f.id),
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
  const here = parsePoint(place.centroide_ll);
  console.log(here)
  const [lat, lon] = here ?? [undefined, undefined];

  const gemalen = useNear({ typeName: "landschapsatlas:gemalen", lat, lon, radius: RADIUS_M, limit: PER_LAYER });
  const molens = useNear({ typeName: "landschapsatlas:Molens", lat, lon, radius: RADIUS_M, limit: PER_LAYER });

  const pois = [...(gemalen.data ?? []).map(fromGemaal), ...(molens.data ?? []).map(fromMolen)].sort(
    (a, b) => a.distance - b.distance,
  );
  const loading = gemalen.isLoading || molens.isLoading;
  const failed = gemalen.isError || molens.isError;

  const [picked, setPicked] = useState<string | null>(null);
  const g = pois.find((p) => p.id === picked) ?? null;

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
        <div>
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
          <div id="detail">
            {g ? (
              <>
                <b>{g.name}</b>
                {g.text}
                <small>
                  status · {g.status} &nbsp;{" "}
                  <Tip kind="bron" tip="Bron: RCE Landschapsatlas">
                    <a href={g.source} target="_blank" rel="noreferrer">bron</a>
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
