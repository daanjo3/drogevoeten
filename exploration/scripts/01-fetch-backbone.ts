// Backbone: Kaart Verdronken Dorpen Zeeland (Provincie Zeeland), WFS layer chs:geocmd_vrddrppnt.
//
// Writes data/backbone/villages.geojson and data/backbone/villages.json from one of two sources,
// selected with BACKBONE_SOURCE (see lib/config.ts):
// - wfs (default): downloads the layer as GeoJSON in WGS84 into dumps/ (reused on later runs, pass
//   --refresh to download again). The WFS backend is sometimes unavailable (GeoServer answers with an
//   ows:ExceptionReport); then use the backup, or open WFS_URL in a browser and save the response as
//   dumps/verdronken-dorpen.geojson.
// - backup: reads the JSON export in BACKBONE_BACKUP_FILE (exploration/resources/ by default).
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { config } from './lib/config.ts';
import { fetchText } from './lib/http.ts';
import { readJson, writeJson } from './lib/io.ts';
import { dataPath, dumpPath } from './lib/paths.ts';
import type { Village } from './lib/types.ts';

interface Feature {
  type: 'Feature';
  id: string;
  geometry: { type: string; coordinates: number[] } | null;
  properties: Record<string, unknown>;
}

interface FeatureCollection {
  type: 'FeatureCollection';
  features: Feature[];
}

/** A record in the backup file. */
interface BackupRecord {
  naam: string;
  namen: string[];
  gemeente: string;
  rd_x: number;
  rd_y: number;
  lat: number;
  lon: number;
}

const WFS_URL =
  'https://opengeodata.zeeland.nl/geoserver/chs/wfs?service=WFS&version=2.0.0&request=GetFeature' +
  '&typeNames=chs:geocmd_vrddrppnt&outputFormat=application/json&srsName=EPSG:4326';

// WGS84 bounding box of the layer according to GetCapabilities, widened slightly.
const BBOX = { minLon: 3.2, maxLon: 4.4, minLat: 51.1, maxLat: 51.9 };

// Property keys that may hold the village name; the actual schema is checked at runtime.
const NAME_KEY_PATTERN = /^(naam|name|dorp|dorpsnaam|plaatsnaam)$/i;

const DUMP_FILE = dumpPath('verdronken-dorpen.geojson');
const refresh = process.argv.includes('--refresh');

const inBbox = ([lon, lat]: number[]): boolean =>
  lon >= BBOX.minLon && lon <= BBOX.maxLon && lat >= BBOX.minLat && lat <= BBOX.maxLat;

function rejectExceptionReport(body: string): void {
  if (body.trimStart().startsWith('<')) {
    const message = body.match(/<ows:ExceptionText>([\s\S]*?)<\/ows:ExceptionText>/)?.[1] ?? body.slice(0, 500);
    throw new Error(`WFS returned an exception instead of GeoJSON: ${message.split('\n')[0]}`);
  }
}

async function loadGeoJson(): Promise<FeatureCollection> {
  if (!refresh) {
    try {
      const cached = JSON.parse(await readFile(DUMP_FILE, 'utf8')) as FeatureCollection;
      console.log(`Using cached dump ${DUMP_FILE} (pass --refresh to download again)`);
      return cached;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  console.log(`Fetching ${WFS_URL}\n(this can take a minute)`);
  const body = await fetchText(WFS_URL, { validate: rejectExceptionReport });
  await mkdir(dirname(DUMP_FILE), { recursive: true });
  await writeFile(DUMP_FILE, body);
  console.log(`Wrote ${DUMP_FILE}`);
  return JSON.parse(body) as FeatureCollection;
}

/** Returns [lon, lat], swapping the axes if the service returned lat/lon order. */
function toLonLat(feature: Feature): [number, number] {
  if (feature.geometry?.type !== 'Point') {
    throw new Error(`Feature ${feature.id} has geometry ${feature.geometry?.type}, expected Point`);
  }
  const [x, y] = feature.geometry.coordinates;
  if (inBbox([x, y])) return [x, y];
  if (inBbox([y, x])) return [y, x];
  throw new Error(
    `Feature ${feature.id} has coordinates ${x},${y} outside Zeeland. ` +
      'Is the dump in EPSG:4326? Download it with srsName=EPSG:4326.',
  );
}

async function loadFromWfs(): Promise<Village[]> {
  const geojson = await loadGeoJson();
  if (geojson.type !== 'FeatureCollection' || !Array.isArray(geojson.features)) {
    throw new Error('Expected a GeoJSON FeatureCollection');
  }
  const propertyKeys = Object.keys(geojson.features[0]?.properties ?? {});
  const nameKey = propertyKeys.find((key) => NAME_KEY_PATTERN.test(key));
  if (!nameKey) {
    throw new Error(`No name property found. Available properties: ${propertyKeys.join(', ')}`);
  }
  console.log(`Name taken from property "${nameKey}"; properties: ${propertyKeys.join(', ')}`);
  return geojson.features.map((feature) => {
    const [lon, lat] = toLonLat(feature);
    return {
      id: feature.id,
      name: String(feature.properties[nameKey]).trim(),
      altNames: [],
      municipality: null,
      lon,
      lat,
      properties: feature.properties,
    };
  });
}

const slug = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

async function loadFromBackup(): Promise<Village[]> {
  console.log(`Reading backup ${config.backboneBackupFile}`);
  const records = await readJson<BackupRecord[]>(config.backboneBackupFile);
  if (!Array.isArray(records)) throw new Error('Expected the backup file to contain a JSON array');

  // The backup contains a few exact duplicates.
  const unique = [...new Map(records.map((r) => [JSON.stringify(r), r])).values()];
  if (unique.length < records.length) console.log(`Skipped ${records.length - unique.length} duplicate records`);

  // Ids from the name, with the municipality added where a name occurs more than once.
  const nameCounts = new Map<string, number>();
  for (const r of unique) nameCounts.set(r.naam, (nameCounts.get(r.naam) ?? 0) + 1);
  const ids = new Set<string>();

  return unique.map((record) => {
    const { naam, namen, gemeente, lat, lon } = record;
    if (typeof naam !== 'string' || typeof lat !== 'number' || typeof lon !== 'number') {
      throw new Error(`Invalid backup record: ${JSON.stringify(record)}`);
    }
    if (!inBbox([lon, lat])) throw new Error(`Backup record ${naam} has coordinates ${lon},${lat} outside Zeeland`);

    let id = slug((nameCounts.get(naam) ?? 0) > 1 ? `${naam} ${gemeente}` : naam);
    for (let n = 2; ids.has(id); n++) id = `${slug(naam)}-${n}`;
    ids.add(id);

    const name = naam.trim();
    const altNames = [...new Set((namen ?? []).map((n) => n.trim()))].filter((n) => n && n !== name);
    for (const n of [name, ...altNames]) {
      if (n.includes('?')) console.warn(`Warning: name "${n}" of ${id} looks garbled (encoding problem?)`);
    }
    return {
      id,
      name,
      altNames,
      municipality: gemeente?.trim() || null,
      lon,
      lat,
      properties: record as unknown as Record<string, unknown>,
    };
  });
}

console.log(`Backbone source: ${config.backboneSource}`);
const villages = config.backboneSource === 'backup' ? await loadFromBackup() : await loadFromWfs();

const features = villages.map((village) => ({
  type: 'Feature',
  id: village.id,
  geometry: { type: 'Point', coordinates: [village.lon, village.lat] },
  properties: village.properties,
}));

await writeJson(dataPath('backbone', 'villages.geojson'), { type: 'FeatureCollection', features });
await writeJson(dataPath('backbone', 'villages.json'), villages);
console.log(`${villages.length} villages from ${config.backboneSource}`);
