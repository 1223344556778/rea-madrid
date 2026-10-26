(() => {
'use strict';

const NTFY = 'https://ntfy.sh/madrid-swipes-093cbd1f19ca';
const LS_KEY = 'madrid-swipe-v1';
const RM = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const IS_LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) && !/[?&]track=1/.test(location.search);

const CATS = {
  essen:    { emoji: '🍜',  label: 'Essen',    title: 'Foodie',        sub: 'Du hast Hunger auf Madrid.' },
  cafe:     { emoji: '☕',  label: 'Cafés',    title: 'Café-Kennerin', sub: 'Ohne Cortado läuft hier nichts.' },
  shopping: { emoji: '🛍️', label: 'Shopping', title: 'Shopping-Queen', sub: 'Montag wird teuer.' },
  erlebnis: { emoji: '✨',  label: 'Erlebnisse', title: 'Entdeckerin', sub: 'Du willst was sehen, nicht nur essen.' },
  special:  { emoji: '🐶',  label: 'Special',  title: '', sub: '' }
};
const PTS = { like: 10, super: 25, nope: 2, slider: 10 };
const STUDY_LABELS = ['Ferien-Modus 😎', 'Eine Stunde Gewissen', 'Kurz und schmerzlos', 'Geht klar', 'Ernsthaft', 'Das tut weh', 'Fast schon Prüfungsphase', 'Nur noch Kaffee und Skript', 'Bibliothek ist mein Zuhause'];
const MILESTONES = [[0.25, 'Ein Viertel geschafft 💪'], [0.5, 'Halbzeit! 🔥'], [0.75, 'Fast da, noch ein paar!']];
const SLOT_ORDER = { morning: 0, lunch: 1, afternoon: 2, sunset: 3, evening: 4 };
const SLOT_LABEL = { morning: 'Morgens', lunch: 'Mittags', afternoon: 'Nachmittags', sunset: 'Sonnen&shy;untergang', evening: 'Abends', any: 'Flexibel' };
const CAP = { fri: 3, sat: 5, sun: 5, mon: 5, tue: 1 };
const CITY = { GVA: 'Genf', MAD: 'Madrid', ZRH: 'Zürich' };

const $ = s => document.querySelector(s);
function el(tag, props, ...kids) {
  const e = document.createElement(tag);
  if (props) for (const k in props) {
    const v = props[k];
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) { if (c == null || c === false) continue; e.append(c.nodeType ? c : document.createTextNode(c)); }
  return e;
}

let data = null, items = [], N = 0, itemById = {};
let state = { results: [], sent: false, started: false };
let busy = false, restore = null, shownPts = 0;

/* ---------- storage / tracking / haptics ---------- */
function save() { try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) {} }
function loadState() {
  try {
    const s = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
    if (s && Array.isArray(s.results)) {
      const ok = [];
      for (let i = 0; i < s.results.length && i < N; i++) { if (items[i] && s.results[i].id === items[i].id) ok.push(s.results[i]); else break; }
      state = { results: ok, sent: !!s.sent && ok.length >= N, started: !!s.started };
    }
  } catch (e) {}
}
function track(text) {
  if (IS_LOCAL) { console.log('[ntfy]', text); return; }
  try { fetch(NTFY, { method: 'POST', body: text }).catch(() => {}); } catch (e) {}
}
function vib(p) { try { navigator.vibrate && navigator.vibrate(p); } catch (e) {} }

const idx = () => state.results.length;
const ptsFor = r => r.a === 'input' ? (r.vals && r.vals.length ? 10 : 0) : (PTS[r.a] || 0);
const totalPts = () => state.results.reduce((s, r) => s + ptsFor(r), 0);
const isCard = it => (it.kind || 'card') === 'card';

/* ---------- screens ---------- */
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === id));
  const s = $('#' + id); if (s) s.scrollTop = 0;
}

/* ---------- start ---------- */
function fmtDate(iso) {
  const d = new Date(iso + 'T12:00:00');
  return ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'][d.getDay()] + ' ' + d.getDate() + '.' + (d.getMonth() + 1) + '.';
}
function ticket(label, f) {
  const [from, to] = f.route.split(/[–-]/);
  const [t0, t1] = f.time.split(/[–-]/);
  const fld = (a, b) => el('div', null, el('span', { text: a }), el('b', { text: b }));
  return el('div', { class: 'ticket' },
    el('div', { class: 't-main' },
      el('div', { class: 't-top' }, el('span', { text: label }), el('span', { text: f.flight })),
      el('div', { class: 't-route' }, el('div', { class: 't-code', text: from }), el('div', { class: 't-plane', text: '✈︎' }), el('div', { class: 't-code', text: to })),
      el('div', { class: 't-cities' }, el('span', { text: CITY[from] || '' }), el('span', { text: CITY[to] || '' })),
      el('div', { class: 't-grid' }, fld('Datum', fmtDate(f.date)), fld('Abflug', t0), fld('Ankunft', t1))),
    el('div', { class: 't-stub' }, el('div', { class: 'barcode' })));
}
function renderStart() {
  const t = data.trip;
  const box = $('#tickets'); box.innerHTML = '';
  box.append(ticket('Hinflug', t.arrival), ticket('Rückflug', t.departure));
  const go = $('#go'), done = idx(), rs = $('#restart-start');
  go.disabled = false;
  go.textContent = done === 0 ? "Los geht's" : done >= N ? 'Ergebnis ansehen' : `Weitermachen (${done}/${N})`;
  rs.hidden = done === 0;
}
function onGo() {
  if (!state.started) { state.started = true; save(); track('🚀 Rea hat die App gestartet'); }
  if (idx() >= N) showEnd(false); else enterSwipe();
}
function restart(confirmIt) {
  if (confirmIt && !confirm('Wirklich alles zurücksetzen?')) return;
  state = { results: [], sent: false, started: true }; save(); restore = null;
  track('🔁 Neu gestartet');
  renderStart(); enterSwipe();
}

/* ---------- deck ---------- */
const deck = $('#deck');
let cards = [];
function enterSwipe() { showScreen('swipe'); mountDeck(); updateProgress(); shownPts = totalPts(); $('#pts').textContent = shownPts; updateActions(); }
function mountDeck() {
  deck.innerHTML = ''; cards = [];
  for (let k = 0; k < 3; k++) addCard(idx() + k);
  layout(); preload(idx() + 3);
}
function addCard(i) {
  if (i >= N) return;
  const item = items[i];
  const e = buildCard(item);
  deck.append(e); cards.push({ el: e, item, i });
  preload(i + 3);
}
function layout() { cards.forEach((c, k) => { c.el.dataset.pos = k; }); }
function preload(i) { for (let k = i; k < i + 2 && k < N; k++) { const it = items[k]; if (it && it.image && !it._pre) { it._pre = true; const im = new Image(); im.src = it.image; } } }

function buildCard(item) {
  const k = item.kind || 'card';
  if (k === 'slider') return buildSlider(item);
  if (k === 'input') return buildInput(item);
  return buildPhotoCard(item);
}
function photoEl(item, cls) {
  const im = el('img', { class: 'photo', src: item.image, alt: '', draggable: 'false', decoding: 'async' });
  im.addEventListener('error', () => im.remove());
  return im;
}
function stamps() { return [el('div', { class: 'stamp like', text: 'LIKE' }), el('div', { class: 'stamp nope', text: 'NOPE' }), el('div', { class: 'stamp super', text: 'SUPER' })]; }

function buildPhotoCard(item) {
  const cat = CATS[item.category] || CATS.erlebnis;
  if (item.special) {
    const bg = el('div', { class: 'dog-bg' });
    if (item.image) {
      const im = el('img', { src: item.image, alt: '🐶', draggable: 'false' });
      im.addEventListener('error', () => { im.replaceWith(el('div', { class: 'emo', text: '🐶' })); });
      bg.append(im);
    } else bg.append(el('div', { class: 'emo', text: '🐶' }));
    return el('div', { class: 'card kind-card special' }, bg, stamps());
  }
  const card = el('div', { class: 'card kind-card cat-' + item.category });
  if (item.image) card.append(photoEl(item));
  card.append(el('div', { class: 'shade' }));
  const price = item.price ? el('span', { class: 'price' }, [1, 2, 3].map(n => el('b', { class: n <= item.price ? 'on' : '', text: '€' }))) : null;
  const more = el('span', { class: 'more', text: 'Details ▾' });
  const det = el('div', { class: 'details' }, el('div', null,
    item.address ? el('p', { text: '📍 ' + item.address }) : null,
    el('p', { text: '🕒 ' + (item.hours && item.hours !== 'unbekannt' ? item.hours : 'Öffnungszeiten unbekannt') }),
    item.mapsUrl ? el('a', { href: item.mapsUrl, target: '_blank', rel: 'noopener', text: 'In Google Maps öffnen ↗' }) : null));
  card.append(el('div', { class: 'info' },
    el('div', { class: 'chips' }, el('span', { class: 'chip', text: cat.emoji + ' ' + cat.label }), item.isClassic ? el('span', { class: 'chip classic', text: 'Klassiker' }) : null),
    el('h2', { class: 'name', text: item.name }),
    el('div', { class: 'meta' }, price, item.area ? el('span', { text: item.area }) : null),
    item.description ? el('p', { class: 'desc', text: item.description }) : null,
    more, det));
  card._more = more;
  card.append(...stamps());
  return card;
}

function buildSlider(item) {
  const min = item.min ?? 0, max = item.max ?? 8, step = item.step ?? 1, unit = item.unit || 'Std.';
  let v = restore && restore.id === item.id && restore.v != null ? restore.v : Math.min(max, Math.max(min, 2));
  const val = el('div', { class: 'sl-val' }), lab = el('div', { class: 'sl-label' });
  const rng = el('input', { class: 'range', type: 'range', min, max, step, value: v, 'aria-label': 'Stunden' });
  const upd = () => {
    v = +rng.value; val.textContent = ''; val.append(String(v), el('small', { text: unit }));
    lab.textContent = STUDY_LABELS[v] || '';
    rng.style.setProperty('--pct', ((v - min) / (max - min) * 100) + '%');
  };
  rng.addEventListener('input', () => { upd(); vib(5); });
  const ticks = el('div', { class: 'ticks' }); for (let n = min; n <= max; n += step) ticks.append(el('span', { text: n }));
  const btn = el('button', { class: 'btn primary', text: 'Abgemacht', onclick: () => { if (busy || cards[0] && cards[0].item !== item) return; record({ id: item.id, a: 'slider', v }); } });
  const card = el('div', { class: 'card kind-slider' },
    el('div', { class: 'sl-photo' }, item.image ? photoEl(item) : null),
    el('div', { class: 'sl-body' }, el('h2', { text: item.name }), item.description ? el('p', { text: item.description }) : null, val, lab, rng, ticks, btn));
  upd();
  return card;
}

function buildInput(item) {
  const vals = restore && restore.id === item.id && restore.vals ? restore.vals.slice() : [];
  const chips = el('div', { class: 'in-chips' });
  const inp = el('input', { type: 'text', placeholder: item.placeholder || '', maxlength: 80, autocomplete: 'off', enterkeyhint: 'done' });
  const next = el('button', { class: 'btn skip', onclick: () => { addVal(); if (busy || cards[0] && cards[0].item !== item) return; record({ id: item.id, a: 'input', vals: vals.slice() }); } });
  const label = item.id === 'andere-shops' ? 'Wunsch (Läden)' : 'Wunsch';
  function drawChips() {
    chips.innerHTML = '';
    vals.forEach((t, i) => chips.append(el('span', { class: 'in-chip' }, t, el('button', { 'aria-label': 'Entfernen', text: '×', onclick: () => { vals.splice(i, 1); drawChips(); } }))));
    next.textContent = vals.length ? 'Weiter' : 'Überspringen';
    next.classList.toggle('skip', !vals.length);
  }
  function addVal() {
    const t = inp.value.trim(); if (!t) return;
    vals.push(t); inp.value = ''; drawChips(); vib(8);
    track('✍️ ' + label + ': ' + t);
  }
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addVal(); } });
  const plus = el('button', { 'aria-label': 'Hinzufügen', text: '+', onclick: () => { addVal(); inp.focus(); } });
  drawChips();
  return el('div', { class: 'card kind-input' },
    el('div', { class: 'emo', text: (CATS[item.category] || CATS.erlebnis).emoji }),
    el('h2', { text: item.name }), item.description ? el('p', { text: item.description }) : null,
    el('div', { class: 'in-row' }, inp, plus), chips, next);
}

/* ---------- gestures ---------- */
let drag = null;
deck.addEventListener('pointerdown', e => {
  if (busy || e.button > 0) return;
  const top = cards[0]; if (!top || !isCard(top.item) || !top.el.contains(e.target)) return;
  if (e.target.closest('a,button')) return;
  drag = { top, x0: e.clientX, y0: e.clientY, dx: 0, dy: 0, moved: false, pts: [{ x: e.clientX, y: e.clientY, t: e.timeStamp }], id: e.pointerId, raf: 0 };
  try { top.el.setPointerCapture(e.pointerId); } catch (_) {}
});
deck.addEventListener('pointermove', e => {
  if (!drag || e.pointerId !== drag.id) return;
  drag.dx = e.clientX - drag.x0; drag.dy = e.clientY - drag.y0;
  drag.pts.push({ x: e.clientX, y: e.clientY, t: e.timeStamp }); if (drag.pts.length > 8) drag.pts.shift();
  if (!drag.moved && Math.hypot(drag.dx, drag.dy) > 8) { drag.moved = true; drag.top.el.classList.add('dragging'); }
  if (drag.moved && !drag.raf) drag.raf = requestAnimationFrame(applyDrag);
});
function applyDrag() {
  if (!drag) return; drag.raf = 0;
  const { top, dx, dy } = drag, e = top.el;
  const rot = Math.max(-18, Math.min(18, dx / 14));
  e._tx = dx; e._ty = dy; e._rot = rot;
  e.style.transform = `translate3d(${dx}px,${dy}px,0) rotate(${rot}deg)`;
  const up = dy < 0 && Math.abs(dy) > Math.abs(dx);
  const p = v => Math.max(0, Math.min(1, v / 100));
  setStamp(e, 'like', !up && dx > 0 ? p(dx) : 0);
  setStamp(e, 'nope', !up && dx < 0 ? p(-dx) : 0);
  setStamp(e, 'super', up ? p(-dy) : 0);
}
function setStamp(e, k, o) { const s = e.querySelector('.stamp.' + k); if (s) s.style.opacity = o; }
function endDrag(e) {
  if (!drag || (e && e.pointerId !== drag.id)) return;
  const d = drag; drag = null;
  if (d.raf) cancelAnimationFrame(d.raf);
  const el_ = d.top.el;
  el_.classList.remove('dragging');
  if (!d.moved) { // tap
    if (!d.top.item.special) { const o = el_.classList.toggle('open'); if (el_._more) el_._more.textContent = o ? 'Weniger ▴' : 'Details ▾'; }
    return;
  }
  const dx = d.dx, dy = d.dy, adx = Math.abs(dx), ady = Math.abs(dy);
  const a = d.pts[0], b = d.pts[d.pts.length - 1], dt = Math.max(1, b.t - a.t);
  const vx = (b.x - a.x) / dt, vy = (b.y - a.y) / dt;
  let act = null;
  if (dy < -100 && ady > adx * 0.8) act = 'super';
  else if (dx > 100) act = 'like';
  else if (dx < -100) act = 'nope';
  else if (vy < -0.7 && dy < -50 && ady > adx) act = 'super';
  else if (vx > 0.6 && dx > 40) act = 'like';
  else if (vx < -0.6 && dx < -40) act = 'nope';
  if (act) decide(act);
  else springBack(el_);
}
deck.addEventListener('pointerup', endDrag);
deck.addEventListener('pointercancel', endDrag);

function springBack(e) {
  e.style.transform = ''; e._tx = e._ty = e._rot = 0;
  ['like', 'nope', 'super'].forEach(k => setStamp(e, k, 0));
}

function decide(act) {
  if (busy) return;
  const top = cards[0]; if (!top || !isCard(top.item)) return;
  if (top.item.special && act !== 'super') { springBack(top.el); showDogDialog(); return; }
  record({ id: top.item.id, a: act }, { dir: act === 'like' ? 'right' : act === 'nope' ? 'left' : 'up' });
}

function throwOut(e, dir) {
  e.classList.remove('dragging'); e.classList.add('thrown');
  const W = innerWidth, H = innerHeight;
  let tx = e._tx || 0, ty = e._ty || 0, rot = e._rot || 0, sc = 1;
  const st = { right: 'like', left: 'nope', up: 'super' }[dir];
  if (st) setStamp(e, st, 1);
  if (dir === 'right') { tx = W * 1.2; rot = 22; }
  else if (dir === 'left') { tx = -W * 1.2; rot = -22; }
  else if (dir === 'up') { ty = -H * 1.1; }
  else { ty = -30; sc = .96; }
  e.style.transition = RM ? 'opacity .15s' : 'transform .4s cubic-bezier(.3,.6,.4,1), opacity .4s .05s';
  e.style.transform = `translate3d(${tx}px,${ty}px,0) rotate(${rot}deg) scale(${sc})`;
  e.style.opacity = 0;
  setTimeout(() => e.remove(), 520);
}

/* ---------- recording ---------- */
function trackFor(r, it) {
  const n = it.name;
  switch (r.a) {
    case 'nope': return '❌ Nope: ' + n;
    case 'like': return it.special ? '🐶 Hund: nur Like (Superlike abgelehnt)' : '❤️ Like: ' + n;
    case 'super': return it.special ? '🐶 Hund: Superlike ⭐' : '⭐ Superlike: ' + n;
    case 'slider': return '📚 Rea muss lernen: ' + r.v + ' Std.';
    case 'input': return r.vals && r.vals.length ? null : '⏭️ Übersprungen: ' + n;
  }
}
function record(r, opts) {
  opts = opts || {};
  const top = cards[0]; if (!top) return;
  const it = top.item;
  state.results.push(r); state.sent = false; restore = null; save();
  const tx = trackFor(r, it); if (tx) track(tx);

  const rect = deck.getBoundingClientRect();
  const cx = rect.left + rect.width / 2, cy = rect.top + rect.height * 0.4;
  const p = ptsFor(r);
  if (p) floatPts('+' + p, cx, cy, r.a === 'super');
  updateScore();
  vib(r.a === 'super' ? [15, 40, 25] : 12);

  throwOut(top.el, opts.dir || 'none');
  cards.shift(); layout(); addCard(idx() + 2);
  updateProgress(); updateActions();

  const likes = state.results.filter(x => (x.a === 'like' || x.a === 'super') && !(itemById[x.id] || {}).special).length;
  if (r.a === 'super') {
    burst(cx, cy, it.special ? 220 : 110, it.special ? 1.5 : 1.1);
    if (it.special) { setTimeout(() => burst(rect.left + 20, cy, 80, 1.2), 150); setTimeout(() => burst(rect.right - 20, cy, 80, 1.2), 250); }
    toastMatch(it.special ? 'Super Match! 🐶' : 'Super Match! ⭐', it.special ? '🐶' : it.name);
  } else if (r.a === 'like' && !it.special && likes % 3 === 0) {
    burst(cx, cy, 45, .8);
    toastMatch("It's a Match!", it.name);
  }
  const done = idx();
  MILESTONES.forEach(([pc, msg]) => { if (done === Math.round(N * pc) && done < N && done > 0) setTimeout(() => toastMile(msg), 350); });
  if (done >= N) setTimeout(() => showEnd(true), 600);
}

function undo() {
  if (busy || !state.results.length) return;
  const r = state.results.pop(); const it = itemById[r.id];
  state.sent = false; restore = r; save();
  track('↩︎ Rückgängig: ' + (it ? it.name : r.id));
  showScreen('swipe'); mountDeck();
  if (cards[0] && !RM) cards[0].el.classList.add('pop');
  updateProgress(); updateScore(); updateActions();
}

/* ---------- UI updates ---------- */
function updateProgress() {
  const d = idx();
  $('#bar').style.width = (N ? d / N * 100 : 0) + '%';
  $('#prog-txt').textContent = d + '/' + N;
}
function updateActions() {
  const top = cards[0];
  const rate = !top || !isCard(top.item);
  document.querySelectorAll('#actions .rate').forEach(b => b.classList.toggle('off', rate));
  $('#b-undo').disabled = idx() === 0;
}
function updateScore() {
  const target = totalPts(), from = shownPts, t0 = performance.now();
  const ptsEl = $('#pts'), sc = $('#score');
  if (target > from) { sc.classList.remove('bump'); void sc.offsetWidth; sc.classList.add('bump'); }
  const step = now => {
    const k = RM ? 1 : Math.min(1, (now - t0) / 400);
    shownPts = Math.round(from + (target - from) * k); ptsEl.textContent = shownPts;
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
function floatPts(text, x, y, sup) {
  const f = el('div', { class: 'float' + (sup ? ' sup' : ''), text }); f.style.left = x + 'px'; f.style.top = y + 'px';
  $('#fx').append(f); setTimeout(() => f.remove(), 1100);
}
function toastMatch(title, sub) {
  const t = el('div', { class: 'toast match' }, el('b', { text: title }), el('span', { text: sub }));
  $('#toast').append(t); setTimeout(() => t.remove(), 2300);
}
function toastMile(text) {
  const t = el('div', { class: 'toast mile', text });
  $('#toast').append(t); burst(innerWidth / 2, innerHeight * 0.4, 50, .8); vib([10, 30, 10]);
  setTimeout(() => t.remove(), 2300);
}

/* ---------- confetti ---------- */
const cv = $('#confetti'), ctx = cv.getContext('2d');
let parts = [], craf = 0;
function sizeCv() { const d = Math.min(devicePixelRatio || 1, 2); cv.width = innerWidth * d; cv.height = innerHeight * d; ctx.setTransform(d, 0, 0, d, 0, 0); }
addEventListener('resize', sizeCv); sizeCv();
const COLORS = ['#FF4D8D', '#FF9EC4', '#FFF1F5', '#E0508A', '#FFC2D9', '#B04A9C'];
function burst(x, y, n, power) {
  if (RM) return;
  power = power || 1;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, s = (4 + Math.random() * 9) * power;
    parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 5 * power, w: 5 + Math.random() * 6, h: 3 + Math.random() * 5, r: Math.random() * 6, vr: (Math.random() - .5) * .4, c: COLORS[i % COLORS.length], life: 70 + Math.random() * 50 });
  }
  if (!craf) craf = requestAnimationFrame(tick);
}
function tick() {
  ctx.clearRect(0, 0, innerWidth, innerHeight);
  parts = parts.filter(p => p.life > 0 && p.y < innerHeight + 30);
  for (const p of parts) {
    p.vy += .28; p.vx *= .985; p.x += p.vx; p.y += p.vy; p.r += p.vr; p.life--;
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.globalAlpha = Math.min(1, p.life / 25);
    ctx.fillStyle = p.c; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.restore();
  }
  craf = parts.length ? requestAnimationFrame(tick) : 0;
  if (!parts.length) ctx.clearRect(0, 0, innerWidth, innerHeight);
}

/* ---------- dog dialog ---------- */
function showDogDialog() {
  busy = true; $('#modal').hidden = false; vib([10, 30, 10]);
  track('🐶 Hund: Dialog "nicht superlike???"');
}
function closeDog(act) {
  $('#modal').hidden = true; busy = false;
  const top = cards[0]; if (!top || !top.item.special) return;
  record({ id: top.item.id, a: act }, { dir: act === 'like' ? 'right' : 'up' });
}
$('#m-super').addEventListener('click', () => closeDog('super'));
$('#m-like').addEventListener('click', () => closeDog('like'));

/* ---------- plan ---------- */
function allowed(item, dk) {
  const days = item.days || [];
  if (days.length && !days.includes(dk)) return false;
  const bt = item.bestTime || 'any';
  if (days.length === 1 && days[0] === dk) return true; // fest eingeplant, z. B. IE Campus am Freitag
  if (dk === 'fri') return ['evening', 'sunset', 'any'].includes(bt) && item.category !== 'shopping';
  if (dk === 'tue') return (item.category === 'cafe' || item.category === 'essen') && ['morning', 'any'].includes(bt);
  return true;
}
function slotFor(item, dk) {
  let bt = item.bestTime || 'any';
  if (bt !== 'any') return bt;
  if (item.category === 'shopping' && dk === 'mon') return 'morning';
  if (/rastro/i.test(item.id + item.name) && dk === 'sun') return 'morning';
  return 'any';
}
function slotVal(s, item) {
  if (s !== 'any') return SLOT_ORDER[s];
  return { cafe: 1.5, shopping: 2, erlebnis: 2.5, essen: 4 }[item.category] ?? 2;
}
function bonus(item, dk) {
  let b = 0;
  if (item.category === 'shopping' && dk === 'mon') b += 4;
  if (/rastro/i.test(item.id + item.name) && dk === 'sun') b += 20;
  return b;
}
function buildPlan() {
  const days = data.trip.days, plan = {}; days.forEach(d => plan[d.key] = []);
  const liked = state.results.filter(r => r.a === 'like' || r.a === 'super')
    .map(r => ({ item: itemById[r.id], sup: r.a === 'super' }))
    .filter(x => x.item && !x.item.special && isCard(x.item));
  const cand = x => days.filter(d => allowed(x.item, d.key));
  liked.sort((a, b) => (b.sup - a.sup) || (cand(a).length - cand(b).length));
  const rest = [];
  for (const x of liked) {
    let best = null, bs = 1e9;
    for (const d of cand(x)) {
      const list = plan[d.key]; if (list.length >= (CAP[d.key] ?? 5)) continue;
      const bt = x.item.bestTime || 'any';
      const same = bt === 'any' ? 0 : list.filter(y => y.item.bestTime === bt).length;
      const s = list.length * 1.2 + same * 3 - bonus(x.item, d.key);
      if (s < bs) { bs = s; best = d; }
    }
    if (best) { x.slot = slotFor(x.item, best.key); plan[best.key].push(x); } else rest.push(x);
  }
  // Lernzeit als Block auf Tage verteilen
  const sl = state.results.find(r => r.a === 'slider');
  if (sl && sl.v > 0) {
    let left = sl.v;
    const order = ['sat', 'mon', 'sun'].filter(k => plan[k]).sort((a, b) => plan[a].length - plan[b].length);
    for (const k of order) {
      if (left <= 0) break;
      const h = Math.min(left, 3); left -= h;
      plan[k].push({ study: h, slot: 'afternoon' });
    }
  }
  days.forEach(d => plan[d.key].sort((a, b) => slotVal(a.slot, a.item || {}) - slotVal(b.slot, b.item || {})));
  return { days, plan, rest };
}

/* ---------- end ---------- */
function thumbEl(it, cls) {
  const d = el('div', { class: cls || 'im' });
  if (it.image) { const im = el('img', { src: it.image, alt: '', loading: 'lazy' }); im.addEventListener('error', () => { im.replaceWith((CATS[it.category] || CATS.erlebnis).emoji); }); d.append(im); }
  else d.append((CATS[it.category] || CATS.erlebnis).emoji);
  return d;
}
function stats() {
  const R = state.results, by = a => R.filter(r => r.a === a).map(r => itemById[r.id]).filter(Boolean);
  return { sup: by('super'), like: by('like'), nope: by('nope'), slider: R.find(r => r.a === 'slider'), inputs: R.filter(r => r.a === 'input' && r.vals && r.vals.length) };
}
function levelOf(s) {
  const w = {};
  s.like.forEach(i => { if (!i.special) w[i.category] = (w[i.category] || 0) + 1; });
  s.sup.forEach(i => { if (!i.special) w[i.category] = (w[i.category] || 0) + 2; });
  const cardTotal = items.filter(i => isCard(i) && !i.special).length;
  const yes = s.like.filter(i => !i.special).length + s.sup.filter(i => !i.special).length;
  let best = null, bv = 0;
  for (const k in w) if (w[k] > bv) { bv = w[k]; best = k; }
  if (yes <= 2) return { emoji: '🧐', title: 'Wählerisch', sub: 'Du weisst, was du willst.' };
  if (cardTotal && yes / cardTotal >= 0.8) return { emoji: '🤩', title: 'Alles-Mitnehmerin', sub: 'Du willst einfach alles. Gut so.' };
  const c = CATS[best] || CATS.erlebnis;
  return { emoji: c.emoji, title: c.title, sub: c.sub };
}
function summaryText(s, lvl) {
  const names = a => a.map(i => i.name).join(', ') || '-';
  const lines = ['🏁 Rea ist fertig! Level: ' + lvl.title + ' ' + lvl.emoji,
    '⭐ Superlikes (' + s.sup.length + '): ' + names(s.sup),
    '❤️ Likes (' + s.like.length + '): ' + names(s.like),
    '❌ Nopes (' + s.nope.length + '): ' + names(s.nope)];
  if (s.slider) lines.push('📚 Lernen: ' + s.slider.v + ' Std.');
  const w = s.inputs.flatMap(r => r.vals);
  if (w.length) lines.push('✍️ Wünsche: ' + w.join(' | '));
  lines.push('🎯 Punkte: ' + totalPts());
  return lines.join('\n');
}
function showEnd(celebrate) {
  const s = stats(), lvl = levelOf(s), root = $('#end');
  root.innerHTML = '';
  root.append(el('div', { class: 'end-hero' },
    el('small', { text: 'Rea, das ist dein Level' }),
    el('h1', { text: lvl.emoji + ' ' + lvl.title }),
    el('p', { text: lvl.sub }),
    el('div', { class: 'stats' }, el('span', { text: '☀️ ' + totalPts() + ' Punkte' }), el('span', { text: '⭐ ' + s.sup.length }), el('span', { text: '❤️ ' + s.like.length }), el('span', { text: '❌ ' + s.nope.length }))));

  root.append(el('h2', { class: 'hero-h', style: 'font:800 30px/1 var(--f-display);letter-spacing:-.03em;margin-bottom:16px', text: 'Deine Matches' }));

  if (s.sup.length) root.append(el('div', { class: 'sec' }, el('h2', { text: 'Unbedingt ⭐' }),
    el('div', { class: 'supers' }, s.sup.map(i => el('div', { class: 'sup-card' + (i.special ? ' dog' : '') }, i.image ? el('img', { src: i.image, alt: '' }) : null, el('span', { class: 'star', text: '⭐' }),
      i.special ? el('div', { text: '🐶' }) : el('div', { text: i.name }, i.area ? el('small', { text: i.area }) : null))))));

  const groups = {}; s.like.forEach(i => { (groups[i.category] = groups[i.category] || []).push(i); });
  if (s.like.length) {
    const sec = el('div', { class: 'sec' }, el('h2', { text: 'Gefällt dir' }));
    ['essen', 'cafe', 'shopping', 'erlebnis', 'special'].forEach(k => {
      if (!groups[k]) return;
      sec.append(el('div', { class: 'grp' }, el('h3', { text: CATS[k].emoji + ' ' + CATS[k].label }),
        el('div', { class: 'thumbs' }, groups[k].map(i => el('div', { class: 'thumb' }, thumbEl(i), i.special ? '🐶' : i.name)))));
    });
    root.append(sec);
  }
  if (s.slider) root.append(el('div', { class: 'sec' }, el('h2', { text: 'Lernzeit 📚' }),
    el('div', { class: 'paper' }, el('b', { text: s.slider.v + ' Std.' }), ' – ' + (STUDY_LABELS[s.slider.v] || ''))));
  if (s.inputs.length) {
    const sec = el('div', { class: 'sec' }, el('h2', { text: 'Deine Wünsche ✍️' }));
    s.inputs.forEach(r => sec.append(el('div', { class: 'paper', style: 'margin-bottom:8px' }, el('b', { text: (itemById[r.id] || {}).name || '' }), el('div', { class: 'tags' }, r.vals.map(v => el('span', { text: v }))))));
    root.append(sec);
  }

  // Plan
  const { days, plan, rest } = buildPlan();
  const psec = el('div', { class: 'sec' }, el('h2', { text: 'Dein Madrid-Plan' }));
  days.forEach(d => {
    const list = plan[d.key];
    const card = el('div', { class: 'day' }, el('h3', { text: d.label }), d.note ? el('div', { class: 'note', text: d.note }) : null);
    if (!list.length) card.append(el('div', { class: 'empty', text: 'Noch frei. Spontan oder ausschlafen.' }));
    list.forEach(x => {
      if (x.study) { card.append(el('div', { class: 'row study' }, el('div', { class: 'im', text: '📚' }), el('div', { class: 'tx' }, 'Lernblock', el('small', { text: 'Rea lernt, Emil bringt Kaffee' })), el('div', { class: 'tm', text: x.study + ' Std.' }))); return; }
      const i = x.item;
      card.append(el('a', { class: 'row', href: i.mapsUrl || '#', target: '_blank', rel: 'noopener' }, thumbEl(i),
        el('div', { class: 'tx' }, (x.sup ? '⭐ ' : '') + i.name, el('small', { text: i.area || '' })),
        el('div', { class: 'tm', html: SLOT_LABEL[x.slot] })));
    });
    psec.append(card);
  });
  if (rest.length) psec.append(el('div', { class: 'paper' }, el('b', { text: 'Passt zeitlich nicht mehr rein' }), el('div', { class: 'tags' }, rest.map(x => el('span', { text: x.item.name })))));
  root.append(psec);

  root.append(el('div', { class: 'end-actions' },
    el('button', { class: 'btn primary big', text: 'Nochmal von vorne', onclick: () => restart(true) }),
    el('button', { class: 'linkbtn', text: '↩︎ Letzte Karte zurück', onclick: undo })));

  showScreen('end');
  if (celebrate) { burst(innerWidth / 2, innerHeight * 0.3, 140, 1.4); setTimeout(() => burst(innerWidth * .2, innerHeight * .4, 80, 1.1), 250); setTimeout(() => burst(innerWidth * .8, innerHeight * .4, 80, 1.1), 400); vib([20, 50, 20, 50, 40]); }
  if (!state.sent) { state.sent = true; save(); track(summaryText(s, lvl)); }
}

/* ---------- boot ---------- */
async function loadData() {
  for (const f of ['data.json', 'data.sample.json']) {
    try {
      const r = await fetch(f, { cache: 'no-cache' });
      if (!r.ok) continue;
      const j = await r.json();
      if (j && j.trip && Array.isArray(j.items) && j.items.length) return j;
    } catch (e) {}
  }
  return null;
}

// Hund kommt spontan irgendwo im mittleren Teil; Position bleibt pro Gerät gleich (sonst passt der gespeicherte Fortschritt nicht mehr)
function placeDog(list) {
  const dog = list.find(i => i.special);
  if (!dog) return list;
  const rest = list.filter(i => !i.special);
  const nCards = rest.filter(isCard).length;
  let pos = NaN;
  try { pos = parseInt(localStorage.getItem(LS_KEY + '-dog'), 10); } catch (e) {}
  if (!(pos >= 1 && pos < nCards)) {
    pos = Math.floor(nCards * (0.35 + Math.random() * 0.4));
    try { localStorage.setItem(LS_KEY + '-dog', pos); } catch (e) {}
  }
  rest.splice(pos, 0, dog);
  return rest;
}

$('#go').addEventListener('click', onGo);
$('#restart-start').addEventListener('click', () => restart(true));
$('#b-undo').addEventListener('click', undo);
$('#b-nope').addEventListener('click', () => decide('nope'));
$('#b-like').addEventListener('click', () => decide('like'));
$('#b-super').addEventListener('click', () => decide('super'));
document.addEventListener('keydown', e => {
  if (!$('#swipe').classList.contains('active') || /INPUT|TEXTAREA/.test((document.activeElement || {}).tagName)) return;
  if (e.key === 'ArrowLeft') decide('nope'); else if (e.key === 'ArrowRight') decide('like'); else if (e.key === 'ArrowUp') decide('super');
});

(async function boot() {
  data = await loadData();
  if (!data) {
    const er = $('#start-error'); er.hidden = false;
    er.textContent = 'Daten konnten nicht geladen werden. Bitte Seite neu laden (über einen Webserver öffnen, nicht als Datei).';
    return;
  }
  items = placeDog(data.items); N = items.length; items.forEach(i => itemById[i.id] = i);
  loadState(); preload(idx());
  renderStart();
})();
})();
