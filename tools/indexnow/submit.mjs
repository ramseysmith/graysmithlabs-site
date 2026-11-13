// Tells Bing, Yandex, Seznam and Naver (and through Bing, ChatGPT search and
// Copilot) about new and changed pages right away, with IndexNow.
//
//   node tools/indexnow/submit.mjs --all             every URL in sitemap.xml
//   node tools/indexnow/submit.mjs <file.html> ...   just those pages
//
// The key file /d2139afdf0909c92ab8434502870f181.txt at the site root proves the site is ours.
import fs from "node:fs";

const HOST = "graysmithlabs.com";
const KEY = "d2139afdf0909c92ab8434502870f181";
const args = process.argv.slice(2);

function toUrl(file) {
  const f = file.replace(/^\.\//, "");
  if (!f.endsWith(".html") || f === "404.html") return null;
  // Pages marked noindex (the friends page, shared by link only) are never announced.
  try { if (/<meta name="robots" content="noindex/i.test(fs.readFileSync(f, "utf8"))) return null; } catch {}
  return `https://${HOST}/${f.replace(/(^|\/)index\.html$/, "$1")}`;
}

let urls = args.includes("--all")
  ? [...fs.readFileSync("sitemap.xml", "utf8").matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])
  : args.map(toUrl).filter(Boolean);
urls = [...new Set(urls)];
if (!urls.length) {
  console.log("nothing to submit");
  process.exit(0);
}
for (let i = 0; i < urls.length; i += 10000) {
  const res = await fetch("https://api.indexnow.org/indexnow", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ host: HOST, key: KEY, keyLocation: `https://${HOST}/${KEY}.txt`, urlList: urls.slice(i, i + 10000) }),
  });
  console.log(`IndexNow: ${urls.slice(i, i + 10000).length} URLs, HTTP ${res.status}`);
  // 403 means the key file has not been checked yet; a new key can take a day
  // to verify, and the next publish sends again. Anything else is a real error.
  if (res.status === 403) console.log("key not verified yet; the next publish retries");
  else if (res.status >= 400 && res.status !== 429) process.exit(1);
}
