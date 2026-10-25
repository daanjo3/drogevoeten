import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { Quad } from '@rdfjs/types';
import { Store, Writer } from 'n3';

export const exists = (path: string): Promise<boolean> =>
  stat(path).then(
    () => true,
    () => false,
  );

export async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
  console.log(`Wrote ${path}`);
}

export async function readJson<T>(path: string): Promise<T> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`Missing input ${path}; run the step that writes it first (see scripts/main.ts).`);
    }
    throw error;
  }
}

/** Writes quads as Turtle, without duplicates (CONSTRUCT emits its template once per solution). */
export async function writeTurtle(path: string, quads: Quad[], prefixes: Record<string, string> = {}): Promise<void> {
  const unique = new Store(quads).getQuads(null, null, null, null);
  const writer = new Writer({ prefixes });
  writer.addQuads(unique);
  const turtle = await new Promise<string>((resolve, reject) =>
    writer.end((error, result) => (error ? reject(error) : resolve(result ?? ''))),
  );
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, turtle);
  console.log(`Wrote ${path} (${unique.length} triples)`);
}
