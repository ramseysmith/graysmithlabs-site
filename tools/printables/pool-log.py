#!/usr/bin/env python3
"""Makes assets/printables/pool-chemical-log-sheet.pdf (two landscape letter pages, black on white).
Run with HQ's python: "$(bash scripts/local/pyenv.sh)" tools/printables/pool-log.py
Ranges match guides.json (Pool chemical log sheet). Local health codes come first for public pools."""
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
cols = ["Date", "Time", "Free chlorine<i>1 to 4</i>", "Combined chlorine<i>under 0.5</i>", "pH<i>7.2 to 7.8</i>",
        "Alkalinity<i>80 to 120</i>", "Calcium<i>200 to 400</i>", "Stabilizer CYA<i>30 to 50</i>", "Water temp<i>&deg;F</i>",
        "Clarity<i>clear / cloudy</i>", "Added, and how much", "Initials"]
rows = "".join("<tr>" + "<td></td>" * len(cols) + "</tr>" for _ in range(20))
jobs = [("Every day the pool is open", 14, ["Test free chlorine and pH", "Skim the surface, empty skimmer baskets", "Check the pump is running and the water level"]),
        ("2 to 3 times a week", 12, ["Brush walls, steps and floor", "Check the filter pressure gauge"]),
        ("Every week", 4, ["Test total alkalinity", "Vacuum the floor", "Shock if combined chlorine is 0.5 or more"]),
        ("Every month", 1, ["Test calcium hardness and stabilizer (CYA)", "Clean or backwash the filter when pressure is 8 to 10 psi over clean"])]
box = "<span class=b></span>"
check = "".join(f"<h2>{w}</h2>" + "".join(f"<p class=job><span>{j}</span><span>{box * n}</span></p>" for j in js) for w, n, js in jobs)
html = f"""<meta charset=utf-8><title>Pool chemical log sheet</title><style>
@page{{size:letter landscape;margin:0.45in}} *{{box-sizing:border-box}} body{{font:10pt Helvetica,Arial,sans-serif;color:#111;margin:0}}
h1{{font-size:19pt;margin:0 0 4pt}} .fill{{display:flex;gap:16pt;margin:4pt 0 8pt}} .fill span{{flex:1;border-bottom:1px solid #333;padding-bottom:3pt}}
table{{width:100%;border-collapse:collapse;table-layout:fixed}} th,td{{border:1px solid #777}} th{{font-size:8.5pt;padding:4pt 2pt;background:#e8f1f8;vertical-align:top}}
th i{{display:block;font-weight:400;font-style:normal;font-size:7.5pt;margin-top:2pt}} td{{height:20pt}}
th:nth-child(1){{width:7%}} th:nth-child(2){{width:5.5%}} th:nth-child(11){{width:19%}} th:nth-child(12){{width:6%}}
.foot{{font-size:8pt;color:#333;margin-top:6pt}} .two{{break-before:page;columns:2;column-gap:28pt}} .two h1{{column-span:all}}
h2{{font-size:12pt;margin:12pt 0 4pt;border-bottom:1.5px solid #111;break-after:avoid}}
.job{{display:flex;justify-content:space-between;gap:8pt;margin:0;padding:5pt 0;border-bottom:1px solid #ccc;break-inside:avoid}} .job span:last-child{{white-space:nowrap}}
.b{{display:inline-block;width:12pt;height:12pt;border:1.2px solid #333;margin-left:4pt;border-radius:2pt}} ol{{margin:4pt 0;padding-left:16pt}} ol li{{margin:3pt 0}}</style>
<h1>Pool chemical log sheet</h1><div class=fill><span>Pool:</span><span>Gallons:</span><span>Sanitizer:</span><span>Month:</span></div>
<table><tr>{''.join(f'<th>{c}</th>' for c in cols)}</tr>{rows}</table>
<p class=foot>Chlorine, alkalinity, calcium and stabilizer are in ppm. Ranges are common targets for home pools. Public, HOA and commercial pools follow the ranges and log rules of the local health code. Follow the label of each chemical. Free to copy from graysmithlabs.com/guides/pool-chemical-log-sheet.html</p>
<div class=two><h1>Pool maintenance checklist</h1>{check}
<h2>When a reading is off</h2><ol><li>Fix alkalinity first, then pH, then chlorine.</li><li>Add one chemical at a time with the pump running. Never mix chemicals together.</li><li>Wait at least 4 hours, or the time on the label, then retest before adding more.</li><li>Keep swimmers out until free chlorine and pH are back in range.</li></ol>
<p class=foot>Hot tub too? The hot tub log sheet is free at graysmithlabs.com/guides/hot-tub-log-sheet.html</p></div>"""
out = ROOT / "assets/printables/pool-chemical-log-sheet.pdf"
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(); pg.set_content(html)
    pg.pdf(path=str(out), prefer_css_page_size=True, print_background=True); b.close()
print(out)
