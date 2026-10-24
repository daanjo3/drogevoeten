/** A backbone village, as written by 01-fetch-backbone to data/backbone/villages.json. */
export interface Village {
  id: string;
  name: string;
  /** Alternative and historical names (only available from the backup source). */
  altNames: string[];
  municipality: string | null;
  lon: number;
  lat: number;
  /** The original record from the source. */
  properties: Record<string, unknown>;
}
