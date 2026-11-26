#!/usr/bin/env python3
"""Makes assets/printables/bill-of-sale-template.pdf (one letter page, black on white).
Run with HQ's python: "$(bash scripts/local/pyenv.sh)" tools/printables/bill-of-sale.py
A general template for a private sale; the page tells people to check their state's DMV form."""
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
def line(*labels): return "<div class=row>" + "".join(f"<span>{l}</span>" for l in labels) + "</div>"
box = "<span class=b></span>"
html = f"""<meta charset=utf-8><title>Bill of sale</title><style>
@page{{size:letter;margin:0.45in}} *{{box-sizing:border-box}} body{{font:10.5pt Helvetica,Arial,sans-serif;color:#111;margin:0}}
h1{{font-size:22pt;margin:0 0 2pt;text-align:center;letter-spacing:.5pt}} .sub{{text-align:center;font-size:9pt;margin:0 0 8pt;color:#333}}
h2{{font-size:11pt;margin:9pt 0 2pt;padding-bottom:2pt;border-bottom:1.5px solid #111;text-transform:uppercase;letter-spacing:.6pt}}
.row{{display:flex;gap:14pt;margin-top:9pt}} .row span{{flex:1;border-bottom:1px solid #333;padding-bottom:2pt;font-size:9pt}}
.kind{{display:flex;gap:18pt;margin-top:8pt;font-size:10pt}} .b{{display:inline-block;width:11pt;height:11pt;border:1.2px solid #333;margin-right:4pt;vertical-align:-2pt;border-radius:2pt}}
p{{margin:5pt 0;line-height:1.3}} .sig .row{{margin-top:18pt}} .foot{{font-size:7.5pt;color:#333;margin-top:12pt;border-top:1px solid #aaa;padding-top:4pt}}</style>
<h1>Bill of Sale</h1><p class=sub>For the private sale of a vehicle, trailer, boat or other personal property</p>
<h2>Seller</h2>{line("Full name", "Phone")}{line("Address, city, state, ZIP")}
<h2>Buyer</h2>{line("Full name", "Phone")}{line("Address, city, state, ZIP")}
<h2>What is being sold</h2><div class=kind><span>{box}Vehicle</span><span>{box}Trailer</span><span>{box}Boat</span><span>{box}Other</span></div>
{line("Year", "Make", "Model", "Color")}{line("VIN, hull ID or serial number", "Title number, if titled")}{line("Odometer reading (miles)", "Description of other property")}
<h2>Sale</h2>{line("Sale price $", "Date of sale", "Payment method")}
{line("Trade, gift or other terms, if any")}
<p>The seller sells the property above to the buyer for the price shown and states that the seller owns it, has the right to sell it, and that it is free of liens and claims except: ______________________________________________.</p>
<p>The property is sold <b>as is</b>, with no warranty from the seller, unless written here: _________________________________________________.</p>
<p>Odometer: to the best of the seller's knowledge the reading above is the actual mileage {box}, is over the mechanical limit {box}, or is not the actual mileage {box}.</p>
<div class=sig><h2>Signatures</h2>{line("Seller signature", "Printed name", "Date")}{line("Buyer signature", "Printed name", "Date")}</div>
<h2>Notary, only if your state asks for one</h2>{line("State of", "County of")}
<p>Signed and sworn before me on this date ______________ by the people named above.</p>{line("Notary signature", "Commission expires")}
<p class=foot>A general template, not legal advice. Many states publish their own bill of sale or require one on the title, an odometer statement or a notary: check your state's DMV or motor vehicle office before you use this form. Each party keeps a signed copy. Free to copy from graysmithlabs.com/guides/bill-of-sale-template.html</p>"""
out = ROOT / "assets/printables/bill-of-sale-template.pdf"
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(); pg.set_content(html)
    pg.pdf(path=str(out), prefer_css_page_size=True, print_background=True); b.close()
print(out)
