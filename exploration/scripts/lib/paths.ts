import { join, resolve } from 'node:path';

// Resolve shared directories from the repository root, so scripts work from any cwd.
export const REPO_ROOT = resolve(import.meta.dirname, '../../..');
export const EXPLORATION_ROOT = join(REPO_ROOT, 'exploration');
export const QUERIES_DIR = join(EXPLORATION_ROOT, 'queries');
export const DATA_DIR = join(REPO_ROOT, 'data');
export const DUMPS_DIR = join(REPO_ROOT, 'dumps');

export const dataPath = (...parts: string[]): string => join(DATA_DIR, ...parts);
export const dumpPath = (...parts: string[]): string => join(DUMPS_DIR, ...parts);
export const queryPath = (name: string): string => join(QUERIES_DIR, name);
