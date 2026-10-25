// Runs the backbone step and then the source steps, in the order of STEPS.
//
//   node scripts/main.ts [--refresh] [step ...]
//
// Without step names, all steps run. The backbone always runs first, because every step reads
// data/backbone/villages.json. --refresh is passed on to every step (download cached sources again).
// Each step runs in its own Node process and the run stops at the first step that fails.
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

interface Step {
  /** Also the script name (scripts/<name>.ts) and the output directory (data/<name>/). */
  name: string;
  /** Optional outputs of earlier steps the step uses when they exist; documentation only. */
  uses?: string[];
}

// The order in which the steps run. Steps don't depend on each other's outputs, but a step that
// uses another step's output gets better results when it runs after that step.
const STEPS: Step[] = [{ name: 'wikidata' }, { name: 'zeeuws-erfgoedplatform', uses: ['wikidata'] }];

const BACKBONE = 'backbone';

const { values, positionals } = parseArgs({ options: { refresh: { type: 'boolean' } }, allowPositionals: true });
const unknown = positionals.filter((name) => !STEPS.some((s) => s.name === name));
if (unknown.length) {
  throw new Error(`Unknown step ${unknown.join(', ')}. Steps: ${STEPS.map((s) => s.name).join(', ')}`);
}
const selected = positionals.length ? STEPS.filter((s) => positionals.includes(s.name)) : STEPS;
const forwarded = values.refresh ? ['--refresh'] : [];

for (const name of [BACKBONE, ...selected.map((s) => s.name)]) {
  console.log(`\n=== ${name} ===`);
  const started = Date.now();
  const { status, signal } = spawnSync(process.execPath, [join(import.meta.dirname, `${name}.ts`), ...forwarded], {
    stdio: 'inherit',
  });
  if (status !== 0) {
    console.error(`Step ${name} failed (${signal ?? `exit code ${status}`}); stopping.`);
    process.exit(status ?? 1);
  }
  console.log(`=== ${name} done in ${Math.round((Date.now() - started) / 1000)} s ===`);
}
