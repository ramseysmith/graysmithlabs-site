#!/usr/bin/env node
// Seasonal footer links. The Thanksgiving countdown sits in every footer from
// September 1 to Thanksgiving Day (America/Denver), and is taken out of every
// footer and the home page's "Also here" line the day after. The Christmas
// countdown stays all year. The daily holidays workflow runs this, so the
// footer changes on its own; it is safe to run any number of times.
//
//   node tools/links/seasonal.mjs                    apply the rule for today
//   node tools/links/seasonal.mjs --today 2026-11-27 apply it for another date
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const i = process.argv.indexOf("--today");
const today = i > 0 ? process.argv[i + 1] : new Intl.DateTimeFormat("en-CA", { timeZone: "America/Denver" }).format(new Date());
const [y, m, d] = today.split("-").map(Number);
const first = new Date(Date.UTC(y, 10, 1)).getUTCDay();
const tgDay = 1 + ((4 - first + 7) % 7) + 21;
export const showThanksgiving = (m >= 9 && m < 11) || (m === 11 && d <= tgDay);

const TG = (pre) => `<li><a href="${pre}days-until-thanksgiving/">Thanksgiving countdown</a></li>`;
const HOME_ON = `<a class="link" href="receipt-generator/">receipt generator</a>, <a class="link" href="days-until-christmas/">Christmas countdown</a> and <a class="link" href="days-until-thanksgiving/">Thanksgiving countdown</a>.`;
const HOME_OFF = `<a class="link" href="receipt-generator/">receipt generator</a> and <a class="link" href="days-until-christmas/">Christmas countdown</a>.`;

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith(".") || e.name === "tools" || e.name === "node_modules") continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith(".html")) out.push(p);
  }
  return out;
}

let changed = 0;
for (const file of walk(SITE)) {
  const html = fs.readFileSync(file, "utf8");
  let next = html;
  if (showThanksgiving) {
    // Put the line back just above the Christmas line, with the same indent and prefix.
    next = next.replace(/^( *)<li><a href="((?:\.\.\/)*)days-until-christmas\/">Christmas countdown<\/a><\/li>/gm, (all, ind, pre, at, src) =>
      src.slice(Math.max(0, at - 200), at).includes(TG(pre)) ? all : `${ind}${TG(pre)}\n${all}`);
    next = next.replace(HOME_OFF, HOME_ON);
  } else {
    next = next.replace(/^ *<li><a href="(?:\.\.\/)*days-until-thanksgiving\/">Thanksgiving countdown<\/a><\/li>\n/gm, "");
    next = next.replace(HOME_ON, HOME_OFF);
  }
  if (next !== html) { fs.writeFileSync(file, next); changed++; }
}
console.log(`seasonal: Thanksgiving footer link ${showThanksgiving ? "shown" : "hidden"} for ${today}, ${changed} pages changed`);
