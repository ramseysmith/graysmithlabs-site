#!/usr/bin/env node
// Bundles TubTender's chemistry engine (ramseysmith/tubtender src/engine) into
// hot-tub-calculator/engine.js so the web calculator runs the exact math the app
// runs. The engine is the only thing allowed to calculate a dose, so the page
// never does its own arithmetic on amounts.
//
//   node tools/hot-tub/build.mjs --engine ../tubtender/src/engine
//
// Rebuild and commit whenever the app's engine changes.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const site = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const i = process.argv.indexOf('--engine');
const engine = resolve(i > 0 ? process.argv[i + 1] : resolve(site, '../tubtender/src/engine'));
if (!existsSync(resolve(engine, 'index.ts'))) {
  console.error(`No engine at ${engine}. Pass --engine path/to/tubtender/src/engine`);
  process.exit(1);
}
let commit = 'unknown';
try {
  commit = execFileSync('git', ['-C', engine, 'rev-parse', '--short', 'HEAD']).toString().trim();
} catch {}

const entry = `export { buildDosePlan, waterStatus, defaultTargets, DEFAULT_PRODUCTS, ROLE_KINDS, roleLabel, drainIntervalDays, isLiquid } from ${JSON.stringify(resolve(engine, 'index.ts'))};`;
const out = resolve(site, 'hot-tub-calculator/engine.js');
execFileSync('npx', ['--yes', 'esbuild@0.28.2', '--bundle', '--format=iife', '--global-name=TubEngine',
  '--target=es2018', '--minify', '--tsconfig-raw={}', '--loader=ts', `--sourcefile=entry.ts`, `--outfile=${out}`], {
  input: entry,
  stdio: ['pipe', 'inherit', 'inherit'],
  cwd: engine,
});
const body = readFileSync(out, 'utf8');
writeFileSync(out, `/* TubTender chemistry engine, bundled from ramseysmith/tubtender src/engine at ${commit} by tools/hot-tub/build.mjs. Do not edit by hand. */\n${body}`);
console.log(`wrote ${out} from engine ${commit}`);
