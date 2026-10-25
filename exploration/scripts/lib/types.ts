import type { DrowningCause } from './vocab.ts';

/** A backbone village, as written by the backbone script to data/backbone/villages.json. */
export interface Village {
  id: string;
  name: string;
  /** Alternative and historical names (only available from the backup source). */
  altNames: string[];
  municipality: string | null;
  lon: number;
  lat: number;
  /** The village's row in the Wikipedia list, when one was accepted. */
  wikipedia: WikipediaListEntry | null;
  /** When the village drowned, from its row in the Wikipedia list. */
  drowned: Drowning | null;
  /** The original record from the source. */
  properties: Record<string, unknown>;
}

export interface WikipediaListEntry {
  /** The row number ("Nr"). */
  row: number;
  /** The IRI of the row (vd:WikipediaListRow). */
  record: string;
  /** The names in the row's first column, without alternative names. */
  names: string[];
  /** The linked article; it can describe a successor of the drowned village. */
  article: string | null;
}

export interface Drowning {
  /** The text the dates were taken from, as written. */
  text: string;
  /** The last date mentioned, as a year range (one year, a range such as 1550-1600, or a century). */
  beginYear: number;
  endYear: number;
  cause: DrowningCause[];
}
