/* Unstyled test page: Rijksmuseum images for an address, via Comunica and IIIF.
   /rijksmuseum-test?q=<address> or, without q, a random demo address per reload. */

import { useState } from "react";
import { useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { freeQueryOptions } from "../lib/locatieserver";
import { DATA_URL, findImages, imagesQuery, loadStore, locationOf, RANK_LABELS } from "../lib/rijksmuseum";

const DEMO_ADDRESSES = [
  "Abdij 4, Middelburg",
  "Koningin Maudplein 1, Nieuwerkerk",
  "Elisabethweg 2, Heijningen",
  "Middenweg 68a, Middenbeemster",
  "Nieuwburen 1, Lemmer",
  "Hoofdweg 569, Hoofddorp",
  "Walstraat 1, Vlissingen",
  "Grote Markt 1, Gorinchem",
  "Havenpark 1, Zierikzee",
  "Markt 1, Kruiningen",
];

export default function RijksmuseumTest() {
  const [params] = useSearchParams();
  const [random] = useState(() => DEMO_ADDRESSES[Math.floor(Math.random() * DEMO_ADDRESSES.length)]);
  const q = params.get("q") || random;

  const geocode = useQuery(freeQueryOptions({ q, fq: ["type:adres"], rows: 1 }));
  const doc = geocode.data?.response.docs[0];
  const loc = locationOf(doc);

  const store = useQuery({
    queryKey: ["rijksmuseum", "store"],
    queryFn: async () => {
      const t = performance.now();
      const s = await loadStore();
      return { size: s.size, ms: Math.round(performance.now() - t) };
    },
    staleTime: Infinity,
  });

  const images = useQuery({
    queryKey: ["rijksmuseum", "images", loc],
    queryFn: async () => {
      const t = performance.now();
      const rows = await findImages(loc!);
      return { rows, ms: Math.round(performance.now() - t) };
    },
    enabled: !!loc && store.isSuccess,
  });

  return (
    <main>
      <h1>Rijksmuseum IIIF-test</h1>
      <form method="get">
        <input name="q" defaultValue={params.get("q") ?? ""} placeholder={random} size={40} />{" "}
        <button type="submit">Zoek</button> <a href="?">willekeurig adres</a>
      </form>

      <p>
        Adres: <b>{q}</b>
        {!params.get("q") && " (willekeurig, herlaad voor een ander)"}
        <br />
        {geocode.isPending && "Adres zoeken bij PDOK…"}
        {geocode.isError && `PDOK: ${String(geocode.error)}`}
        {geocode.isSuccess && !doc && "PDOK vond dit adres niet."}
        {doc && (
          <>
            {doc.weergavenaam} · woonplaats {doc.woonplaatsnaam} · gemeente {doc.gemeentenaam} · provincie{" "}
            {doc.provincienaam} · {loc?.lat.toFixed(4)}, {loc?.lon.toFixed(4)}
          </>
        )}
        <br />
        Data: <a href={DATA_URL}>{DATA_URL}</a>{" "}
        {store.isPending && "laden…"}
        {store.isError && String(store.error)}
        {store.data && `${store.data.size} triples, geladen in ${store.data.ms} ms`}
        <br />
        {images.isFetching && "Comunica draait de query…"}
        {images.isError && `Query: ${String(images.error)}`}
        {images.data && `${images.data.rows.length} beelden, query in ${images.data.ms} ms`}
      </p>

      {images.data && images.data.rows.length === 0 && <p>Geen beelden voor deze plek.</p>}

      {images.data?.rows.map((img) => (
        <figure key={img.object}>
          <a href={`${img.iiif}/full/max/0/default.jpg`}>
            <img src={`${img.iiif}/full/400,/0/default.jpg`} alt={img.title} width={400} loading="lazy" />
          </a>
          <figcaption>
            <b>{img.title}</b>
            {img.year ? `, ${img.year}` : ""}
            <br />
            thema: {img.theme} · match: {RANK_LABELS[img.rank]}
            {img.km !== undefined && ` · ~${Math.round(img.km)} km`}
            <br />
            toont: {img.depicts}
            <br />
            rechten: {img.license ?? "onbekend"}
            <br />
            <a href={`${img.iiif}/info.json`}>info.json</a> ·{" "}
            <a href={`${img.iiif}/full/max/0/default.jpg`}>volledig</a> ·{" "}
            <a href={`${img.iiif}/square/200,/0/default.jpg`}>vierkant</a> · <a href={img.object}>{img.objectNumber ?? "object"}</a>
            {img.page && (
              <>
                {" "}
                · <a href={img.page}>collectie</a>
              </>
            )}
          </figcaption>
        </figure>
      ))}

      {loc && (
        <details>
          <summary>SPARQL</summary>
          <pre>{imagesQuery(loc)}</pre>
        </details>
      )}
    </main>
  );
}
