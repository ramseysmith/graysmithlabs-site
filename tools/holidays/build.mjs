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
function dayEntries(data, m, d) {
  const fixed = (data.fixed.find((e) => e.month === m && e.day === d)?.holidays ?? []).map((h) => ({ ...h }));
  const moving = NEXT_MOVING
    .filter((mh) => mh.at.getUTCMonth() + 1 === m && mh.at.getUTCDate() === d)
    .map((mh) => ({ ...mh, year: mh.at.getUTCFullYear() }));
  return { moving, fixed, all: [...moving, ...fixed] };
}

// ---------- page shell (matches the app pages on the site) ----------

function shell({ title, description, canonical, body, extraHead = "" }) {
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
<meta property="og:image" content="${ORIGIN}/assets/apps/celebriday/og.jpg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="CelebriDay app screens on iPhone, free on the App Store">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:site" content="@GraysmithLabs">
<meta name="twitter:image" content="${ORIGIN}/assets/apps/celebriday/og.jpg">
<link rel="icon" href="../favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;1,9..144,400&family=Spline+Sans+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../styles.css">
<link rel="stylesheet" href="holidays.css">
<script src="../main.js" defer></script>
${extraHead}</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="site-head">
  <div class="wrap">
    <a class="mark" href="../"><span class="glyph">G</span> Graysmith Labs</a>
    <nav class="nav" aria-label="Main">
      <div class="nav-links" id="nav-links">
        <a href="../#services">Services</a>
        <a href="../work/valentine-tide.html">Work</a>
        <a href="../#apps">Apps</a>
        <a href="./">Holidays</a>
        <a href="../#about">About</a>
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
        <p class="blurb">An independent software studio in Colorado. Elegant software across every platform, for clients and for ourselves.</p>
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
        </ul>
      </div>
      <div>
        <span class="label">Contact</span>
        <ul>
          <li><a href="mailto:ramsey@graysmithlabs.com?subject=Project%20inquiry">ramsey@graysmithlabs.com</a></li>
          <li><a href="https://apps.apple.com/us/developer/graysmith-labs-llc/id1871756911">Our App Store page</a></li>
        </ul>
      </div>
    </div>
    <div class="foot-base">
      <span>&copy; <span data-year>2026</span> Graysmith Labs LLC &middot; A Colorado limited liability company</span>
      <span>Centennial, Colorado &middot; United States</span>
    </div>
  </div>
</footer>
</body>
</html>
`;
}

function card(h) {
  const when = h.year ? `<p class="hd-when">The date moves each year. In ${h.year} it falls on this day.</p>` : "";
  return `        <article class="hd-card">
          <div class="hd-top"><span class="hd-emoji" aria-hidden="true">${h.emoji}</span><span class="tag">${CATEGORY_LABEL[h.category] ?? "Observance"}</span></div>
          <h2>${esc(h.name)}</h2>
          <p>${esc(h.description)}</p>
          ${when}
        </article>`;
}

function appPitch(context) {
  return `      <aside class="hd-app">
        <img src="../assets/apps/celebriday/icon.png" alt="CelebriDay app icon" width="64" height="64">
        <div>
          <h2>Get ${context} every morning</h2>
          <p>CelebriDay sends the day's holiday with a fun fact and a card made for sharing. Free on iPhone, with a full calendar of the year.</p>
          <a class="btn" href="${APP_URL}" rel="noopener">Download CelebriDay on the App Store</a>
        </div>
      </aside>`;
}

// ---------- pages ----------

function dayPage(data, m, d, years, prev, next) {
  const { all } = dayEntries(data, m, d);
  const names = all.map((h) => h.name);
  const when = label(m, d);
  let title = `${when} Holidays: ${names[0]}`;
  if (names.length > 1) title += " and More";
  if (title.length > 60) title = `What Holiday Is It on ${when}?`;
  const description = clip(`What holiday is it on ${when}? ${listNames(names)}. See every observance for the day and get one each morning in CelebriDay.`, 155);
  const canonical = `${ORIGIN}/holidays/${slug(m, d)}.html`;
  const body = `  <div class="wrap hd">
    <p class="crumbs"><a href="./">Holidays</a> &nbsp;/&nbsp; <a href="${monthSlug(m)}.html">${MONTHS[m - 1]}</a> &nbsp;/&nbsp; ${d}</p>
    <h1>What holiday is it on ${when}?</h1>
    <p class="lede">${when} has ${all.length === 1 ? "one observance" : `${all.length} observances`} to celebrate: ${esc(listNames(names))}.</p>
    <div class="hd-grid">
${all.map(card).join("\n")}
    </div>
${appPitch("a holiday like this")}
    <nav class="pager" aria-label="Nearby days">
      <a href="${slug(...prev)}.html"><span><span class="label">Previous day</span><b>${label(...prev)}</b></span></a>
      <a class="next" href="${slug(...next)}.html"><span><span class="label">Next day</span><b>${label(...next)}</b></span></a>
    </nav>
  </div>`;
  return shell({ title, description, canonical, body });
}

function monthPage(data, m, years, daysWithContent) {
  const name = MONTHS[m - 1];
  const rows = [];
  for (let d = 1; d <= DAYS_IN[m - 1]; d++) {
    if (!daysWithContent.has(`${m}-${d}`)) continue;
    const { all } = dayEntries(data, m, d);
    rows.push(`      <li><a href="${slug(m, d)}.html"><b>${name} ${d}</b><span>${esc(all.map((h) => `${h.emoji} ${h.name}`).join("  ·  "))}</span></a></li>`);
  }
  const title = `${name} Holidays and Observances, Day by Day`;
  const description = clip(`Every holiday and national day in ${name}, day by day, from food days to awareness days. Tap a date for details, or get one each morning in CelebriDay.`, 155);
  const body = `  <div class="wrap hd">
    <p class="crumbs"><a href="./">Holidays</a> &nbsp;/&nbsp; ${name}</p>
    <h1>${name} holidays and observances</h1>
    <p class="lede">The holidays and national days of ${name}, day by day. Tap a date to see what it is about.</p>
    <ul class="hd-month">
${rows.join("\n")}
    </ul>
${appPitch("a new holiday")}
    <nav class="pager" aria-label="Other months">
      <a href="${monthSlug(m === 1 ? 12 : m - 1)}.html"><span><span class="label">Previous month</span><b>${MONTHS[(m + 10) % 12]}</b></span></a>
      <a class="next" href="${monthSlug(m === 12 ? 1 : m + 1)}.html"><span><span class="label">Next month</span><b>${MONTHS[m % 12]}</b></span></a>
    </nav>
  </div>`;
  return shell({ title, description, canonical: `${ORIGIN}/holidays/${monthSlug(m)}.html`, body });
}

function indexPage(data, today, years, daysWithContent) {
  const [y, m, d] = today.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const { all } = dayEntries(data, m, d);
  const upcoming = [];
  for (let i = 1; upcoming.length < 6 && i < 40; i++) {
    const n = new Date(date);
    n.setUTCDate(n.getUTCDate() + i);
    const nm = n.getUTCMonth() + 1, nd = n.getUTCDate();
    const e = dayEntries(data, nm, nd).all;
    if (e.length) upcoming.push(`      <li><a href="${slug(nm, nd)}.html"><b>${WEEKDAYS[n.getUTCDay()]}, ${label(nm, nd)}</b><span>${esc(e.map((h) => `${h.emoji} ${h.name}`).join("  ·  "))}</span></a></li>`);
  }
  const todayBlock = all.length
    ? all.map((h) => card(h)).join("\n")
    : `        <article class="hd-card"><h2>A quiet day</h2><p>No verified observance on our list today. See the days ahead below.</p></article>`;
  const title = "What Holiday Is It Today? Today's National Days";
  const description = "What holiday is it today? See today's national days and observances, the week ahead, and a full calendar of holidays for every day of the year.";
  const script = `<script>
(function () {
  var M = ${JSON.stringify(MONTHS)}, W = ${JSON.stringify(WEEKDAYS)};
  var now = new Date(), y = now.getFullYear(), m = now.getMonth() + 1, d = now.getDate();
  var built = ${JSON.stringify(today)};
  var local = y + "-" + String(m).padStart(2, "0") + "-" + String(d).padStart(2, "0");
  if (local === built) return;
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
      var top = document.createElement("div"); top.className = "hd-top";
      var em = document.createElement("span"); em.className = "hd-emoji"; em.textContent = h.emoji; top.appendChild(em);
      var h2 = document.createElement("h2"); h2.textContent = h.name;
      var p = document.createElement("p"); p.textContent = h.description;
      a.appendChild(top); a.appendChild(h2); a.appendChild(p); grid.appendChild(a);
    });
  }).catch(function () {});
})();
</script>
`;
  const body = `  <div class="wrap hd">
    <p class="eyebrow">Daily holidays</p>
    <h1>What holiday is it today?</h1>
    <p class="lede">Today is <b id="today-date">${WEEKDAYS[date.getUTCDay()]}, ${label(m, d)}</b>. Here is what the world is celebrating.</p>
    <div class="hd-grid" id="today-grid">
${todayBlock}
    </div>
${all.length ? `    <p class="hd-more"><a class="link" id="today-link" href="${slug(m, d)}.html">More about today &rarr;</a></p>\n` : ""}${appPitch("today's holiday")}
    <h2 class="hd-h2">Coming up next</h2>
    <ul class="hd-month">
${upcoming.join("\n")}
    </ul>
    <h2 class="hd-h2">Browse by month</h2>
    <ul class="hd-months">
${MONTHS.map((n, i) => `      <li><a href="${monthSlug(i + 1)}.html">${n}</a></li>`).join("\n")}
    </ul>
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
  fs.writeFileSync(path.join(OUT, `${slug(m, d)}.html`), dayPage(data, m, d, years, prev, next));
});
for (let m = 1; m <= 12; m++) fs.writeFileSync(path.join(OUT, `${monthSlug(m)}.html`), monthPage(data, m, years, daysWithContent));
fs.writeFileSync(path.join(OUT, "index.html"), indexPage(data, today, years, daysWithContent));

linkFromAppPage();
updateSitemap([
  `${ORIGIN}/holidays/`,
  ...MONTHS.map((n) => `${ORIGIN}/holidays/${n.toLowerCase()}.html`),
  ...days.map(([m, d]) => `${ORIGIN}/holidays/${slug(m, d)}.html`),
]);
console.log(`built ${days.length} day pages, 12 month pages and the today page for ${today}`);
