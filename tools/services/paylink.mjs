#!/usr/bin/env node
// Puts the Stripe payment link for the $499 app audit beside the audit form on
// /services/, so a visitor can pay in two taps (Pay, then Stripe checkout).
//
//   node tools/services/paylink.mjs https://buy.stripe.com/XXXX    place or replace the link
//   node tools/services/paylink.mjs --remove                       take it off again
//
// Set the payment link's confirmation page in Stripe to
// https://graysmithlabs.com/services/?sent=audit#audit-request so buyers land on the thank you panel.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const file = path.join(SITE, "services/index.html");
const arg = process.argv[2];
const remove = arg === "--remove";
if (!remove && !/^https:\/\/buy\.stripe\.com\/[A-Za-z0-9_]+$/.test(arg ?? "")) {
  console.error("usage: node tools/services/paylink.mjs https://buy.stripe.com/<id> | --remove");
  process.exit(1);
}
const pay = remove ? "" : `          <p class="btn-row" style="margin-top:18px"><a class="btn ghost" href="${arg}" rel="noopener">Pay $499 now <span class="arrow" aria-hidden="true">&rarr;</span></a></p>
          <p class="muted" style="max-width:40ch">Secure checkout by Stripe. Rather talk first? Send the form and pay after our reply.</p>
`;
const paySent = remove ? "" : `          <p>Ready to start now? <a class="link" href="${arg}" rel="noopener">Pay the $499 audit securely with Stripe</a>.</p>
`;
let html = fs.readFileSync(file, "utf8");
const put = (name, block) => {
  const re = new RegExp(`(<!-- ${name}:start[^>]*-->\\n)[\\s\\S]*?(<!-- ${name}:end -->)`);
  if (!re.test(html)) throw new Error(`marker ${name} missing in services/index.html`);
  html = html.replace(re, (_, a, z) => a + block + z);
};
put("pay", pay);
put("paysent", paySent);
fs.writeFileSync(file, html);
console.log(remove ? "audit payment link removed" : `audit payment link placed: ${arg}`);
