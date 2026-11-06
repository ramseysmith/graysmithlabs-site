// Launch day for one app on graysmithlabs.com, in one command.
//
//   node tools/launch/launch.mjs <slug>          apply the launch edits, then rebuild facts and guides
//   node tools/launch/launch.mjs <slug> --check  prove every edit still applies, write nothing
//   node tools/launch/launch.mjs --check         check every app in launch.json
//
// It sets appStoreId in tools/ai/products.json (Smart App Banner and JSON LD come from
// tools/ai/build.mjs), swaps the prelaunch wording in the answer and the "Can I download"
// FAQ, drops the prelaunch cta and note from the app's guides so they offer the download,
// applies the page edits in launch.json (App Store buttons, banners on the tool pages,
// status lines), then runs tools/ai/build.mjs and tools/guides/build.mjs.
// Run it only once Apple shows the app live (HQ release queue), never before.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const site = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const check = args.includes('--check');
const slugs = args.filter((a) => !a.startsWith('--'));
const config = JSON.parse(fs.readFileSync(path.join(site, 'tools/launch/launch.json'), 'utf8')).apps;

if (!slugs.length && !check) {
  console.error('usage: node tools/launch/launch.mjs <slug> [--check]');
  process.exit(2);
}
const targets = slugs.length ? slugs : Object.keys(config);

const read = (rel) => fs.readFileSync(path.join(site, rel), 'utf8');
const count = (hay, needle) => hay.split(needle).length - 1;
const problems = [];

function plan(slug) {
  const cfg = config[slug];
  if (!cfg) { problems.push(`${slug}: not in tools/launch/launch.json`); return null; }
  const files = new Map();
  const get = (rel) => { if (!files.has(rel)) files.set(rel, read(rel)); return files.get(rel); };

  // Page edits
  for (const e of cfg.edits) {
    const text = get(e.file);
    const n = count(text, e.find);
    if (n !== 1) { problems.push(`${slug}: ${e.file}: expected the find text once, found ${n}: ${e.find.slice(0, 80)}`); continue; }
    files.set(e.file, text.replace(e.find, e.replace));
  }

  // Facts
  const factsRel = 'tools/ai/products.json';
  const facts = JSON.parse(get(factsRel));
  const app = facts.apps.find((a) => a.slug === slug);
  if (!app) problems.push(`${slug}: missing from ${factsRel}`);
  else {
    if (app.appStoreId && app.appStoreId !== cfg.appStoreId) problems.push(`${slug}: products.json appStoreId ${app.appStoreId} differs from launch.json ${cfg.appStoreId}`);
    app.appStoreId = cfg.appStoreId;
    const [from, to] = cfg.answer;
    if (count(app.answer, from) !== 1) problems.push(`${slug}: products.json answer does not contain "${from}" once`);
    else app.answer = app.answer.replace(from, to);
    const [q, a] = cfg.faq;
    const row = app.faq.find(([fq]) => fq === q);
    if (!row) problems.push(`${slug}: products.json has no FAQ "${q}"`);
    else row[1] = a;
    files.set(factsRel, JSON.stringify(facts, null, 2) + '\n');
  }

  // Guides for this app: drop the prelaunch cta, swap any In App Review note
  const guidesRel = 'tools/guides/guides.json';
  const guides = JSON.parse(get(guidesRel));
  for (const g of guides.guides.filter((x) => x.app === slug)) {
    delete g.cta;
    for (const s of g.sections || []) {
      if (s.note && /App Review|coming to the App Store/i.test(s.note)) {
        if (!cfg.guideNote) problems.push(`${slug}: guide ${g.slug} has a prelaunch note but launch.json has no guideNote`);
        else s.note = cfg.guideNote;
      }
    }
  }
  files.set(guidesRel, JSON.stringify(guides, null, 2) + '\n');
  return files;
}

const results = targets.map((slug) => [slug, plan(slug)]);
if (problems.length) {
  console.error(problems.map((p) => `FAIL ${p}`).join('\n'));
  process.exit(1);
}
if (check) {
  console.log(`launch edits apply cleanly: ${targets.join(', ')}`);
  process.exit(0);
}
for (const [slug, files] of results) {
  for (const [rel, text] of files) if (text !== read(rel)) fs.writeFileSync(path.join(site, rel), text);
  console.log(`${slug}: launch edits written`);
}
execFileSync('node', ['tools/ai/build.mjs', '--site', '.'], { cwd: site, stdio: 'inherit' });
execFileSync('node', ['tools/guides/build.mjs'], { cwd: site, stdio: 'inherit' });
let found = '';
try { found = execFileSync('git', ['grep', '-n', '-i', '-E', 'in App Review|coming to the App Store|Coming soon', '--', '*.html', '*.json', 'llms.txt'], { cwd: site, encoding: 'utf8' }); } catch { /* no matches */ }
const left = found.split('\n')
  .filter((l) => l && targets.some((s) => l.toLowerCase().includes(s)) && !l.startsWith('tools/launch/'));
if (left.length) console.log(`check these lines by hand:\n${left.join('\n')}`);
console.log('now remove the launched app from tools/launch/launch.json and commit');
