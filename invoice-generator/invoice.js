// Free invoice generator. Everything stays in this browser: the form is saved to
// localStorage so a refresh keeps the invoice, and "Download PDF" uses the browser's
// own print to PDF with a print stylesheet that shows only the invoice.
// Money math matches the Tallyhand app engine: integer cents, quantities to two
// decimals, each line rounded to the cent, tax on the rounded subtotal.
(function () {
  var KEY = 'gl-invoice-v1';
  var form = document.getElementById('ig-form');
  var itemsBox = document.getElementById('ig-items');
  var sheet = document.getElementById('ig-sheet');
  var msg = document.getElementById('ig-msg');
  if (!form || !sheet) return;

  function today(offset) {
    var d = new Date();
    d.setDate(d.getDate() + (offset || 0));
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + m + '-' + day;
  }

  var blank = {
    biz: '', from: '', client: '', to: '', number: 'INV-0001', currency: 'USD',
    date: today(0), due: today(14), tax: '', pay: '', notes: '',
    items: [{ d: '', q: '1', r: '' }]
  };

  function load() {
    try {
      var s = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (s && Array.isArray(s.items)) return s;
    } catch (e) {}
    return JSON.parse(JSON.stringify(blank));
  }
  function save(state) {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
  }

  function cents(text) {
    var c = String(text || '').replace(/[^0-9.,]/g, '');
    if (!/[0-9]/.test(c)) return 0;
    if (/,\d{2}$/.test(c) && c.indexOf('.') < 0) c = c.replace(/\./g, '').replace(',', '.');
    else c = c.replace(/,/g, '');
    var v = Number(c);
    return isFinite(v) ? Math.round(v * 100) : 0;
  }
  function qty(text) {
    var v = Number(String(text || '').replace(',', '.'));
    return isFinite(v) && v > 0 ? Math.round(v * 100) / 100 : 0;
  }
  function lineTotal(q, r) { return Math.round((Math.round(q * 100) * r) / 100); }
  function money(c, cur) {
    try { return new Intl.NumberFormat('en-US', { style: 'currency', currency: cur }).format(c / 100); }
    catch (e) { return (c / 100).toFixed(2) + ' ' + cur; }
  }
  function esc(s) {
    return String(s || '').replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function fmtDate(iso) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) return '';
    var p = iso.split('-');
    return MONTHS[Number(p[1]) - 1] + ' ' + Number(p[2]) + ', ' + p[0];
  }

  var state = load();

  function renderItems() {
    itemsBox.querySelectorAll('.ig-item').forEach(function (el) { el.remove(); });
    state.items.forEach(function (it, i) {
      var row = document.createElement('div');
      row.className = 'ig-item';
      row.innerHTML =
        '<label>Description <input data-i="' + i + '" data-k="d" value="' + esc(it.d) + '" placeholder="Mowed lawn"></label>' +
        '<label>Qty <input data-i="' + i + '" data-k="q" value="' + esc(it.q) + '" inputmode="decimal"></label>' +
        '<label>Rate <input data-i="' + i + '" data-k="r" value="' + esc(it.r) + '" inputmode="decimal" placeholder="40.00"></label>' +
        '<button type="button" data-remove="' + i + '" aria-label="Remove item ' + (i + 1) + '">&times;</button>';
      itemsBox.appendChild(row);
    });
  }

  function fill() {
    ['biz', 'from', 'client', 'to', 'number', 'currency', 'date', 'due', 'tax', 'pay', 'notes'].forEach(function (k) {
      if (form.elements[k]) form.elements[k].value = state[k] || '';
    });
    renderItems();
  }

  function preview() {
    var cur = state.currency || 'USD';
    var rows = '';
    var subtotal = 0;
    state.items.forEach(function (it) {
      var q = qty(it.q), r = cents(it.r);
      if (!it.d && !r) return;
      var t = lineTotal(q || 1, r);
      subtotal += t;
      rows += '<tr><td>' + esc(it.d || 'Item') + '</td><td class="n">' + (q || 1) + '</td><td class="n">' + money(r, cur) +
        '</td><td class="n">' + money(t, cur) + '</td></tr>';
    });
    var rate = Number(String(state.tax || '').replace(',', '.'));
    rate = isFinite(rate) && rate > 0 ? Math.min(rate, 50) : 0;
    var tax = rate ? Math.round((subtotal * rate) / 100) : 0;
    var totals = '';
    if (tax) totals += '<tr><td>Subtotal</td><td>' + money(subtotal, cur) + '</td></tr><tr><td>Tax (' + rate + '%)</td><td>' + money(tax, cur) + '</td></tr>';
    totals += '<tr class="g"><td>Amount due</td><td>' + money(subtotal + tax, cur) + '</td></tr>';
    sheet.innerHTML =
      '<div class="inv-top"><div><p class="inv-biz">' + esc(state.biz || 'Your business') + '</p><div class="inv-muted">' + esc(state.from) + '</div></div>' +
      '<div class="inv-title"><h2>Invoice</h2><table class="inv-meta">' +
      '<tr><td>Invoice number</td><td>' + esc(state.number) + '</td></tr>' +
      (state.date ? '<tr><td>Date</td><td>' + fmtDate(state.date) + '</td></tr>' : '') +
      '<tr><td>Due</td><td>' + (state.due && state.due !== state.date ? fmtDate(state.due) : 'On receipt') + '</td></tr>' +
      '</table></div></div>' +
      '<div class="inv-to"><p class="inv-h">Bill to</p><strong>' + esc(state.client || 'Client name') + '</strong><div class="inv-muted">' + esc(state.to) + '</div></div>' +
      '<table class="inv-items"><thead><tr><th>Description</th><th class="n">Qty</th><th class="n">Rate</th><th class="n">Amount</th></tr></thead><tbody>' +
      (rows || '<tr><td colspan="4" class="inv-muted">Add an item to start</td></tr>') + '</tbody></table>' +
      '<table class="inv-totals">' + totals + '</table>' +
      (state.pay ? '<div class="inv-block"><p class="inv-h">How to pay</p>' + esc(state.pay) + '</div>' : '') +
      (state.notes ? '<div class="inv-block"><p class="inv-h">Notes</p>' + esc(state.notes) + '</div>' : '') +
      '<p class="inv-credit">Made with the free invoice generator at graysmithlabs.com</p>';
  }

  form.addEventListener('input', function (e) {
    var t = e.target;
    if (t.dataset && t.dataset.k) state.items[Number(t.dataset.i)][t.dataset.k] = t.value;
    else if (t.name) state[t.name] = t.value;
    save(state);
    preview();
  });
  itemsBox.addEventListener('click', function (e) {
    var i = e.target && e.target.getAttribute('data-remove');
    if (i === null || i === undefined) return;
    state.items.splice(Number(i), 1);
    if (!state.items.length) state.items.push({ d: '', q: '1', r: '' });
    save(state);
    renderItems();
    preview();
  });
  document.getElementById('ig-add').addEventListener('click', function () {
    state.items.push({ d: '', q: '1', r: '' });
    save(state);
    renderItems();
    var inputs = itemsBox.querySelectorAll('input[data-k="d"]');
    if (inputs.length) inputs[inputs.length - 1].focus();
  });
  document.getElementById('ig-reset').addEventListener('click', function () {
    var keepBiz = { biz: state.biz, from: state.from, pay: state.pay, currency: state.currency };
    var n = String(state.number || '').match(/^(.*?)(\d+)$/);
    state = JSON.parse(JSON.stringify(blank));
    Object.assign(state, keepBiz);
    if (n) state.number = n[1] + String(Number(n[2]) + 1).padStart(n[2].length, '0');
    save(state);
    fill();
    preview();
    msg.textContent = 'New invoice started. Your business details were kept.';
  });
  document.getElementById('ig-print').addEventListener('click', function () {
    msg.textContent = 'Choose Save as PDF in the print window.';
    window.print();
  });

  fill();
  preview();
})();
