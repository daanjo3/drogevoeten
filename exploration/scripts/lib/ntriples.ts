// Streaming over large (gzipped) N-Triples dumps, line by line, without loading them into memory.
// N-Triples has one triple per line, so a triple can be split without a full RDF parser: the
// subject and predicate never contain spaces, and the object is the rest of the line.
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { createGunzip } from 'node:zlib';

export interface RawTriple {
  /** IRI without the angle brackets, or a blank node label starting with "_:". */
  subject: string;
  predicate: string;
  /** The object as written: `<iri>`, `_:label` or a literal with its quotes, datatype or language. */
  object: string;
  /** The whole line, for writing the triple out unchanged. */
  line: string;
}

const unbracket = (term: string): string => (term.startsWith('<') ? term.slice(1, -1) : term);

/** The IRI of an object term, or null for literals and blank nodes. */
export const objectIri = (object: string): string | null => (object.startsWith('<') ? object.slice(1, -1) : null);

/** The lexical value of a literal object term ("foo"@nl, "1"^^<...>), unescaped; null for IRIs and blank nodes. */
export function literalValue(object: string): string | null {
  if (!object.startsWith('"')) return null;
  const end = object.lastIndexOf('"');
  return object.slice(1, end).replace(/\\u([0-9a-fA-F]{4})|\\U([0-9a-fA-F]{8})|\\(.)/g, (_, u4, u8, c) => {
    if (u4 || u8) return String.fromCodePoint(Number.parseInt(u4 ?? u8, 16));
    return ({ n: '\n', r: '\r', t: '\t', b: '\b', f: '\f' } as Record<string, string>)[c] ?? c;
  });
}

/** Calls `visit` for every triple in a .nt or .nt.gz file. Returns the number of triples. */
export async function forEachTriple(path: string, visit: (triple: RawTriple) => void): Promise<number> {
  const input = createReadStream(path);
  const lines = createInterface({
    input: path.endsWith('.gz') ? input.pipe(createGunzip()) : input,
    crlfDelay: Number.POSITIVE_INFINITY,
  });
  let count = 0;
  for await (const line of lines) {
    if (line === '' || line.startsWith('#')) continue;
    const first = line.indexOf(' ');
    const second = line.indexOf(' ', first + 1);
    const end = line.lastIndexOf(' .');
    if (first === -1 || second === -1 || end <= second)
      throw new Error(`Not an N-Triples line in ${path}: ${line.slice(0, 200)}`);
    visit({
      subject: unbracket(line.slice(0, first)),
      predicate: unbracket(line.slice(first + 1, second)),
      object: line.slice(second + 1, end).trimEnd(),
      line,
    });
    count++;
  }
  return count;
}
