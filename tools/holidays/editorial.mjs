#!/usr/bin/env node
// Brings CelebriDay's own drawings and holiday stories into the holiday pages.
//
//   node --experimental-strip-types tools/holidays/editorial.mjs --app ../CelebriDay
//
// Writes assets/holidays/*.svg (one drawing per subject, plus the category and
// big holiday scenes) and tools/holidays/editorial.json: which drawing each
// published observance uses, and the story and ways to celebrate for the day
// pages search engines may index. Stories for other days stay in the app.
// Run it after a new art batch or story batch lands in CelebriDay, then rebuild
// with tools/holidays/build.mjs.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { pathToFileURL } from "node:url";

const i = process.argv.indexOf("--app");
if (i < 0) { console.error("usage: node tools/holidays/editorial.mjs --app ../CelebriDay"); process.exit(1); }
const APP = path.resolve(process.argv[i + 1]);
const HERE = path.dirname(new URL(import.meta.url).pathname);
const SITE = path.resolve(HERE, "../..");
const OUT = path.join(SITE, "assets/holidays");
fs.mkdirSync(OUT, { recursive: true });

const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "subjects-")), "subjects.ts");
fs.writeFileSync(tmp, fs.readFileSync(path.join(APP, "src/theme/subjects.ts"), "utf8").replace(/^import .*$/gm, ""));
fs.writeFileSync(tmp, "type SubjectName = string; type Holiday = any;\n" + fs.readFileSync(tmp, "utf8"));
const { subjectFor } = await import(pathToFileURL(tmp).href);

const flat = (n) => n.toLowerCase().replace(/[^a-z0-9|-]/g, "");
const SCENES_RAW = { "Christmas Day": "christmas", "Christmas Eve": "christmas", "Cinco de Mayo": "cincodemayo", "Earth Day": "earthday", "Easter Sunday": "easter", "Father's Day": "fathersday", "Halloween": "halloween", "Independence Day": "july4", "Mardi Gras": "mardigras", "Mother's Day": "mothersday", "New Year's Day": "newyear", "New Years Eve": "newyear", "New Year's Eve": "newyear", "Pi Day": "piday", "St. Patrick's Day": "stpatricks", "Thanksgiving": "thanksgiving", "Valentine's Day": "valentines" };
const SCENES = Object.fromEntries(Object.entries(SCENES_RAW).map(([k, v]) => [flat(k), v]));
const data = JSON.parse(fs.readFileSync(path.join(SITE, "holidays/data.json"), "utf8"));
const indexed = JSON.parse(fs.readFileSync(path.join(HERE, "indexed.json"), "utf8"));
const keep = new Set([...indexed.seen, ...indexed.keep]);
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

// The app's key is "month-day|name"; some batches pad the month with a zero.
const stories = {};
for (const [k, v] of Object.entries(JSON.parse(fs.readFileSync(path.join(APP, "src/data/holidayStories.json"), "utf8")))) {
  stories[flat(k.replace(/^0/, "").replace(/-0(\d\|)/, "-$1"))] = v;
}
for (const [k, v] of Object.entries(JSON.parse(fs.readFileSync(path.join(HERE, "stories-site.json"), "utf8")))) stories[flat(k)] = v;

const art = {}, story = {}, used = new Set();
function add(key, h, withStory) {
  const scene = SCENES[flat(h.name)];
  const subject = scene ? null : subjectFor(h);
  const file = subject && fs.existsSync(path.join(APP, `design/subjects/${subject}.svg`)) ? `subjects/${subject}` : `scenes/${scene ?? h.category}`;
  if (fs.existsSync(path.join(APP, `design/${file}.svg`))) {
    const out = (file.startsWith("scenes/") ? "scene-" : "") + path.basename(file);
    art[key] = out;
    used.add([file, out].join("|"));
  }
  const s = stories[flat(key)];
  if (withStory && s) story[key] = { story: s.story, ways: s.ways };
}
for (const e of data.fixed) for (const h of e.holidays) add(`${e.month}-${e.day}|${h.name}`, h, keep.has(`${MONTHS[e.month - 1]}-${e.day}`));
for (const h of data.moving) add(`moving|${h.name}`, h, true);

for (const f of fs.readdirSync(OUT)) if (f.endsWith(".svg")) fs.unlinkSync(path.join(OUT, f));
for (const u of used) { const [from, to] = u.split("|"); fs.copyFileSync(path.join(APP, `design/${from}.svg`), path.join(OUT, `${to}.svg`)); }
fs.writeFileSync(path.join(HERE, "editorial.json"), JSON.stringify({ _readme: "Made by editorial.mjs from CelebriDay; do not edit.", art, story }, null, 1) + "\n");
console.log(`${used.size} drawings, ${Object.keys(art).length} observances with art, ${Object.keys(story).length} with a story`);
