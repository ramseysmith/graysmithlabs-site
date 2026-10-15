# AI visibility kit

Makes every product easy for AI assistants (ChatGPT, Claude, Grok, Perplexity,
Google AI Overviews) and search engines to describe and recommend.

* `products.json`: the facts. One entry per app in HQ portfolio.json. Only what
  the product really does today; no invented ratings or user counts.
* `build.mjs`: writes `/llms.txt` and, on each `apps/<slug>.html`, the title,
  description, Smart App Banner, JSON LD (MobileApplication plus FAQPage) and a
  visible FAQ when the page has none of its own.

Run `node tools/ai/build.mjs --site .` after editing products.json, and
`--check` to confirm nothing is stale. The HQ `ai-visibility` skill owns the
process, including new apps.
