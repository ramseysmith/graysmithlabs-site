// Builds /days-until-thanksgiving/index.html: a live countdown to US Thanksgiving
// (the fourth Thursday of November, computed in the browser for any year), the
// dates for the next five years, and every verified observance from November 1
// to Thanksgiving taken from holidays/data.json (the same list as CelebriDay).
//
//   node tools/countdown/build.mjs            uses the current year
//   node tools/countdown/build.mjs 2027       builds the list for 2027
//
// Run it once a year after Thanksgiving so the list shows the coming November.
// The page hides days that have passed on its own.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const YEAR = Number(process.argv[2]) || new Date().getFullYear();
const data = JSON.parse(fs.readFileSync(path.join(SITE, "holidays/data.json"), "utf8"));
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function thanksgiving(y) {
  const first = new Date(Date.UTC(y, 10, 1)).getUTCDay();
  return 1 + ((4 - first + 7) % 7) + 21;
}
function nthWeekday(y, month, weekday, n) {
  const first = new Date(Date.UTC(y, month - 1, 1)).getUTCDay();
  return 1 + ((weekday - first + 7) % 7) + (n - 1) * 7;
}
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/'/g, "&#x27;").replace(/"/g, "&quot;");

const TG = thanksgiving(YEAR);
const days = [];
for (let d = 1; d <= TG; d++) {
  const fixed = data.fixed.find((x) => x.month === 11 && x.day === d)?.holidays || [];
  const moving = data.moving.filter((m) => {
    const r = m.rule;
    if (r.kind !== "nthWeekday") return false;
    const base = new Date(Date.UTC(YEAR, r.month - 1, nthWeekday(YEAR, r.month, r.weekday, r.n) + (r.offsetDays || 0)));
    return base.getUTCMonth() === 10 && base.getUTCDate() === d;
  });
  const names = [...moving, ...fixed].map((h) => h.name);
  if (names.length) days.push({ d, names });
}
if (!days.length) throw new Error("no November observances found in holidays/data.json");

const listHtml = days
  .map(({ d, names }) => {
    const wd = WEEKDAYS[new Date(Date.UTC(YEAR, 10, d)).getUTCDay()];
    return `        <li data-day="${d}"><a href="../holidays/november-${d}.html"><b>${wd}, November ${d}</b><span>${names.map(esc).join(", ")}</span></a></li>`;
  })
  .join("\n");

const dates = [];
for (let y = YEAR; y < YEAR + 5; y++) dates.push([y, thanksgiving(y)]);
const datesHtml = dates.map(([y, d]) => `            <tr><th scope="row">${y}</th><td>Thursday, November ${d}</td></tr>`).join("\n");

const faq = [
  ["How many days until Thanksgiving?", `The countdown at the top of this page shows the exact number of days, hours and minutes until Thanksgiving in your own time zone. Thanksgiving ${YEAR} is Thursday, November ${TG}.`],
  [`What date is Thanksgiving ${YEAR}?`, `Thanksgiving ${YEAR} in the United States is Thursday, November ${TG}. It always falls on the fourth Thursday of November, so the date moves between November 22 and 28 each year.`],
  ["Why is Thanksgiving always on a Thursday?", "Presidents set Thanksgiving on a Thursday by proclamation from the 1860s on, and a 1941 law fixed it as the fourth Thursday of November, which is the rule the United States still follows."],
  [`When is Thanksgiving ${YEAR + 1}?`, `Thanksgiving ${YEAR + 1} is Thursday, November ${thanksgiving(YEAR + 1)}.`],
  ["When is Canadian Thanksgiving?", "Canada celebrates Thanksgiving on the second Monday of October, so it comes about six weeks before Thanksgiving in the United States."],
  ["What national days are in Thanksgiving week?", `The list on this page shows every verified observance from November 1 to Thanksgiving, such as ${days.filter((x) => x.d >= TG - 7 && x.d < TG).flatMap((x) => x.names).slice(0, 3).join(", ")}. The CelebriDay app names each one in a morning notification.`],
];
const faqLd = faq.map(([q, a]) => `        {\n          "@type": "Question",\n          "name": ${JSON.stringify(q)},\n          "acceptedAnswer": {\n            "@type": "Answer",\n            "text": ${JSON.stringify(a)}\n          }\n        }`).join(",\n");
const faqHtml = faq.map(([q, a]) => `        <details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join("\n");

const title = `How Many Days Until Thanksgiving ${YEAR}? Countdown`;
const desc = `Live countdown to Thanksgiving ${YEAR} (Thursday, November ${TG}) in days, hours and minutes, plus the next five years and every national day until then.`;
const URL = "https://graysmithlabs.com/days-until-thanksgiving/";

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
<meta property="og:image" content="https://graysmithlabs.com/assets/apps/celebriday/og.jpg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:site" content="@GraysmithLabs">
<meta name="twitter:image" content="https://graysmithlabs.com/assets/apps/celebriday/og.jpg">
<link rel="icon" href="../favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;1,9..144,400&family=Spline+Sans+Mono:wght@400;500&display=swap" rel="stylesheet">
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
      "name": "Thanksgiving countdown",
      "url": "${URL}",
      "applicationCategory": "LifestyleApplication",
      "operatingSystem": "Any (web browser)",
      "browserRequirements": "Requires JavaScript",
      "offers": { "@type": "Offer", "price": "0", "priceCurrency": "USD" },
      "description": "A free live countdown to US Thanksgiving in days, hours and minutes, with every national day between now and then.",
      "publisher": { "@type": "Organization", "name": "Graysmith Labs", "url": "https://graysmithlabs.com" },
      "isRelatedTo": { "@id": "https://graysmithlabs.com/apps/celebriday.html#app" }
    },
    {
      "@type": "Event",
      "name": "Thanksgiving ${YEAR}",
      "startDate": "${YEAR}-11-${TG}",
      "endDate": "${YEAR}-11-${TG}",
      "eventAttendanceMode": "https://schema.org/OfflineEventAttendanceMode",
      "eventStatus": "https://schema.org/EventScheduled",
      "location": { "@type": "Country", "name": "United States" },
      "description": "Thanksgiving Day in the United States, the fourth Thursday of November."
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
    <p class="crumbs"><a href="../holidays/">Holidays</a> &nbsp;/&nbsp; Days until Thanksgiving</p>
    <h1>How many days until Thanksgiving?</h1>
    <p class="guide-answer" id="cd-answer">Thanksgiving ${YEAR} is on Thursday, November ${TG}, the fourth Thursday of November. The countdown below shows the days, hours and minutes left in your own time zone, and the list shows every national day to celebrate on the way there.</p>

    <section class="cd-tool" aria-label="Thanksgiving countdown">
      <div class="cd-grid" aria-live="polite">
        <div><b id="cd-d">&nbsp;</b><span>days</span></div>
        <div><b id="cd-h">&nbsp;</b><span>hours</span></div>
        <div><b id="cd-m">&nbsp;</b><span>minutes</span></div>
        <div><b id="cd-s">&nbsp;</b><span>seconds</span></div>
      </div>
      <p class="cd-line" id="cd-line">Thanksgiving ${YEAR}: Thursday, November ${TG}.</p>
      <noscript><p class="guide-note">The live countdown needs JavaScript turned on. Thanksgiving ${YEAR} is Thursday, November ${TG}.</p></noscript>
    </section>

    <section class="guide-sec" id="days">
      <h2>Every national day until Thanksgiving</h2>
      <p>Something to celebrate on each day of the countdown, from the same checked list as our <a href="../holidays/november.html">November holidays</a> page. Tap a day to see what each one is about.</p>
      <ol class="cd-days" id="cd-days">
${listHtml}
      </ol>
    </section>

    <section class="guide-sec">
      <h2>Thanksgiving dates for the next five years</h2>
      <p>Thanksgiving in the United States is always the fourth Thursday of November, so it lands between November 22 and 28.</p>
      <div class="guide-table">
        <table>
          <thead><tr><th scope="col">Year</th><th scope="col">Thanksgiving Day</th></tr></thead>
          <tbody>
${datesHtml}
          </tbody>
        </table>
      </div>
    </section>

    <aside class="guide-app">
      <img src="../assets/apps/celebriday/icon.png" alt="CelebriDay app icon" width="64" height="64">
      <div>
        <h2>CelebriDay for iPhone</h2>
        <p>CelebriDay counts down to Thanksgiving on its Today screen and names the national day each morning, with a fun fact and a card to share for every one of its 700 plus holidays. Today and tomorrow are free.</p>
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
  const tg = (y) => { const f = new Date(y, 10, 1).getDay(); return new Date(y, 10, 1 + ((4 - f + 7) % 7) + 21); };
  const $ = (id) => document.getElementById(id);
  const now = new Date();
  let target = tg(now.getFullYear());
  const end = new Date(target); end.setDate(end.getDate() + 1);
  const isToday = now >= target && now < end;
  if (now >= end) target = tg(now.getFullYear() + 1);
  const fmt = (d) => d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((target - midnight) / 86400000);
  if (isToday) {
    $('cd-line').textContent = 'Happy Thanksgiving! Today is the day.';
    $('cd-answer').textContent = 'Today is Thanksgiving, ' + fmt(target) + '. Happy Thanksgiving! Next year it falls on ' + fmt(tg(now.getFullYear() + 1)) + '.';
  } else {
    $('cd-line').textContent = days + (days === 1 ? ' day' : ' days') + ' until Thanksgiving, ' + fmt(target) + '.';
    $('cd-answer').textContent = 'There ' + (days === 1 ? 'is 1 day' : 'are ' + days + ' days') + ' until Thanksgiving, which falls on ' + fmt(target) + ', the fourth Thursday of November. The countdown below shows the hours and minutes left in your own time zone, and the list shows a national day to celebrate on each day until then.';
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
  if (now.getFullYear() === listYear && now.getMonth() === 10) {
    list.querySelectorAll('li').forEach((li) => { if (Number(li.dataset.day) < now.getDate()) li.remove(); });
  }
  if (!list.children.length || now >= new Date(listYear, 10, ${TG + 1})) $('days').hidden = true;
})();
</script>
</main>
${footer}`;

const out = path.join(SITE, "days-until-thanksgiving");
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, "index.html"), html);
console.log(`days-until-thanksgiving: Thanksgiving ${YEAR} is November ${TG}, ${days.length} days with observances`);
