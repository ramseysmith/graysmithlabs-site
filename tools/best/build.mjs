// Builds the "best apps for" lists at /best/ from tools/best/best.json and tools/best/art/<slug>.svg.
// node tools/best/build.mjs            writes best/*.html and updates sitemap.xml
// node tools/best/build.mjs --check    exits 1 when a page is stale
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const site = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const BASE = 'https://graysmithlabs.com';
const data = JSON.parse(fs.readFileSync(path.join(site, 'tools/best/best.json'), 'utf8'));
const facts = JSON.parse(fs.readFileSync(path.join(site, 'tools/ai/products.json'), 'utf8'));
const check = process.argv.includes('--check');
// The lists carry their own stylesheet, stamped by content, so a cached styles.css never leaves them unstyled
const css = fs.readFileSync(path.join(site, 'tools/best/best.css'), 'utf8');
const cssStamp = (await import('node:crypto')).createHash('sha1').update(css).digest('hex').slice(0, 8);

// Header and footer come from an app page so these pages never drift from the site
const shell = fs.readFileSync(path.join(site, 'apps/signsnap.html'), 'utf8');
const header = shell
  .slice(shell.indexOf('<header class="site-head">'), shell.indexOf('</header>') + 9)
  .replace(' aria-current="page"', '');
const footer = shell.slice(shell.indexOf('<footer class="site-foot">'), shell.indexOf('</footer>') + 9);

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const html = (s) => String(s); // prose may carry a few trusted inline links from best.json
const strip = (s) => String(s).replace(/<[^>]+>/g, '');
const art = (slug, prefix) => fs.readFileSync(path.join(site, `tools/best/art/${slug}.svg`), 'utf8').trim().replaceAll('{{p}}', prefix);
const dateText = (d) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

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
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;1,9..144,400&family=Spline+Sans:wght@400;500;600&family=Spline+Sans+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../styles.css">
<link rel="stylesheet" href="best.css?v=${cssStamp}">
<script src="../main.js" defer></script>
${extra}</head>
<body>
<a class="skip" href="#main">Skip to content</a>
${header}
<main id="main">
`;
}

function listPage(l) {
  const app = facts.apps.find((a) => a.slug === l.app);
  if (!app) throw new Error(`${l.slug}: no facts for app ${l.app}`);
  if (!l.picks[0]?.ours) throw new Error(`${l.slug}: our app must be pick 1`);
  for (const [k, max] of [['title', 60], ['description', 155]]) {
    if (l[k].length > max) throw new Error(`${l.slug}: ${k} is ${l[k].length} characters, limit ${max}`);
  }
  const prose = JSON.stringify({ ...l, slug: "", app: "" }).replace(/href=\\"[^"]*\\"/g, '');
  if (/[–—]|[A-Za-z]-[A-Za-z]/.test(prose)) throw new Error(`${l.slug}: a dash in prose`);

  const url = `${BASE}/best/${l.slug}.html`;
  const appPage = fs.readFileSync(path.join(site, `apps/${app.slug}.html`), 'utf8');
  const stamp = (file) => appPage.match(new RegExp(`assets/apps/${app.slug}/${file.replace('.', '\\.')}(\\?v=[\\w.]+)`))?.[1] ?? '';
  const image = `${BASE}/assets/apps/${app.slug}/og.jpg${stamp('og.jpg')}`;
  const store = `https://apps.apple.com/us/app/id${app.appStoreId}?ct=best-${l.slug}&amp;mt=8`;
  const year = l.updated.slice(0, 4);

  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Article',
        '@id': `${url}#article`,
        headline: l.h1,
        description: strip(l.answer),
        url,
        image,
        dateModified: l.updated,
        author: { '@type': 'Organization', name: 'Graysmith Labs', url: `${BASE}/about.html` },
        publisher: { '@type': 'Organization', name: 'Graysmith Labs', url: BASE },
        about: { '@id': `${BASE}/apps/${app.slug}.html#app` },
      },
      {
        '@type': 'ItemList',
        '@id': `${url}#list`,
        name: l.h1,
        itemListOrder: 'https://schema.org/ItemListUnordered',
        numberOfItems: l.picks.length,
        itemListElement: l.picks.map((p, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          name: p.name,
          ...(p.ours ? { url: `${BASE}/apps/${app.slug}.html` } : {}),
        })),
      },
      {
        '@type': 'FAQPage',
        '@id': `${url}#faq`,
        mainEntity: l.faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: strip(a) } })),
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'App comparisons', item: `${BASE}/best/` },
          { '@type': 'ListItem', position: 2, name: l.h1, item: url },
        ],
      },
    ],
  };
  const extra = `<meta name="apple-itunes-app" content="app-id=${app.appStoreId}">\n<script type="application/ld+json">\n${JSON.stringify(ld, null, 2)}\n</script>\n`;

  const id = (p) => 'pick-' + p.name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replaceAll(' ', '_');
  const pick = (p) => `      <li class="bx-pick${p.ours ? ' ours' : ''}" id="${id(p)}">
        <p class="bx-badge">${esc(p.best)}${p.ours ? " &middot; our app" : ""}</p>
        <h3>${esc(p.name)}</h3>
        <p>${html(p.body)}</p>
        <ul class="guide-list">
${p.pros.map((x) => `          <li>${html(x)}</li>`).join('\n')}
        </ul>
        <p class="bx-con"><strong>Pick something else if:</strong> ${html(p.cons)}</p>
${p.ours ? `        <div class="btn-row">\n          <a class="btn" href="${store}" rel="noopener">Get ${esc(p.name)} on the App Store</a>\n          <a class="btn ghost" href="../apps/${app.slug}.html">About ${esc(p.name)}</a>\n        </div>\n` : ''}      </li>`;

  const others = data.lists.filter((o) => o.slug !== l.slug);
  return (
    head({ title: l.title, description: l.description, url, image, extra }) +
    `  <article class="wrap guide">
    <p class="crumbs"><a href="./">App comparisons</a> &nbsp;/&nbsp; ${esc(l.topic)}</p>
    <h1>${esc(l.h1)}</h1>
    <p class="guide-answer">${html(l.answer)}</p>
    <p class="guide-meta">Updated ${dateText(l.updated)} by <a href="../about.html">Graysmith Labs</a></p>
    <p class="bx-note"><strong>We make one of these.</strong> ${esc(app.name)} is our app, listed first so you know which it is. This is a comparison, not a ranking. Details on the others come from their App Store listings and reviews. <a href="../about.html#lists">How we choose apps</a>.</p>
    ${art(l.slug, 'bx')}
    <section class="guide-sec">
      <h2>What we looked for</h2>
      <ul class="guide-list">
${l.how.map((x) => `        <li>${html(x)}</li>`).join('\n')}
      </ul>
    </section>

    <section class="guide-sec">
      <h2>At a glance</h2>
      <div class="guide-table"><table>
        <thead><tr><th scope="col">App</th>${l.table.map((h) => `<th scope="col">${esc(h)}</th>`).join('')}</tr></thead>
        <tbody>
${l.picks.map((p) => `          <tr${p.ours ? ' class="ours"' : ''}><th scope="row"><a href="#${id(p)}">${esc(p.name)}</a></th>${(l.rows[p.name] ?? []).map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('\n')}
        </tbody>
      </table></div>
    </section>

    <section class="guide-sec">
      <h2>${l.picks.length} ways to do it, and who each suits</h2>
      <ol class="bx-picks">
${l.picks.map(pick).join('\n')}
      </ol>
    </section>

    <aside class="guide-app">
      <img src="../assets/apps/${app.slug}/icon.png${stamp('icon.png')}" alt="${esc(app.name)} app icon" width="64" height="64">
      <div>
        <h2>About ${esc(app.name)}, our app</h2>
        <p>${esc(app.answer)}</p>
        <p class="guide-note">${esc(app.pricing)}</p>
        <div class="btn-row">
          <a class="btn" href="${store}" rel="noopener">Download on the App Store</a>
          <a class="btn ghost" href="../apps/${app.slug}.html">About ${esc(app.name)}</a>
        </div>
      </div>
    </aside>

    <section class="guide-sec" id="faq">
      <h2>Questions</h2>
      <div class="faq-list">
${l.faq.map(([q, a]) => `        <details>\n          <summary>${esc(q)}</summary>\n          <p>${html(a)}</p>\n        </details>`).join('\n')}
      </div>
    </section>

    <section class="guide-sec">
      <h2>More comparisons</h2>
      <ul class="guide-list">
${others.map((o) => `        <li><a href="${o.slug}.html">${esc(o.h1)}</a></li>`).join('\n')}
      </ul>
    </section>
  </article>
</main>
${footer}
</body>
</html>
`
  );
}

function indexPage() {
  const url = `${BASE}/best/`;
  const title = 'iPhone App Comparisons by Graysmith Labs';
  const description = 'Comparisons of iPhone apps for white noise, national days, signing PDFs, reflexes, affirmations, hot tub care and invoices, updated for 2026.';
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'App comparisons',
    url,
    hasPart: data.lists.map((l) => ({ '@type': 'Article', headline: l.h1, url: `${BASE}/best/${l.slug}.html` })),
  };
  return (
    head({ title, description, url, image: `${BASE}/assets/og.jpg`, extra: `<script type="application/ld+json">\n${JSON.stringify(ld, null, 2)}\n</script>\n` }) +
    `  <div class="wrap guide">
    <h1>App comparisons</h1>
    <p class="guide-answer">Short comparisons of iPhone apps for everyday jobs. We make one app in each and say so at the top; every entry tells you when another app suits you better.</p>
    <ul class="bx-index">
${data.lists.map((l, i) => `      <li><a href="${l.slug}.html">${art(l.slug, `bx${i}`)}<b>${esc(l.h1)}</b><span>${esc(l.description)}</span></a></li>`).join('\n')}
    </ul>
  </div>
</main>
${footer}
</body>
</html>
`
  );
}

const pages = new Map([['best/index.html', indexPage()], ['best/best.css', css]]);
for (const l of data.lists) pages.set(`best/${l.slug}.html`, listPage(l));

// Sitemap: one line per list, kept between markers
const sitemapPath = path.join(site, 'sitemap.xml');
let sitemap = fs.readFileSync(sitemapPath, 'utf8');
const block =
  '  <!-- best -->\n' +
  [`${BASE}/best/`, ...data.lists.map((l) => `${BASE}/best/${l.slug}.html`)].map((u) => `  <url><loc>${u}</loc></url>`).join('\n') +
  '\n  <!-- /best -->\n';
sitemap = sitemap.includes('<!-- best -->')
  ? sitemap.replace(/  <!-- best -->[\s\S]*?<!-- \/best -->\n/, block)
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
