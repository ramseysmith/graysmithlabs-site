#!/usr/bin/env python3
"""Makes assets/printables/<slug>-invoice-estimate-blank.pdf for every trade in
tools/invoice/trades.json: page 1 a blank invoice, page 2 a blank estimate, both
letter size, black on white, with that trade's usual lines ("blank" in trades.json) printed so a
tradesperson only fills in quantities, prices and names by hand.
Run with HQ's python after any change to trades.json, then node tools/invoice/build.mjs:
  "$(bash ../graysmith_labs_agent/scripts/local/pyenv.sh)" tools/printables/trade-blanks.py"""
import json, html
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
trades = json.loads((ROOT / "tools/invoice/trades.json").read_text())
OUT = ROOT / "assets/printables"
OUT.mkdir(parents=True, exist_ok=True)

def page(kind, t, cls=""):
    is_inv = kind == "Invoice"
    rows = "".join(f"<tr><td>{html.escape(d)}</td><td></td><td></td><td></td></tr>" for d in t["blank"])
    rows += "<tr><td></td><td></td><td></td><td></td></tr>" * (12 - len(t["blank"]))
    meta = (["Invoice no.", "Date", "Due date"] if is_inv else ["Estimate no.", "Date", "Valid until"])
    terms = ("Payment due by the due date. Pay by: ____________________________" if is_inv
             else "This estimate is for the work listed above at the prices shown. Work outside it is quoted first.")
    sign = ("" if is_inv else "<div class=sign><span>Accepted by (client signature)</span><span>Date</span></div>")
    title = f"{t['trade'].capitalize()} {kind.lower()}"
    return f"""<section class="{cls}"><div class=top><div><h1>{kind.upper()}</h1><p class=sub>{html.escape(title)}</p></div>
<div class=meta>{''.join(f'<p><b>{m}</b><span></span></p>' for m in meta)}</div></div>
<div class=parties><div><b>From</b><span></span><span></span><span></span></div><div><b>{'Bill to' if is_inv else 'Prepared for'}</b><span></span><span></span><span></span></div></div>
<p class=job><b>Job or address</b><span></span></p>
<table><tr><th>Description</th><th>Qty or hours</th><th>Rate</th><th>Amount</th></tr>{rows}</table>
<div class=tot>{''.join(f'<p><b>{k}</b><span></span></p>' for k in ['Subtotal', 'Tax', 'Deposit paid' if is_inv else 'Deposit to start', 'Total' if not is_inv else 'Balance due'])}</div>
<p class=terms>{terms}</p>{sign}
<p class=foot>Free blank from graysmithlabs.com/invoice-generator/{t['slug']}/ &middot; fill it in online and download a PDF there, or send it from your phone with Tallyhand.</p></section>"""

CSS = """@page{size:letter;margin:0.55in} *{box-sizing:border-box} body{font:10.5pt Helvetica,Arial,sans-serif;color:#111;margin:0}
section+section{break-before:page} .top{display:flex;justify-content:space-between;align-items:flex-start}
h1{font-size:26pt;letter-spacing:2pt;margin:0} .sub{margin:2pt 0 0;color:#444;font-size:11pt}
.meta p,.tot p,.job{display:flex;gap:8pt;margin:0 0 7pt;align-items:flex-end} .meta b,.tot b{width:78pt;font-size:9.5pt}
.meta span,.tot span,.job span,.parties span,.sign span{flex:1;border-bottom:1px solid #333;min-height:14pt;display:block}
.meta{width:230pt} .parties{display:flex;gap:28pt;margin:18pt 0 12pt} .parties div{flex:1;display:flex;flex-direction:column;gap:9pt}
.parties b,.job b{font-size:9.5pt} .job b{width:80pt}
table{width:100%;border-collapse:collapse;table-layout:fixed;margin-top:12pt} th,td{border:1px solid #777;padding:3pt 5pt}
th{background:#eef3ef;font-size:9pt;text-align:left} td{height:22pt} th:nth-child(1){width:52%}
.tot{width:230pt;margin:12pt 0 0 auto} .tot p:last-child b{font-size:11pt}
.terms{margin:16pt 0 0;font-size:9.5pt} .sign{display:flex;gap:28pt;margin-top:30pt} .sign span{padding-top:16pt;font-size:8.5pt;color:#444}
.sign span:first-child{flex:2} .foot{font-size:8pt;color:#444;margin-top:18pt}"""

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page()
    for t in trades:
        doc = f"<meta charset=utf-8><title>Blank {html.escape(t['trade'])} invoice and estimate</title><style>{CSS}</style>{page('Invoice', t)}{page('Estimate', t)}"
        pg.set_content(doc)
        out = OUT / f"{t['slug']}-invoice-estimate-blank.pdf"
        pg.pdf(path=str(out), prefer_css_page_size=True, print_background=True)
        print(out.relative_to(ROOT))
    b.close()
