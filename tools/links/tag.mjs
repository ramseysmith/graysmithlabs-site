#!/usr/bin/env node
// Gives every App Store app link (href) on the site its campaign token, and the
// provider token once tools/links/config.json has it. Apple's campaign help says a
// link needs both pt and ct to appear in App Analytics.
//
//   node tools/links/tag.mjs            tag every page (run after any other builder)
//   node tools/links/tag.mjs --check    list wrong links, exit 1
//
// Apple shows a campaign only after first downloads from 5 people, so pages of one
// kind share a token: guide, best, inv-trade, holiday-day, holiday-home, app-page.
// Tools keep one each. Review links, developer links and JSON LD are left alone.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const { providerToken = "" } = JSON.parse(fs.readFileSync(path.join(SITE, "tools/links/config.json"), "utf8"));
if (!/^\d*$/.test(providerToken)) throw new Error("providerToken must be digits only");
const check = process.argv.includes("--check");

export function campaign(file) {
  const p = file.split(path.sep).join("/");
  if (p === "index.html") return "home-strip";
  if (p.startsWith("guides/")) return "guide";
  if (p.startsWith("best/")) return "best";
  if (p.startsWith("apps/")) return "app-page";
  if (/^holidays\/(index\.html)$/.test(p)) return "holiday-home";
  if (p === "holidays/calendar.html") return "holiday-calendar";
  if (p.startsWith("holidays/")) return "holiday-day";
  if (/^invoice-generator\/[^/]+\/index\.html$/.test(p)) return "inv-trade";
  return (p.startsWith("white-noise/") ? "white-noise-generator" : p.split("/")[0].replace(/\.html$/, "")).slice(0, 30);
}

const LINK = /href="(https:\/\/apps\.apple\.com\/(?:us\/)?app\/(?:[a-z0-9-]+\/)?id\d+)(\?[^"]*)?"/g;
// Play reads the install referrer, so the same campaign name shows in Play Console.
const PLAY = /href="(https:\/\/play\.google\.com\/store\/apps\/details\?id=[\w.]+)((?:&amp;|&)[^"]*)?"/g;
let changed = 0, links = 0;
function walk(dir) {
  for (const e of fs.readdirSync(path.join(SITE, dir), { withFileTypes: true })) {
    if (e.name.startsWith(".") || ["tools", "node_modules"].includes(e.name)) continue;
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) walk(rel);
    else if (e.name.endsWith(".html")) {
      const html = fs.readFileSync(path.join(SITE, rel), "utf8");
      const out = html.replace(LINK, (all, base, query = "") => {
        if (query.includes("action=")) return all;
        links++;
        return `href="${base}?${providerToken ? `pt=${providerToken}&amp;` : ""}ct=${campaign(rel)}&amp;mt=8"`;
      });
      const tagged = out.replace(PLAY, (all, base, query = "") => {
        if (query.includes("showAllReviews")) return all;
        links++;
        return `href="${base}&amp;referrer=utm_source%3Dgraysmithlabs.com%26utm_medium%3Dweb%26utm_campaign%3D${campaign(rel)}"`;
      });
      if (tagged === html) continue;
      changed++;
      if (check) console.error(`FAIL ${rel}: App Store or Google Play link without its campaign token; run node tools/links/tag.mjs`);
      else fs.writeFileSync(path.join(SITE, rel), tagged);
    }
  }
}
walk("");
console.log(`${links} app links, ${changed} pages ${check ? "wrong" : "changed"}, provider token ${providerToken ? "set" : "MISSING (Apple will not count these)"}`);
if (check && changed) process.exit(1);
