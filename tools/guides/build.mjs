// Builds the how to guides at /guides/ from tools/guides/guides.json.
// node tools/guides/build.mjs            writes guides/*.html and updates sitemap.xml
// node tools/guides/build.mjs --check    exits 1 when a page is stale
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const site = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const BASE = 'https://graysmithlabs.com';
const data = JSON.parse(fs.readFileSync(path.join(site, 'tools/guides/guides.json'), 'utf8'));
const facts = JSON.parse(fs.readFileSync(path.join(site, 'tools/ai/products.json'), 'utf8'));
const check = process.argv.includes('--check');

// Header and footer come from an app page so the guides never drift from the site
const shell = fs.readFileSync(path.join(site, 'apps/signsnap.html'), 'utf8');
const header = shell
  .slice(shell.indexOf('<header class="site-head">'), shell.indexOf('</header>') + 9)
  .replace(' aria-current="page"', '');
const footer = shell.slice(shell.indexOf('<footer class="site-foot">'), shell.indexOf('</footer>') + 9);

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// Prose may carry a few trusted inline links from guides.json
const html = (s) => String(s);
const strip = (s) => String(s).replace(/<[^>]+>/g, '');

function head({ title, description, url, image, extra = '' }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${url}">
<meta name="theme-color" content="#f4f1ea" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#131513" media="(prefers-color-scheme: dark)">
<meta property="og:type" content="article">
<meta property="og:site_name" content="Graysmith Labs">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${image}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:site" content="@GraysmithLabs">
<meta name="twitter:image" content="${image}">
<link rel="icon" href="../favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;1,9..144,400&family=Spline+Sans+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../styles.css">
<script src="../main.js" defer></script>
${extra}</head>
<body>
<a class="skip" href="#main">Skip to content</a>
${header}
<main id="main">
`;
}

function section(s) {
  let out = `    <section class="guide-sec">\n      <h2>${esc(s.h2)}</h2>\n`;
  if (s.intro) out += `      <p>${html(s.intro)}</p>\n`;
  for (const p of s.paras ?? []) out += `      <p>${html(p)}</p>\n`;
  if (s.steps) out += `      <ol class="guide-steps">\n${s.steps.map((x) => `        <li>${html(x)}</li>`).join('\n')}\n      </ol>\n`;
  if (s.list) out += `      <ul class="guide-list">\n${s.list.map((x) => `        <li>${html(x)}</li>`).join('\n')}\n      </ul>\n`;
  if (s.table) {
    out += `      <div class="guide-table"><table>\n        <thead><tr>${s.table.head.map((h) => `<th scope="col">${esc(h)}</th>`).join('')}</tr></thead>\n        <tbody>\n`;
    out += s.table.rows.map((r) => `          <tr><th scope="row">${esc(r[0])}</th>${r.slice(1).map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('\n');
    out += `\n        </tbody>\n      </table></div>\n`;
  }
  if (s.note) out += `      <p class="guide-note">${html(s.note)}</p>\n`;
  if (s.after) out += `      <p>${html(s.after)}</p>\n`;
  return out + `    </section>\n`;
}

function guidePage(g) {
  const app = facts.apps.find((a) => a.slug === g.app);
  if (!app) throw new Error(`${g.slug}: no facts for app ${g.app}`);
  const url = `${BASE}/guides/${g.slug}.html`;
  // Keep the cache stamp the app page uses for its own art (set by tools/app-assets/build.py)
  const appPage = fs.readFileSync(path.join(site, `apps/${app.slug}.html`), 'utf8');
  const stamp = (file) => appPage.match(new RegExp(`assets/apps/${app.slug}/${file.replace('.', '\\.')}(\\?v=[\\w.]+)`))?.[1] ?? '';
  const image = `${BASE}/assets/apps/${app.slug}/og.jpg${stamp('og.jpg')}`;
  const store = `https://apps.apple.com/us/app/id${app.appStoreId}`;
  for (const [k, max] of [['title', 60], ['description', 155]]) {
    if (g[k].length > max) throw new Error(`${g.slug}: ${k} is ${g[k].length} characters, limit ${max}`);
  }
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Article',
        '@id': `${url}#article`,
        headline: g.h1,
        description: strip(g.answer),
        url,
        image,
        dateModified: g.updated,
        author: { '@type': 'Organization', name: 'Graysmith Labs', url: BASE },
        publisher: { '@type': 'Organization', name: 'Graysmith Labs', url: BASE },
        about: { '@id': `${BASE}/apps/${app.slug}.html#app` },
      },
      {
        '@type': 'FAQPage',
        '@id': `${url}#faq`,
        mainEntity: g.faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: strip(a) } })),
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Guides', item: `${BASE}/guides/` },
          { '@type': 'ListItem', position: 2, name: g.h1, item: url },
        ],
      },
    ],
  };
  // A guide for an app still in App Review sets cta, so it never offers a download that does not exist yet
  const banner = g.cta ? '' : `<meta name="apple-itunes-app" content="app-id=${app.appStoreId}">\n`;
  const extra = `${banner}<script type="application/ld+json">\n${JSON.stringify(ld, null, 2)}\n</script>\n`;
  const others = data.guides.filter((o) => o.slug !== g.slug && o.app === g.app);
  return (
    head({ title: g.title, description: g.description, url, image, extra }) +
    `  <article class="wrap guide">
    <p class="crumbs"><a href="./">Guides</a> &nbsp;/&nbsp; ${esc(app.name)}</p>
    <h1>${esc(g.h1)}</h1>
    <p class="guide-answer">${html(g.answer)}</p>
    <p class="guide-meta">Updated ${new Date(g.updated + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })} by Graysmith Labs</p>
${g.sections.map(section).join('')}
    <aside class="guide-app">
      <img src="../assets/apps/${app.slug}/icon.png${stamp('icon.png')}" alt="${esc(app.name)} app icon" width="64" height="64">
      <div>
        <h2>${esc(app.name)}</h2>
        <p>${esc(app.answer)}</p>
        <p class="guide-note">${esc(app.pricing)}</p>
        <div class="btn-row">
          ${g.cta ? `<a class="btn" href="${g.cta.href}">${esc(g.cta.label)}</a>` : `<a class="btn" href="${store}" rel="noopener">Download on the App Store</a>`}
          <a class="btn ghost" href="../apps/${app.slug}.html">About ${esc(app.name)}</a>
        </div>
      </div>
    </aside>

    <section class="guide-sec" id="faq">
      <h2>Questions</h2>
      <div class="faq-list">
${g.faq.map(([q, a]) => `        <details>\n          <summary>${esc(q)}</summary>\n          <p>${html(a)}</p>\n        </details>`).join('\n')}
      </div>
    </section>
${others.length ? `\n    <section class="guide-sec">\n      <h2>More guides</h2>\n      <ul class="guide-list">\n${others.map((o) => `        <li><a href="${o.slug}.html">${esc(o.h1)}</a></li>`).join('\n')}\n      </ul>\n    </section>\n` : ''}  </article>
</main>
${footer}
</body>
</html>
`
  );
}

function indexPage() {
  const url = `${BASE}/guides/`;
  const title = 'Guides: Phone How Tos from Graysmith Labs';
  const description = 'Short, tested how to guides for everyday tasks on iPhone, from signing a PDF to filling in a lease, by the team behind SignSnap and Drift.';
  return (
    head({ title, description, url, image: `${BASE}/assets/og.png` }) +
    `  <div class="wrap guide">
    <h1>Guides</h1>
    <p class="guide-answer">Short how to guides for everyday tasks on your phone. Each one shows the free built in way first, then where one of our apps saves time.</p>
    <ul class="guide-index">
${data.guides.map((g) => `      <li><a href="${g.slug}.html"><b>${esc(g.h1)}</b><span>${esc(g.description)}</span></a></li>`).join('\n')}
    </ul>
  </div>
</main>
${footer}
</body>
</html>
`
  );
}

const pages = new Map([['guides/index.html', indexPage()]]);
for (const g of data.guides) pages.set(`guides/${g.slug}.html`, guidePage(g));

// Sitemap: one line per guide, kept between markers
const sitemapPath = path.join(site, 'sitemap.xml');
let sitemap = fs.readFileSync(sitemapPath, 'utf8');
const block =
  '  <!-- guides -->\n' +
  [`${BASE}/guides/`, ...data.guides.map((g) => `${BASE}/guides/${g.slug}.html`)].map((u) => `  <url><loc>${u}</loc></url>`).join('\n') +
  '\n  <!-- /guides -->\n';
sitemap = sitemap.includes('<!-- guides -->')
  ? sitemap.replace(/  <!-- guides -->[\s\S]*?<!-- \/guides -->\n/, block)
  : sitemap.replace('</urlset>', block + '</urlset>');
pages.set('sitemap.xml', sitemap);

let stale = 0;
for (const [rel, content] of pages) {
  const file = path.join(site, rel);
  const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  if (current === content) continue;
  stale++;
  if (check) console.log(`stale: ${rel}`);
  else {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
    console.log(`wrote ${rel}`);
  }
}
if (check && stale) process.exit(1);
