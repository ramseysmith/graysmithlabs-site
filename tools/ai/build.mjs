// Makes every product legible to AI assistants and search engines.
// Reads tools/ai/products.json and:
//   1. writes /llms.txt (a plain summary assistants can read in one fetch)
//   2. on each apps/<slug>.html: sets the title and description, the Smart App
//      Banner, JSON LD (MobileApplication plus FAQPage) and a visible FAQ section
// Idempotent: everything it owns sits between <!-- ai:... --> markers.
// Usage: node tools/ai/build.mjs [--site .] [--check]
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const site = path.resolve(args.includes("--site") ? args[args.indexOf("--site") + 1] : ".");
const check = args.includes("--check");
const data = JSON.parse(fs.readFileSync(path.join(site, "tools/ai/products.json"), "utf8"));

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const unesc = (s) => s.replace(/<[^>]+>/g, "").replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const DASH = /[–—]|\w-\w/;
const problems = [];

function lint(app) {
  const prose = [app.title, app.description, app.answer, app.pricing, ...app.bestFor, ...app.features, ...app.faq.flat()];
  for (const t of prose) if (DASH.test(t)) problems.push(`${app.slug}: dash in "${t.slice(0, 60)}"`);
  if (app.title.length > 60) problems.push(`${app.slug}: title is ${app.title.length} characters (max 60)`);
  if (app.description.length > 155) problems.push(`${app.slug}: description is ${app.description.length} characters (max 155)`);
}

function between(html, name, block, anchor) {
  const re = new RegExp(`<!-- ai:${name} -->[\\s\\S]*?<!-- /ai:${name} -->\\n?`);
  const wrapped = `<!-- ai:${name} -->\n${block}\n<!-- /ai:${name} -->\n`;
  if (re.test(html)) return html.replace(re, wrapped);
  const i = html.indexOf(anchor);
  if (i < 0) throw new Error(`anchor ${anchor} not found for ${name}`);
  return html.slice(0, i) + wrapped + html.slice(i);
}

function setMeta(html, attr, key, value) {
  const re = new RegExp(`(<meta ${attr}="${key}" content=")[^"]*(")`);
  return re.test(html) ? html.replace(re, `$1${esc(value)}$2`) : html;
}

function visibleFaq(html) {
  // FAQ written by hand on the page (outside our markers) wins; read it back for the schema.
  const own = html.replace(/<!-- ai:faq -->[\s\S]*?<!-- \/ai:faq -->/, "");
  const out = [];
  for (const m of own.matchAll(/<details>\s*<summary>([\s\S]*?)<\/summary>\s*<p>([\s\S]*?)<\/p>\s*<\/details>/g)) out.push([unesc(m[1]), unesc(m[2])]);
  return out;
}

function faqSection(app) {
  const items = app.faq.map(([q, a]) => `        <details>\n          <summary>${esc(q)}</summary>\n          <p>${esc(a)}</p>\n        </details>`).join("\n");
  return `  <section id="faq">
    <div class="wrap faq">
      <div>
        <p class="eyebrow">FAQ</p>
        <h2>${esc(app.name)}, <em>answered.</em></h2>
        <p class="muted" style="margin-top:18px;max-width:34ch">${esc(app.answer)}</p>
      </div>
      <div class="faq-list">
${items}
      </div>
    </div>
  </section>`;
}

function jsonLd(app, faq) {
  const url = `${data.site.url}/apps/${app.slug}.html`;
  const graph = [{
    "@type": "MobileApplication",
    "@id": `${url}#app`,
    name: app.name,
    description: app.answer,
    url,
    downloadUrl: `https://apps.apple.com/app/id${app.appStoreId}`,
    installUrl: `https://apps.apple.com/app/id${app.appStoreId}`,
    operatingSystem: "iOS",
    applicationCategory: app.category,
    featureList: app.features,
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD", description: app.pricing },
    publisher: { "@type": "Organization", name: data.site.name, url: data.site.url },
  }];
  if (faq.length) graph.push({
    "@type": "FAQPage",
    "@id": `${url}#faq`,
    mainEntity: faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
  });
  return `<script type="application/ld+json">\n${JSON.stringify({ "@context": "https://schema.org", "@graph": graph }, null, 2)}\n</script>`;
}

function llmsTxt() {
  const lines = [`# ${data.site.name}`, "", `> ${data.site.summary}`, "", `Contact: ${data.site.contact}`, "", "## Apps", ""];
  for (const a of data.apps) {
    lines.push(`### ${a.name}`, "", a.answer, "", `* Pricing: ${a.pricing}`, `* Platforms: ${a.platforms}`, `* Best for: ${a.bestFor.join("; ")}`,
      `* Page: ${data.site.url}/apps/${a.slug}.html`, `* App Store: https://apps.apple.com/app/id${a.appStoreId}`, "");
  }
  lines.push("## Free tools", "", `* What holiday is it today: ${data.site.url}/holidays/ (verified daily observances, from the team behind CelebriDay)`, `* Hot tub chemical calculator: ${data.site.url}/hot-tub-calculator/ (exact doses in order for bromine or chlorine tubs, using the TubTender app's engine)`, "", "## Brands", "");
  for (const b of data.brands) lines.push(`* [${b.name}](${b.url}): ${b.answer}`);
  return lines.join("\n") + "\n";
}

const changed = [];
function write(file, text) {
  const prev = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
  if (prev === text) return;
  changed.push(path.relative(site, file));
  if (!check) fs.writeFileSync(file, text);
}

for (const app of data.apps) {
  lint(app);
  const file = path.join(site, "apps", `${app.slug}.html`);
  if (!fs.existsSync(file)) { problems.push(`${app.slug}: apps/${app.slug}.html is missing`); continue; }
  let html = fs.readFileSync(file, "utf8");
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${esc(app.title)}</title>`);
  html = setMeta(html, "name", "description", app.description);
  html = setMeta(html, "property", "og:title", app.title);
  html = setMeta(html, "property", "og:description", app.description);
  const pageFaq = visibleFaq(html);
  if (!pageFaq.length && app.faq.length) {
    const anchor = html.includes('<section id="support">') ? '  <section id="support">' : '  <section id="contact">';
    html = between(html, "faq", faqSection(app), anchor);
  }
  const faq = pageFaq.length ? pageFaq : app.faq;
  if (!faq.length) problems.push(`${app.slug}: no FAQ on the page or in products.json`);
  const outsideHead = html.replace(/<!-- ai:head -->[\s\S]*?<!-- \/ai:head -->/, "");
  const banner = outsideHead.includes('name="apple-itunes-app"') ? "" : `<meta name="apple-itunes-app" content="app-id=${app.appStoreId}">\n`;
  html = between(html, "head", banner + jsonLd(app, faq), "</head>");
  write(file, html);
}
// Every app page on the site must be tracked, so a new app cannot skip this.
const known = new Set(data.apps.map((a) => a.slug));
for (const f of fs.readdirSync(path.join(site, "apps"))) {
  const m = f.match(/^([a-z0-9]+)\.html$/);
  if (m && !known.has(m[1])) problems.push(`apps/${f} has no entry in tools/ai/products.json`);
}
write(path.join(site, "llms.txt"), llmsTxt());

for (const p of problems) console.error(`problem: ${p}`);
console.log(changed.length ? `${check ? "would change" : "changed"}: ${changed.join(", ")}` : "up to date");
if (problems.length || (check && changed.length)) process.exit(1);
