'use strict';

const GRAM_PER_QIAN = 3.75;
const SLOT_ORDER = { '開盤': 0, '中午': 1, '收盤': 2 };

const state = {
  bot: [],   // {date, slot, time, sell, buy, t}   每公克
  shop: [],  // {date, time, sell, buy, t}         每錢
  days: 30,
  unit: 'qian',
  tab: 'bot',
  hidden: new Set(),
  calcDir: 'buy',
  calcMode: 'weight',
};

const $ = (id) => document.getElementById(id);
const fmt = (n, d = 0) => Number(n).toLocaleString('zh-TW', { minimumFractionDigits: d, maximumFractionDigits: d });

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const head = lines.shift().split(',');
  return lines.filter(Boolean).map((line) => {
    const cells = line.split(',');
    const row = {};
    head.forEach((h, i) => { row[h] = cells[i]; });
    return row;
  });
}

function toTs(date, time) {
  return Date.parse(`${date}T${time || '12:00'}:00+08:00`);
}

async function loadCsv(path) {
  const res = await fetch(`${path}?v=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${path} ${res.status}`);
  return parseCsv(await res.text());
}

async function load() {
  const [bot, shop] = await Promise.allSettled([loadCsv('data/bot.csv'), loadCsv('data/shop.csv')]);
  if (bot.status === 'fulfilled') {
    state.bot = bot.value.map((r) => ({ ...r, sell: +r.sell, buy: +r.buy, t: toTs(r.date, r.time) }))
      .filter((r) => r.sell > 0)
      .sort((a, b) => a.t - b.t || SLOT_ORDER[a.slot] - SLOT_ORDER[b.slot]);
  }
  if (shop.status === 'fulfilled') {
    state.shop = shop.value.map((r) => ({ ...r, sell: +r.sell, buy: +r.buy, t: toTs(r.date, r.time) }))
      .filter((r) => r.sell > 0)
      .sort((a, b) => a.t - b.t);
  }
}

/* ---------- 最新價格卡片 ---------- */
function setChange(el, cur, prev) {
  el.className = 'chg';
  if (prev == null) { el.textContent = ''; return; }
  const d = cur - prev;
  const pct = prev ? (d / prev) * 100 : 0;
  if (d > 0) { el.classList.add('up'); el.textContent = `▲ ${fmt(d)}（+${pct.toFixed(2)}%）`; }
  else if (d < 0) { el.classList.add('down'); el.textContent = `▼ ${fmt(-d)}（${pct.toFixed(2)}%）`; }
  else { el.classList.add('flat'); el.textContent = '— 持平'; }
}

function renderCards() {
  const b = state.bot, s = state.shop;
  if (b.length) {
    const cur = b[b.length - 1], prev = b[b.length - 2];
    $('bot-sell').textContent = fmt(cur.sell);
    $('bot-buy').textContent = fmt(cur.buy);
    setChange($('bot-sell-chg'), cur.sell, prev && prev.sell);
    setChange($('bot-buy-chg'), cur.buy, prev && prev.buy);
    $('bot-meta').textContent = `${cur.date} ${cur.slot} · 掛牌 ${cur.time}（與前一筆比較）`;
    $('bot-qian').textContent = `換算每錢：賣出 ${fmt(cur.sell * GRAM_PER_QIAN)} / 買進 ${fmt(cur.buy * GRAM_PER_QIAN)}`;
  } else {
    $('bot-meta').textContent = '尚無資料';
  }
  if (s.length) {
    const cur = s[s.length - 1], prev = s[s.length - 2];
    $('shop-sell').textContent = fmt(cur.sell);
    $('shop-buy').textContent = fmt(cur.buy);
    setChange($('shop-sell-chg'), cur.sell, prev && prev.sell);
    setChange($('shop-buy-chg'), cur.buy, prev && prev.buy);
    $('shop-meta').textContent = `${cur.date} ${cur.time} 公告（與前一日比較）`;
  } else {
    $('shop-meta').textContent = '尚無資料';
  }
  const last = Math.max(b.length ? b[b.length - 1].t : 0, s.length ? s[s.length - 1].t : 0);
  $('updated').textContent = last
    ? `最後資料時間：${new Date(last).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false })}`
    : '目前尚無資料';
}

/* ---------- 走勢圖 ---------- */
const SERIES = [
  { key: 'bot-sell', src: 'bot', field: 'sell', label: '台銀 賣出', color: '--s-bot', dash: false },
  { key: 'bot-buy', src: 'bot', field: 'buy', label: '台銀 買進', color: '--s-bot', dash: true },
  { key: 'shop-sell', src: 'shop', field: 'sell', label: '銀樓 賣出', color: '--s-shop', dash: false },
  { key: 'shop-buy', src: 'shop', field: 'buy', label: '銀樓 買進', color: '--s-shop', dash: true },
];
let chart;

const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

function convert(src, v) {
  // 台銀原始為每公克，銀樓原始為每錢
  if (state.unit === 'qian') return src === 'bot' ? v * GRAM_PER_QIAN : v;
  return src === 'shop' ? v / GRAM_PER_QIAN : v;
}

function inRange(rows) {
  if (!state.days) return rows;
  const from = Date.now() - state.days * 86400000;
  return rows.filter((r) => r.t >= from);
}

function renderLegend() {
  const box = $('legend');
  box.replaceChildren();
  for (const s of SERIES) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('aria-pressed', String(!state.hidden.has(s.key)));
    const key = document.createElement('span');
    key.className = 'key' + (s.dash ? ' dash' : '');
    key.style.borderTopColor = cssVar(s.color);
    btn.append(key, document.createTextNode(s.label));
    btn.addEventListener('click', () => {
      state.hidden.has(s.key) ? state.hidden.delete(s.key) : state.hidden.add(s.key);
      renderLegend();
      renderChart();
    });
    box.append(btn);
  }
}

function renderChart() {
  if (!window.Chart) return;
  const datasets = SERIES.map((s) => ({
    label: s.label,
    hidden: state.hidden.has(s.key),
    data: inRange(state[s.src]).map((r) => ({ x: r.t, y: Math.round(convert(s.src, r[s.field]) * 100) / 100, r })),
    borderColor: cssVar(s.color),
    backgroundColor: cssVar(s.color),
    borderWidth: 2,
    borderDash: s.dash ? [6, 4] : [],
    pointRadius: 0,
    pointHoverRadius: 4,
    pointHitRadius: 12,
    tension: 0,
  }));
  const grid = cssVar('--grid'), text = cssVar('--text-2');
  const tickDate = (v) => new Date(v).toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei', month: 'numeric', day: 'numeric' });
  const opts = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    interaction: { mode: 'nearest', axis: 'x', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          title: (items) => {
            const r = items[0].raw.r;
            return `${r.date}${r.slot ? ' ' + r.slot : ''} ${r.time}`;
          },
          label: (item) => ` ${item.dataset.label}  ${fmt(item.parsed.y, state.unit === 'gram' ? 1 : 0)}`,
        },
      },
    },
    scales: {
      x: { type: 'linear', grid: { color: grid }, ticks: { color: text, callback: tickDate, maxTicksLimit: 7, maxRotation: 0 } },
      y: { grid: { color: grid }, ticks: { color: text, callback: (v) => fmt(v) } },
    },
  };
  if (chart) { chart.data.datasets = datasets; chart.options = opts; chart.update(); }
  else chart = new Chart($('chart'), { type: 'line', data: { datasets }, options: opts });
}

/* ---------- 表格 ---------- */
function renderTable() {
  const isBot = state.tab === 'bot';
  const cols = isBot ? ['日期', '時段', '掛牌時間', '賣出', '買進', '漲跌'] : ['日期', '時間', '賣出', '買進', '漲跌'];
  const thead = $('table').tHead, tbody = $('table').tBodies[0];
  const tr = document.createElement('tr');
  cols.forEach((c) => { const th = document.createElement('th'); th.textContent = c; tr.append(th); });
  thead.replaceChildren(tr);

  const rows = state[state.tab];
  const frag = document.createDocumentFragment();
  for (let i = rows.length - 1; i >= 0 && i >= rows.length - 400; i--) {
    const r = rows[i], p = rows[i - 1];
    const cells = isBot ? [r.date, r.slot, r.time, fmt(r.sell), fmt(r.buy)] : [r.date, r.time, fmt(r.sell), fmt(r.buy)];
    const row = document.createElement('tr');
    cells.forEach((c) => { const td = document.createElement('td'); td.textContent = c; row.append(td); });
    const td = document.createElement('td');
    if (p) {
      const d = r.sell - p.sell;
      td.textContent = d > 0 ? `▲${fmt(d)}` : d < 0 ? `▼${fmt(-d)}` : '—';
      td.className = d > 0 ? 'pos' : d < 0 ? 'neg' : '';
    }
    row.append(td);
    frag.append(row);
  }
  if (!rows.length) {
    const row = document.createElement('tr'), td = document.createElement('td');
    td.colSpan = cols.length; td.textContent = '尚無資料'; row.append(td); frag.append(row);
  }
  tbody.replaceChildren(frag);
}

/* ---------- 計算機 ---------- */
function latest(src) { const a = state[src]; return a.length ? a[a.length - 1] : null; }

function resCard(label, value, detail, best) {
  const div = document.createElement('div');
  div.className = 'res' + (best ? ' best' : '');
  const l = document.createElement('div'); l.className = 'lbl'; l.textContent = label + (best ? '　★ 較划算' : '');
  const v = document.createElement('div'); v.className = 'val'; v.textContent = value;
  const d = document.createElement('div'); d.className = 'det'; d.textContent = detail;
  div.append(l, v, d);
  return div;
}

function renderCalc() {
  const out = $('calc-out');
  const buying = state.calcDir === 'buy';
  const field = buying ? 'sell' : 'buy';           // 你買 → 看店家「賣出」價
  const bot = latest('bot'), shop = latest('shop');
  const qty = parseFloat($('calc-qty').value);
  out.replaceChildren();
  if (!(qty > 0) || (!bot && !shop)) return;

  const cards = [];
  if (state.calcMode === 'weight') {
    const grams = qty * parseFloat($('calc-unit').value);
    const w = `${fmt(grams, 2)} 公克 ＝ ${fmt(grams / GRAM_PER_QIAN, 2)} 錢`;
    if (bot) cards.push({ amt: Math.round(grams * bot[field]), label: `台銀黃金存摺（${fmt(bot[field])}/公克）`, det: w });
    if (shop) cards.push({ amt: Math.round((grams / GRAM_PER_QIAN) * shop[field]), label: `銀樓（${fmt(shop[field])}/錢）`, det: w });
    const best = cards.length > 1 ? (buying ? Math.min : Math.max)(...cards.map((c) => c.amt)) : null;
    for (const c of cards) {
      out.append(resCard(c.label, `${buying ? '需支付' : '可拿回'} ${fmt(c.amt)} 元`, c.det, c.amt === best));
    }
  } else {
    // 輸入金額 → 可換多少黃金
    if (bot) {
      const g = qty / bot[field];
      const whole = Math.floor(g);
      out.append(resCard(`台銀黃金存摺（${fmt(bot[field])}/公克）`,
        `${fmt(g, 2)} 公克`,
        buying ? `以整數公克交易：可買 ${whole} 公克，約 ${fmt(whole * bot[field])} 元` : `約 ${fmt(g / GRAM_PER_QIAN, 2)} 錢`, false));
    }
    if (shop) {
      const q = qty / shop[field];
      out.append(resCard(`銀樓（${fmt(shop[field])}/錢）`, `${fmt(q, 2)} 錢`, `約 ${fmt(q * GRAM_PER_QIAN, 2)} 公克`, false));
    }
  }
}

function renderPnl() {
  const out = $('pnl-out');
  out.replaceChildren();
  const cost = parseFloat($('pnl-cost').value);
  const grams = parseFloat($('pnl-qty').value) * parseFloat($('pnl-unit').value);
  if (!(cost > 0) || !(grams > 0)) return;
  const items = [];
  const bot = latest('bot'), shop = latest('shop');
  if (bot) items.push(['現在賣給台銀', grams * bot.buy]);
  if (shop) items.push(['現在賣給銀樓', (grams / GRAM_PER_QIAN) * shop.buy]);
  for (const [label, value] of items) {
    const pl = value - cost;
    const card = resCard(label, `${pl >= 0 ? '+' : '−'}${fmt(Math.abs(pl))} 元`,
      `可拿回 ${fmt(value)} 元 · 報酬率 ${pl >= 0 ? '+' : ''}${((pl / cost) * 100).toFixed(2)}% · 成本 ${fmt(cost / (grams / GRAM_PER_QIAN))}/錢`, false);
    card.querySelector('.val').classList.add(pl >= 0 ? 'pos' : 'neg');
    out.append(card);
  }
}

/* ---------- 控制項 ---------- */
function seg(id, attr, onPick) {
  const box = $(id);
  box.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    box.querySelectorAll('button').forEach((b) => { b.classList.toggle('on', b === btn); b.setAttribute('aria-checked', String(b === btn)); });
    onPick(btn.dataset[attr]);
  });
}

function bind() {
  seg('range', 'days', (v) => { state.days = +v; renderChart(); });
  seg('unit', 'unit', (v) => { state.unit = v; renderChart(); });
  seg('calc-dir', 'dir', (v) => { state.calcDir = v; renderCalc(); });
  seg('calc-mode', 'mode', (v) => {
    state.calcMode = v;
    $('calc-label').textContent = v === 'weight' ? '重量' : '金額（元）';
    $('calc-unit-field').hidden = v !== 'weight';
    $('calc-qty').value = v === 'weight' ? '1' : '10000';
    renderCalc();
  });
  ['calc-qty', 'calc-unit'].forEach((id) => $(id).addEventListener('input', renderCalc));
  ['pnl-cost', 'pnl-qty', 'pnl-unit'].forEach((id) => $(id).addEventListener('input', renderPnl));
  document.querySelector('.tabs').addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    state.tab = btn.dataset.tab;
    document.querySelectorAll('.tabs button').forEach((b) => {
      b.classList.toggle('on', b === btn);
      b.setAttribute('aria-selected', String(b === btn));
    });
    renderTable();
  });
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { renderLegend(); renderChart(); });
}

function renderAll() {
  renderCards();
  renderLegend();
  renderChart();
  renderTable();
  renderCalc();
  renderPnl();
}

bind();
load().then(renderAll).catch((err) => {
  $('updated').textContent = '資料載入失敗：' + err.message;
  renderAll();
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
