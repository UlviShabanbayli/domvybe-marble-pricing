// DV82 MARBLE PRICING · Plinth. Plans, billing, selection, the slab physics, the light and the scheduler.
// Test hook: window.__marble. URL flags: ?nofx · ?current=studio|practice|atelier · ?fail · ?fast · ?sleep=S · ?fxdpr=N · ?still
import { Marble } from './stone.js';

const Q = new URLSearchParams(location.search);
const KEY = 'dv82.v1.';
const store = {
  get(k) { try { return localStorage.getItem(KEY + k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(KEY + k, v); } catch (e) { /* private mode */ } },
};
const PLANS = [
  { id: 'studio', name: 'Studio', m: 24, y: 19, sub: 'For a practice of one', feats: ['3 live projects', 'Portfolio site + domain', 'Drawing & image CDN', 'Email support'], seed: 0.0 },
  { id: 'practice', name: 'Practice', m: 61, y: 49, sub: 'For studios up to 20', feats: ['Unlimited projects', 'Client review rooms', 'Planning-set exports', 'Priority support'], seed: 2.3 },
  { id: 'atelier', name: 'Atelier', m: 124, y: 99, sub: 'For firms and groups', feats: ['Everything in Practice', 'SSO & audit log', 'Custom domains ×10', 'A named advisor'], seed: 4.9 },
];
const $ = (s, r = document) => r.querySelector(s);
const root = document.documentElement;
const mqReduce = matchMedia('(prefers-reduced-motion: reduce)');
const mqTall = matchMedia('(max-aspect-ratio: 6/5), (max-width: 899px), (max-height: 559px)');
const STILL = Q.has('still');
const SLEEP = Q.has('sleep') ? +Q.get('sleep') : 14;
const NET = Q.has('fast') ? 60 : 1100;
const currentIdx = PLANS.findIndex((p) => p.id === Q.get('current'));
let reduce = mqReduce.matches || STILL;
root.classList.toggle('reduce', reduce);

// ---------------- DOM ----------------
const stage = $('#stage'), plansEl = $('#plans'), fxCanvas = $('#fx'), spill = $('#spill'), statusEl = $('#status');
const tpl = $('#tpl-plan');
const cards = PLANS.map((p, i) => {
  const el = tpl.content.firstElementChild.cloneNode(true);
  el.dataset.i = i; el.id = 'plan-' + p.id;
  const r = $('.radio', el); r.value = p.id; r.id = 'r-' + p.id; r.setAttribute('aria-label', p.name + ' plan');
  r.setAttribute('aria-describedby', `pr-${p.id} bl-${p.id}`);
  $('.hit', el).htmlFor = r.id;
  $('.name', el).textContent = p.name; $('.sub', el).textContent = p.sub;
  $('.price', el).id = 'pr-' + p.id; $('.billed', el).id = 'bl-' + p.id;
  $('.feats', el).innerHTML = p.feats.map((f) => `<li>${f.replace('&', '&amp;')}</li>`).join('');
  plansEl.appendChild(el);
  return { el, p, radio: r, cta: $('.cta', el), lbl: $('.cta .lbl', el), err: $('.err', el), num: $('.num', el), billed: $('.billed', el), face: $('.face', el) };
});

// ---------------- state ----------------
const st = {
  sel: 1, yearly: true, mode: 'wide', busy: false, done: false, failNext: Q.has('fail'),
  glow: [0, 0, 0], hov: [0, 0, 0], hovGoal: [0, 0, 0], press: [0, 0, 0], lift: [0, 0, 0], liftV: [0, 0, 0],
  ign: PLANS.map(() => ({ x: 0, y: 0, r: 3.4 })),
  flare: { r: 0, a: 0, i: 1, x: 0, y: 1 },
  pos: 1, posV: 0, drag: null,
  light: [0, 0], lightGoal: null, pointerIn: false,
  time: 2.1, intro: false, introT: 0, lastInput: 0, spillO: 0, spillX: 0, spillY: 0,
};
{
  const sp = store.get('plan'), sb = store.get('billing');
  const i = PLANS.findIndex((p) => p.id === sp);
  if (i >= 0) st.sel = i;
  if (sb === 'monthly') st.yearly = false;
}
st.pos = st.sel;

// ---------------- renderer ----------------
let fx = null;
function startFX() {
  if (root.classList.contains('no-fx')) return null;
  try { return new Marble(fxCanvas); } catch (e) { root.classList.add('no-fx'); return null; }
}
fx = startFX();
fxCanvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); fx = null; root.classList.add('no-fx'); L.baked = 0; });
fxCanvas.addEventListener('webglcontextrestored', () => { root.classList.remove('no-fx'); fx = startFX(); layout(); wake(); });

// ---------------- layout ----------------
let lastSig = '', forceFull = true;
const L = { k: 1, pitch: 0, cards: [], fx: { x: 0, y: 0, w: 0, h: 0 }, dpr: 1, stage: { w: 0, h: 0, docX: 0, docY: 0 }, baked: 0, bakeKey: '' };
function layout() {
  st.mode = mqTall.matches ? 'tall' : 'wide';
  root.dataset.mode = st.mode;
  const sr = stage.getBoundingClientRect();
  L.stage = { w: stage.offsetWidth, h: stage.offsetHeight, docX: sr.left + scrollX, docY: sr.top + scrollY };
  L.fx = { x: fxCanvas.offsetLeft, y: fxCanvas.offsetTop, w: fxCanvas.offsetWidth, h: fxCanvas.offsetHeight };
  L.cards = cards.map((c) => ({ x: c.el.offsetLeft, y: c.el.offsetTop, w: c.el.offsetWidth, h: c.el.offsetHeight }));
  L.k = L.cards[1].h / (st.mode === 'tall' ? 551 : 552);
  L.pitch = st.mode === 'tall' ? L.cards[1].w + 25.8 * L.k : 0;
  let dpr = Q.has('fxdpr') ? +Q.get('fxdpr') : Math.min(devicePixelRatio || 1, 2);
  const px = L.fx.w * L.fx.h * dpr * dpr, cap = 4.6e6;
  if (px > cap) dpr *= Math.sqrt(cap / px);
  L.dpr = dpr;
  if (fx) {
    fx.resize(Math.round(L.fx.w * dpr), Math.round(L.fx.h * dpr));
    const key = L.cards.map((c) => Math.round(c.w * dpr) + 'x' + Math.round(c.h * dpr)).join(',');
    if (key !== L.bakeKey) { L.bakeKey = key; L.baked = 0; }
  }
  forceFull = true;
  placeThumb();
  for (const c of cards) fitDigits(c);
  if (!st.lightGoal) st.light = restLight(st.time);
  applyDOM(true);
}
function bakeNext() {
  if (!fx || L.baked >= 3) return false;
  const i = L.baked, c = L.cards[i];
  fx.bake(i, Math.round(c.w * L.dpr), Math.round(c.h * L.dpr), c.w / c.h, PLANS[i].seed);
  L.baked++;
  return true;
}
// the light's resting path (stage CSS px): it drifts slowly across the slabs
function restLight(t) {
  const k = L.k;
  if (st.mode === 'tall') return [L.stage.w * 0.5 + Math.sin(t * 0.35) * 150 * k, 46 * k];
  return [564 * k + Math.sin(t * 0.35) * 520 * k, 36 * k];
}

// ---------------- prices ----------------
const DIG = {};
function digitW(d) {
  if (!DIG.ctx) { DIG.ctx = document.createElement('canvas').getContext('2d'); }
  if (!(d in DIG)) { DIG.ctx.font = "500 100px 'Cormorant Garamond'"; DIG[d] = DIG.ctx.measureText(d).width / 100; }
  return DIG[d];
}
function setPrice(c, animate) {
  const v = String(st.yearly ? c.p.y : c.p.m), el = c.num;
  const prev = el.dataset.v || '';
  const col = () => `<span>${[...'0123456789'].map((d) => `<span>${d}</span>`).join('')}</span>`;
  if (el.children.length !== v.length) {
    el.innerHTML = [...v].map(() => `<span class="dg">${col()}</span>`).join('');
    // start each column on the digit it replaces (aligned from the right) so the roll reads as a change
    const pv = prev.padStart(v.length, '0').slice(-v.length);
    [...el.children].forEach((dg, j) => { dg.firstChild.style.transform = `translate(-50%, ${-pv[j] * 10}%)`; dg.style.width = digitW(pv[j]) + 'em'; });
    void el.offsetWidth;
  }
  if (!animate) [...el.children].forEach((dg) => { dg.style.transition = 'none'; dg.firstChild.style.transition = 'none'; });
  [...el.children].forEach((dg, j) => {
    dg.firstChild.style.transitionDelay = animate ? (j * 70) + 'ms' : '';
    dg.firstChild.style.transform = `translate(-50%, ${-v[j] * 10}%)`;
    dg.style.width = digitW(v[j]) + 'em';
  });
  if (!animate) { void el.offsetWidth; [...el.children].forEach((dg) => { dg.style.transition = ''; dg.firstChild.style.transition = ''; }); }
  el.dataset.v = v;
  el.setAttribute('aria-label', `$${v} per month`);
  $('.cur', c.el).setAttribute('aria-hidden', 'true');
  c.billed.textContent = st.yearly ? `billed yearly · $${(st.yearly ? c.p.y : c.p.m) * 12}` : 'billed monthly';
}
function fitDigits(c) { /* digit widths are in em: nothing to re-measure on resize */ }

// ---------------- billing ----------------
const bill = $('#bill'), thumb = $('.thumb', bill);
function placeThumb() {
  const lab = [...bill.querySelectorAll('label')][st.yearly ? 1 : 0];
  thumb.style.width = lab.offsetWidth + 'px';
  thumb.style.transform = `translateX(${lab.offsetLeft}px)`;
}
bill.querySelectorAll('input').forEach((inp) => {
  inp.checked = (inp.value === 'yearly') === st.yearly;
  inp.addEventListener('change', () => {
    st.yearly = inp.value === 'yearly';
    store.set('billing', st.yearly ? 'yearly' : 'monthly');
    placeThumb();
    cards.forEach((c) => setPrice(c, !reduce));
    say(`${st.yearly ? 'Yearly' : 'Monthly'} billing. ${PLANS[st.sel].name}: $${price(st.sel)} a month.`);
    poke();
  });
});
const price = (i) => (st.yearly ? PLANS[i].y : PLANS[i].m);

// ---------------- selection ----------------
let lastPress = null;   // { i, x, y, t } slab-space press point
function slabPoint(i, clientX, clientY) {
  // client → slab space (y down, half-height = 1.15)
  const c = L.cards[i], k = L.k;
  const [ox, oy] = cardOffset(i);
  const cx = L.stage.docX - scrollX + c.x + ox + c.w / 2, cy = L.stage.docY - scrollY + c.y + oy + c.h / 2;
  return [(clientX - cx) / (c.h / 2) * 1.15, (clientY - cy) / (c.h / 2) * 1.15];
}
function select(i, origin, { announce = true, fromScroll = false } = {}) {
  if (st.busy || st.done) { cards[st.sel].radio.checked = true; return; }
  const prev = st.sel;
  st.sel = i;
  cards.forEach((c, k) => { c.radio.checked = k === i; c.el.classList.toggle('on', k === i); });
  if (prev !== i || origin) {
    const c = L.cards[i] || { w: 1, h: 1 };
    const asp = c.w / c.h || 0.65;
    const o = origin || [asp * 1.15, -1.15];
    st.ign[i] = { x: o[0], y: o[1], r: reduce ? 3.4 : 0 };
    if (reduce) { st.glow = st.glow.map((g, k) => (k === i ? 1 : 0)); }
  }
  if (st.mode === 'tall' && !fromScroll && !st.drag) { /* the row glides to the chosen slab */ }
  store.set('plan', PLANS[i].id);
  updateCTAs();
  updateNavBtns();
  if (announce && prev !== i) say(`${PLANS[i].name} plan selected: $${price(i)} a month, ${st.yearly ? 'billed yearly' : 'billed monthly'}.${st.mode === 'tall' ? ` ${i + 1} of 3.` : ''}`);
  poke();
}
function updateCTAs() {
  cards.forEach((c, k) => {
    const on = k === st.sel, isCur = k === currentIdx;
    if (c.cta.getAttribute('aria-busy') === 'true' || c.cta.classList.contains('is-done')) return;
    if (isCur) { c.lbl.textContent = 'Current plan'; c.cta.setAttribute('aria-disabled', 'true'); }
    else { c.lbl.textContent = on ? `Start with ${c.p.name}` : `Choose ${c.p.name}`; c.cta.removeAttribute('aria-disabled'); }
  });
}
function updateNavBtns() {
  $('#prev').disabled = st.sel === 0 || st.busy || st.done;
  $('#next').disabled = st.sel === 2 || st.busy || st.done;
  [...$('#dots').children].forEach((d, k) => d.classList.toggle('on', k === st.sel));
}
let sayT = 0;
const announceEl = $('#announce');
function say(t) { clearTimeout(sayT); announceEl.textContent = ''; sayT = setTimeout(() => { announceEl.textContent = t; }, 60); }

cards.forEach((c, i) => {
  c.radio.addEventListener('change', () => {
    if (!c.radio.checked) return;
    const lp = lastPress && lastPress.i === i && performance.now() - lastPress.t < 900 ? [lastPress.x, lastPress.y] : null;
    select(i, lp);
  });
  const hit = $('.hit', c.el);
  hit.addEventListener('click', (e) => { if (st.dragMoved && performance.now() - st.dragMoved < 400) { e.preventDefault(); } });
  c.el.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') { st.hovGoal[i] = 1; poke(); } });
  c.el.addEventListener('pointerleave', () => { st.hovGoal[i] = 0; st.press[i] = 0; poke(); });
  hit.addEventListener('pointerdown', (e) => {
    const [x, y] = slabPoint(i, e.clientX, e.clientY);
    lastPress = { i, x, y, t: performance.now() };
    if (!st.busy && !st.done) st.press[i] = 1;
    poke();
  });
  const up = () => { if (st.press[i]) { st.press[i] = 0; st.liftV[i] += reduce ? 0 : 60; poke(); } };
  hit.addEventListener('pointerup', up); hit.addEventListener('pointercancel', up);
  c.cta.addEventListener('click', (e) => onCTA(i, e));
});

// ---------------- CTA flow ----------------
function lock(on) {
  cards.forEach((c) => { c.radio.disabled = on; });
  bill.querySelectorAll('input').forEach((x) => { x.disabled = on; });
  updateNavBtns();
}
function onCTA(i, e) {
  const c = cards[i];
  if (c.cta.getAttribute('aria-disabled') === 'true' || st.busy || st.done) return;
  if (i !== st.sel) {
    const r = c.cta.getBoundingClientRect();
    select(i, slabPoint(i, e && e.clientX ? e.clientX : r.left + r.width / 2, e && e.clientY ? e.clientY : r.top + r.height / 2));
    return;
  }
  c.err.textContent = '';
  st.busy = true; lock(true);
  c.cta.setAttribute('aria-busy', 'true'); c.lbl.textContent = 'Starting trial…';
  plansEl.setAttribute('aria-busy', 'true');
  setTimeout(() => {
    st.busy = false; c.cta.removeAttribute('aria-busy'); plansEl.removeAttribute('aria-busy');
    if (st.failNext) {
      st.failNext = false; lock(false);
      c.lbl.textContent = 'Try again';
      c.err.textContent = "Couldn't start the trial. Check your connection and try again.";
      c.cta.classList.remove('shake'); void c.cta.offsetWidth; if (!reduce) c.cta.classList.add('shake');
      return;
    }
    st.done = true;
    c.cta.classList.add('is-done'); c.lbl.textContent = `Trial started · ${c.p.name}`;
    st.flare = { r: 0, a: reduce ? 0 : 1, i, x: 0, y: 1.05 };
    statusEl.innerHTML = `Your 14-day ${c.p.name} trial has started. <button type="button" id="undo">Change plan</button>`;
    $('#undo').addEventListener('click', undo);
    updateNavBtns();
    poke();
  }, NET);
}
function undo() {
  const c = cards[st.sel];
  st.done = false; lock(false);
  c.cta.classList.remove('is-done');
  statusEl.textContent = '';
  updateCTAs();
  c.radio.focus();
}
$('#prev').addEventListener('click', () => { if (st.sel > 0) { select(st.sel - 1, edgeOrigin(st.sel - 1, 1)); } });
$('#next').addEventListener('click', () => { if (st.sel < 2) { select(st.sel + 1, edgeOrigin(st.sel + 1, -1)); } });
function edgeOrigin(i, side) { const c = L.cards[i]; return [side * (c.w / c.h) * 1.15, 0]; }

// ---------------- the phone row: swipe ----------------
stage.addEventListener('pointerdown', (e) => {
  if (st.mode !== 'tall' || e.button > 0 || e.target.closest('.cta, .nav-btn')) return;
  st.drag = { x0: e.clientX, y0: e.clientY, pos0: st.pos, id: e.pointerId, on: false, vx: 0, lx: e.clientX, lt: performance.now() };
});
stage.addEventListener('pointermove', (e) => {
  const d = st.drag;
  if (!d || e.pointerId !== d.id) return;
  const dx = e.clientX - d.x0, dy = e.clientY - d.y0;
  if (!d.on) {
    if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.2 && !st.busy && !st.done) { d.on = true; try { stage.setPointerCapture(e.pointerId); } catch (er) { /* */ } cards.forEach((c, k) => { st.press[k] = 0; }); }
    else if (Math.abs(dy) > 10) { st.drag = null; return; }
    else return;
  }
  const now = performance.now(), dt = Math.max(1, now - d.lt);
  d.vx = 0.7 * d.vx + 0.3 * ((e.clientX - d.lx) / dt); d.lx = e.clientX; d.lt = now;
  let p = d.pos0 - dx / L.pitch;
  if (p < 0) p = -Math.pow(-p, 0.7) * 0.35; else if (p > 2) p = 2 + Math.pow(p - 2, 0.7) * 0.35;
  st.pos = p; st.posV = 0;
  st.lightGoal = [e.clientX - (L.stage.docX - scrollX), e.clientY - (L.stage.docY - scrollY)];
  poke();
});
const endDrag = (e) => {
  const d = st.drag; st.drag = null;
  if (!d || !d.on) return;
  st.dragMoved = performance.now();
  const target = Math.max(0, Math.min(2, Math.round(st.pos - d.vx * 0.32 * (1000 / L.pitch) * 0.5)));
  st.posV = -d.vx * 1000 / L.pitch;
  if (target !== st.sel) select(target, edgeOrigin(target, target > st.sel ? -1 : 1));
  poke();
};
stage.addEventListener('pointerup', endDrag); stage.addEventListener('pointercancel', endDrag);

// ---------------- pointer light ----------------
addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'mouse' && !st.drag) return;
  st.lightGoal = [e.clientX - (L.stage.docX - scrollX), e.clientY - (L.stage.docY - scrollY)];
  st.pointerIn = true; poke();
}, { passive: true });
document.addEventListener('pointerleave', () => { st.lightGoal = null; st.pointerIn = false; poke(); });
addEventListener('blur', () => { st.lightGoal = null; });

// ---------------- frame ----------------
function cardOffset(i) {
  if (st.mode === 'tall') return [Math.round((i - st.pos) * L.pitch * 2) / 2, -(st.lift[i]) * L.k];
  return [0, -(st.lift[i]) * L.k];
}
const domCache = ['', '', ''], fadeCache = ['', '', ''];
let spillCache = '';
function applyDOM(force) {
  cards.forEach((c, i) => {
    const [x, y] = cardOffset(i);
    const t = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0)`;
    if (force || t !== domCache[i]) { c.el.style.transform = t; domCache[i] = t; }
    // phone row: only the centred slab carries its type; the peeking neighbours show bare stone (as in concept_phone)
    const f = st.mode === 'tall' ? Math.max(0, Math.min(1, 1 - (Math.abs(i - st.pos) - 0.15) * 1.8)) : 1;
    const fs = f.toFixed(2);
    if (force || fs !== fadeCache[i]) {
      fadeCache[i] = fs;
      for (const el of [c.face, c.cta, c.err]) { el.style.opacity = f < 1 ? fs : ''; el.style.visibility = f <= 0.01 ? 'hidden' : ''; }
    }
  });
  // the amber spill follows the chosen slab
  const i = st.sel, c = L.cards[i];
  if (c) {
    const [ox, oy] = cardOffset(i);
    const sx = c.x + ox + c.w / 2, sy = c.y + oy + c.h * 0.42;
    st.spillX = st.spillX ? st.spillX + (sx - st.spillX) * (reduce ? 1 : 0.18) : sx; st.spillY = sy;
    const t = `translate3d(${st.spillX.toFixed(1)}px, ${sy.toFixed(1)}px, 0)|${(st.spillO * Math.min(1, 0.12 + st.ign[i].r / 2.4)).toFixed(3)}`;
    if (force || t !== spillCache) { spill.style.transform = t.split('|')[0]; spill.style.opacity = (st.spillO * Math.min(1, 0.12 + st.ign[i].r / 2.4)).toFixed(3); spillCache = t; }
  }
}
function render() {
  if (!fx || L.baked < 3) return;
  const d = L.dpr, k = L.k;
  const slabs = L.cards.map((c, i) => {
    const [ox, oy] = cardOffset(i);
    return {
      x: (c.x + ox - L.fx.x + c.w / 2) * d, y: (c.y + oy - L.fx.y + c.h / 2) * d, hw: c.w / 2 * d, hh: c.h / 2 * d,
      sel: st.glow[i], rim: st.glow[i] * Math.min(1, 0.12 + st.ign[i].r / 2.4), hov: st.hov[i], lift: Math.max(0, st.lift[i]), dim: i === currentIdx ? 1 : 0, ign: [st.ign[i].x, st.ign[i].y, st.ign[i].r],
    };
  });
  // only the light moved (the commonest frame): repaint just the slab faces, the shadows and glows are unchanged
  const sig = slabs.map((k) => [k.x, k.y, k.sel.toFixed(4), k.rim.toFixed(4), k.lift.toFixed(3), k.dim].join(',')).join('|') + '|' + L.fx.w + 'x' + L.fx.h + '|' + d;
  const full = sig !== lastSig || forceFull; lastSig = sig; forceFull = false;
  const boxes = full ? null : slabs.filter((k) => k.x + k.hw > 0 && k.x - k.hw < L.fx.w * d).map((k) => [k.x - k.hw - 1, k.y - k.hh - 1, k.x + k.hw + 1, k.y + k.hh + 1]);
  fx.frame(slabs, {
    s: k * d, rad: 20 * k * d, time: st.time,
    light: [(st.light[0] - L.fx.x) * d, (st.light[1] - L.fx.y) * d],
    flare: [st.flare.x, st.flare.y, st.flare.r, st.flare.a], flareI: st.flare.i,
  }, boxes);
}

// ---------------- scheduler ----------------
let raf = 0, lastT = 0, lastDraw = 0, frames = 0;
const S = { awake: false, draws: 0 };
function poke() { st.lastInput = performance.now(); wake(); }
function wake() { if (!raf) { lastT = 0; raf = requestAnimationFrame(tick); S.awake = true; } }
function idleLeft(now) { return SLEEP * 1000 - (now - st.lastInput); }
function step(dt, now) {
  let moving = false;
  const near = (a, b, e = 1e-3) => Math.abs(a - b) < e;
  // glow: the chosen slab lights, the others cool
  for (let i = 0; i < 3; i++) {
    const g = i === st.sel ? 1 : 0;
    if (!near(st.glow[i], g)) { st.glow[i] += (g - st.glow[i]) * Math.min(1, dt * (g ? 5 : 3.2)); moving = true; } else st.glow[i] = g;
    const ig = st.ign[i];
    if (ig.r < 3.4) { ig.r = Math.min(3.4, ig.r + dt * (1.1 + ig.r * 1.6)); moving = true; }
    if (!near(st.hov[i], st.hovGoal[i])) { st.hov[i] += (st.hovGoal[i] - st.hov[i]) * Math.min(1, dt * 9); moving = true; } else st.hov[i] = st.hovGoal[i];
    // lift: hover raises the slab, a press sinks it; a heavy spring so stone feels like stone
    const goal = reduce ? 0 : (st.press[i] ? -3 : st.hovGoal[i] * 6);
    const a = (goal - st.lift[i]) * 320 - st.liftV[i] * 26;
    st.liftV[i] += a * dt; st.lift[i] += st.liftV[i] * dt;
    if (Math.abs(st.lift[i] - goal) < 0.01 && Math.abs(st.liftV[i]) < 0.05) { st.lift[i] = goal; st.liftV[i] = 0; } else moving = true;
  }
  // the phone row glides to the chosen slab
  if (st.mode === 'tall' && !st.drag) {
    const goal = st.sel;
    if (reduce) { st.pos = goal; st.posV = 0; }
    const a = (goal - st.pos) * 140 - st.posV * 22;
    st.posV += a * dt; st.pos += st.posV * dt;
    if (Math.abs(st.pos - goal) < 1e-3 && Math.abs(st.posV) < 1e-3) { st.pos = goal; st.posV = 0; } else moving = true;
  } else if (st.mode === 'wide') { st.pos = st.sel; st.posV = 0; }
  if (st.drag && st.drag.on) moving = true;
  // spill
  const so = reduce ? 1 : Math.min(1, st.spillO + dt * 1.5);
  if (!near(so, st.spillO)) { st.spillO = so; moving = true; } else st.spillO = 1;
  // success flare: a ring of light rolls up the chosen slab's veins
  if (st.flare.a > 0) { st.flare.r += dt * 2.6; if (st.flare.r > 3.6) { st.flare.a = 0; st.flare.r = 0; } moving = true; }
  // light
  const left = idleLeft(now);
  const drift = !reduce && left > 0;
  if (drift) st.time += dt * Math.min(1, left / 3000);
  let goal = st.lightGoal || restLight(st.time);
  if (reduce && !st.lightGoal) goal = restLight(0);
  if (st.intro) {
    st.introT += dt;
    const e = Math.min(1, st.introT / 1.5), ee = 1 - Math.pow(1 - e, 3);
    const from = [-0.35 * L.stage.w, goal[1]];
    goal = [from[0] + (goal[0] - from[0]) * ee, goal[1]];
    st.light = goal.slice();
    if (e >= 1) st.intro = false;
    moving = true;
  } else {
    const dx = goal[0] - st.light[0], dy = goal[1] - st.light[1];
    if (Math.abs(dx) > 0.3 || Math.abs(dy) > 0.3) { const r = Math.min(1, dt * (st.lightGoal ? 7 : 3)); st.light[0] += dx * r; st.light[1] += dy * r; if (st.lightGoal) moving = true; }
    else { st.light = goal.slice(); }
  }
  return { moving, drift };
}
function tick(now) {
  raf = 0;
  const dt = lastT ? Math.min(0.05, (now - lastT) / 1000) : 1 / 60;
  lastT = now;
  if (fx && L.baked < 3) {
    forceFull = true;
    // bake one slab per frame so a resize never blocks a frame for long
    bakeNext();
    if (L.baked >= 3 && !st.introDone) beginIntro();
    raf = requestAnimationFrame(tick); return;
  }
  const { moving, drift } = step(dt, now);
  const due = moving || !drift || now - lastDraw > 31;   // idle drift alone renders at ~30 fps
  if (due) { applyDOM(false); render(); lastDraw = now; S.draws++; frames++; }
  if (moving || drift) raf = requestAnimationFrame(tick);
  else S.awake = false;
}
function beginIntro() {
  st.introDone = true;
  if (reduce) { st.glow[st.sel] = 1; st.ign[st.sel].r = 3.4; st.spillO = 1; return; }
  st.intro = true; st.introT = 0; st.spillO = 0;
  const c = L.cards[st.sel];
  st.ign[st.sel] = { x: (c.w / c.h) * 1.15, y: -1.15, r: 0 };
  st.lastInput = performance.now();
}
document.addEventListener('visibilitychange', () => { if (document.hidden && raf) { cancelAnimationFrame(raf); raf = 0; S.awake = false; } else if (!document.hidden) wake(); });
mqReduce.addEventListener('change', () => { reduce = mqReduce.matches || STILL; root.classList.toggle('reduce', reduce); poke(); });
let rzT = 0;
addEventListener('resize', () => { cancelAnimationFrame(rzT); rzT = requestAnimationFrame(() => { layout(); poke(); }); });
addEventListener('scroll', () => { /* stage document offsets are scroll-independent */ }, { passive: true });

// ---------------- boot ----------------
cards.forEach((c) => setPrice(c, false));
let readyRes;
const ready = new Promise((r) => (readyRes = r));
(async () => {
  try { await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 2500))]); } catch (e) { /* */ }
  try { await Promise.all(['600 20px Cinzel', "500 40px 'Cormorant Garamond'", '400 14px Inter', '600 14px Inter'].map((f) => document.fonts.load(f))); } catch (e) { /* */ }
  for (const k of Object.keys(DIG)) if (k !== 'ctx') delete DIG[k];
  cards.forEach((c) => setPrice(c, false));
  select(st.sel, null, { announce: false });
  st.glow = st.glow.map((g, k) => (k === st.sel && (reduce || !fx) ? 1 : 0));
  layout();
  if (fx) { while (bakeNext()); beginIntro(); if (STILL) { st.intro = false; st.light = restLight(st.time); st.ign[st.sel].r = 3.4; st.glow[st.sel] = 1; st.spillO = 1; } }
  else { st.spillO = 1; }
  applyDOM(true); render();
  poke();
  readyRes();
})();

window.__marble = {
  ready,
  get busy() { return S.awake; },
  get fx() { return !!fx; },
  state() {
    return {
      sel: st.sel, plan: PLANS[st.sel].id, yearly: st.yearly, mode: st.mode, glow: st.glow.slice(), ign: st.ign.map((g) => g.r), ignO: st.ign.map((g) => [g.x, g.y]), lift: st.lift.slice(),
      hov: st.hov.slice(), pos: st.pos, light: st.light.slice(), lightGoal: st.lightGoal, intro: st.intro, busy: st.busy, done: st.done, flare: st.flare.a,
      awake: S.awake, draws: fx ? fx.draws : 0, px: fx ? fx.px : 0, frames: S.draws, dpr: L.dpr, k: L.k, canvas: fx ? [fxCanvas.width, fxCanvas.height] : null, baked: L.baked,
    };
  },
  layout() { layout(); },
  redraw(full) { if (full) forceFull = true; render(); },
  scene() { return fx; },
  select(i) { cards[i].radio.click(); },
};
