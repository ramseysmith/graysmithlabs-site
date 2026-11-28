// Builds /days-until-christmas/index.html: a live countdown to Christmas Day
// (December 25, in the visitor's own time zone), the weekday it falls on for the
// next five years, and every verified observance from December 1 to Christmas
// taken from holidays/data.json (the same list as CelebriDay).
//
//   node tools/countdown/christmas.mjs        uses the current year
//   node tools/countdown/christmas.mjs 2027   builds the list for 2027
//
// A run with no year after December 25 builds next year, so the daily workflow rolls it.
// The page hides days that have passed on its own.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tagHtml } from "../links/tag.mjs";

const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
// With no year given it builds for the next Christmas still ahead in Denver, so a
// daily run rolls the page to next year on December 26 by itself.
const denver = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Denver" }).format(new Date());
const [dy, dm, dd] = denver.split("-").map(Number);
const YEAR = Number(process.argv[2]) || (dm === 12 && dd > 25 ? dy + 1 : dy);
const data = JSON.parse(fs.readFileSync(path.join(SITE, "holidays/data.json"), "utf8"));
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function nthWeekday(y, month, weekday, n) {
  const first = new Date(Date.UTC(y, month - 1, 1)).getUTCDay();
  return 1 + ((weekday - first + 7) % 7) + (n - 1) * 7;
}
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/'/g, "&#x27;").replace(/"/g, "&quot;");

const TG = 25;
const wdOf = (y) => WEEKDAYS[new Date(Date.UTC(y, 11, 25)).getUTCDay()];
// The list runs from the day after Thanksgiving (Black Friday) to Christmas, so
// holiday shoppers who arrive in late November see their days too.
const TGDAY = nthWeekday(YEAR, 11, 4, 4);
const days = [];
for (let t = Date.UTC(YEAR, 10, TGDAY + 1); t <= Date.UTC(YEAR, 11, TG); t += 86400000) {
  const at = new Date(t), mo = at.getUTCMonth() + 1, d = at.getUTCDate();
  const fixed = data.fixed.find((x) => x.month === mo && x.day === d)?.holidays || [];
  const moving = data.moving.filter((m) => {
    const r = m.rule;
    if (r.kind !== "nthWeekday") return false;
    const base = new Date(Date.UTC(YEAR, r.month - 1, nthWeekday(YEAR, r.month, r.weekday, r.n) + (r.offsetDays || 0)));
    return base.getUTCMonth() === mo - 1 && base.getUTCDate() === d;
  });
  const names = [...moving, ...fixed].map((h) => h.name);
  if (names.length) days.push({ mo, d, names });
}
if (!days.length) throw new Error("no observances from Black Friday to Christmas found in holidays/data.json");

const MONTH_NAME = { 11: "November", 12: "December" };
const listHtml = days
  .map(({ mo, d, names }) => {
    const wd = WEEKDAYS[new Date(Date.UTC(YEAR, mo - 1, d)).getUTCDay()];
    return `        <li data-at="${YEAR}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}"><a href="../holidays/${MONTHS[mo - 1]}-${d}.html"><b>${wd}, ${MONTH_NAME[mo]} ${d}</b><span>${names.map(esc).join(", ")}</span></a></li>`;
  })
  .join("\n");

const dates = [];
for (let y = YEAR; y < YEAR + 5; y++) dates.push([y, wdOf(y)]);
const datesHtml = dates.map(([y, d]) => `            <tr><th scope="row">${y}</th><td>${d}, December 25</td></tr>`).join("\n");

const faq = [
  ["How many days until Christmas?", `The countdown at the top of this page shows the exact number of days, hours and minutes until Christmas in your own time zone. Christmas ${YEAR} is ${wdOf(YEAR)}, December 25.`],
  [`What day of the week is Christmas ${YEAR}?`, `Christmas Day ${YEAR} falls on a ${wdOf(YEAR)}, and Christmas Eve is the ${WEEKDAYS[new Date(Date.UTC(YEAR, 11, 24)).getUTCDay()]} before it. Christmas is always December 25, so only the weekday changes from year to year.`],
  ["How many sleeps until Christmas?", "The number of sleeps is the same as the number of days shown in the countdown: each night between now and Christmas Eve counts as one sleep, and the last one is the night of December 24."],
  [`When is Christmas ${YEAR + 1}?`, `Christmas ${YEAR + 1} is ${wdOf(YEAR + 1)}, December 25.`],
  ["Is Christmas a federal holiday?", "Yes. Christmas Day has been a federal holiday in the United States since 1870. When December 25 falls on a Saturday, federal workers get the Friday before off, and when it falls on a Sunday, the Monday after."],
  ["What national days are in December before Christmas?", `The list on this page shows every verified observance from Black Friday to Christmas, such as ${["National Ugly Sweater Day", "Festivus", "National Eggnog Day"].filter((n) => days.some((x) => x.names.includes(n))).join(", ")}. The CelebriDay app names each one in a morning notification.`],
];
const faqLd = faq.map(([q, a]) => `        {\n          "@type": "Question",\n          "name": ${JSON.stringify(q)},\n          "acceptedAnswer": {\n            "@type": "Answer",\n            "text": ${JSON.stringify(a)}\n          }\n        }`).join(",\n");
const faqHtml = faq.map(([q, a]) => `        <details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join("\n");

const title = `How Many Days Until Christmas ${YEAR}? Countdown`;
const desc = `Live countdown to Christmas ${YEAR} (${wdOf(YEAR)}, December 25) in days, hours and minutes, plus the next five years and a national day for every day of December until then.`;
const URL = "https://graysmithlabs.com/days-until-christmas/";

const template = fs.readFileSync(path.join(SITE, "reaction-time-test/index.html"), "utf8");
const footer = template.slice(template.indexOf('<footer class="site-foot">'));
const header = template.slice(template.indexOf("<body>"), template.indexOf('<main id="main">'));

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<meta name="description" content="${desc}">
<link rel="canonical" href="${URL}">
<meta name="theme-color" content="#f4f1ea" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#131513" media="(prefers-color-scheme: dark)">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Graysmith Labs">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${desc}">
<meta property="og:url" content="${URL}">
<meta property="og:image" content="https://graysmithlabs.com/assets/apps/celebriday/og.jpg?v=1.8.1">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:site" content="@GraysmithLabs">
<meta name="twitter:image" content="https://graysmithlabs.com/assets/apps/celebriday/og.jpg?v=1.8.1">
<link rel="icon" href="../favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;1,9..144,400&family=Spline+Sans:wght@400;500;600&family=Spline+Sans+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../styles.css">
<script src="../main.js" defer></script>
<meta name="apple-itunes-app" content="app-id=6760971240">
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebApplication",
      "@id": "${URL}#tool",
      "name": "Christmas countdown",
      "url": "${URL}",
      "applicationCategory": "LifestyleApplication",
      "operatingSystem": "Any (web browser)",
      "browserRequirements": "Requires JavaScript",
      "offers": { "@type": "Offer", "price": "0", "priceCurrency": "USD" },
      "description": "A free live countdown to Christmas Day in days, hours and minutes, with every national day in December until then.",
      "publisher": { "@type": "Organization", "name": "Graysmith Labs", "url": "https://graysmithlabs.com" },
      "isRelatedTo": { "@id": "https://graysmithlabs.com/apps/celebriday.html#app" }
    },
    {
      "@type": "Event",
      "name": "Christmas Day ${YEAR}",
      "startDate": "${YEAR}-12-25",
      "endDate": "${YEAR}-12-25",
      "eventAttendanceMode": "https://schema.org/OfflineEventAttendanceMode",
      "eventStatus": "https://schema.org/EventScheduled",
      "location": { "@type": "Country", "name": "United States" },
      "description": "Christmas Day, December 25, a federal holiday in the United States."
    },
    {
      "@type": "FAQPage",
      "@id": "${URL}#faq",
      "mainEntity": [
${faqLd}
      ]
    }
  ]
}
</script>
<style>
.cd-tool { margin-top: 32px; padding: 28px 24px; border-radius: 20px; background: var(--card); box-shadow: inset 0 0 0 1px var(--line); text-align: center; }
.cd-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; max-width: 520px; margin: 0 auto; }
.cd-grid div { border: 1px solid var(--line); border-radius: 14px; padding: 14px 6px; }
.cd-grid b { display: block; font-family: var(--serif); font-weight: 500; font-size: clamp(32px, 7vw, 52px); line-height: 1.05; font-variant-numeric: tabular-nums; }
.cd-grid span { font-size: 12px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.06em; }
.cd-line { margin-top: 16px; font-size: 16px; }
.cd-days { list-style: none; padding: 0; margin: 16px 0 0; display: grid; gap: 8px; }
.cd-days a { display: grid; grid-template-columns: minmax(150px, 210px) 1fr; gap: 12px; padding: 12px 14px; border: 1px solid var(--line); border-radius: 12px; color: var(--ink); text-decoration: none; }
.cd-days a:hover { border-color: var(--accent); }
.cd-days b { font-weight: 500; }
.cd-days span { color: var(--muted); }
@media (max-width: 560px) { .cd-days a { grid-template-columns: 1fr; gap: 2px; } .cd-tool { padding: 20px 14px; } .cd-grid { gap: 6px; } }
</style>
</head>
${header}<main id="main">
  <div class="wrap guide">
    <p class="crumbs"><a href="../holidays/">Holidays</a> &nbsp;/&nbsp; Days until Christmas</p>
    <h1>How many days until Christmas?</h1>
    <p class="guide-answer" id="cd-answer">Christmas ${YEAR} is on ${wdOf(YEAR)}, December 25. The countdown below shows the days, hours and minutes left in your own time zone, and the list shows a national day to celebrate on every day of December on the way there.</p>

    <section class="cd-tool" aria-label="Christmas countdown">
      <div class="cd-grid" aria-live="polite">
        <div><b id="cd-d">&nbsp;</b><span>days</span></div>
        <div><b id="cd-h">&nbsp;</b><span>hours</span></div>
        <div><b id="cd-m">&nbsp;</b><span>minutes</span></div>
        <div><b id="cd-s">&nbsp;</b><span>seconds</span></div>
      </div>
      <p class="cd-line" id="cd-line">Christmas ${YEAR}: ${wdOf(YEAR)}, December 25.</p>
      <noscript><p class="guide-note">The live countdown needs JavaScript turned on. Christmas ${YEAR} is ${wdOf(YEAR)}, December 25.</p></noscript>
    </section>

    <section class="guide-sec" id="days">
      <h2>Every national day until Christmas</h2>
      <p>Something to celebrate on each day of the countdown, from Black Friday and Giving Tuesday to Christmas Eve, from the same checked list as our <a href="../holidays/december.html">December holidays</a> page. Tap a day to see what each one is about.</p>
      <ol class="cd-days" id="cd-days">
${listHtml}
      </ol>
    </section>

    <section class="guide-sec">
      <h2>Christmas for the next five years</h2>
      <p>Christmas is always December 25, so only the day of the week moves: one day later each year, two after a leap year. After Christmas, the <a href="../days-until-new-year/">New Year countdown</a> takes over.</p>
      <div class="guide-table">
        <table>
          <thead><tr><th scope="col">Year</th><th scope="col">Christmas Day</th></tr></thead>
          <tbody>
${datesHtml}
          </tbody>
        </table>
      </div>
    </section>

    <aside class="guide-app">
      <img src="../assets/apps/celebriday/icon.png?v=1.8.1" alt="CelebriDay app icon" width="64" height="64">
      <div>
        <h2>CelebriDay for iPhone</h2>
        <p>CelebriDay counts down to Christmas in its Coming up tab, opens Christmas Eve and Christmas Day on their own snowy scene, and names the national day each morning, with a fun fact and a card to share for every one of its 700 plus holidays. Today and tomorrow are free.</p>
        <div class="btn-row">
          <a class="btn" href="https://apps.apple.com/us/app/id6760971240" rel="noopener">Download on the App Store</a>
          <a class="btn ghost" href="../apps/celebriday.html">About CelebriDay</a>
        </div>
      </div>
    </aside>

    <section class="guide-sec" id="faq">
      <h2>Questions</h2>
      <div class="faq-list">
${faqHtml}
      </div>
    </section>
  </div>
<script>
(() => {
  const xmas = (y) => new Date(y, 11, 25);
  const $ = (id) => document.getElementById(id);
  const now = new Date();
  let target = xmas(now.getFullYear());
  const end = new Date(target); end.setDate(end.getDate() + 1);
  const isToday = now >= target && now < end;
  if (now >= end) target = xmas(now.getFullYear() + 1);
  const fmt = (d) => d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((target - midnight) / 86400000);
  if (isToday) {
    $('cd-line').textContent = 'Merry Christmas! Today is the day.';
    $('cd-answer').textContent = 'Today is Christmas, ' + fmt(target) + '. Merry Christmas! Next year it falls on ' + fmt(xmas(now.getFullYear() + 1)) + '.';
  } else {
    const sleeps = days === 1 ? '1 sleep' : days + ' sleeps';
    $('cd-line').textContent = days + (days === 1 ? ' day' : ' days') + ' (' + sleeps + ') until Christmas, ' + fmt(target) + '.';
    $('cd-answer').textContent = 'There ' + (days === 1 ? 'is 1 day' : 'are ' + days + ' days') + ' until Christmas, which falls on ' + fmt(target) + '. The countdown below shows the hours and minutes left in your own time zone, and the list shows a national day to celebrate on each day of December until then.';
  }
  const pad = (n) => String(n).padStart(2, '0');
  function tick() {
    const ms = isToday ? 0 : Math.max(0, target - new Date());
    const s = Math.floor(ms / 1000);
    $('cd-d').textContent = Math.floor(s / 86400);
    $('cd-h').textContent = pad(Math.floor(s / 3600) % 24);
    $('cd-m').textContent = pad(Math.floor(s / 60) % 60);
    $('cd-s').textContent = pad(s % 60);
  }
  tick(); setInterval(tick, 1000);
  const list = $('cd-days');
  const listYear = ${YEAR};
  const todayKey = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());
  list.querySelectorAll('li').forEach((li) => { if (li.dataset.at < todayKey) li.remove(); });
  if (!list.children.length || now >= new Date(listYear, 11, 26)) $('days').hidden = true;
})();
</script>
</main>
${footer}`;

const out = path.join(SITE, "days-until-christmas");
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, "index.html"), tagHtml(html, "days-until-christmas/index.html"));
console.log(`days-until-christmas: Christmas ${YEAR} is ${wdOf(YEAR)}, ${days.length} days with observances`);
