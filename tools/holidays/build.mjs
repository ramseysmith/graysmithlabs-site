#!/usr/bin/env node
// Builds the CelebriDay daily holiday pages for graysmithlabs.com.
//
//   node build.mjs --site ../graysmithlabs-site                      rebuild from the site's holidays/data.json
//   node build.mjs --site S --app ../celebriday --verification V      refresh data.json from the app, then rebuild
//   add --today 2026-10-10 to pin the "today" page (defaults to the date in America/Denver)
//
// Writes into the site: holidays/index.html, holidays/<month>.html, holidays/<month>-<day>.html,
// holidays/data.json, holidays/holidays.css, and the holiday URLs in sitemap.xml.
//
// Only observances whose date was verified against a public source are published
// (status "verified" in verification.json). Moving holidays come from the app's rules
// and are placed on their date for the current and next year.

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { pathToFileURL } from "node:url";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => {
    if (a.startsWith("--")) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith("--") ? all[i + 1] : true]);
    return acc;
  }, [])
);
if (!args.site) {
  console.error("usage: node build.mjs --site DIR [--app DIR --verification FILE] [--today YYYY-MM-DD]");
  process.exit(1);
}
const SITE = path.resolve(args.site);
const OUT = path.join(SITE, "holidays");
const HERE = path.dirname(new URL(import.meta.url).pathname);
fs.mkdirSync(OUT, { recursive: true });

const ORIGIN = "https://graysmithlabs.com";
const APP_ID = "6760971240";
const APP_URL = `https://apps.apple.com/us/app/celebriday/id${APP_ID}`;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAYS_IN = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
// AdSense: tags only when ads.json enabled is true; ads.txt follows the publisher id. Off until tools/holidays/ads.json has a publisher id (see its _readme).
const ADS = (() => {
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(HERE, "ads.json"), "utf8"));
    return /^ca-pub-\d{10,20}$/.test(cfg.publisherId ?? "") ? cfg : null;
  } catch {
    return null;
  }
})();
const ADS_HEAD = ADS?.enabled
  ? `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADS.publisherId}" crossorigin="anonymous"></script>\n`
  : "";
function adSlot(kind) {
  const id = ADS?.slots?.[kind];
  if (!ADS?.enabled || !/^\d{6,20}$/.test(id ?? "")) return "";
  return `    <aside class="hd-ad" aria-label="Advertisement">
      <ins class="adsbygoogle" style="display:block" data-ad-client="${ADS.publisherId}" data-ad-slot="${id}" data-ad-format="auto" data-full-width-responsive="true"></ins>
      <script>(adsbygoogle = window.adsbygoogle || []).push({});</script>
    </aside>
`;
}

// Only day pages with proven search demand, or kept on purpose, are indexed
// (tools/holidays/indexed.json; AdSense called the thin ones Low value content).
const INDEXED = JSON.parse(fs.readFileSync(path.join(HERE, "indexed.json"), "utf8"));
const INDEXED_DAYS = new Set([...INDEXED.seen, ...INDEXED.keep]);
// A page also needs something of its own to say: a story on at least one observance.
const isIndexed = (data, m, d) => {
  if (!INDEXED.enabled) return true;
  const { all, moving } = dayEntries(data, m, d);
  return (INDEXED_DAYS.has(slug(m, d)) || moving.length > 0) && all.some((h) => storyOf(h, m, d));
};

const CATEGORY_LABEL = {
  food: "Food", awareness: "Awareness", fun: "Fun", cultural: "Culture", nature: "Nature",
  tech: "Tech", health: "Health", arts: "Arts", sports: "Sports", other: "Observance",
};

// ---------- data ----------

async function loadMovingFromApp(appDir) {
  const src = fs.readFileSync(path.join(appDir, "src/data/movingHolidays.ts"), "utf8")
    .replace(/^import .*$/m, "type Holiday = any;");
  const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "holidays-")), "moving.ts");
  fs.writeFileSync(tmp, src);
  const mod = await import(pathToFileURL(tmp).href);
  return mod.MOVING_HOLIDAYS.map(({ rule, holiday }) => ({ rule, ...pick(holiday) }));
}

function pick(h) {
  return { name: h.name, emoji: h.emoji, category: h.category, description: h.description };
}

async function refreshData() {
  const fixedAll = JSON.parse(fs.readFileSync(path.join(args.app, "src/data/holidays.json"), "utf8"));
  const verification = JSON.parse(fs.readFileSync(args.verification, "utf8"));
  const status = new Map(verification.map((v) => [`${v.month}/${v.day}/${v.name}`, v.status]));
  let kept = 0, dropped = 0;
  const fixed = fixedAll.map((e) => {
    const holidays = e.holidays.filter((h) => status.get(`${e.month}/${e.day}/${h.name}`) === "verified").map(pick);
    kept += holidays.length;
    dropped += e.holidays.length - holidays.length;
    return { month: e.month, day: e.day, holidays };
  });
  const moving = await loadMovingFromApp(args.app);
  const data = { source: "CelebriDay app data, verified dates only", fixed, moving };
  fs.writeFileSync(path.join(OUT, "data.json"), JSON.stringify(data));
  console.log(`data.json: ${kept} verified fixed observances published, ${dropped} held back, ${moving.length} moving`);
  return data;
}

// ---------- moving holiday rules (same as the app) ----------

function easterSunday(year) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

function resolveRule(rule, year) {
  switch (rule.kind) {
    case "nthWeekday": {
      const first = new Date(Date.UTC(year, rule.month - 1, 1));
      const delta = (rule.weekday - first.getUTCDay() + 7) % 7;
      return new Date(Date.UTC(year, rule.month - 1, 1 + delta + (rule.n - 1) * 7 + (rule.offsetDays ?? 0)));
    }
    case "lastWeekday": {
      const last = new Date(Date.UTC(year, rule.month, 0));
      const delta = (last.getUTCDay() - rule.weekday + 7) % 7;
      return new Date(Date.UTC(year, rule.month - 1, last.getUTCDate() - delta));
    }
    case "easter": {
      const d = easterSunday(year);
      d.setUTCDate(d.getUTCDate() + rule.offsetDays);
      return d;
    }
    case "leapDay": {
      const d = new Date(Date.UTC(year, 1, 29));
      return d.getUTCMonth() === 1 ? d : null;
    }
  }
  return null;
}

// ---------- helpers ----------

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const slug = (m, d) => `${MONTHS[m - 1].toLowerCase()}-${d}`;
const monthSlug = (m) => MONTHS[m - 1].toLowerCase();
const label = (m, d) => `${MONTHS[m - 1]} ${d}`;
const isLeap = (y) => new Date(Date.UTC(y, 1, 29)).getUTCMonth() === 1;

function todayInDenver() {
  if (typeof args.today === "string") return args.today;
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Denver", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function listNames(names) {
  if (names.length <= 1) return names.join("");
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function clip(text, max) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  return cut.slice(0, cut.lastIndexOf(" ")).replace(/[,.;:]$/, "") + ".";
}

// Each moving holiday sits on its next occurrence on or after today, so it shows
// on exactly one date page. The daily rebuild moves it forward once it passes.
let NEXT_MOVING = null;
function placeMoving(data, todayIso) {
  const [y, m, d] = todayIso.split("-").map(Number);
  const today = Date.UTC(y, m - 1, d);
  NEXT_MOVING = data.moving.map((mh) => {
    for (const year of [y, y + 1, y + 2, y + 3, y + 4]) {
      const r = resolveRule(mh.rule, year);
      if (r && r.getTime() >= today) return { ...mh, at: r };
    }
    return null;
  }).filter(Boolean);
}

// Every observance on month/day.
// Where each published date was checked (tools/holidays/verification.json), shown
// on the day page so readers and crawlers can see the source behind the date.
const SOURCES = (() => {
  try {
    const list = JSON.parse(fs.readFileSync(path.join(HERE, "verification.json"), "utf8"));
    return new Map(list.filter((v) => v.status === "verified" && /^https:\/\//.test(v.source ?? "")).map((v) => [`${v.month}/${v.day}/${v.name}`, v.source]));
  } catch {
    return new Map();
  }
})();

function dayEntries(data, m, d) {
  const fixed = (data.fixed.find((e) => e.month === m && e.day === d)?.holidays ?? []).map((h) => ({ ...h, source: SOURCES.get(`${m}/${d}/${h.name}`) }));
  const moving = NEXT_MOVING
    .filter((mh) => mh.at.getUTCMonth() + 1 === m && mh.at.getUTCDate() === d)
    .map((mh) => ({ ...mh, year: mh.at.getUTCFullYear() }));
  return { moving, fixed, all: [...moving, ...fixed] };
}

// ---------- page shell (matches the app pages on the site) ----------

// Breadcrumb and WebPage structured data for every holiday page, worked out
// from its canonical URL: Holidays, then the month, then the day.
function pageLd(title, description, canonical) {
  const crumbs = [["Graysmith Labs", `${ORIGIN}/`], ["Holidays", `${ORIGIN}/holidays/`]];
  const slug = canonical.replace(`${ORIGIN}/holidays/`, "").replace(/\.html$/, "");
  const [monthPart, dayPart] = slug.split("-");
  const mi = MONTHS.findIndex((n, i) => monthSlug(i + 1) === `${monthPart}.html` || monthSlug(i + 1).replace(/\.html$/, "") === monthPart);
  if (mi >= 0) {
    crumbs.push([MONTHS[mi], `${ORIGIN}/holidays/${monthSlug(mi + 1)}.html`.replace(/\.html\.html$/, ".html")]);
    if (dayPart) crumbs.push([`${MONTHS[mi]} ${Number(dayPart)}`, canonical]);
  }
  const graph = [
    { "@type": "WebPage", "@id": canonical, url: canonical, name: title, description, isPartOf: { "@type": "WebSite", name: "Graysmith Labs", url: `${ORIGIN}/` }, inLanguage: "en" },
    { "@type": "BreadcrumbList", itemListElement: crumbs.map(([name, item], i) => ({ "@type": "ListItem", position: i + 1, name, item })) },
  ];
  return `<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@graph": graph })}</script>\n`;
}

function shell({ title, description, canonical, body, extraHead = "" }) {
  extraHead = pageLd(title, description, canonical) + extraHead;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${canonical}">
<meta name="apple-itunes-app" content="app-id=${APP_ID}">
<meta name="theme-color" content="#f4f1ea" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#131513" media="(prefers-color-scheme: dark)">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Graysmith Labs">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${ORIGIN}/assets/apps/celebriday/og.jpg?v=1.8.1">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="CelebriDay app screens on iPhone, free on the App Store">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:site" content="@GraysmithLabs">
<meta name="twitter:image" content="${ORIGIN}/assets/apps/celebriday/og.jpg?v=1.8.1">
<link rel="icon" href="../favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;1,9..144,400&family=Spline+Sans:wght@400;500;600&family=Spline+Sans+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../styles.css">
<link rel="stylesheet" href="holidays.css">
<script src="../main.js" defer></script>
${ADS_HEAD}${extraHead}</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="site-head">
  <div class="wrap">
    <a class="mark" href="../"><span class="glyph">G</span> Graysmith Labs</a>
    <nav class="nav" aria-label="Main">
      <div class="nav-links" id="nav-links">
        <a href="../#apps">Apps</a>
        <a href="../#tools">Free tools</a>
        <a href="../holidays/">Holidays</a>
        <a href="../guides/">Guides</a>
        <a href="../services/">Services</a>
        <a href="../about.html">About</a>
        <a class="menu-cta" href="../#contact">Start a project &rarr;</a>
      </div>
      <a class="btn sm" href="../#contact">Start a project</a>
      <button class="menu-btn" type="button" aria-controls="nav-links" aria-expanded="false" aria-label="Open menu"><span></span><span></span></button>
    </nav>
  </div>
</header>
<main id="main">
${body}
</main>
<footer class="site-foot">
  <div class="wrap">
    <div class="foot-grid">
      <div>
        <a class="mark" href="../"><span class="glyph">G</span> Graysmith Labs</a>
        <p class="blurb">A small independent studio in Colorado. Seven apps, free tools, and software for clients.</p>
      </div>
      <div>
        <span class="label">Holidays</span>
        <ul>
          <li><a href="./">What holiday is it today?</a></li>
${MONTHS.map((n, i) => `          <li><a href="${monthSlug(i + 1)}.html">${n}</a></li>`).join("\n")}
        </ul>
      </div>
      <div>
        <span class="label">Apps</span>
        <ul>
          <li><a href="../apps/celebriday.html">CelebriDay</a></li>
          <li><a href="../apps/drift.html">Drift</a></li>
          <li><a href="../apps/signsnap.html">SignSnap</a></li>
          <li><a href="../apps/blitztap.html">BlitzTap</a></li>
          <li><a href="../apps/saybright.html">SayBright</a></li>
          <li><a href="../apps/tubtender.html">TubTender</a></li>
          <li><a href="../apps/tallyhand.html">Tallyhand</a></li>
        </ul>
      </div>
      <div>
        <span class="label">Free tools</span>
        <ul>
          <li><a href="../holidays/">Today's holiday</a></li>
          <li><a href="../invoice-generator/">Invoice generator</a></li>
          <li><a href="../estimate-generator/">Estimate generator</a></li>
          <li><a href="../receipt-generator/">Receipt generator</a></li>
          <li><a href="../signature-maker/">Signature maker</a></li>
          <li><a href="../white-noise/">White noise generator</a></li>
          <li><a href="../sleep-calculator/">Sleep calculator</a></li>
          <li><a href="../hot-tub-calculator/">Hot tub calculator</a></li>
          <li><a href="../reaction-time-test/">Reaction time test</a></li>
          <li><a href="../days-until-thanksgiving/">Thanksgiving countdown</a></li>
          <li><a href="../days-until-christmas/">Christmas countdown</a></li>
          <li><a href="../affirmations/">Affirmation of the day</a></li>
          <li><a href="../guides/">Guides</a></li><li><a href="../best/">App comparisons</a></li>
        </ul>
      </div>
      <div>
        <span class="label">Contact</span>
        <ul>
          <li><a href="mailto:ramsey@graysmithlabs.com?subject=Project%20inquiry">ramsey@graysmithlabs.com</a></li>
          <li><a href="https://apps.apple.com/us/developer/graysmith-labs-llc/id1871756911">Our App Store page</a></li>
          <li><a href="https://play.google.com/store/apps/developer?id=Graysmith+Labs+LLC">Our Google Play page</a></li>
          <li><a href="../about.html">About and contact</a></li>
          <li><a href="../privacy.html">Privacy policy</a></li>
        </ul>
      </div>
    </div>
    <div class="foot-base">
      <span>&copy; <span data-year>2026</span> Graysmith Labs LLC &middot; A Colorado limited liability company</span>
      <span>United States &middot; clients worldwide</span>
    </div>
  </div>
</footer>
</body>
</html>
`;
}

// CelebriDay's own drawings and stories (tools/holidays/editorial.mjs).
const EDITORIAL = JSON.parse(fs.readFileSync(path.join(HERE, "editorial.json"), "utf8"));
const keyOf = (h, m, d) => (h.rule ? `moving|${h.name}` : `${m}-${d}|${h.name}`);
// The app's keys have no apostrophes in some names; readers get them spelled right.
const SPELLED = { "Mothers Day": "Mother's Day", "Fathers Day": "Father's Day", "Presidents Day": "Presidents' Day", "Valentines Day": "Valentine's Day", "Galentines Day": "Galentine's Day", "St. Patricks Day": "St. Patrick's Day", "April Fools Day": "April Fools' Day", "International Womens Day": "International Women's Day", "Business Womens Day": "Business Women's Day", "Universal Childrens Day": "Universal Children's Day", "New Years Eve": "New Year's Eve", "Workers Memorial Day": "Workers' Memorial Day", "World Teachers Day": "World Teachers' Day", "National Boss Day": "National Boss's Day", "All Saints Day": "All Saints' Day", "All Souls Day": "All Souls' Day", "National Smores Day": "National S'mores Day", "Forefathers Day": "Forefathers' Day", "National Doctors Day": "National Doctors' Day", "National Inventors Day": "National Inventors' Day", "Brothers Day": "Brother's Day" };
const show = (n) => SPELLED[n] ?? n;
const artOf = (h, m, d) => EDITORIAL.art[keyOf(h, m, d)] ?? null;
const storyOf = (h, m, d) => EDITORIAL.story[keyOf(h, m, d)] ?? null;

function drawing(h, m, d, cls = "") {
  const a = artOf(h, m, d);
  if (!a) return "";
  return `<span class="hd-stage cat-${h.category}${cls ? ` ${cls}` : ""}"><img src="../assets/holidays/${a}.svg" alt="Drawing for ${esc(show(h.name))}" width="400" height="200" loading="lazy" decoding="async"></span>`;
}

// The next four dates of a moving holiday after the one on this page, worked out
// from the same rule, so the page answers "when is it next year" too.
function nextDates(h) {
  const out = [];
  for (let y = h.year + 1; y <= h.year + 4; y++) {
    const r = resolveRule(h.rule, y);
    if (r) out.push(`${label(r.getUTCMonth() + 1, r.getUTCDate())} in ${y}`);
  }
  return out.length ? ` After that: ${listNames(out)}.` : "";
}

function card(h, m, d, level = "h2") {
  const s = storyOf(h, m, d);
  const host = h.source ? new URL(h.source).hostname.replace(/^www\./, "") : "";
  const when = h.year
    ? `<p class="hd-when">The date moves each year. In ${h.year} it falls on ${WEEKDAYS[h.at.getUTCDay()]}, ${label(m, d)}.${nextDates(h)}</p>`
    : host ? `<p class="hd-when">Same date every year. Date checked against <a href="${esc(h.source)}" rel="noopener" target="_blank">${esc(host)}</a>. <a href="../about.html#dates">How we check</a>.</p>` : "";
  const body = s
    ? `<p class="hd-intro">${esc(h.description)}</p>
            ${s.story.split(/\n\n+/).map((p) => `<p>${esc(p)}</p>`).join("\n            ")}
            <h3>Ways to celebrate</h3>
            <ul class="hd-ways">${s.ways.map((w) => `<li>${esc(w)}</li>`).join("")}</ul>`
    : `<p>${esc(h.description)}</p>`;
  return `        <article class="hd-card${s ? " has-story" : ""}">
          ${drawing(h, m, d)}
          <div class="hd-body">
            <span class="tag">${CATEGORY_LABEL[h.category] ?? "Observance"}</span>
            <${level}>${esc(show(h.name))}</${level}>
            ${body}
            ${when}
          </div>
        </article>`;
}

// One small tile: drawing, date, names.
function tile(data, m, d, line) {
  const { all } = dayEntries(data, m, d);
  if (!all.length) return "";
  return `      <li><a class="hd-tile" href="${slug(m, d)}.html">${drawing(all[0], m, d)}<b>${line ?? label(m, d)}</b><span>${esc(all.map((h) => show(h.name)).join(", "))}</span></a></li>`;
}

function appPitch(context) {
  return `      <aside class="hd-app">
        <img src="../assets/apps/celebriday/icon.png?v=1.8.1" alt="CelebriDay app icon" width="64" height="64">
        <div>
          <h2>Get ${context} every morning</h2>
          <p>The drawings on this page come from CelebriDay, our iPhone app. It names the day's holiday each morning, with a fun fact and a card made for sharing. Today and tomorrow are free; Premium opens the whole year.</p>
          <a class="btn" href="${APP_URL}" rel="noopener">Download CelebriDay on the App Store</a>
        </div>
      </aside>`;
}

// Three more days of the same kind, so each page links to its neighbors by topic.
function relatedDays(data, m, d, daysWithContent) {
  const own = (data.fixed.find((e) => e.month === m && e.day === d)?.holidays ?? [])[0];
  if (!own) return "";
  const order = [];
  for (let mm = 1; mm <= 12; mm++) for (let dd = 1; dd <= DAYS_IN[mm - 1]; dd++) order.push([mm, dd]);
  const start = order.findIndex(([a, b]) => a === m && b === d);
  const picks = [];
  for (let i = 1; i < order.length && picks.length < 4; i++) {
    const [mm, dd] = order[(start + i) % order.length];
    if (!daysWithContent.has(`${mm}-${dd}`)) continue;
    const list = data.fixed.find((e) => e.month === mm && e.day === dd)?.holidays ?? [];
    if (list[0]?.category === own.category) picks.push([mm, dd]);
  }
  if (!picks.length) return "";
  return `    <section class="hd-related">
      <h2>More ${(CATEGORY_LABEL[own.category] ?? "Observance").toLowerCase()} days ahead</h2>
      <ul class="hd-tiles">
${picks.map(([mm, dd]) => tile(data, mm, dd)).join("\n")}
      </ul>
    </section>
`;
}

const BYLINE = `<p class="hd-by">Written and illustrated by <a href="../about.html">Graysmith Labs</a>, the makers of CelebriDay.</p>`;

// ---------- pages ----------

function dayPage(data, m, d, years, prev, next, daysWithContent) {
  const { all } = dayEntries(data, m, d);
  const names = all.map((h) => show(h.name));
  const when = label(m, d);
  let title = `${when} Holidays: ${names[0]}`;
  if (names.length > 1) title += " and More";
  if (title.length > 60) title = `What Holiday Is It on ${when}?`;
  const told = all.some((h) => storyOf(h, m, d));
  const long = `What holiday is it on ${when}? ${listNames(names)}.${told ? " Where it came from and easy ways to celebrate, with drawings." : ""}`;
  const description = long.length <= 158 ? long : clip(`What holiday is it on ${when}? ${listNames(names)}.`, 155);
  const canonical = `${ORIGIN}/holidays/${slug(m, d)}.html`;
  const wk = years.map((y) => { const dt = new Date(Date.UTC(y, m - 1, d)); return dt.getUTCMonth() === m - 1 ? `${WEEKDAYS[dt.getUTCDay()]} in ${y}` : null; }).filter(Boolean);
  const body = `  <div class="wrap hd">
    <p class="crumbs"><a href="./">Holidays</a> &nbsp;/&nbsp; <a href="${monthSlug(m)}.html">${MONTHS[m - 1]}</a> &nbsp;/&nbsp; ${d}</p>
    <h1>What holiday is it on ${when}?</h1>
    <p class="lede">${when} is ${esc(listNames(names))}.${wk.length ? ` It falls on a ${wk.join(" and a ")}.` : ""}</p>
    ${BYLINE}
    <div class="hd-grid">
${all.map((h) => card(h, m, d)).join("\n")}
    </div>
${relatedDays(data, m, d, daysWithContent)}${adSlot("day")}${appPitch("a holiday like this")}
    <nav class="pager" aria-label="Nearby days">
      <a href="${slug(...prev)}.html"><span><span class="label">Previous day</span><b>${label(...prev)}</b></span></a>
      <a class="next" href="${slug(...next)}.html"><span><span class="label">Next day</span><b>${label(...next)}</b></span></a>
    </nav>
  </div>`;
  const extraHead = isIndexed(data, m, d) ? "" : `<meta name="robots" content="noindex, follow">\n`;
  return shell({ title, description, canonical, body, extraHead });
}

const MONTH_NOTES = [
  "January opens on a clean page. New Year's Day is followed by a long run of comfort food days, and the third Monday belongs to Martin Luther King Jr. Day, the only federal holiday set aside for volunteering.",
  "The shortest month is crowded. Groundhog Day, Valentine's Day and Presidents' Day anchor it, Mardi Gras usually lands here, and Leap Day shows up once every four years.",
  "March turns toward spring. Pi Day falls on 3.14, St. Patrick's Day follows three days later, and the clocks in most of the United States move ahead an hour on the second Sunday.",
  "April starts with a prank and ends with a tree: April Fools' Day on the 1st, Earth Day on the 22nd, Arbor Day on the last Friday. Easter falls here in most years.",
  "May is for mothers on the second Sunday and for remembrance on the last Monday. Between them sit nurses, teachers, bees and more grilled food days than any month before it.",
  "June brings Juneteenth, Father's Day and the solstice. Donuts get the first Friday, a tradition that began with the Salvation Army volunteers of the First World War.",
  "July in the United States means the 4th, and then a month of ice cream, hot dogs and long evenings. The 20th marks the first walk on the Moon.",
  "August has no federal holiday, so the small days get the spotlight: s'mores, left handers, dogs, book lovers and a stretch of summer fruit.",
  "September starts with Labor Day, honors grandparents the following Sunday, and ends with autumn. The 19th is for talking like a pirate.",
  "October is a long walk to Halloween. Before it come noodles, animals, teachers, World Smile Day on the first Friday and the first pumpkin days of the year.",
  "November holds Veterans Day and Thanksgiving, then Black Friday and Giving Tuesday in the week after. Between them is the best run of pie, stuffing and cranberry days on the calendar.",
  "December stacks up celebrations from many traditions: Saint Nicholas, Saint Lucia, the solstice, Christmas, Kwanzaa and New Year's Eve, with a cookie day nearly every week.",
];

function monthPage(data, m, years, daysWithContent) {
  const name = MONTHS[m - 1];
  const tiles = [];
  for (let d = 1; d <= DAYS_IN[m - 1]; d++) if (daysWithContent.has(`${m}-${d}`)) tiles.push(tile(data, m, d, `${name} ${d}`));
  const title = `${name} Holidays and Observances, Day by Day`;
  const description = clip(`Every holiday and national day in ${name}, drawn and listed day by day, from food days to awareness days. Dates checked against named sources.`, 155);
  const body = `  <div class="wrap hd">
    <p class="crumbs"><a href="./">Holidays</a> &nbsp;/&nbsp; ${name}</p>
    <h1>${name} holidays and observances</h1>
    <p class="lede">${MONTH_NOTES[m - 1]}</p>
    ${BYLINE}
    <ul class="hd-tiles">
${tiles.join("\n")}
    </ul>
${adSlot("month")}${appPitch("a new holiday")}
    <nav class="pager" aria-label="Other months">
      <a href="${monthSlug(m === 1 ? 12 : m - 1)}.html"><span><span class="label">Previous month</span><b>${MONTHS[(m + 10) % 12]}</b></span></a>
      <a class="next" href="${monthSlug(m === 12 ? 1 : m + 1)}.html"><span><span class="label">Next month</span><b>${MONTHS[m % 12]}</b></span></a>
    </nav>
  </div>`;
  return shell({ title, description, canonical: `${ORIGIN}/holidays/${monthSlug(m)}.html`, body });
}

const FAQ = [
  ["Are national days official?", "Most are not. In the United States only Congress and the president create federal holidays, and there are eleven of them. The rest are proclaimed by presidents, governors or mayors, adopted by the United Nations, or started by a club, a company or one stubborn person who kept at it."],
  ["What is the difference between a holiday and an observance?", "A holiday usually means time off: federal offices and many businesses close. An observance is a date people mark without closing anything, such as World Oceans Day or National Pickle Day."],
  ["Who decides when a national day falls?", "Whoever starts it. Some pick a birthday, as World Diabetes Day did with Frederick Banting's. Some pick a joke: Mad Hatter Day is October 6 because the Hatter's price tag reads 10/6. Others float, such as Thanksgiving on the fourth Thursday in November."],
  ["How do you check these dates?", "We publish a day only after finding its date at a source we can name, and each page links to it. Days that failed the check are left off, even when other lists carry them. If you spot a mistake, write to us and we will fix it."],
];

function indexPage(data, today, years, daysWithContent) {
  const [y, m, d] = today.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const { all } = dayEntries(data, m, d);
  const week = [];
  for (let i = 1; week.length < 8 && i < 40; i++) {
    const n = new Date(date);
    n.setUTCDate(n.getUTCDate() + i);
    const t = tile(data, n.getUTCMonth() + 1, n.getUTCDate(), `${WEEKDAYS[n.getUTCDay()]}, ${label(n.getUTCMonth() + 1, n.getUTCDate())}`);
    if (t) week.push(t);
  }
  // The big dates ahead, with how far off they are.
  const BIG = [[1, 1, "New Year's Day"], [2, 14, "Valentines Day"], [3, 17, "St. Patricks Day"], [6, 19, "Juneteenth"], [7, 4, "Independence Day"], [10, 31, "Halloween"], [11, 11, "Veterans Day"], [12, 25, "Christmas Day"]];
  const big = [];
  for (const [mm, dd, name] of BIG) {
    const h = dayEntries(data, mm, dd).fixed.find((x) => x.name === name);
    if (!h) continue;
    let at = Date.UTC(y, mm - 1, dd);
    if (at < date.getTime()) at = Date.UTC(y + 1, mm - 1, dd);
    big.push([at, h, mm, dd]);
  }
  for (const h of NEXT_MOVING) if (["Martin Luther King Jr. Day", "Easter Sunday", "Mothers Day", "Memorial Day", "Fathers Day", "Labor Day", "Thanksgiving"].includes(h.name)) big.push([h.at.getTime(), h, h.at.getUTCMonth() + 1, h.at.getUTCDate()]);
  big.sort((a, b) => a[0] - b[0]);
  const bigTiles = big.slice(0, 8).map(([at, h, mm, dd]) => {
    const off = Math.round((at - date.getTime()) / 864e5), dt = new Date(at);
    return `      <li><a class="hd-tile" href="${slug(mm, dd)}.html">${drawing(h, mm, dd)}<b>${esc(show(h.name))}</b><span>${WEEKDAYS[dt.getUTCDay()]}, ${label(mm, dd)}, ${dt.getUTCFullYear()}</span><span class="hd-off" data-at="${dt.toISOString().slice(0, 10)}">${off === 0 ? "Today" : off === 1 ? "Tomorrow" : `In ${off} days`}</span></a></li>`;
  });
  const todayBlock = all.length
    ? all.map((h) => card(h, m, d)).join("\n")
    : `        <article class="hd-card"><h2>A quiet day</h2><p>No verified observance on our list today. See the days ahead below.</p></article>`;
  const title = "What Holiday Is It Today? Today's National Days";
  const description = "What holiday is it today? Today's national days with a drawing and the story behind each, the week ahead, and how many days until the next big holiday.";
  const script = `<script>
(function () {
  var M = ${JSON.stringify(MONTHS)}, W = ${JSON.stringify(WEEKDAYS)};
  var now = new Date(), y = now.getFullYear(), m = now.getMonth() + 1, d = now.getDate();
  var built = ${JSON.stringify(today)};
  var local = y + "-" + String(m).padStart(2, "0") + "-" + String(d).padStart(2, "0");
  if (local === built) return;
  function go() {
    document.querySelectorAll("[data-at]").forEach(function (el) {
      var n = Math.round((Date.parse(el.dataset.at) - Date.UTC(y, m - 1, d)) / 864e5);
      if (n >= 0) el.textContent = n === 0 ? "Today" : n === 1 ? "Tomorrow" : "In " + n + " days";
    });
    fetch("data.json").then(function (r) { return r.json(); }).then(function (data) {
      var list = ((data.fixed.find(function (e) { return e.month === m && e.day === d; }) || {}).holidays || []);
      var heading = document.getElementById("today-date");
      var grid = document.getElementById("today-grid");
      var link = document.getElementById("today-link");
      if (!heading || !grid) return;
      heading.textContent = W[now.getDay()] + ", " + M[m - 1] + " " + d;
      if (link) link.href = M[m - 1].toLowerCase() + "-" + d + ".html";
      if (!list.length) return;
      grid.innerHTML = "";
      list.forEach(function (h) {
        var a = document.createElement("article"); a.className = "hd-card";
        if (h.art) {
          var s = document.createElement("span"); s.className = "hd-stage cat-" + h.category;
          var im = document.createElement("img"); im.src = "../assets/holidays/" + h.art + ".svg"; im.alt = "Drawing for " + h.name; im.width = 400; im.height = 200; s.appendChild(im); a.appendChild(s);
        }
        var b = document.createElement("div"); b.className = "hd-body";
        var h2 = document.createElement("h2"); h2.textContent = h.name;
        var p = document.createElement("p"); p.textContent = h.description;
        b.appendChild(h2); b.appendChild(p); a.appendChild(b); grid.appendChild(a);
      });
    }).catch(function () {});
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", go); else go();
})();
</script>
`;
  const body = `  <div class="wrap hd">
    <p class="eyebrow">Daily holidays</p>
    <h1>What holiday is it today?</h1>
    <p class="lede">Today is <b id="today-date">${WEEKDAYS[date.getUTCDay()]}, ${label(m, d)}</b>${all.length ? `. Here is what people are celebrating` : ""}.</p>
    ${BYLINE}
    <div class="hd-grid" id="today-grid">
${todayBlock}
    </div>
${all.length ? `    <p class="hd-more"><a class="link" id="today-link" href="${slug(m, d)}.html">The page for today &rarr;</a></p>\n` : ""}    <h2 class="hd-h2">Coming up this week</h2>
    <ul class="hd-tiles">
${week.join("\n")}
    </ul>
    <h2 class="hd-h2">How long until the next big holiday?</h2>
    <ul class="hd-tiles">
${bigTiles.join("\n")}
    </ul>
${adSlot("today")}${appPitch("today's holiday")}
    <h2 class="hd-h2">Browse by month</h2>
    <ul class="hd-months">
${MONTHS.map((n, i) => `      <li><a href="${monthSlug(i + 1)}.html">${n}</a></li>`).join("\n")}
    </ul>
    <h2 class="hd-h2">About national days</h2>
    <div class="hd-faq">
${FAQ.map(([q, a]) => `      <div><h3>${esc(q)}</h3><p>${esc(a)}</p></div>`).join("\n")}
    </div>
  </div>`;
  return shell({ title, description, canonical: `${ORIGIN}/holidays/`, body, extraHead: script });
}


// ---------- sitemap ----------

function updateSitemap(urls) {
  const file = path.join(SITE, "sitemap.xml");
  let xml = fs.readFileSync(file, "utf8");
  xml = xml.replace(/\s*<url><loc>https:\/\/graysmithlabs\.com\/holidays\/[^<]*<\/loc><\/url>/g, "");
  const block = urls.map((u) => `  <url><loc>${u}</loc></url>\n`).join("");
  xml = xml.replace(/\s*<\/urlset>/, `\n${block}</urlset>`);
  fs.writeFileSync(file, xml);
}

// One time: link the holiday calendar from the CelebriDay app page.
function linkFromAppPage() {
  const file = path.join(SITE, "apps/celebriday.html");
  if (!fs.existsSync(file)) return;
  const html = fs.readFileSync(file, "utf8");
  if (html.includes('href="../holidays/"')) return;
  const button = `<a class="btn" href="${APP_URL}" rel="noopener">Download on the App Store</a>`;
  if (!html.includes(button)) return console.warn("apps/celebriday.html: App Store button not found, add the holidays link by hand");
  fs.writeFileSync(file, html.replace(button, `${button}\n          <a class="btn ghost" href="../holidays/">See today's holiday</a>`));
}

// ---------- main ----------

const data = args.app ? await refreshData() : JSON.parse(fs.readFileSync(path.join(OUT, "data.json"), "utf8"));
fs.copyFileSync(path.join(HERE, "holidays.css"), path.join(OUT, "holidays.css"));
const today = todayInDenver();
const year = Number(today.slice(0, 4));
const years = [year, year + 1];
placeMoving(data, today);

// The today page redraws itself for the visitor's date from data.json, so each
// observance there carries its drawing.
for (const e of data.fixed) for (const h of e.holidays) { const a = artOf(h, e.month, e.day); if (a) h.art = a; }
fs.writeFileSync(path.join(OUT, "data.json"), JSON.stringify(data));

// Days with something to publish, in calendar order.
const days = [];
for (let m = 1; m <= 12; m++) {
  for (let d = 1; d <= DAYS_IN[m - 1]; d++) {
    if (dayEntries(data, m, d).all.length) days.push([m, d]);
  }
}
const daysWithContent = new Set(days.map(([m, d]) => `${m}-${d}`));

// Remove day pages that no longer have content, so nothing thin stays live.
for (const f of fs.readdirSync(OUT)) {
  const match = f.match(/^([a-z]+)-(\d+)\.html$/);
  if (match && !daysWithContent.has(`${MONTHS.findIndex((n) => n.toLowerCase() === match[1]) + 1}-${match[2]}`)) fs.unlinkSync(path.join(OUT, f));
}

days.forEach(([m, d], i) => {
  const prev = days[(i - 1 + days.length) % days.length];
  const next = days[(i + 1) % days.length];
  fs.writeFileSync(path.join(OUT, `${slug(m, d)}.html`), dayPage(data, m, d, years, prev, next, daysWithContent));
});
for (let m = 1; m <= 12; m++) fs.writeFileSync(path.join(OUT, `${monthSlug(m)}.html`), monthPage(data, m, years, daysWithContent));
fs.writeFileSync(path.join(OUT, "index.html"), indexPage(data, today, years, daysWithContent));

// Today's card on the home page.
{
  const file = path.join(SITE, "index.html");
  const [, m, d] = today.split("-").map(Number);
  const all = dayEntries(data, m, d).all, h = all.find((x) => storyOf(x, m, d)) ?? all[0];
  const html = fs.readFileSync(file, "utf8");
  const s = h && storyOf(h, m, d);
  const lead = s ? s.story.split(/\n\n+/)[0] : h?.description ?? "";
  const block = h ? `      <article class="td">
        <div class="td-art"><img src="assets/holidays/${artOf(h, m, d)}.svg" alt="Drawing for ${esc(show(h.name))}" width="400" height="200"></div>
        <div class="td-body">
          <p class="eyebrow">${label(m, d)}</p>
          <h2>${esc(show(h.name))}</h2>
          <p>${esc(lead)}</p>
          <a class="btn chunky" href="holidays/">What else is today? <span class="arrow" aria-hidden="true">&rarr;</span></a>
        </div>
      </article>
` : "";
  fs.writeFileSync(file, html.replace(/(<!-- today:start[^>]*-->\n)[\s\S]*?(<!-- today:end -->)/, (_, a, z) => a + block + z));
}

linkFromAppPage();
// ads.txt exists only while a publisher id is set, so the site never claims a seller it is not.
const adsTxt = path.join(SITE, "ads.txt");
const pub = ADS?.publisherId.replace(/^ca-/, "");
if (pub) fs.writeFileSync(adsTxt, `google.com, ${pub}, DIRECT, f08c47fec0942fa0\n`);
else if (fs.existsSync(adsTxt) && /^google\.com, pub-/.test(fs.readFileSync(adsTxt, "utf8"))) fs.unlinkSync(adsTxt);
updateSitemap([
  `${ORIGIN}/holidays/`,
  ...MONTHS.map((n) => `${ORIGIN}/holidays/${n.toLowerCase()}.html`),
  ...days.filter(([m, d]) => isIndexed(data, m, d)).map(([m, d]) => `${ORIGIN}/holidays/${slug(m, d)}.html`),
]);
console.log(`built ${days.length} day pages, 12 month pages and the today page for ${today}`);
