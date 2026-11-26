#!/usr/bin/env node
// Gives every App Store app link (href) on the site its campaign token, and the
// provider token once tools/links/config.json has it. Apple's campaign help says a
// link needs both pt and ct to appear in App Analytics.
//
//   node tools/links/tag.mjs            tag every page (run after any other builder)
//   node tools/links/tag.mjs --check    list wrong links, exit 1
//
// Builders import tagHtml (one page) or tagSite (every page) so a rebuild never
// drops the tokens: best, guides, invoice, countdown and holidays all do.
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

// Tags every App Store and Google Play app link in one page. rel is the page path
// relative to the site root (it picks the campaign token).
export function tagHtml(html, rel, count = { links: 0 }) {
  return html
    .replace(LINK, (all, base, query = "") => {
      if (query.includes("action=")) return all;
      count.links++;
      return `href="${base}?${providerToken ? `pt=${providerToken}&amp;` : ""}ct=${campaign(rel)}&amp;mt=8"`;
    })
    .replace(PLAY, (all, base, query = "") => {
      if (query.includes("showAllReviews")) return all;
      count.links++;
      return `href="${base}&amp;referrer=utm_source%3Dgraysmithlabs.com%26utm_medium%3Dweb%26utm_campaign%3D${campaign(rel)}"`;
    });
}

// Tags every page under root (default the site). With check, writes nothing and
// returns the pages that would change.
export function tagSite({ check = false, root = SITE, quiet = false } = {}) {
  const count = { links: 0 };
  const wrong = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      if (e.name.startsWith(".") || ["tools", "node_modules"].includes(e.name)) continue;
      const rel = path.join(dir, e.name);
      if (e.isDirectory()) walk(rel);
      else if (e.name.endsWith(".html")) {
        const html = fs.readFileSync(path.join(root, rel), "utf8");
        const tagged = tagHtml(html, rel, count);
        if (tagged === html) continue;
        wrong.push(rel);
        if (check) console.error(`FAIL ${rel}: App Store or Google Play link without its campaign token; run node tools/links/tag.mjs`);
        else fs.writeFileSync(path.join(root, rel), tagged);
      }
    }
  })("");
  if (!quiet || wrong.length) console.log(`${count.links} app links, ${wrong.length} pages ${check ? "wrong" : "changed"}, provider token ${providerToken ? "set" : "MISSING (Apple will not count these)"}`);
  return wrong;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes("--check");
  if (tagSite({ check }).length && check) process.exit(1);
}
