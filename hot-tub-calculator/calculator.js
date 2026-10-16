// Hot tub chemical calculator. Every amount comes from TubEngine (engine.js),
// TubTender's own chemistry engine; this file only collects inputs and shows
// the plan. Strip values match the app's test screen.
(() => {
  const E = window.TubEngine;
  const $ = (id) => document.getElementById(id);
  const form = $('htc-form');
  const out = $('htc-result');
  if (!E || !form) return;

  const STRIP = {
    chlorine: [0, 0.5, 1, 3, 5, 10],
    bromine: [0, 1, 2, 4, 6, 10, 20],
    ph: [6.2, 6.8, 7.2, 7.5, 7.8, 8.4],
    ta: [0, 40, 80, 120, 180, 240],
    ch: [0, 100, 250, 500, 1000],
    cya: [0, 30, 50, 100, 150, 300],
  };
  const ROLES = ['sanitizer', 'phDown', 'phUp', 'alkalinityUp', 'calciumUp'];
  const fmt = (v) => (Number.isInteger(v) ? String(v) : v.toFixed(1));
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  function fill(select, values, preferred) {
    select.innerHTML = '<option value="">Skip</option>' +
      values.map((v) => `<option value="${v}"${v === preferred ? ' selected' : ''}>${fmt(v)}</option>`).join('');
  }
  const sanitizer = () => form.querySelector('input[name="htc-san"]:checked').value;

  function syncSanitizer() {
    const s = sanitizer();
    $('htc-san-label').textContent = s === 'chlorine' ? 'Free chlorine (ppm)' : 'Total bromine (ppm)';
    fill($('htc-sanitizer'), STRIP[s]);
    $('htc-cya-wrap').hidden = s !== 'chlorine';
    renderProducts();
  }

  function renderProducts() {
    const box = $('htc-products');
    const keep = {};
    box.querySelectorAll('[data-role]').forEach((el) => { keep[el.dataset.role] = { kind: el.querySelector('select').value, pct: el.querySelector('input').value }; });
    box.innerHTML = ROLES.map((role) => {
      const kinds = E.ROLE_KINDS[role];
      const kind = keep[role] && kinds.includes(keep[role].kind) ? keep[role].kind : kinds[0];
      const pct = keep[role] && keep[role].kind === kind ? keep[role].pct : E.DEFAULT_PRODUCTS[kind].strengthPct;
      return `<div class="htc-field htc-product" data-role="${role}">
        <span>${esc(E.roleLabel(role, sanitizer()))}</span>
        <select aria-label="${esc(E.roleLabel(role, sanitizer()))} product">${kinds.map((k) => `<option value="${k}"${k === kind ? ' selected' : ''}>${esc(E.DEFAULT_PRODUCTS[k].name)}</option>`).join('')}</select>
        <label class="htc-pct"><input type="number" min="1" max="100" step="0.1" value="${pct}" inputmode="decimal" aria-label="Strength in percent"> % on the label</label>
      </div>`;
    }).join('');
    box.querySelectorAll('select').forEach((sel) => sel.addEventListener('change', (e) => {
      const row = e.target.closest('[data-role]');
      row.querySelector('input').value = E.DEFAULT_PRODUCTS[e.target.value].strengthPct;
    }));
  }

  function shelf() {
    const s = {};
    $('htc-products').querySelectorAll('[data-role]').forEach((el) => {
      const kind = el.querySelector('select').value;
      const pct = Number(el.querySelector('input').value);
      const base = E.DEFAULT_PRODUCTS[kind];
      s[el.dataset.role] = Object.assign({}, base, { strengthPct: pct > 0 && pct <= 100 ? pct : base.strengthPct });
    });
    return s;
  }

  function num(id) {
    const v = $(id).value;
    return v === '' ? undefined : Number(v);
  }

  function render(e) {
    if (e) e.preventDefault();
    const gallons = Number($('htc-gallons').value);
    if (!Number.isFinite(gallons) || gallons < 50 || gallons > 3000) {
      out.hidden = false;
      out.innerHTML = '<p class="htc-error">Enter a size between 50 and 3,000 gallons.</p>';
      $('htc-gallons').focus();
      return;
    }
    const s = sanitizer();
    const reading = {
      sanitizerPpm: num('htc-sanitizer'),
      ph: num('htc-ph'),
      taPpm: num('htc-ta'),
      chPpm: num('htc-ch'),
      cyaPpm: s === 'chlorine' ? num('htc-cya') : undefined,
      tempF: num('htc-temp'),
    };
    const tub = { id: 'web', name: 'Hot tub', gallons: Math.round(gallons), sanitizer: s, avgDailyBathers: 2, createdAt: new Date().toISOString() };
    const now = E.waterStatus(reading, s);
    const plan = E.buildDosePlan(tub, reading, shelf());

    let html = `<div class="htc-status htc-${now.level}"><b>Right now: ${esc(now.headline)}</b>`;
    if (now.issues.length) html += `<ul>${now.issues.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`;
    if (now.level === 'unknown') html += '<p>Add a sanitizer and a pH reading for a verdict.</p>';
    html += '</div>';

    if (plan.allGood) {
      html += '<p class="htc-good">Nothing to add. Your readings are in range.</p>';
    } else {
      html += `<h2>Your plan for ${tub.gallons} gallons</h2><ol class="htc-steps">`;
      plan.steps.forEach((st) => {
        if (st.kind === 'dose') {
          html += `<li><div class="htc-step-head"><b>${esc(st.title)}</b><span class="htc-amount">${esc(st.amount.primary)}</span></div>
            <p class="htc-product-name">${esc(st.productName)}${st.amount.hint ? ` &middot; ${esc(st.amount.hint)}` : ''}</p>
            <p>${esc(st.why)}</p>
            ${st.splitInHalf ? '<p class="htc-tip">Add it in two halves, retesting between them.</p>' : ''}
            <p class="htc-wait">Then run the jets and wait ${st.waitMinutes} minutes.</p></li>`;
        } else {
          html += `<li><div class="htc-step-head"><b>${esc(st.title)}</b></div><p>${esc(st.why)}</p></li>`;
        }
      });
      html += '</ol>';
      if (plan.soakAfterMinutes !== null && plan.steps.some((st) => st.kind === 'dose')) {
        html += `<p class="htc-good">Safe to soak about ${plan.soakAfterMinutes} minutes after the last step, once a retest agrees.</p>`;
      }
    }
    if (plan.notes.length) html += `<ul class="guide-list htc-notes">${plan.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>`;
    html += '<p class="guide-note">Amounts are calculated from your readings and the product strengths above. Measure with a kitchen scale or measuring cup, never more than the label allows. Follow the label on your product.</p>';
    out.innerHTML = html;
    out.hidden = false;
    out.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  form.querySelectorAll('input[name="htc-san"]').forEach((r) => r.addEventListener('change', syncSanitizer));
  fill($('htc-ph'), STRIP.ph);
  fill($('htc-ta'), STRIP.ta);
  fill($('htc-ch'), STRIP.ch);
  fill($('htc-cya'), STRIP.cya);
  syncSanitizer();
  form.addEventListener('submit', render);
})();
