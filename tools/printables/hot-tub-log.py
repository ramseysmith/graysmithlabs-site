#!/usr/bin/env python3
"""Makes assets/printables/hot-tub-log-sheet.pdf (two letter pages, black on white).
Run with HQ's python: "$(bash scripts/local/pyenv.sh)" tools/printables/hot-tub-log.py
Ranges are the ones in guides.json (How often to test hot tub water)."""
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
cols = ["Date", "Chlorine or bromine<i>3 to 10 / 4 to 8</i>", "pH<i>7.2 to 7.8</i>", "Alkalinity<i>80 to 120</i>",
        "Calcium<i>150 to 400</i>", "Water temp<i>&deg;F</i>", "Added, and how much", "Notes"]
rows = "".join("<tr>" + "<td></td>" * len(cols) + "</tr>" for _ in range(26))
jobs = [("2 to 3 times a week", ["Test chlorine or bromine", "Test pH", "Look: clear, no foam, no strong smell"]),
        ("Every week", ["Test total alkalinity", "Wipe the waterline and the pillows"]),
        ("Every 2 weeks", ["Rinse the filter, pleat by pleat"]),
        ("Every month", ["Test calcium hardness", "Wipe the cover inside and out"]),
        ("Every 3 to 4 months", ["Drain, clean and refill", "Rebalance, then test daily for a week"])]
def boxes(n, label): return "".join("<span class=b></span>" for _ in range(n))
count = {"2 to 3 times a week": 12, "Every week": 4, "Every 2 weeks": 2, "Every month": 1, "Every 3 to 4 months": 1}
check = "".join(f"<h2>{w}</h2>" + "".join(f"<p class=job><span>{j}</span><span>{boxes(count[w], j)}</span></p>" for j in js) for w, js in jobs)
html = f"""<meta charset=utf-8><title>Hot tub log sheet</title><style>
@page{{size:letter;margin:0.5in}} *{{box-sizing:border-box}} body{{font:10pt Helvetica,Arial,sans-serif;color:#111;margin:0}}
h1{{font-size:20pt;margin:0 0 4pt}} .fill{{display:flex;gap:16pt;margin:6pt 0 10pt}} .fill span{{flex:1;border-bottom:1px solid #333;padding-bottom:3pt}}
table{{width:100%;border-collapse:collapse;table-layout:fixed}} th,td{{border:1px solid #777}} th{{font-size:8.5pt;padding:4pt 2pt;background:#eef5f4;vertical-align:top}}
th i{{display:block;font-weight:400;font-style:normal;font-size:7.5pt;margin-top:2pt}} td{{height:21.5pt}} th:nth-child(1){{width:9%}} th:nth-child(7){{width:22%}} th:nth-child(8){{width:19%}}
.foot{{font-size:8pt;color:#333;margin-top:8pt}} .two{{break-before:page}} h2{{font-size:12pt;margin:16pt 0 4pt;border-bottom:1.5px solid #111}}
.job{{display:flex;justify-content:space-between;margin:0;padding:6pt 0;border-bottom:1px solid #ccc}} .b{{display:inline-block;width:13pt;height:13pt;border:1.2px solid #333;margin-left:5pt;border-radius:2pt}}
ol li{{margin:4pt 0}}</style>
<h1>Hot tub log sheet</h1><div class=fill><span>Dates:</span><span>Tub and gallons:</span><span>Sanitizer:</span><span>Last refill:</span></div>
<table><tr>{''.join(f'<th>{c}</th>' for c in cols)}</tr>{rows}</table>
<p class=foot>Sanitizer, alkalinity and calcium are in ppm. First sanitizer range is chlorine, second is bromine. Follow the label of each chemical. Free to copy from graysmithlabs.com/guides/hot-tub-log-sheet.html</p>
<div class=two><h1>Hot tub maintenance checklist</h1><div class=fill><span>Month:</span><span>Tub:</span></div>{check}
<h2>When a reading is off</h2><ol><li>Fix alkalinity first, then pH, then sanitizer.</li><li>Add one chemical at a time with the pump running. Never mix chemicals together.</li><li>Wait 20 minutes, then retest before adding more.</li><li>Stay out until sanitizer and pH are both in range.</li></ol>
<p class=foot>Amounts for your tub size: graysmithlabs.com/hot-tub-calculator</p></div>"""
out = ROOT / "assets/printables/hot-tub-log-sheet.pdf"
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(); pg.set_content(html)
    pg.pdf(path=str(out), prefer_css_page_size=True, print_background=True); b.close()
print(out)
