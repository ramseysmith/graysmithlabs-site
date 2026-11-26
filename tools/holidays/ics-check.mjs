#!/usr/bin/env node
// Checks holidays/calendar.ics against the RFC 5545 rules calendar apps enforce:
// CRLF line ends, lines at most 75 octets, balanced BEGIN and END, the required
// properties on the calendar and every event, valid all day dates, unique UIDs.
//   node tools/holidays/ics-check.mjs [file]     exits 1 on any problem
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const file = process.argv[2] ?? path.join(SITE, "holidays/calendar.ics");
const raw = fs.readFileSync(file, "utf8");
const bad = [];
if (!raw.endsWith("\r\n")) bad.push("file does not end with CRLF");
const physical = raw.split("\r\n").slice(0, -1);
physical.forEach((l, i) => {
  if (l.includes("\n") || l.includes("\r")) bad.push(`line ${i + 1}: bare LF or CR`);
  if (Buffer.byteLength(l) > 75) bad.push(`line ${i + 1}: ${Buffer.byteLength(l)} octets`);
});
const lines = [];
for (const l of physical) (l.startsWith(" ") || l.startsWith("\t")) && lines.length ? (lines[lines.length - 1] += l.slice(1)) : lines.push(l);
const stack = [], uids = new Set();
let ev = null, events = 0;
const need = { VCALENDAR: ["VERSION", "PRODID"], VEVENT: ["UID", "DTSTAMP", "DTSTART", "SUMMARY"] };
let seen = new Set(), calSeen = new Set();
lines.forEach((l, i) => {
  const m = l.match(/^([A-Z][A-Z0-9-]*)((?:;[^:]*)?):(.*)$/);
  if (!m) return bad.push(`line ${i + 1}: not NAME[;params]:value`);
  const [, name, , value] = m;
  if (name === "BEGIN") { stack.push(value); if (value === "VEVENT") { ev = {}; seen = new Set(); } return; }
  if (name === "END") {
    if (stack.pop() !== value) bad.push(`line ${i + 1}: END:${value} does not close its BEGIN`);
    if (value === "VEVENT") {
      events++;
      for (const p of need.VEVENT) if (!seen.has(p)) bad.push(`event ${events}: missing ${p}`);
      if (ev.DTEND && ev.DTEND <= ev.DTSTART) bad.push(`event ${events}: DTEND not after DTSTART`);
    }
    if (value === "VCALENDAR") for (const p of need.VCALENDAR) if (!calSeen.has(p)) bad.push(`calendar: missing ${p}`);
    return;
  }
  const top = stack[stack.length - 1];
  if (top === "VCALENDAR") calSeen.add(name);
  if (top !== "VEVENT") return;
  seen.add(name);
  if (name === "UID") { if (uids.has(value)) bad.push(`duplicate UID ${value}`); uids.add(value); }
  if (name === "DTSTART" || name === "DTEND") {
    if (!/^\d{8}$/.test(value)) return bad.push(`line ${i + 1}: ${name} ${value} is not a date`);
    const d = new Date(Date.UTC(+value.slice(0, 4), +value.slice(4, 6) - 1, +value.slice(6, 8)));
    if (d.toISOString().slice(0, 10).replace(/-/g, "") !== value) bad.push(`line ${i + 1}: ${name} ${value} is not a real day`);
    ev[name] = value;
  }
  if (/(^|[^\\])[,;]/.test(value) && ["SUMMARY", "DESCRIPTION"].includes(name)) bad.push(`line ${i + 1}: unescaped , or ; in ${name}`);
});
if (stack.length) bad.push(`unclosed ${stack.join(", ")}`);
if (!events) bad.push("no events");
for (const b of bad.slice(0, 20)) console.error(`FAIL ${b}`);
if (bad.length) process.exit(1);
console.log(`ok ${path.relative(SITE, file)}: ${events} events, ${uids.size} unique UIDs`);
