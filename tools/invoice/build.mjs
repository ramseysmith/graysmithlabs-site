// Builds one invoice template page per trade at /invoice-generator/<slug>/index.html
// from the main generator page (/invoice-generator/index.html) and
// tools/invoice/trades.json. Each page runs the same generator (../invoice.js),
// prefilled with three typical lines for that trade, and adds a short section on
// how to bill the trade, three FAQ entries with FAQPage JSON LD and the Tallyhand
// card with that trade's one sentence Quick add example.
//
//   node tools/invoice/build.mjs
//
// Rerun after any change to the main generator page or to trades.json. It also
// writes the trade list onto the main page between the INVOICE TRADES markers.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const MAIN = path.join(SITE, "invoice-generator/index.html");
const trades = JSON.parse(fs.readFileSync(path.join(SITE, "tools/invoice/trades.json"), "utf8"));
const BASE = "https://graysmithlabs.com/invoice-generator/";
const APP = "https://apps.apple.com/us/app/id6827360818";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const DASH = /[–—]|[A-Za-z]-[A-Za-z]/;

function must(html, from, to, label) {
  if (!html.includes(from)) throw new Error(`template changed: ${label} not found`);
  return html.split(from).join(to);
}
function replaceBetween(html, start, end, inner, label) {
  const a = html.indexOf(start);
  const b = html.indexOf(end, a + start.length);
  if (a < 0 || b < 0) throw new Error(`template changed: ${label} not found`);
  return html.slice(0, a) + inner + html.slice(b + end.length);
}

// The trade list on the main page, rebuilt every run.
const listHtml =
  `<!-- INVOICE TRADES -->\n    <section class="guide-sec" id="trades">\n      <h2>Invoice templates by trade</h2>\n      <p>Start from the lines your trade bills most, already filled in. Each page also has a printable blank invoice and estimate PDF:</p>\n      <ul>\n` +
  trades.map((t) => `        <li><a href="${t.slug}/">${esc(t.h1.replace(/^Free /, "").replace(/^./, (c) => c.toUpperCase()))}</a></li>`).join("\n") +
  `\n      </ul>\n    </section>\n    <!-- /INVOICE TRADES -->`;

let main = fs.readFileSync(MAIN, "utf8");
if (main.includes("<!-- INVOICE TRADES -->")) {
  main = replaceBetween(main, "<!-- INVOICE TRADES -->", "<!-- /INVOICE TRADES -->", listHtml, "trade list markers");
} else {
  main = must(main, `    <aside class="guide-app">`, `${listHtml}\n\n    <aside class="guide-app">`, "guide-app aside");
}
fs.writeFileSync(MAIN, main);

// The template is the main page without its trade list.
const template = replaceBetween(main, "<!-- INVOICE TRADES -->", "<!-- /INVOICE TRADES -->\n\n", "", "trade list markers");

for (const t of trades) {
  for (const [k, v] of Object.entries(t)) {
    const text = JSON.stringify(v);
    if (k !== "slug" && DASH.test(text)) throw new Error(`${t.slug}.${k} has a dash in prose: ${text}`);
  }
  if (t.items.length !== 3 || t.faq.length !== 3) throw new Error(`${t.slug}: needs 3 items and 3 FAQ entries`);

  const url = `${BASE}${t.slug}/`;
  let html = template;

  // Paths are one folder deeper.
  html = html.replace(/(href|src)="\.\.\//g, '$1="../../');
  html = must(html, '<script src="invoice.js" defer></script>', '<script src="../invoice.js" defer></script>', "invoice.js script");

  // Head.
  html = must(html, "<title>Free Invoice Generator: Make a PDF Invoice Online</title>", `<title>${esc(t.title)}</title>`, "title");
  html = html.replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${esc(t.description)}">`);
  html = html.replace(/<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${esc(t.description)}">`);
  html = must(html, '<meta property="og:title" content="Free Invoice Generator: Make a PDF Invoice Online">', `<meta property="og:title" content="${esc(t.title)}">`, "og:title");
  html = must(html, `<link rel="canonical" href="${BASE}">`, `<link rel="canonical" href="${url}">`, "canonical");
  html = must(html, `<meta property="og:url" content="${BASE}">`, `<meta property="og:url" content="${url}">`, "og:url");

  // JSON LD: the tool, the FAQ and the breadcrumb.
  const ld = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebApplication",
        "@id": `${url}#tool`,
        name: t.h1,
        url,
        applicationCategory: "BusinessApplication",
        operatingSystem: "Any (web browser)",
        browserRequirements: "Requires JavaScript",
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        description: t.description,
        publisher: { "@type": "Organization", name: "Graysmith Labs", url: "https://graysmithlabs.com" },
        isRelatedTo: { "@id": "https://graysmithlabs.com/apps/tallyhand.html#app" },
      },
      {
        "@type": "FAQPage",
        "@id": `${url}#faq`,
        mainEntity: t.faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Invoice generator", item: BASE },
          { "@type": "ListItem", position: 2, name: t.h1.replace(/^Free /, "").replace(/^./, (c) => c.toUpperCase()), item: url },
        ],
      },
    ],
  };
  html = replaceBetween(html, '<script type="application/ld+json">', "</script>", `<script type="application/ld+json">\n${JSON.stringify(ld, null, 2)}\n</script>`, "JSON LD");

  // Top of the page.
  html = must(
    html,
    '<p class="crumbs"><a href="../../apps/tallyhand.html">Tallyhand</a> &nbsp;/&nbsp; Invoice generator</p>',
    `<p class="crumbs"><a href="../../apps/tallyhand.html">Tallyhand</a> &nbsp;/&nbsp; <a href="../">Invoice generator</a> &nbsp;/&nbsp; ${esc(t.trade.replace(/^./, (c) => c.toUpperCase()))}</p>`,
    "crumbs"
  );
  html = must(html, "<h1>Free invoice generator</h1>", `<h1>${esc(t.h1)}</h1>`, "h1");
  html = html.replace(/<p class="guide-answer">[\s\S]*?<\/p>/, `<p class="guide-answer">${esc(t.answer)}</p>`);
  html = must(html, 'placeholder="Green Acre Lawn Care"', `placeholder="${esc(t.biz)}"`, "biz placeholder");
  html = must(html, 'placeholder="The Hendersons"', `placeholder="${esc(t.client)}"`, "client placeholder");

  // Preset lines for invoice.js.
  html = must(
    html,
    '<script src="../invoice.js" defer></script>',
    `<script>window.IG_PRESET = ${JSON.stringify({ trade: t.slug, items: t.items })};</script>\n<script src="../invoice.js" defer></script>`,
    "preset"
  );

  // How to bill this trade, in place of the general how to.
  const how =
    `<section class="guide-sec">\n      <h2>${esc(t.howTitle)}</h2>\n      <ol class="guide-steps">\n` +
    t.how.map(([a, b]) => `        <li><strong>${esc(a)}</strong> ${esc(b)}</li>`).join("\n") +
    `\n      </ol>\n      <p>New to invoices? The <a href="../">main invoice generator</a> walks through what every invoice needs.</p>\n    </section>`;
  html = replaceBetween(html, '<section class="guide-sec">\n      <h2>How to make an invoice</h2>', "</section>", how, "how to section");
  // Printable blank invoice and estimate (tools/printables/trade-blanks.py), ahead of the how to.
  const pdf = `assets/printables/${t.slug}-invoice-estimate-blank.pdf`;
  if (!fs.existsSync(path.join(SITE, pdf))) throw new Error(`${pdf} missing: run tools/printables/trade-blanks.py`);
  const blank =
    `<section class="guide-sec" id="printable">\n      <h2>Printable blank ${esc(t.trade)} invoice and estimate (PDF)</h2>\n` +
    `      <p>Rather fill it in by hand? <a href="../../${pdf}" download>Download the free blank ${esc(t.trade)} invoice and estimate</a>: two letter size pages, an invoice and an estimate with a client signature line, with your usual lines already printed (${esc(t.blank.join("; "))}). Print as many as you need; no sign up and no watermark.</p>\n    </section>\n\n    `;
  html = html.replace('<section class="guide-sec">\n      <h2>' + t.howTitle.replace(/&/g, "&amp;"), blank + '<section class="guide-sec">\n      <h2>' + t.howTitle.replace(/&/g, "&amp;"));
  if (!html.includes('id="printable"')) throw new Error(`${t.slug}: printable section not placed`);

  // Tallyhand card with this trade's Quick add sentence and a campaign token.
  html = html.replace(
    /<p>Invoicing from your phone is faster still:[\s\S]*?<\/p>/,
    `<p>Invoicing ${esc(t.trade)} from your phone is faster still: tell Tallyhand the job in one sentence, like &ldquo;${esc(t.quickAdd)}&rdquo;, and it builds the invoice, sends the PDF, keeps every client in one place and reminds you when someone is late. Your first 3 documents are free.</p>`
  );
  // tools/links/tag.mjs (run after this) sets the campaign token.
  html = must(html, `<a class="btn" href="${APP}`, `<a class="btn" href="${APP}`, "App Store link");

  // FAQ.
  const faq =
    `<div class="faq-list">\n` + t.faq.map(([q, a]) => `        <details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join("\n") + `\n      </div>`;
  html = replaceBetween(html, '<div class="faq-list">', "</div>", faq, "faq list");

  const dir = path.join(SITE, "invoice-generator", t.slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "index.html"), html);
  console.log(`wrote invoice-generator/${t.slug}/index.html`);
}
