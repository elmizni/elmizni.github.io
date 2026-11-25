/* Solar Home: tap-to-open detail screens and the energy history dashboard.
   Loaded after the main page script, which exposes window.SOLAR (live values, settings).
   History comes from the hourly collector (.github/workflows/solar-history.yml), which saves it,
   encrypted with a key derived from the VRM access key, on the history-data branch. */
(function () {
'use strict';
var A = window.SOLAR; if (!A) return;
var T = A.T;
var RAW = 'https://raw.githubusercontent.com/elmizni/elmizni.github.io/history-data/';
var C = { solar: '#ffd24a', batt: '#3fe08a', home: '#56b6ff', grid: '#9aa3ae', gen: '#ff9f43', exp: '#b58cff' };
var FL = {
  Pc: { c: C.solar, n: 'Solar' }, Bc: { c: C.batt, n: 'Battery' }, Gc: { c: C.grid, n: 'Grid' }, gc: { c: C.gen, n: 'Generator' },
  Pb: { c: '#e0b43a', n: 'Solar into battery' }, Gb: { c: '#69717c', n: 'Grid into battery' }, gb: { c: '#c97f33', n: 'Generator into battery' },
  Pg: { c: C.exp, n: 'Solar sent out' }, Bg: { c: '#8f6fd6', n: 'Battery sent out' }
};
function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k) || ''; if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v) } catch (e) { return '' } }
function $(id) { return document.getElementById(id) }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] }) }
function num(v) { return typeof v === 'number' && isFinite(v) ? v : null }
function tv(p) { return num(T[p]) }
function insts(svc) { var o = {}, re = new RegExp('^' + svc + '/(\\d+)/'); for (var k in T) { var m = k.match(re); if (m) o[m[1]] = 1 } return Object.keys(o).sort(function (a, b) { return a - b }) }
function sumT(re) { var s = null; for (var k in T) { if (re.test(k) && num(T[k]) != null) s = (s || 0) + T[k] } return s }

/* ---------------- time, in the house's time zone ---------------- */
var TZ = 'Asia/Beirut', DTF, PC = {}, PCn = 0;
function setTZ(z) { try { DTF = new Intl.DateTimeFormat('en-US', { timeZone: z, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }); if (z !== TZ) { PC = {}; PCn = 0 } TZ = z } catch (e) { } }
setTZ(TZ);
function parts(ms) {
  var key = Math.floor(ms / 60000), c = PC[key]; if (c) return c;
  var o = {}; DTF.formatToParts(new Date(ms)).forEach(function (p) { o[p.type] = p.value });
  c = { y: +o.year, m: +o.month, d: +o.day, h: +o.hour % 24, mi: +o.minute };
  if (++PCn > 30000) { PC = {}; PCn = 0 } PC[key] = c; return c;
}
function offs(ms) { var p = parts(ms); return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi) - Math.floor(ms / 60000) * 60000 }
function mid(y, m, d) { var g = Date.UTC(y, m - 1, d), t = g - offs(g); return g - offs(t) }
function pad(n) { return (n < 10 ? '0' : '') + n }
function dk(ms) { var p = parts(ms); return p.y + '-' + pad(p.m) + '-' + pad(p.d) }
function mk(ms) { var p = parts(ms); return p.y + '-' + pad(p.m) }
function kp(k) { var a = k.split('-'); return { y: +a[0], m: +a[1], d: +(a[2] || 1) } }
function kStart(k) { var p = kp(k); return mid(p.y, p.m, p.d) }
function addDays(k, n) { var p = kp(k), u = new Date(Date.UTC(p.y, p.m - 1, p.d + n)); return u.getUTCFullYear() + '-' + pad(u.getUTCMonth() + 1) + '-' + pad(u.getUTCDate()) }
function todayK() { return dk(Date.now()) }
function dim(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate() }
var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
var MONF = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
var WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
function wd(k) { var p = kp(k); return WD[new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay()] }
function dShort(k) { var p = kp(k); return p.d + ' ' + MON[p.m - 1] }
function dLabel(k) { var t = todayK(); if (k === t) return 'Today'; if (k === addDays(t, -1)) return 'Yesterday'; return wd(k) + ' ' + dShort(k) }
function hm(ms) { var p = parts(ms); return pad(p.h) + ':' + pad(p.mi) }

/* ---------------- numbers ---------------- */
function nf(v, d) {
  if (v == null || !isFinite(v)) return '–';
  var a = Math.abs(v); if (d == null) d = a < 1 && a > 0 ? 2 : a < 10 ? 1 : 0;
  return v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}
function kW(w) { return w == null ? '–' : nf(Math.abs(w) / 1000, 1) }
function dur(min) { if (min == null || !isFinite(min)) return '–'; min = Math.round(min); var h = Math.floor(min / 60), m = min % 60; return h ? h + ' h' + (m ? ' ' + m + ' min' : '') : m + ' min' }
function mwh(k) { return k >= 1000 ? nf(k / 1000, 1) + ' MWh' : nf(k) + ' kWh' }
function pctChange(a, b) { if (!(b > 0.2) || a == null) return null; return (a - b) / b * 100 }
function delta(a, b, goodUp) {
  var p = pctChange(a, b); if (p == null || !isFinite(p)) return '';
  if (Math.abs(p) < 2) return '<p>about the same</p>';
  var up = p > 0, good = goodUp == null ? null : (up === goodUp);
  return '<p style="color:' + (good == null ? 'var(--ink-3)' : good ? '#6fe3a2' : '#ffb07a') + '">' + (up ? '▲ ' : '▼ ') + Math.round(Math.abs(p)) + '%</p>';
}

/* energy flows for a period: Pc solar->home, Pb solar->battery, Pg solar->grid, Gc grid->home, Gb grid->battery,
   Bc battery->home, Bg battery->grid, gc/gb generator */
function tot(o) {
  var g = function (k) { return +(o && o[k]) || 0 };
  var r = { Pc: g('Pc'), Pb: g('Pb'), Pg: g('Pg'), Gc: g('Gc'), Gb: g('Gb'), Bc: g('Bc'), Bg: g('Bg'), gc: g('gc'), gb: g('gb') };
  r.solar = r.Pc + r.Pb + r.Pg; r.home = r.Pc + r.Bc + r.Gc + r.gc; r.gin = r.Gc + r.Gb; r.gout = r.Pg + r.Bg;
  r.gen = r.gc + r.gb; r.bin = r.Pb + r.Gb + r.gb; r.bout = r.Bc + r.Bg;
  r.self = r.home > 0.05 ? Math.max(0, Math.min(100, (r.home - r.Gc - r.gc) / r.home * 100)) : null;
  r.any = r.solar + r.home + r.gin + r.gout > 0.001;
  return r;
}
function addInto(a, o) { a = a || {}; for (var k in o) a[k] = (a[k] || 0) + (+o[k] || 0); return a }

/* ---------------- history store ---------------- */
var H = { mode: 'idle', db: null, why: '', status: null, busy: false, at: 0, K: null, monthBusy: {} };
function newDB(tz) { return { tz: tz || 'Asia/Beirut', gen: 0, day: {}, socd: {}, mon: {}, hr: {}, socH: {}, soc15: [], iv: null, fc: null, loaded: {}, sample: false } }
function histOK() { return H.db && (H.mode === 'ready' || (H.mode === 'sample' && A.isDemo())) }

function rng(s) { return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 } }
function sampleDB() {
  // a plausible year for a Beirut-area home with ~7 kWp of panels, a 20 kWh battery and a few hours of grid a day
  var D = newDB('Asia/Beirut'); D.sample = true; D.gen = Date.now(); setTZ(D.tz);
  var r = rng(20261125), now = Date.now(), t0 = kStart(addDays(todayK(), -400)), cap = 20, soc = 62, reserve = 20;
  var cur = '', grid = [], daySolar = 0, rise = 6, DL = 12, summer = 0, recent = now - 8 * 86400e3, prevSoc = soc;
  for (var t = t0; t < now; t += 3600e3) {
    var p = parts(t), k = p.y + '-' + pad(p.m) + '-' + pad(p.d);
    if (k !== cur) {
      cur = k; var doy = Math.floor((Date.UTC(p.y, p.m - 1, p.d) - Date.UTC(p.y, 0, 0)) / 864e5), win = Math.cos(2 * Math.PI * (doy - 172) / 365);
      summer = Math.max(0, win); DL = 12 + 2.3 * win; rise = 12.15 - DL / 2;
      var clouds = r() < (0.3 - 0.2 * win) ? 0.22 + 0.45 * r() : 0.86 + 0.14 * r();
      daySolar = 7.2 * (5.0 + 2.1 * win) * clouds * 0.9;
      grid = []; var on = r() < 0.5, blk = 0;
      for (var hh = 0; hh < 24; hh++) { if (blk <= 0) { on = !on; blk = on ? 2 + Math.floor(r() * 4) : 1 + Math.floor(r() * 4) } grid.push(on); blk-- }
    }
    var x = (p.h + 0.5 - rise) / DL, sh = x > 0 && x < 1 ? Math.pow(Math.sin(Math.PI * x), 1.5) : 0;
    var pv = sh > 0 ? daySolar * sh / (DL * 0.599) * (0.88 + 0.24 * r()) : 0;
    var load = 0.5 + (p.h >= 7 && p.h < 9 ? 0.8 : 0) + (p.h >= 12 && p.h < 15 ? 0.5 : 0) + (p.h >= 18 && p.h < 23 ? 1.5 : 0) + (p.h >= 13 && p.h < 22 ? 1.4 * summer : 0);
    load *= 0.8 + 0.4 * r();
    var o = { Pc: 0, Pb: 0, Pg: 0, Gc: 0, Gb: 0, Bc: 0, Bg: 0 };
    o.Pc = Math.min(pv, load); var room = (100 - soc) / 100 * cap; o.Pb = Math.max(0, Math.min(pv - o.Pc, room, 5)); soc += o.Pb / cap * 100;
    var need = load - o.Pc;
    if (grid[p.h]) { o.Gc = need; if (soc < 45) { o.Gb = Math.min(2.5, (45 - soc) / 100 * cap); soc += o.Gb / cap * 100 } }
    else { var av = Math.max(0, (soc - reserve) / 100 * cap); o.Bc = Math.min(need, av, 6); soc -= o.Bc / cap * 100; var rest = need - o.Bc; if (rest > 0) { var b2 = Math.min(rest, Math.max(0, (soc - 8) / 100 * cap)); o.Bc += b2; soc -= b2 / cap * 100 } }
    for (var c in o) o[c] = Math.round(o[c] * 1000) / 1000;
    D.hr[t] = o; D.socH[t] = Math.round(soc * 10) / 10;
    D.day[k] = addInto(D.day[k], o); D.mon[k.slice(0, 7)] = addInto(D.mon[k.slice(0, 7)], o);
    var sd = D.socd[k] || (D.socd[k] = [0, 101, -1, 0]); sd[0] += soc; sd[3]++; sd[1] = Math.min(sd[1], soc, prevSoc); sd[2] = Math.max(sd[2], soc, prevSoc);
    if (t >= recent) {
      for (var q = 0; q < 4; q++) D.soc15.push([t + q * 900e3, Math.round((prevSoc + (soc - prevSoc) * (q + 1) / 4) * 10) / 10]);
      D.iv = D.iv || []; for (q = 0; q < 4; q++) D.iv.push([t + q * 900e3, grid[p.h] ? 226 + Math.round(r() * 8) : 0]);
    }
    prevSoc = soc;
  }
  for (var dd in D.socd) { var a = D.socd[dd]; D.socd[dd] = [a[0] / a[3], a[1], a[2]] }
  for (var mm in D.mon) D.loaded[mm] = true;
  D.fc = []; var tom = kStart(addDays(todayK(), 1));
  for (var h = 0; h < 48; h++) { var tt = kStart(todayK()) + h * 3600e3, pp = parts(tt), xx = (pp.h + 0.5 - rise) / DL, s2 = xx > 0 && xx < 1 ? Math.pow(Math.sin(Math.PI * xx), 1.5) : 0; D.fc.push([tt, Math.round(s2 * 7.2 * 5 * 0.85 / (DL * 0.599) * 1000)]) }
  D.live = { soc: soc };
  return D;
}

function colsEach(c, fn) { if (!c || !c.t) return; var codes = Object.keys(c).filter(function (k) { return k !== 't' }); c.t.forEach(function (t, i) { var o = {}; codes.forEach(function (k) { o[k] = +c[k][i] || 0 }); fn(t, o) }) }
function normSummary(j) {
  var D = newDB(j.site && j.site.tz); setTZ(D.tz); D.gen = j.gen;
  colsEach(j.days, function (t, o) { var k = dk(t + 3 * 3600e3); D.day[k] = addInto(D.day[k], o) });
  colsEach(j.months, function (t, o) { var k = mk(t + 3 * 86400e3); D.mon[k] = addInto(D.mon[k], o) });
  if (j.socd && j.socd.t) j.socd.t.forEach(function (t, i) { D.socd[dk(t + 3 * 3600e3)] = [j.socd.v[i], j.socd.lo[i], j.socd.hi[i]] });
  if (j.soc15 && j.soc15.t) D.soc15 = j.soc15.t.map(function (t, i) { return [t, j.soc15.v[i]] });
  if (j.iv && j.iv.t) D.iv = j.iv.t.map(function (t, i) { return [t, j.iv.v[i]] });
  if (j.fc && j.fc.t && j.fc.solar_yield_forecast) D.fc = j.fc.t.map(function (t, i) { return [t, j.fc.solar_yield_forecast[i]] });
  return D;
}
function addMonth(D, j) {
  colsEach(j.hours, function (t, o) { D.hr[t] = o });
  if (j.soch && j.soch.t) j.soch.t.forEach(function (t, i) { D.socH[t] = j.soch.v[i] });
  D.loaded[j.month] = true;
}

function hex(b) { return Array.prototype.map.call(new Uint8Array(b), function (x) { return (x < 16 ? '0' : '') + x.toString(16) }).join('') }
function b64(s) { var b = atob(s), u = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u }
function keyFor(token) {
  return crypto.subtle.digest('SHA-256', new TextEncoder().encode('solarhome-history-v1:' + token)).then(function (raw) {
    return Promise.all([crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt']), crypto.subtle.digest('SHA-256', raw)]);
  }).then(function (a) { return { key: a[0], kf: hex(a[1]).slice(0, 8), token: token } });
}
function decrypt(K, j) {
  return crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64(j.iv) }, K.key, b64(j.ct)).then(function (pt) {
    if (!j.z) return pt;
    if (typeof DecompressionStream === 'undefined') throw { code: 'old' };
    return new Response(new Blob([pt]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  }).then(function (b) { return JSON.parse(new TextDecoder().decode(b)) });
}
function getJSON(name, bust) {
  return fetch(RAW + name + (bust ? '?v=' + bust : ''), { cache: 'no-store' }).then(function (r) {
    if (r.status === 404) throw { code: '404' };
    if (!r.ok) throw { code: 'http', msg: 'HTTP ' + r.status };
    return r.json();
  });
}

function loadHistory(force) {
  var cfg = A.cfg();
  if (A.isDemo() || !cfg.token) {
    if (H.mode !== 'sample') { H.db = sampleDB(); H.mode = 'sample'; H.why = 'demo'; shareSample(); refresh() }
    return;
  }
  if (H.busy || (!force && H.mode === 'ready' && H.K && H.K.token === cfg.token && Date.now() - H.at < 10 * 60e3)) return;
  if (!window.crypto || !crypto.subtle) { setFallback('old'); return }
  H.busy = true;
  var bust = Math.floor(Date.now() / 300000), cached = null;
  keyFor(cfg.token).then(function (K) {
    H.K = K;
    // show the last copy straight away, then refresh it
    try { cached = JSON.parse(ls('hist_sum') || 'null') } catch (e) { }
    if (cached && cached.kf === K.kf && (!H.db || H.db.sample)) {
      return decrypt(K, cached).then(function (s) { if (!H.db || H.db.sample) { H.db = normSummary(s); H.mode = 'ready'; H.at = 0; refresh() } }, function () { });
    }
  }).then(function () { return getJSON('status.json', bust) }).then(function (st) {
    H.status = st;
    if (!st.kf) throw { code: 'nosetup' };
    if (st.kf !== H.K.kf) throw { code: 'keymismatch' };
    if (!st.gen) throw { code: 'error', msg: st.error || 'no data yet' };
    if (H.mode === 'ready' && H.db && H.db.gen === st.gen) return null;
    return getJSON('summary.json', st.gen).then(function (j) {
      return decrypt(H.K, j).then(function (s) { try { ls('hist_sum', JSON.stringify(j)) } catch (e) { } return s });
    });
  }).then(function (s) {
    if (s) { var keep = H.db && !H.db.sample ? H.db : null; H.db = normSummary(s); if (keep) { H.db.hr = keep.hr; H.db.socH = keep.socH; H.db.loaded = {} } }
    H.mode = 'ready'; H.at = Date.now(); H.why = H.status && H.status.error ? H.status.error : '';
  }).catch(function (e) {
    var c = e && e.code;
    if (c === '404') c = 'nosetup';
    if (H.mode === 'ready' && H.db && !H.db.sample && c !== 'keymismatch' && c !== 'nosetup') { H.why = 'stale'; return }
    setFallback(c || 'error', e && e.msg);
  }).then(function () { H.busy = false; refresh() });
}
function shareSample() {
  var D = H.db, t = todayK(), y = []; if (!D || !D.sample) return;
  for (var i = 0; i <= 30; i++) { var x = D.day[addDays(t, -i)]; y.push(x ? Math.round(tot(x).solar * 10) / 10 : 0) }
  A.sampleDays = y; A.sampleSoc = D.live && D.live.soc;
}
function setFallback(code, msg) { H.mode = code; H.why = msg || ''; if (!H.db || !H.db.sample) H.db = sampleDB() }

function ensureMonth(key) {
  var D = H.db; if (!D || D.loaded[key] || D.sample) return true;
  if (H.mode !== 'ready' || H.monthBusy[key]) return false;
  if (H.status && H.status.months && H.status.months.indexOf(key) < 0) { D.loaded[key] = 'none'; return true }
  H.monthBusy[key] = 1;
  var current = key === mk(Date.now());
  getJSON('m-' + key + '.json', current ? (H.status && H.status.gen) || Math.floor(Date.now() / 300000) : H.K.kf).then(function (j) { return decrypt(H.K, j) })
    .then(function (o) { if (H.db === D) addMonth(D, o) }, function () { if (H.db === D) D.loaded[key] = 'none' })
    .then(function () { delete H.monthBusy[key]; refresh() });
  return false;
}
function monthsFor(keys) { var o = {}; keys.forEach(function (k) { o[k.slice(0, 7)] = 1 }); return Object.keys(o) }
function haveHours(keys) { var ok = true; monthsFor(keys).forEach(function (m) { if (!ensureMonth(m)) ok = false }); return ok }
function hoursOf(k) {
  var D = H.db, a = kStart(k), b = kStart(addDays(k, 1)), out = [];
  for (var t = a; t < b; t += 3600e3) out.push({ t: t, o: D.hr[t] || null });
  return out;
}
function dayTot(k) {
  var D = H.db; if (!D) return null;
  if (k === todayK() && D.loaded[k.slice(0, 7)] === true) { var o = null; hoursOf(k).forEach(function (h) { if (h.o) o = addInto(o, h.o) }); if (o) return tot(o) }
  return D.day[k] ? tot(D.day[k]) : null;
}

/* ---------------- solar forecast: weather forecast calibrated on this system's own recent days ---------------- */
var FCW = { st: 0, d: null };
function loadFC() {
  if (FCW.st === 1 || (FCW.st === 2 && Date.now() - FCW.at < 3 * 3600e3)) return;
  FCW.st = 1;
  fetch('https://api.open-meteo.com/v1/forecast?latitude=' + A.LAT + '&longitude=' + A.LON + '&daily=shortwave_radiation_sum,weather_code&past_days=31&forecast_days=3&timezone=Asia%2FBeirut')
    .then(function (r) { return r.json() }).then(function (j) { FCW.d = j.daily; FCW.st = 2; FCW.at = Date.now(); refresh() }, function () { FCW.st = 3 });
}
function mqttDaily() { var out = []; for (var k in T) { var m = k.match(/^solarcharger\/\d+\/History\/Daily\/(\d+)\/Yield$/); if (m && num(T[k]) != null) { var d = +m[1]; out[d] = (out[d] || 0) + T[k] } } return out }
function solarByDay() {
  var o = {}, t = todayK();
  if (histOK()) for (var k in H.db.day) { var x = tot(H.db.day[k]).solar; if (x > 0) o[k] = x }
  mqttDaily().forEach(function (v, i) { if (v != null) o[addDays(t, -i)] = v });
  return o;
}
function forecast() {
  if (!FCW.d || !FCW.d.time) return null;
  var D = FCW.d, y = solarByDay(), t = todayK(), R = [];
  D.time.forEach(function (k, i) { var rad = D.shortwave_radiation_sum[i]; if (k < t && y[k] > 0.3 && rad > 1.5) R.push(y[k] / rad) });
  if (R.length < 5) return null;
  R.sort(function (a, b) { return a - b }); var f = R[Math.floor(R.length * 0.6)], o = {};
  D.time.forEach(function (k, i) { if (k >= t && D.shortwave_radiation_sum[i] != null) o[k] = { kwh: f * D.shortwave_radiation_sum[i], code: D.weather_code[i] } });
  return o;
}
function wxIcon(c) { return c == null ? '' : c <= 1 ? '☀️' : c === 2 ? '⛅' : c === 3 ? '☁️' : c >= 95 ? '⛈️' : (c >= 71 && c <= 77) || c === 85 || c === 86 ? '🌨️' : c === 45 || c === 48 ? '🌫️' : '🌧️' }

/* ---------------- charts (hand-made SVG, with touch scrubbing) ---------------- */
var NS = 'http://www.w3.org/2000/svg', UID = 0, TIPS = [];
function E(n, a, p) { var e = document.createElementNS(NS, n); for (var k in a) e.setAttribute(k, a[k]); if (p) p.appendChild(e); return e }
function niceMax(v) { if (!(v > 0)) return 1; var p = Math.pow(10, Math.floor(Math.log(v) / Math.LN10)), n = v / p, st = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]; for (var i = 0; i < st.length; i++) if (n <= st[i] + 1e-9) return st[i] * p; return 10 * p }
function tl(v) { return v >= 100 ? Math.round(v).toLocaleString('en-US') : v >= 10 ? Math.round(v * 10) / 10 : parseFloat(v.toFixed(2)) }
function scrub(box, s, g, tipFn) {
  var tip = document.createElement('div'), cur = -1; tip.className = 'tip'; box.appendChild(tip);
  function show(px) {
    var i = g.idx(px); if (i < 0 || i >= g.n) return;
    if (i !== cur) { var h = tipFn(i); if (!h) return; cur = i; tip.innerHTML = h; g.hl(i) }
    tip.classList.add('on');
    var x = g.x(i), tw = tip.offsetWidth, bw = box.clientWidth; tip.style.left = Math.max(tw / 2, Math.min(bw - tw / 2, x)) + 'px';
  }
  function hide() { cur = -1; tip.classList.remove('on'); g.hl(-1) }
  function px(e) { return e.clientX - s.getBoundingClientRect().left }
  s.addEventListener('pointerdown', function (e) { show(px(e)) });
  s.addEventListener('pointermove', function (e) { if (e.pointerType === 'mouse' || e.buttons) show(px(e)) });
  s.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse') hide() });
  box.__hide = hide; TIPS.push(box);
}
document.addEventListener('pointerdown', function (e) {
  TIPS = TIPS.filter(function (b) { return document.body.contains(b) });
  TIPS.forEach(function (b) { if (!b.contains(e.target) && b.__hide) b.__hide() });
}, true);

// stacked bars: top series grow up from zero, bottom series grow down (energy stored or sent out)
function drawBars(box, o) {
  box.innerHTML = '';
  var W = box.clientWidth || 330, Hh = o.h || 180, L = 30, R = 4, Tp = 12, B = o.xl ? 20 : 6, n = o.n, top = o.top || [], bot = o.bot || [];
  function sm(a, i) { var s = 0; for (var j = 0; j < a.length; j++) s += Math.max(0, +a[j].v[i] || 0); return s }
  var mT = 0, mB = 0, i;
  for (i = 0; i < n; i++) { mT = Math.max(mT, sm(top, i) + (o.ghost ? Math.max(0, +o.ghost.v[i] || 0) : 0), o.line ? +o.line[i] || 0 : 0); mB = Math.max(mB, sm(bot, i)) }
  if (o.avg) mT = Math.max(mT, o.avg);
  var nT = niceMax(mT || 0.1), nB = mB > 0 ? niceMax(mB) : 0;
  var ph = Hh - Tp - B, k = ph / (nT + nB), y0 = Tp + nT * k, slot = (W - L - R) / n, bw = Math.max(2, Math.min(o.bw || 26, slot * (n > 40 ? 0.74 : 0.64))), rx = Math.min(3, bw / 3);
  var s = E('svg', { width: W, height: Hh, viewBox: '0 0 ' + W + ' ' + Hh });
  var hl = E('rect', { y: Tp - 4, height: ph + 8, width: slot, rx: 6, fill: 'rgba(255,255,255,.08)', opacity: 0 }, s);
  [nT, nT / 2].forEach(function (v) { var y = y0 - v * k; E('line', { x1: L, x2: W - R, y1: y, y2: y, 'class': 'ax' }, s); E('text', { x: L - 6, y: y + 3.5, 'text-anchor': 'end' }, s).textContent = tl(v) });
  if (nB) { var yb = y0 + nB * k; E('line', { x1: L, x2: W - R, y1: yb, y2: yb, 'class': 'ax' }, s); E('text', { x: L - 6, y: yb + 3.5, 'text-anchor': 'end' }, s).textContent = tl(nB) }
  for (i = 0; i < n; i++) {
    var x = L + slot * i + (slot - bw) / 2, y = y0, faded = o.fade && o.fade(i);
    top.forEach(function (sr) { var h = Math.max(0, +sr.v[i] || 0) * k; if (h < 0.4) return; y -= h; E('rect', { x: x, y: y, width: bw, height: h, rx: rx, fill: sr.c, opacity: faded ? 0.35 : 1 }, s) });
    if (o.ghost) { var gh = Math.max(0, +o.ghost.v[i] || 0) * k; if (gh > 1) E('rect', { x: x + 0.75, y: y - gh + 0.75, width: bw - 1.5, height: gh - 1.5, rx: rx, fill: o.ghost.c, 'fill-opacity': 0.13, stroke: o.ghost.c, 'stroke-opacity': 0.75, 'stroke-dasharray': '3 3' }, s) }
    var yy = y0; bot.forEach(function (sr) { var h = Math.max(0, +sr.v[i] || 0) * k; if (h < 0.4) return; E('rect', { x: x, y: yy, width: bw, height: h, rx: rx, fill: sr.c, opacity: faded ? 0.35 : 1 }, s); yy += h });
    if (o.mark === i) { E('circle', { cx: x + bw / 2, cy: y - 7, r: 2.6, fill: '#fff' }, s) }
  }
  E('line', { x1: L, x2: W - R, y1: y0, y2: y0, 'class': 'zero' }, s);
  if (o.line) {
    var d = ''; o.line.forEach(function (v, j) { if (v == null) return; d += (d ? 'L' : 'M') + (L + slot * (j + 0.5)).toFixed(1) + ' ' + (y0 - v * k).toFixed(1) });
    if (d) E('path', { d: d, fill: 'none', stroke: 'rgba(255,255,255,.75)', 'stroke-width': 1.6, 'stroke-dasharray': '4 3', 'stroke-linejoin': 'round' }, s);
  }
  if (o.avg) { var ya = y0 - o.avg * k; E('line', { x1: L, x2: W - R, y1: ya, y2: ya, stroke: 'rgba(255,255,255,.55)', 'stroke-dasharray': '4 4' }, s); E('text', { x: W - R, y: ya - 5, 'text-anchor': 'end', style: 'fill:rgba(255,255,255,.75)' }, s).textContent = o.avgLabel || 'average ' + nf(o.avg) }
  if (o.xl) for (i = 0; i < n; i++) { var lb = o.xl(i); if (lb) E('text', { x: L + slot * (i + 0.5), y: Hh - 4, 'text-anchor': 'middle' }, s).textContent = lb }
  box.appendChild(s);
  if (o.tip) scrub(box, s, { n: n, x: function (j) { return L + slot * (j + 0.5) }, idx: function (px) { return Math.floor((px - L) / slot) }, hl: function (j) { hl.setAttribute('x', L + slot * j); hl.setAttribute('opacity', j < 0 ? 0 : 1) } }, o.tip);
}
// floating bars (lowest to highest), e.g. battery level range for each day
function drawRange(box, o) {
  box.innerHTML = '';
  var W = box.clientWidth || 330, Hh = o.h || 150, L = 30, R = 4, Tp = 10, B = 20, n = o.n, ph = Hh - Tp - B, slot = (W - L - R) / n, bw = Math.max(3, Math.min(18, slot * 0.5));
  var Y = function (v) { return Tp + (1 - v / 100) * ph };
  var s = E('svg', { width: W, height: Hh, viewBox: '0 0 ' + W + ' ' + Hh });
  var hl = E('rect', { y: Tp - 4, height: ph + 8, width: slot, rx: 6, fill: 'rgba(255,255,255,.08)', opacity: 0 }, s);
  [0, 50, 100].forEach(function (v) { E('line', { x1: L, x2: W - R, y1: Y(v), y2: Y(v), 'class': 'ax' }, s); E('text', { x: L - 6, y: Y(v) + 3.5, 'text-anchor': 'end' }, s).textContent = v + '%' });
  if (o.ref) { E('line', { x1: L, x2: W - R, y1: Y(o.ref), y2: Y(o.ref), stroke: C.gen, 'stroke-dasharray': '4 4', 'stroke-opacity': 0.8 }, s) }
  for (var i = 0; i < n; i++) {
    if (o.lo[i] == null) continue;
    var x = L + slot * i + (slot - bw) / 2, y1 = Y(o.hi[i]), y2 = Y(o.lo[i]);
    E('rect', { x: x, y: y1, width: bw, height: Math.max(3, y2 - y1), rx: bw / 2, fill: 'url(#rg' + (UID + 1) + ')' }, s);
    if (o.mean && o.mean[i] != null) E('circle', { cx: x + bw / 2, cy: Y(o.mean[i]), r: 2.2, fill: '#fff' }, s);
  }
  var id = 'rg' + (++UID), df = E('defs', {}, s), lg = E('linearGradient', { id: id, x1: 0, y1: 0, x2: 0, y2: 1 }, df);
  E('stop', { offset: 0, 'stop-color': C.batt }, lg); E('stop', { offset: 1, 'stop-color': '#1f9e5c' }, lg);
  for (i = 0; i < n; i++) { var lb = o.xl(i); if (lb) E('text', { x: L + slot * (i + 0.5), y: Hh - 4, 'text-anchor': 'middle' }, s).textContent = lb }
  box.appendChild(s);
  if (o.tip) scrub(box, s, { n: n, x: function (j) { return L + slot * (j + 0.5) }, idx: function (px) { return Math.floor((px - L) / slot) }, hl: function (j) { hl.setAttribute('x', L + slot * j); hl.setAttribute('opacity', j < 0 ? 0 : 1) } }, o.tip);
}
function segs(a, gap) { var out = [], cur = []; for (var i = 0; i < a.length; i++) { if (a[i][1] == null) { if (cur.length) out.push(cur); cur = []; continue } if (cur.length && a[i][0] - cur[cur.length - 1][0] > gap) { out.push(cur); cur = [] } cur.push(a[i]) } if (cur.length) out.push(cur); return out }
// line over time (battery level), optional low-high band and a reference line
function drawLine(box, o) {
  box.innerHTML = '';
  var W = box.clientWidth || 330, Hh = o.h || 150, L = 30, R = 6, Tp = 10, B = 20, ph = Hh - Tp - B;
  var X = function (t) { return L + (t - o.x0) / (o.x1 - o.x0) * (W - L - R) }, Y = function (v) { return Tp + (1 - (v - o.min) / (o.max - o.min)) * ph };
  var s = E('svg', { width: W, height: Hh, viewBox: '0 0 ' + W + ' ' + Hh }), id = 'lg' + (++UID);
  var df = E('defs', {}, s), lg = E('linearGradient', { id: id, x1: 0, y1: 0, x2: 0, y2: 1 }, df);
  E('stop', { offset: 0, 'stop-color': o.c, 'stop-opacity': 0.32 }, lg); E('stop', { offset: 1, 'stop-color': o.c, 'stop-opacity': 0 }, lg);
  [o.min, (o.min + o.max) / 2, o.max].forEach(function (v) { var y = Y(v); E('line', { x1: L, x2: W - R, y1: y, y2: y, 'class': 'ax' }, s); E('text', { x: L - 6, y: y + 3.5, 'text-anchor': 'end' }, s).textContent = v + (o.unit || '') });
  (o.xt || []).forEach(function (a) { E('text', { x: X(a[0]), y: Hh - 4, 'text-anchor': 'middle' }, s).textContent = a[1] });
  var gap = o.gap || 3 * 3600e3;
  if (o.band && o.band.length) segs(o.band, gap).forEach(function (sg) {
    var d = ''; sg.forEach(function (p, i) { d += (i ? 'L' : 'M') + X(p[0]).toFixed(1) + ' ' + Y(p[2]).toFixed(1) });
    for (var i = sg.length - 1; i >= 0; i--) d += 'L' + X(sg[i][0]).toFixed(1) + ' ' + Y(sg[i][1]).toFixed(1);
    E('path', { d: d + 'Z', fill: o.c, 'fill-opacity': 0.17 }, s);
  });
  if (o.ref != null) { var yr = Y(o.ref); E('line', { x1: L, x2: W - R, y1: yr, y2: yr, stroke: C.gen, 'stroke-dasharray': '4 4', 'stroke-opacity': 0.85 }, s); E('text', { x: W - R, y: yr - 5, 'text-anchor': 'end', style: 'fill:' + C.gen }, s).textContent = o.refLabel || '' }
  var pts = o.pts || [];
  segs(pts, gap).forEach(function (sg) {
    var d = ''; sg.forEach(function (p, i) { d += (i ? 'L' : 'M') + X(p[0]).toFixed(1) + ' ' + Y(p[1]).toFixed(1) });
    if (sg.length > 1) E('path', { d: d + 'L' + X(sg[sg.length - 1][0]).toFixed(1) + ' ' + Y(o.min) + 'L' + X(sg[0][0]).toFixed(1) + ' ' + Y(o.min) + 'Z', fill: 'url(#' + id + ')' }, s);
    E('path', { d: d, fill: 'none', stroke: o.c, 'stroke-width': o.sw || 2.2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, s);
  });
  if (o.dot && pts.length) { var lp = pts[pts.length - 1]; E('circle', { cx: X(lp[0]), cy: Y(lp[1]), r: 7, fill: o.c, 'fill-opacity': 0.25 }, s); E('circle', { cx: X(lp[0]), cy: Y(lp[1]), r: 3.6, fill: o.c }, s) }
  var vl = E('line', { y1: Tp, y2: Tp + ph, stroke: 'rgba(255,255,255,.45)', opacity: 0 }, s), dot = E('circle', { r: 4.2, fill: '#fff', stroke: o.c, 'stroke-width': 2, opacity: 0 }, s);
  box.appendChild(s);
  if (o.tip && pts.length) scrub(box, s, {
    n: pts.length, x: function (i) { return X(pts[i][0]) },
    idx: function (px) { var b = -1, bd = 1e9; for (var i = 0; i < pts.length; i++) { var d = Math.abs(X(pts[i][0]) - px); if (d < bd) { bd = d; b = i } } return b },
    hl: function (i) { if (i < 0) { vl.setAttribute('opacity', 0); dot.setAttribute('opacity', 0); return } var x = X(pts[i][0]); vl.setAttribute('x1', x); vl.setAttribute('x2', x); vl.setAttribute('opacity', 1); dot.setAttribute('cx', x); dot.setAttribute('cy', Y(pts[i][1])); dot.setAttribute('opacity', 1) }
  }, function (i) { return o.tip(pts[i]) });
}
function ring(parts_, size, sw, center) {
  var r = (size - sw) / 2, c = 2 * Math.PI * r, off = 0, h = '<div class="ringwrap" style="width:' + size + 'px;height:' + size + 'px"><svg width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '">';
  h += '<circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" fill="none" stroke="rgba(255,255,255,.09)" stroke-width="' + sw + '"/>';
  var shown = parts_.filter(function (p) { return p[0] * c > 0.8 });
  shown.forEach(function (p) {
    var len = Math.min(1, p[0]) * c, g = shown.length > 1 ? 2.5 : 0;
    h += '<circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" fill="none" stroke="' + p[1] + '" stroke-width="' + sw + '" stroke-dasharray="' + Math.max(0.1, len - g).toFixed(2) + ' ' + c.toFixed(2) + '" stroke-dashoffset="' + (-off).toFixed(2) + '" transform="rotate(-90 ' + size / 2 + ' ' + size / 2 + ')"' + (shown.length === 1 ? ' stroke-linecap="round"' : '') + '/>';
    off += len;
  });
  return h + '</svg><div class="c">' + center + '</div></div>';
}
function drawSankey(box, t, gname) {
  box.innerHTML = '';
  var W = box.clientWidth || 330, Hh = 220, lw = Math.max(74, Math.min(96, W * 0.25)), nw = 9, gap = 12, x1 = lw, x2 = W - lw - nw;
  var Ls = [['S', 'Solar', C.solar, t.Pc + t.Pb + t.Pg], ['G', gname, C.grid, t.Gc + t.Gb], ['N', 'Generator', C.gen, t.gc + t.gb], ['B', 'Battery', C.batt, t.Bc + t.Bg]].filter(function (v) { return v[3] > 0.01 });
  var Rs = [['H', 'Home', C.home, t.Pc + t.Gc + t.Bc + t.gc], ['b', 'Battery', C.batt, t.Pb + t.Gb + t.gb], ['X', 'Sent out', C.exp, t.Pg + t.Bg]].filter(function (v) { return v[3] > 0.01 });
  var links = [['S', 'H', t.Pc], ['S', 'b', t.Pb], ['S', 'X', t.Pg], ['G', 'H', t.Gc], ['G', 'b', t.Gb], ['N', 'H', t.gc], ['N', 'b', t.gb], ['B', 'H', t.Bc], ['B', 'X', t.Bg]].filter(function (l) { return l[2] > 0.01 });
  var total = 0; Ls.forEach(function (v) { total += v[3] });
  if (!(total > 0.01)) { box.innerHTML = '<div class="note">No energy moved in this period.</div>'; return }
  var sc = Math.min((Hh - gap * (Ls.length - 1)) / total, (Hh - gap * (Rs.length - 1)) / total), N = {};
  function place(arr, x) { var used = 0; arr.forEach(function (v) { used += v[3] * sc }); used += gap * (arr.length - 1); var y = (Hh - used) / 2; arr.forEach(function (v) { N[v[0] + (x < W / 2 ? 'L' : 'R')] = { y: y, h: Math.max(2, v[3] * sc), off: 0, c: v[2], n: v[1], v: v[3] }; y += v[3] * sc + gap }) }
  place(Ls, x1); place(Rs, x2);
  var s = E('svg', { width: W, height: Hh, viewBox: '0 0 ' + W + ' ' + Hh }), df = E('defs', {}, s), xm = (x1 + nw + x2) / 2;
  links.forEach(function (l) {
    var a = N[l[0] + 'L'], b = N[l[1] + 'R'], w = l[2] * sc, sy = a.y + a.off, ty = b.y + b.off; a.off += w; b.off += w;
    var id = 'sk' + (++UID), g = E('linearGradient', { id: id, x1: 0, y1: 0, x2: 1, y2: 0 }, df);
    E('stop', { offset: 0, 'stop-color': a.c }, g); E('stop', { offset: 1, 'stop-color': b.c }, g);
    var X1 = x1 + nw, d = 'M' + X1 + ' ' + sy + 'C' + xm + ' ' + sy + ',' + xm + ' ' + ty + ',' + x2 + ' ' + ty + 'L' + x2 + ' ' + (ty + w) + 'C' + xm + ' ' + (ty + w) + ',' + xm + ' ' + (sy + w) + ',' + X1 + ' ' + (sy + w) + 'Z';
    E('path', { d: d, fill: 'url(#' + id + ')', 'fill-opacity': 0.5 }, s);
  });
  function labels(side, x, anchor) {
    var list = Object.keys(N).filter(function (k) { return k.slice(-1) === side }).map(function (k) { return N[k] });
    var lastY = -99; list.forEach(function (n) { var cy = Math.max(n.y + n.h / 2, lastY + 30); n.ly = cy; lastY = cy });
    var over = lastY + 14 - Hh; if (over > 0) list.forEach(function (n) { n.ly -= over });
    list.forEach(function (n) {
      E('rect', { x: side === 'L' ? x1 : x2, y: n.y, width: nw, height: n.h, rx: 3, fill: n.c }, s);
      E('text', { x: x, y: n.ly - 3, 'text-anchor': anchor, style: 'font-size:11.5px' }, s).textContent = n.n;
      E('text', { x: x, y: n.ly + 12, 'text-anchor': anchor, style: 'fill:#fff;font-size:13.5px;font-weight:700' }, s).textContent = nf(n.v) + ' kWh';
    });
  }
  labels('L', x1 - 8, 'end'); labels('R', x2 + nw + 8, 'start');
  box.appendChild(s);
}
function legend(items) { return '<div class="leg">' + items.filter(Boolean).map(function (i) { return '<span><i style="background:' + i[0] + '"></i>' + i[1] + '</span>' }).join('') + '</div>' }
function mixBar(parts_) { var t = 0; parts_.forEach(function (p) { t += Math.max(0, p[0]) }); if (!(t > 0)) return '<div class="mix"></div>'; return '<div class="mix">' + parts_.filter(function (p) { return p[0] / t > 0.004 }).map(function (p) { return '<b style="width:' + (p[0] / t * 100).toFixed(2) + '%;background:' + p[1] + '"></b>' }).join('') + '</div>' }
function tr(c, n, v, u) { return '<div class="tr"><span>' + (c ? '<i style="background:' + c + '"></i>' : '') + n + '</span><span>' + v + (u == null ? ' kWh' : u) + '</span></div>' }
function flowTip(title, o) {
  var t = tot(o), g = gName(), h = '<b>' + title + '</b>';
  [['Pc', 'Solar'], ['Bc', 'Battery'], ['Gc', g], ['gc', 'Generator']].forEach(function (a) { if (t[a[0]] > 0.004) h += tr(FL[a[0]].c, a[1], nf(t[a[0]])) });
  h += '<div class="tr" style="border-top:1px solid rgba(255,255,255,.14);margin-top:3px;padding-top:3px"><span>Home used</span><span>' + nf(t.home) + ' kWh</span></div>';
  if (t.bin > 0.004) h += tr(C.batt, 'Into battery', nf(t.bin));
  if (t.gout > 0.004) h += tr(C.exp, 'Sent out', nf(t.gout));
  return h;
}

/* render a list of sections, only touching the ones whose content changed (keeps charts and scroll steady) */
function sections(host, list) {
  var seen = {}, idx = 0;
  list.forEach(function (it) {
    if (!it) return;
    var k = it[0], el = null;
    for (var c = host.firstElementChild; c; c = c.nextElementSibling) if (c.getAttribute('data-k') === k) { el = c; break }
    if (!el) { el = document.createElement('div'); el.setAttribute('data-k', k) }
    if (host.children[idx] !== el) host.insertBefore(el, host.children[idx] || null);
    if (el.__h !== it[1]) { el.__h = it[1]; el.innerHTML = it[1]; if (it[2]) try { it[2](el) } catch (e) { console.log(e) } }
    seen[k] = 1; idx++;
  });
  Array.prototype.slice.call(host.children).forEach(function (c) { if (!seen[c.getAttribute('data-k')]) host.removeChild(c) });
}
function chartBox(h) { return '<div class="chart" style="height:' + (h || 180) + 'px"></div>' }
function card(title, right, body) { return '<div class="cd"><h3>' + title + (right ? '<em>' + right + '</em>' : '') + '</h3>' + body + '</div>' }
function sig(o) { return '<!--' + JSON.stringify(o).length + ':' + hashStr(JSON.stringify(o)) + '-->' }
function hashStr(s) { var h = 0; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h }

/* ---------------- shared helpers for the views ---------------- */
function gName() { return A.live.gen ? 'Generator' : 'Grid' }
function reserve() { return tv('settings/0/Settings/CGwacs/BatteryLife/MinimumSocLimit') }
function price() { var p = parseFloat(ls('kwh_price')); return p > 0 ? p : null }
function money(v) { return '$' + nf(v, v < 100 ? 2 : 0) }
function histNote() {
  if (H.mode === 'ready') return '';
  if (H.mode === 'sample' || H.mode === 'idle') return '';
  return '<div class="note" style="margin:2px 4px 12px">Today\'s charts appear here once your history is switched on.</div>';
}
function todaySoc() {
  var D = H.db, a = kStart(todayK()), pts = D.soc15.filter(function (p) { return p[0] >= a });
  if (!pts.length) for (var t in D.socH) if (+t >= a) pts.push([+t, D.socH[t]]);
  pts.sort(function (x, y) { return x[0] - y[0] });
  if (A.live.soc != null && !D.sample) pts.push([Date.now(), A.live.soc]);
  return pts;
}
function dayTicks(a) { return [0, 6, 12, 18].map(function (h) { return [a + h * 3600e3, pad(h) + ':00'] }).concat([[a + 24 * 3600e3 - 1, '']]) }
function last7() { var t = todayK(), o = []; for (var i = 6; i >= 0; i--) o.push(addDays(t, -i)); return o }
function gridCells(k) {
  // grid availability for one day: from the grid voltage (every 15 min) when we have it, else from hours with grid energy
  var D = H.db, a = kStart(k), b = kStart(addDays(k, 1)), now = Date.now(), cells = [], on = 0, known = 0, src = 'none';
  if (D.iv && D.iv.length && D.iv[0][0] <= a + 900e3) {
    var m = {}; D.iv.forEach(function (p) { if (p[0] >= a && p[0] < b && p[0] <= now) m[Math.floor((p[0] - a) / 900e3)] = p[1] });
    for (var i = 0; i < Math.round((b - a) / 900e3); i++) { var t = a + i * 900e3, v = m[i]; if (t > now || v == null) cells.push(null); else { var g = v > 150; cells.push(g); known++; if (g) on++ } }
    if (known) { src = 'voltage'; return { cells: cells, min: on * 15, src: src } }
    cells = [];
  }
  if (!D.loaded[k.slice(0, 7)] || D.loaded[k.slice(0, 7)] === 'none') return null;
  hoursOf(k).forEach(function (h) { if (h.t > now || !h.o) { cells.push(null); return } var g = (h.o.Gc || 0) + (h.o.Gb || 0) > 0.03; cells.push(g); known++; if (g) on++ });
  return known ? { cells: cells, min: on * 60, src: 'energy' } : null;
}
function stripHTML(gc, live) {
  if (!gc) return '';
  var cells = gc.cells.slice();
  if (live != null) { var first = cells.indexOf(null); if (first > 0) cells[first - 1] = live }
  return '<div class="strip">' + cells.map(function (c) { return '<b style="background:' + (c == null ? 'transparent' : c ? '#6fe3a2' : 'rgba(255,159,67,.55)') + '"></b>' }).join('') + '</div><div class="strip-l"><span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>24:00</span></div>';
}
function gridSince() {
  // when did the grid go off? remembered while the page is open; otherwise the last time history saw grid power
  var st = ls('gridState').split('|'), D = H.db;
  if (st[0] === 'off' && st[2] === 'seen') return { t: +st[1], exact: true };
  if (histOK()) {
    var now = Date.now();
    if (D.iv && D.iv.length) { for (var i = D.iv.length - 1; i >= 0; i--) if (D.iv[i][0] < now && D.iv[i][1] > 150) return { t: Math.min(now, D.iv[i][0] + 900e3), exact: false } }
    var ts = Object.keys(D.hr).map(Number).filter(function (x) { return x < now }).sort(function (a, b) { return b - a });
    for (var j = 0; j < ts.length && j < 72; j++) { var o = D.hr[ts[j]]; if (o && (o.Gc || 0) + (o.Gb || 0) > 0.03) return { t: Math.min(now, ts[j] + 3600e3), exact: false } }
  }
  return null;
}
function nextSunrise() {
  var t = Date.now(); for (var i = 0; i < 300; i++) { t += 5 * 60e3; if (A.sunPos(new Date(t)).el > -0.83) return t } return null;
}
function stateName(svc, v) {
  if (v == null) return '';
  if (svc === 'solarcharger') return ({ 0: 'Off', 2: 'Fault', 3: 'Charging', 4: 'Topping up', 5: 'Battery full', 6: 'Storage', 7: 'Equalising', 11: 'Running', 245: 'Starting', 252: 'Managed by system' })[v] || 'State ' + v;
  return ({ 0: 'Off', 1: 'Low power', 2: 'Fault', 3: 'Charging', 4: 'Topping up', 5: 'Battery full', 6: 'Storage', 7: 'Equalising', 8: 'Passing through', 9: 'Inverting', 10: 'Assisting', 11: 'Power supply', 244: 'Sustain', 252: 'Managed by system' })[v] || 'State ' + v;
}
function nm(svc, i, fallback) { return T[svc + '/' + i + '/CustomName'] || T[svc + '/' + i + '/ProductName'] || fallback }
function phases(prefix) { var o = []; ['L1', 'L2', 'L3'].forEach(function (l) { var v = tv(prefix + '/' + l + '/Power'); if (v != null) o.push([l, v]) }); return o }

/* ---------------- detail sheets ---------------- */
function solarSheet() {
  var L = A.live, pv = L.pv || 0, out = [], chg = insts('solarcharger'), inv = insts('pvinverter'), mp = [], best = 0;
  for (var k in T) { var m = k.match(/^solarcharger\/\d+\/History\/Daily\/(\d+)\/MaxPower$/); if (m && num(T[k]) != null) mp[+m[1]] = (mp[+m[1]] || 0) + T[k] }
  mp.forEach(function (v) { if (v > best) best = v });
  var sp = A.sunPos(new Date()), pct = best > 100 ? Math.min(100, pv / best * 100) : null, lead;
  var full = chg.some(function (i) { var s = tv('solarcharger/' + i + '/State'); return s === 5 || s === 4 }) && (L.soc || 0) >= 97;
  if (sp.el < -0.5) { var nr = nextSunrise(); lead = 'The sun is down' + (nr ? ' — it rises at ' + hm(nr) : '') }
  else if (pv < 40) lead = 'Hardly any power yet';
  else if (full) lead = 'The battery is full, so the panels are only making what the house is using';
  else if (A.WX.cloud > 65) lead = 'Clouds are holding the panels back';
  else if (pct != null && pct >= 80) lead = 'Producing strongly — close to your best this month';
  else lead = 'Producing' + (pct != null ? ' ' + Math.round(pct) + '% of your best this month' : '');
  out.push(['hero', '<div class="cd"><div class="hero2"><div class="tx"><div class="big">' + kW(pv) + '<small>kW</small></div><div class="lead">' + lead + '</div></div>' +
    ring([[pct == null ? 0 : pct / 100, C.solar]], 100, 10, '<b>' + (pct == null ? '–' : Math.round(pct) + '%') + '</b><span>of your<br>best</span>') + '</div></div>']);

  var f = forecast(), t = todayK(), td = histOK() ? dayTot(t) : null, yd = L.yieldToday != null ? L.yieldToday : td ? td.solar : null;
  var kv = '<div class="kv"><div><span>So far today</span><b>' + nf(yd) + '<small>kWh</small></b></div><div><span>Peak today</span><b>' + (mp[0] != null ? nf(mp[0] / 1000, 1) : '–') + '<small>kW</small></b></div>';
  if (f && f[t]) kv += '<div><span>Expected today</span><b>' + nf(Math.max(f[t].kwh, yd || 0)) + '<small>kWh</small></b><p>' + wxIcon(f[t].code) + ' from the forecast</p></div>';
  var tm = addDays(t, 1); if (f && f[tm]) kv += '<div><span>Tomorrow</span><b>' + nf(f[tm].kwh) + '<small>kWh</small></b><p>' + wxIcon(f[tm].code) + ' expected</p></div>';
  out.push(['today', card('Today', '', kv + '</div>' + (f ? '<div class="note" style="margin-top:10px">Expected figures combine the weather forecast with what your panels made on recent days.</div>' : ''))]);

  if (histOK()) {
    if (haveHours([t])) {
      var hrs = hoursOf(t), now = Date.now(), fc = {};
      (H.db.fc || []).forEach(function (p) { fc[p[0]] = p[1] / 1000 });
      var v = hrs.map(function (h) { return h.o ? tot(h.o).solar : 0 }), gv = hrs.map(function (h) { return h.t + 3600e3 > now && fc[h.t] ? Math.max(0, fc[h.t] - (h.o ? tot(h.o).solar : 0)) : 0 });
      var peak = 0, pi = -1; v.forEach(function (x, i) { if (x > peak) { peak = x; pi = i } });
      var S = { v: v, g: gv };
      out.push(['hourly', card('Hour by hour', nf(td ? td.solar : null) + ' kWh', chartBox(170) + legend([[C.solar, 'Made'], gv.some(function (x) { return x > 0 }) ? ['rgba(255,210,74,.35)', 'Expected for the rest of today'] : null]) +
        (pi >= 0 ? '<div class="note" style="margin-top:8px">Best hour so far: <b>' + pad(pi) + ':00–' + pad(pi + 1) + ':00</b>, ' + nf(peak) + ' kWh</div>' : '')) + sig(S), function (el) {
        drawBars(el.querySelector('.chart'), { n: v.length, h: 170, top: [{ c: C.solar, v: v }], ghost: { c: C.solar, v: gv }, xl: function (i) { return i % 6 === 0 ? pad(i) : '' }, tip: function (i) { return '<b>' + pad(i) + ':00–' + pad(i + 1) + ':00</b>' + tr(C.solar, 'Made', nf(v[i])) + (gv[i] > 0.01 ? tr('rgba(255,210,74,.4)', 'Expected', nf(gv[i] + v[i])) : '') } });
      }]);
    } else out.push(['hourly', card('Hour by hour', '', '<div class="spin">Loading</div>')]);
    if (td && td.solar > 0.05) {
      out.push(['went', card('Where today\'s sunshine went', '', mixBar([[td.Pc, C.solar], [td.Pb, C.batt], [td.Pg, C.exp]]) +
        legend([[C.solar, 'Home ' + nf(td.Pc) + ' kWh'], [C.batt, 'Battery ' + nf(td.Pb) + ' kWh'], td.Pg > 0.01 ? [C.exp, 'Sent out ' + nf(td.Pg) + ' kWh'] : null]))]);
    }
  } else { var hn = histNote(); if (hn) out.push(['hn', hn]) }

  var d30 = mqttDaily(), days = [];
  if (d30.length > 3) { for (var i = Math.min(30, d30.length - 1); i >= 0; i--) days.push([addDays(t, -i), d30[i] || 0]) }
  else if (histOK()) { for (i = 29; i >= 0; i--) { var kk = addDays(t, -i), dt = dayTot(kk); days.push([kk, dt ? dt.solar : 0]) } }
  if (days.length > 3) {
    var past = days.slice(0, -1).filter(function (d) { return d[1] > 0 }), avg = 0, bi = 0;
    past.forEach(function (d) { avg += d[1] }); avg = past.length ? avg / past.length : 0;
    days.forEach(function (d, j) { if (d[1] > days[bi][1]) bi = j });
    out.push(['d30', card('Last ' + days.length + ' days', 'best ' + nf(days[bi][1]) + ' kWh', chartBox(160) + '<div class="note" style="margin-top:8px">Your best day was <b>' + dLabel(days[bi][0]) + '</b>. A typical day makes about <b>' + nf(avg) + ' kWh</b>.</div>') + sig(days), function (el) {
      drawBars(el.querySelector('.chart'), { n: days.length, h: 160, top: [{ c: C.solar, v: days.map(function (d) { return d[1] }) }], avg: avg, avgLabel: 'typical ' + nf(avg), mark: bi,
        xl: function (j) { return (days.length - 1 - j) % 7 === 0 ? kp(days[j][0]).d + '' : '' }, tip: function (j) { return '<b>' + dLabel(days[j][0]) + '</b>' + tr(C.solar, 'Solar', nf(days[j][1])) } });
    }]);
  }

  var rows = '';
  chg.forEach(function (i) {
    var pw = tv('solarcharger/' + i + '/Yield/Power'), pvv = tv('solarcharger/' + i + '/Pv/V'), st = tv('solarcharger/' + i + '/State'), y0 = tv('solarcharger/' + i + '/History/Daily/0/Yield');
    rows += '<div class="r"><div class="n"><b>' + esc(nm('solarcharger', i, 'Solar charger')) + '</b><span>' + (pvv == null ? '' : pvv > 5 ? 'Panels at ' + nf(pvv, 0) + ' V' : 'Panels asleep') + '</span><br><span class="badge">' + stateName('solarcharger', st) + '</span></div>' +
      '<div class="v"><b>' + kW(pw) + ' kW</b><span>' + (y0 != null ? nf(y0) + ' kWh today' : '') + '</span></div></div>';
  });
  inv.forEach(function (i) {
    var pw = tv('pvinverter/' + i + '/Ac/Power');
    rows += '<div class="r"><div class="n"><b>' + esc(nm('pvinverter', i, 'Solar inverter')) + '</b><span>On the AC side</span></div><div class="v"><b>' + kW(pw) + ' kW</b></div></div>';
  });
  if (rows) out.push(['chg', card(chg.length + inv.length > 1 ? 'Your solar chargers' : 'Your solar charger', '', '<div class="rows">' + rows + '</div>')]);
  var life = sumT(/^solarcharger\/\d+\/Yield\/User$/), lifeI = sumT(/^pvinverter\/\d+\/Ac\/Energy\/Forward$/);
  if (life != null || lifeI != null) out.push(['life', '<div class="note" style="text-align:center;margin:2px 0 12px">Since installation your panels have made <b>' + mwh((life || 0) + (lifeI || 0)) + '</b></div>']);
  out.push(['go', '<button class="link" data-hist="solar">Solar history</button>']);
  return out;
}

function gridSheet() {
  var L = A.live, g = L.grid, off = L.gridOff, n = gName(), lc = n.toLowerCase(), out = [], lead, imp = g > 40, exp = g < -40;
  if (off) lead = 'No ' + lc + ' power right now. Your home is running on ' + ((L.pv || 0) > 80 ? 'solar and ' : '') + 'the battery.';
  else if (imp) lead = 'Your home is taking ' + kW(g) + ' kW from the ' + lc + ((L.bp || 0) > 40 ? ', partly to charge the battery' : '') + '.';
  else if (exp) lead = 'Sending ' + kW(-g) + ' kW of spare power out to the ' + lc + '.';
  else if (g == null) lead = 'Waiting for live numbers from your system…';
  else lead = 'Connected, but your home isn\'t using any ' + lc + ' power right now.';
  out.push(['hero', '<div class="cd"><div class="big">' + (off ? 'Off' : kW(g) + '<small>kW</small>') + '</div><div class="lead">' + lead + '</div>' +
    (g == null && off == null ? '' : '<span class="chip" style="color:' + (off ? C.gen : '#6fe3a2') + '"><i></i>' + (off ? n + ' is off' : n + ' is available') + '</span>') + '</div>']);
  if (off) {
    var since = gridSince();
    if (since) out.push(['since', card('Outage', '', '<div class="kv"><div><span>Off since</span><b>' + (since.exact ? '' : '~') + hm(since.t) + '</b></div><div><span>So far</span><b>' + dur(Math.max(0, Date.now() - since.t) / 60000) + '</b></div></div>' +
      (L.ttg ? '<div class="note" style="margin-top:10px">At the current rate the battery lasts about <b>' + dur(L.ttg / 60) + '</b>.</div>' : ''))]);
  }
  if (histOK()) {
    var t = todayK(), gc = haveHours([t]) ? gridCells(t) : null;
    if (gc) out.push(['avail', card(gc.src === 'voltage' ? n + ' availability today' : 'Hours you used ' + lc + ' power today', dur(gc.min), stripHTML(gc, off == null ? null : !off) +
      legend([['#6fe3a2', gc.src === 'voltage' ? 'Available' : 'Used'], ['rgba(255,159,67,.55)', gc.src === 'voltage' ? 'Off' : 'Not used']]))]);
  }
  var vin = null, fq = null, lim = null, vout = null;
  insts('vebus').forEach(function (i) { var p = 'vebus/' + i + '/Ac/'; if (vin == null) vin = tv(p + 'ActiveIn/L1/V'); if (fq == null) fq = tv(p + 'ActiveIn/L1/F'); if (lim == null) lim = tv(p + 'ActiveIn/CurrentLimit'); if (vout == null) vout = tv(p + 'Out/L1/V') });
  insts('grid').forEach(function (i) { if (vin == null) vin = tv('grid/' + i + '/Ac/L1/Voltage'); if (fq == null) fq = tv('grid/' + i + '/Ac/Frequency') });
  var kv = '';
  if (vin != null) kv += '<div><span>' + n + ' voltage</span><b>' + (off || vin < 50 ? '–' : nf(vin, 0) + '<small>V</small>') + '</b></div>';
  if (fq != null) kv += '<div><span>Frequency</span><b>' + (off || fq < 5 ? '–' : nf(fq, 1) + '<small>Hz</small>') + '</b></div>';
  if (vout != null) kv += '<div><span>Your home\'s voltage</span><b>' + nf(vout, 0) + '<small>V</small></b></div>';
  if (lim != null) kv += '<div><span>Input limit</span><b>' + nf(lim, 0) + '<small>A</small></b><p>most the system will draw</p></div>';
  var ph = phases('system/0/Ac/Grid'); if (ph.length > 1) ph.forEach(function (p) { kv += '<div><span>Phase ' + p[0].slice(1) + '</span><b>' + kW(p[1]) + '<small>kW</small></b></div>' });
  if (kv) out.push(['live', card('Right now', '', '<div class="kv">' + kv + '</div>')]);
  if (histOK()) {
    var td = dayTot(t), pr = price();
    if (td) out.push(['today', card('Today', '', '<div class="kv"><div><span>Bought</span><b>' + nf(td.gin) + '<small>kWh</small></b>' + (td.Gb > 0.05 ? '<p>' + nf(td.Gb) + ' kWh of it went into the battery</p>' : '') + '</div>' +
      (td.gout > 0.01 ? '<div><span>Sent out</span><b>' + nf(td.gout) + '<small>kWh</small></b></div>' : '<div><span>Cost</span><b>' + (pr ? money(td.gin * pr) : '–') + '</b>' + (pr ? '' : '<p>set your price in History</p>') + '</div>') + '</div>')]);
    if (haveHours([t])) {
      var hrs = hoursOf(t), S = hrs.map(function (h) { return h.o ? [h.o.Gc || 0, h.o.Gb || 0, h.o.Pg || 0, h.o.Bg || 0] : [0, 0, 0, 0] });
      out.push(['hourly', card('Hour by hour', '', chartBox(160) + legend([[C.grid, 'To home'], [FL.Gb.c, 'To battery'], S.some(function (x) { return x[2] + x[3] > 0 }) ? [C.exp, 'Sent out'] : null])) + sig(S), function (el) {
        drawBars(el.querySelector('.chart'), { n: S.length, h: 160, top: [{ c: C.grid, v: S.map(function (x) { return x[0] }) }, { c: FL.Gb.c, v: S.map(function (x) { return x[1] }) }], bot: [{ c: C.exp, v: S.map(function (x) { return x[2] + x[3] }) }],
          xl: function (i) { return i % 6 === 0 ? pad(i) : '' }, tip: function (i) { return '<b>' + pad(i) + ':00–' + pad(i + 1) + ':00</b>' + tr(C.grid, 'To home', nf(S[i][0])) + tr(FL.Gb.c, 'To battery', nf(S[i][1])) + (S[i][2] + S[i][3] > 0 ? tr(C.exp, 'Sent out', nf(S[i][2] + S[i][3])) : '') } });
      }]);
    }
    var w = last7().map(function (k) { var x = dayTot(k); return [k, x ? x.gin : 0] });
    out.push(['week', card('Bought, last 7 days', nf(w.reduce(function (a, b) { return a + b[1] }, 0)) + ' kWh', chartBox(140)) + sig(w), function (el) {
      drawBars(el.querySelector('.chart'), { n: 7, h: 140, top: [{ c: C.grid, v: w.map(function (x) { return x[1] }) }], xl: function (i) { return wd(w[i][0]) }, tip: function (i) { return '<b>' + dLabel(w[i][0]) + '</b>' + tr(C.grid, 'Bought', nf(w[i][1])) + (pr ? tr('', 'Cost', money(w[i][1] * pr), '') : '') } });
    }]);
  } else { var hn = histNote(); if (hn) out.push(['hn', hn]) }
  var fw = sumT(/^grid\/\d+\/Ac\/Energy\/Forward$/), rv = sumT(/^grid\/\d+\/Ac\/Energy\/Reverse$/);
  if (fw != null) out.push(['meter', '<div class="note" style="text-align:center;margin:2px 0 12px">Your meter has counted <b>' + mwh(fw) + '</b> bought' + (rv ? ' and <b>' + mwh(rv) + '</b> sent out' : '') + '</div>']);
  out.push(['go', '<button class="link" data-hist="grid">' + n + ' history</button>']);
  return out;
}

function battSheet() {
  var L = A.live, soc = L.soc, bp = L.bp || 0, out = [], res = reserve(), bi = insts('battery')[0];
  var V = tv('system/0/Dc/Battery/Voltage'), I = tv('system/0/Dc/Battery/Current'), temp = tv('system/0/Dc/Battery/Temperature');
  var capAh = bi != null ? tv('battery/' + bi + '/InstalledCapacity') : null, capK = capAh && V ? capAh * V / 1000 : null;
  if (temp == null && bi != null) temp = tv('battery/' + bi + '/Dc/0/Temperature');
  var stt = bp > 40 ? 'Charging' : bp < -40 ? 'Supplying your home' : 'Resting', lead;
  if (bp > 40 && capK && soc != null && soc < 99) lead = 'Full in about ' + dur((100 - soc) / 100 * capK / (bp / 1000) * 60 * 1.12);
  else if (bp > 40) lead = 'Topping up';
  else if (bp < -40 && L.ttg) lead = 'Lasts about ' + dur(L.ttg / 60) + ' at this rate';
  else if (bp < -40 && capK && soc != null) lead = 'Lasts about ' + dur(Math.max(0, soc - (res || 0)) / 100 * capK / (-bp / 1000) * 60) + (res ? ' until the ' + res + '% reserve' : '') + ' at this rate';
  else lead = soc >= 99 ? 'Full and ready' : 'Holding steady';
  out.push(['hero', '<div class="cd"><div class="hero2">' + ring([[soc == null ? 0 : soc / 100, C.batt]], 118, 12, '<b>' + (soc == null ? '–' : Math.round(soc) + '%') + '</b><span>charged</span>') +
    '<div class="tx"><div style="font-size:15px;font-weight:650;color:' + (bp > 40 ? C.batt : bp < -40 ? C.home : 'var(--ink-2)') + '">' + stt + '</div><div class="big" style="font-size:38px;margin-top:4px">' + kW(bp) + '<small>kW</small></div><div class="lead">' + lead + '</div></div></div>' +
    (capK && soc != null ? '<div class="note" style="margin-top:12px">About <b>' + nf(soc / 100 * capK) + ' kWh</b> stored of ' + nf(capK, 0) + ' kWh' + (res ? '. ' + res + '% is kept in reserve for outages.' : '.') + '</div>' : '') + '</div>']);
  if (histOK()) {
    var pts = todaySoc(), a = kStart(todayK());
    if (pts.length > 1) out.push(['soc', card('Battery level today', '', chartBox(150)) + sig(pts.length + ':' + Math.round(pts[pts.length - 1][1])), function (el) {
      drawLine(el.querySelector('.chart'), { x0: a, x1: a + 24 * 3600e3, pts: pts, min: 0, max: 100, unit: '%', c: C.batt, ref: res, refLabel: res ? 'reserve ' + res + '%' : '', xt: dayTicks(a), dot: true, gap: 2 * 3600e3,
        tip: function (p) { return '<b>' + hm(p[0]) + '</b>' + tr(C.batt, 'Charged', nf(p[1], 0), '%') } });
    }]);
    var td = dayTot(todayK());
    if (td) out.push(['today', card('Today', '', '<div class="kv"><div><span>Charged</span><b>' + nf(td.bin) + '<small>kWh</small></b><p>' + (td.bin > 0.05 ? Math.round(td.Pb / td.bin * 100) + '% from solar' : '') + '</p></div><div><span>Used</span><b>' + nf(td.bout) + '<small>kWh</small></b><p>' + (td.home > 0.1 ? Math.round(td.Bc / td.home * 100) + '% of your home\'s power' : '') + '</p></div></div>')]);
    var w = last7().map(function (k) { return [k, H.db.socd[k] || null] });
    if (w.some(function (x) { return x[1] })) out.push(['range', card('Lowest and highest, last 7 days', '', chartBox(150)) + sig(w), function (el) {
      drawRange(el.querySelector('.chart'), { n: 7, lo: w.map(function (x) { return x[1] ? x[1][1] : null }), hi: w.map(function (x) { return x[1] ? x[1][2] : null }), mean: w.map(function (x) { return x[1] ? x[1][0] : null }), ref: res,
        xl: function (i) { return wd(w[i][0]) }, tip: function (i) { var x = w[i][1]; return x ? '<b>' + dLabel(w[i][0]) + '</b>' + tr('', 'Lowest', nf(x[1], 0), '%') + tr('', 'Highest', nf(x[2], 0), '%') + tr('', 'Average', nf(x[0], 0), '%') : '' } });
    }]);
  } else { var hn = histNote(); if (hn) out.push(['hn', hn]) }
  var kv = '';
  if (V != null) kv += '<div><span>Voltage</span><b>' + nf(V, 1) + '<small>V</small></b></div>';
  if (I != null) kv += '<div><span>Current</span><b>' + nf(I, 1) + '<small>A</small></b></div>';
  if (temp != null) kv += '<div><span>Temperature</span><b>' + nf(temp, 0) + '<small>°C</small></b></div>';
  if (bi != null) {
    var soh = tv('battery/' + bi + '/Soh'), cyc = tv('battery/' + bi + '/History/ChargeCycles'), mn = tv('battery/' + bi + '/System/MinCellVoltage'), mx = tv('battery/' + bi + '/System/MaxCellVoltage');
    if (soh != null) kv += '<div><span>Health</span><b>' + nf(soh, 0) + '<small>%</small></b><p>of its original capacity</p></div>';
    if (cyc != null) kv += '<div><span>Charge cycles</span><b>' + nf(cyc, 0) + '</b></div>';
    if (mn != null && mx != null) kv += '<div><span>Cell balance</span><b>' + nf((mx - mn) * 1000, 0) + '<small>mV</small></b><p>' + ((mx - mn) < 0.05 ? 'cells are well balanced' : 'cells are drifting apart') + '</p></div>';
  }
  if (capK) kv += '<div><span>Size</span><b>' + nf(capK, 0) + '<small>kWh</small></b></div>';
  if (kv) out.push(['live', card('Details', bi != null ? esc(nm('battery', bi, '')) : '', '<div class="kv">' + kv + '</div>')]);
  out.push(['go', '<button class="link" data-hist="batt">Battery history</button>']);
  return out;
}

function homeSheet() {
  var L = A.live, load = Math.max(0, L.load || 0), out = [], gin = Math.max(0, L.grid || 0), dis = Math.max(0, -(L.bp || 0));
  var fg = Math.min(gin, load), fb = Math.min(dis, load - fg), fs = Math.max(0, load - fg - fb), n = gName();
  var top = Math.max(fs, fb, fg), lead = load < 40 ? 'Almost nothing is switched on' : top === fs ? 'Mostly running on sunshine' : top === fb ? 'Mostly running on the battery' : 'Mostly running on ' + n.toLowerCase() + ' power';
  out.push(['hero', '<div class="cd"><div class="big">' + kW(load) + '<small>kW</small></div><div class="lead">' + lead + ' right now.</div><div style="margin-top:14px">' + mixBar([[fs, C.solar], [fb, C.batt], [fg, C.grid]]) + '</div>' +
    legend([fs > 5 ? [C.solar, 'Solar ' + kW(fs) + ' kW'] : null, fb > 5 ? [C.batt, 'Battery ' + kW(fb) + ' kW'] : null, fg > 5 ? [C.grid, n + ' ' + kW(fg) + ' kW'] : null]) + '</div>']);
  var outP = phases('system/0/Ac/ConsumptionOnOutput'), inP = phases('system/0/Ac/ConsumptionOnInput'), oT = 0, iT = 0;
  outP.forEach(function (p) { oT += p[1] }); inP.forEach(function (p) { iT += p[1] });
  if (outP.length && inP.length && oT + iT > 0) out.push(['circ', card('Your circuits', '', '<div class="kv"><div><span>Backed up</span><b>' + kW(oT) + '<small>kW</small></b><p>keep running in an outage</p></div><div><span>Not backed up</span><b>' + kW(iT) + '<small>kW</small></b><p>only when the ' + n.toLowerCase() + ' is on</p></div></div>')]);
  var ph = phases('system/0/Ac/Consumption'); if (ph.length > 1) out.push(['ph', card('By phase', '', '<div class="kv k3">' + ph.map(function (p) { return '<div><span>Phase ' + p[0].slice(1) + '</span><b>' + kW(p[1]) + '<small>kW</small></b></div>' }).join('') + '</div>')]);
  if (histOK()) {
    var t = todayK(), td = dayTot(t), sv = [], have = haveHours(last7().concat([addDays(t, -7)]));
    if (have) {
      var hrs = hoursOf(t), now = parts(Date.now()), typ = [], cnt = [];
      for (var d = 1; d <= 7; d++) hoursOf(addDays(t, -d)).forEach(function (h) { if (!h.o) return; var hh = parts(h.t).h; typ[hh] = (typ[hh] || 0) + tot(h.o).home; cnt[hh] = (cnt[hh] || 0) + 1 });
      typ = typ.map(function (v, i) { return cnt[i] ? v / cnt[i] : null });
      var S = hrs.map(function (h) { return h.o ? [h.o.Pc || 0, h.o.Bc || 0, (h.o.Gc || 0) + (h.o.gc || 0)] : [0, 0, 0] });
      var soFar = 0, typSoFar = 0; S.forEach(function (x, i) { if (i < now.h) { soFar += x[0] + x[1] + x[2]; typSoFar += typ[i] || 0 } });
      var peakH = -1, pk = 0; typ.forEach(function (v, i) { if (v > pk) { pk = v; peakH = i } });
      if (td) {
        var cmp = typSoFar > 0.5 ? Math.round((soFar - typSoFar) / typSoFar * 100) : null;
        out.push(['today', card('Today', '', '<div class="kv"><div><span>Used</span><b>' + nf(td.home) + '<small>kWh</small></b>' + (cmp != null ? '<p>' + (Math.abs(cmp) < 5 ? 'about usual for this time' : Math.abs(cmp) + '% ' + (cmp > 0 ? 'more' : 'less') + ' than usual by now') + '</p>' : '') + '</div>' +
          '<div><span>Self-powered</span><b>' + nf(td.self, 0) + '<small>%</small></b><p>from solar and battery</p></div></div>' +
          (peakH >= 0 ? '<div class="note" style="margin-top:10px">Your home usually uses the most around <b>' + pad(peakH) + ':00</b>.</div>' : ''))]);
      }
      out.push(['hourly', card('Hour by hour', '', chartBox(170) + legend([[C.solar, 'Solar'], [C.batt, 'Battery'], [C.grid, n], ['rgba(255,255,255,.75)', 'Usual day (dashed)']])) + sig([S, typ]), function (el) {
        drawBars(el.querySelector('.chart'), { n: S.length, h: 170, top: [{ c: C.solar, v: S.map(function (x) { return x[0] }) }, { c: C.batt, v: S.map(function (x) { return x[1] }) }, { c: C.grid, v: S.map(function (x) { return x[2] }) }], line: typ,
          xl: function (i) { return i % 6 === 0 ? pad(i) : '' }, tip: function (i) { return '<b>' + pad(i) + ':00–' + pad(i + 1) + ':00</b>' + tr(C.solar, 'Solar', nf(S[i][0])) + tr(C.batt, 'Battery', nf(S[i][1])) + tr(C.grid, n, nf(S[i][2])) + (typ[i] != null ? tr('', 'Usual', nf(typ[i])) : '') } });
      }]);
    } else out.push(['hourly', card('Hour by hour', '', '<div class="spin">Loading</div>')]);
    var w = last7().map(function (k) { var x = dayTot(k); return [k, x] });
    out.push(['week', card('Last 7 days', nf(w.reduce(function (a, b) { return a + (b[1] ? b[1].home : 0) }, 0)) + ' kWh', chartBox(150)) + sig(w.map(function (x) { return x[1] && x[1].home })), function (el) {
      var f = function (c) { return w.map(function (x) { return x[1] ? x[1][c] : 0 }) };
      drawBars(el.querySelector('.chart'), { n: 7, h: 150, top: [{ c: C.solar, v: f('Pc') }, { c: C.batt, v: f('Bc') }, { c: C.grid, v: f('Gc') }], xl: function (i) { return wd(w[i][0]) }, tip: function (i) { return w[i][1] ? flowTip(dLabel(w[i][0]), H.db.day[w[i][0]]) : '' } });
    }]);
  } else { var hn = histNote(); if (hn) out.push(['hn', hn]) }
  out.push(['go', '<button class="link" data-hist="home">Home history</button>']);
  return out;
}

/* ---------------- sheet + history views, with the phone's back gesture ---------------- */
var STACK = [];
function pushView(close) { STACK.push(close); try { history.pushState({ solarView: STACK.length }, '') } catch (e) { } document.documentElement.classList.add('lock') }
window.addEventListener('popstate', function () { var c = STACK.pop(); if (c) c(); if (!STACK.length) document.documentElement.classList.remove('lock') });
function popView() { if (STACK.length) history.back() }
function div(cls, html) { var d = document.createElement('div'); d.className = cls; if (html) d.innerHTML = html; return d }
var X_SVG = '<svg viewBox="0 0 14 14"><path d="M2 2l10 10M12 2L2 12"/></svg>';
var OV = div('ov', '<div class="ds" role="dialog" aria-modal="true"><div class="ds-top"><div class="grab"></div><div class="ds-h"><div class="ds-t"></div><button class="xb" aria-label="Close">' + X_SVG + '</button></div></div><div class="ds-b"></div></div>');
document.body.appendChild(OV);
var DS = OV.querySelector('.ds'), DSB = OV.querySelector('.ds-b'), DST = OV.querySelector('.ds-t'), CUR = null;
var SHEETS = { solar: ['Solar', C.solar, solarSheet], grid: ['Grid', C.grid, gridSheet], batt: ['Battery', C.batt, battSheet], home: ['Home', C.home, homeSheet] };
OV.addEventListener('click', function (e) { if (e.target === OV) popView(); var h = e.target.closest && e.target.closest('[data-hist]'); if (h) openHistory(h.getAttribute('data-hist')) });
OV.querySelector('.xb').onclick = popView;
(function () {
  var top = OV.querySelector('.ds-top'), sy = null, dy = 0;
  top.addEventListener('touchstart', function (e) { sy = e.touches[0].clientY; dy = 0; DS.classList.add('drag') }, { passive: true });
  top.addEventListener('touchmove', function (e) { if (sy == null) return; dy = Math.max(0, e.touches[0].clientY - sy); DS.style.transform = 'translateY(' + dy + 'px)' }, { passive: true });
  top.addEventListener('touchend', function () { DS.classList.remove('drag'); DS.style.transform = ''; if (dy > 90) popView(); sy = null });
})();
function openSheet(k) {
  if (!SHEETS[k]) return;
  var was = CUR; CUR = k;
  if (was !== k) DSB.innerHTML = '';
  if (!was) { DSB.scrollTop = 0; OV.classList.add('on'); pushView(function () { OV.classList.remove('on'); CUR = null; setTimeout(function () { if (!CUR) DSB.innerHTML = '' }, 420) }) }
  loadHistory(); loadFC(); renderSheet();
}
function renderSheet() {
  if (!CUR) return; var s = SHEETS[CUR], name = CUR === 'grid' ? gName() : s[0], col = CUR === 'grid' && A.live.gen ? C.gen : s[1];
  DST.innerHTML = '<i style="color:' + col + '"></i>' + name;
  sections(DSB, s[2]());
}

var HV = div('hv', '<div class="hv-top"><div class="in"><div class="hv-row"><button class="back" aria-label="Back"><svg viewBox="0 0 18 18"><path d="M11 3L5 9l6 6"/></svg></button><h2>Energy history</h2></div>' +
  '<div class="seg"><button data-r="day">Day</button><button data-r="week">Week</button><button data-r="month">Month</button><button data-r="year">Year</button></div>' +
  '<div class="dnav"><button data-n="-1" aria-label="Earlier"><svg viewBox="0 0 16 16"><path d="M10 3L5 8l5 5"/></svg></button><b></b><button data-n="1" aria-label="Later"><svg viewBox="0 0 16 16"><path d="M6 3l5 5-5 5"/></svg></button></div></div></div><div class="hv-b"><div class="in"></div></div>');
document.body.appendChild(HV);
var HVB = HV.querySelector('.hv-b .in'), HVS = { r: ls('hist_range') || 'week', end: null, focus: null, open: false };
HV.querySelector('.back').onclick = popView;
HV.querySelectorAll('.seg button').forEach(function (b) { b.onclick = function () { HVS.r = b.getAttribute('data-r'); ls('hist_range', HVS.r); HVS.end = todayK(); renderHV(true) } });
HV.querySelectorAll('.dnav button').forEach(function (b) { b.onclick = function () { var P = period(); var k = +b.getAttribute('data-n') < 0 ? P.prev : P.next; if (k) { HVS.end = k; renderHV(true) } } });
HV.addEventListener('click', function (e) {
  var t = e.target.closest && e.target.closest('[data-act]'); if (!t) return;
  var a = t.getAttribute('data-act');
  if (a === 'price') { var v = parseFloat((HV.querySelector('#pIn') || {}).value); ls('kwh_price', v > 0 ? String(v) : null); renderHV(true) }
  if (a === 'clearprice') { ls('kwh_price', null); renderHV(true) }
  if (a === 'retry') loadHistory(true);
  if (a === 'settings') A.openSettings();
});
function openHistory(focus) {
  HVS.end = todayK(); HVS.focus = focus || null; HVB.innerHTML = '';
  if (!HVS.open) { HVS.open = true; HV.classList.add('on'); HV.querySelector('.hv-b').scrollTop = 0; pushView(function () { HV.classList.remove('on'); HVS.open = false }) }
  loadHistory(); loadFC(); renderHV(true);
}

function period() {
  var r = HVS.r, e = HVS.end || todayK(), t = todayK(), P = { r: r }, p = kp(e), i;
  if (r === 'day') { P.keys = [e]; P.label = dLabel(e); P.prev = addDays(e, -1); P.next = e < t ? addDays(e, 1) : null }
  else if (r === 'week') { P.keys = []; for (i = 6; i >= 0; i--) P.keys.push(addDays(e, -i)); P.label = e === t ? 'Last 7 days' : dShort(P.keys[0]) + ' – ' + dShort(e); P.prev = addDays(e, -7); P.next = e < t ? (addDays(e, 7) > t ? t : addDays(e, 7)) : null }
  else if (r === 'month') {
    P.keys = []; for (i = 1; i <= dim(p.y, p.m); i++) P.keys.push(p.y + '-' + pad(p.m) + '-' + pad(i));
    P.label = MONF[p.m - 1] + (p.y !== kp(t).y ? ' ' + p.y : ''); P.prev = addDays(p.y + '-' + pad(p.m) + '-01', -1);
    var nx = addDays(P.keys[P.keys.length - 1], 1); P.next = nx <= t ? (addDays(nx.slice(0, 8) + pad(dim(kp(nx).y, kp(nx).m)), 0) > t ? t : nx.slice(0, 8) + pad(dim(kp(nx).y, kp(nx).m))) : null;
  } else { P.months = []; for (i = 1; i <= 12; i++) P.months.push(p.y + '-' + pad(i)); P.label = '' + p.y; P.prev = (p.y - 1) + '-12-31'; P.next = p.y < kp(t).y ? (p.y + 1 === kp(t).y ? t : (p.y + 1) + '-12-31') : null }
  return P;
}
function periodRows(P) {
  var D = H.db;
  if (P.r === 'year') return P.months.map(function (m) { var o = D.mon[m]; if (!o) { o = null; for (var k in D.day) if (k.slice(0, 7) === m) o = addInto(o, D.day[k]) } return { k: m, o: o, t: o ? tot(o) : null } });
  if (P.r === 'day' && D.loaded[P.keys[0].slice(0, 7)] === true) {
    // a single day: total the hours, so the numbers always match the hourly chart
    var o = null; hoursOf(P.keys[0]).forEach(function (h) { if (h.o) o = addInto(o, h.o) });
    if (o) return [{ k: P.keys[0], o: o, t: tot(o) }];
  }
  return P.keys.map(function (k) { var o = D.day[k] || null; return { k: k, o: o, t: o ? tot(o) : null } });
}
function sumRows(rows) { var o = {}, any = false; rows.forEach(function (r) { if (r.o) { addInto(o, r.o); any = true } }); return any ? tot(o) : null }
function daysWithData(P, rows) {
  var D = H.db, t = todayK(), n = 0, part = function () { return Math.max(0.05, (Date.now() - kStart(t)) / 864e5) };
  if (P.r !== 'year') { rows.forEach(function (r) { if (r.o && r.k <= t) n += r.k === t ? part() : 1 }); return n }
  rows.forEach(function (r) { if (!r.o) return; var c = 0; for (var k in D.day) if (k.slice(0, 7) === r.k && k <= t) c += k === t ? part() : 1; n += c || dim(kp(r.k).y, kp(r.k).m) });
  return n;
}
function perDay(S, n) { if (!S || !(n > 0)) return null; var o = {}; for (var k in S) o[k] = typeof S[k] === 'number' ? S[k] / n : S[k]; return o }

function renderHV(reset) {
  if (!HVS.open) return;
  HV.querySelectorAll('.seg button').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-r') === HVS.r) });
  if (!H.db) { HVB.innerHTML = '<div class="spin">Loading your history</div>'; return }
  if (reset) HVB.innerHTML = '';
  var P = period(), t = todayK();
  HV.querySelector('.dnav b').textContent = P.label;
  HV.querySelector('.dnav [data-n="-1"]').disabled = !P.prev; HV.querySelector('.dnav [data-n="1"]').disabled = !P.next;
  var rows = periodRows(P), S = sumRows(rows), prevP = (function () { var keep = HVS.end; HVS.end = P.prev; var Q = period(); HVS.end = keep; return Q })(), prevRows = periodRows(prevP), PS = sumRows(prevRows), out = [], n = gName(), pr = price();
  // compare like with like: the average per day, and only when the earlier period is reasonably complete
  var nC = daysWithData(P, rows), nP = daysWithData(prevP, prevRows), full = P.r === 'year' ? 365 : P.r === 'month' ? dim(kp(P.keys[0]).y, kp(P.keys[0]).m) : P.keys.length, CA = null, PA = null;
  if (S && PS && !(P.r === 'day' && P.keys[0] === t) && nP >= 0.6 * full) { CA = perDay(S, nC); PA = perDay(PS, nP) }
  var prevName = { day: 'the day before', week: 'the 7 days before', month: 'last month', year: 'last year' }[P.r];

  // banner about where these numbers come from
  var ban = '';
  if (H.mode === 'sample' && A.isDemo()) ban = '<div class="warn"><b>Sample numbers.</b> Connect your Victron account (gear button on the main screen) to see your own history.</div>';
  else if (H.mode === 'nosetup') ban = '<div class="warn"><b>Sample numbers.</b> Your own history isn\'t switched on yet — it needs your VRM access key added once on GitHub. Ask Claude to walk you through it.</div>';
  else if (H.mode === 'keymismatch') ban = '<div class="warn"><b>Sample numbers.</b> This device\'s VRM access key is different from the one your history was saved with. Use the same key on every device (gear button on the main screen).</div>';
  else if (H.mode === 'old') ban = '<div class="warn"><b>Sample numbers.</b> This browser is too old to open your saved history. Update the phone\'s software and try again.</div>';
  else if (H.mode === 'error') ban = '<div class="warn"><b>Sample numbers.</b> Your history couldn\'t be loaded' + (H.why ? ' (' + esc(H.why) + ')' : '') + '. <button data-act="retry" style="color:var(--solar);font-weight:700">Try again</button></div>';
  if (ban) out.push(['ban', ban]);

  if (!S) {
    out.push(['empty', '<div class="cd"><div class="note" style="text-align:center;padding:24px 0">No history for ' + esc(P.label.toLowerCase() === 'today' ? 'today yet' : P.label) + '.</div></div>']);
    sections(HVB, out); return;
  }

  // 1. self-powered ring and headline numbers
  var parts_ = S.home > 0 ? [[S.Pc / S.home, C.solar], [S.Bc / S.home, C.batt], [S.Gc / S.home, C.grid], [S.gc / S.home, C.gen]] : [];
  var kpi = function (c, label, v, dl, extra) { return '<div class="kpi"><span><i style="background:' + c + '"></i>' + label + '</span><b>' + nf(v) + '<small>kWh</small></b>' + (dl || '') + (extra || '') + '</div>' };
  out.push(['top', '<div class="cd"><div class="hero2" style="align-items:center">' + ring(parts_, 108, 12, '<b>' + nf(S.self, 0) + '%</b><span>self-<br>powered</span>') +
    '<div class="kpis">' + kpi(C.solar, 'Solar made', S.solar, CA ? delta(CA.solar, PA.solar, true) : '') + kpi(C.home, 'Home used', S.home, CA ? delta(CA.home, PA.home, null) : '') +
    kpi(C.grid, n + ' bought', S.gin, CA ? delta(CA.gin, PA.gin, false) : '') + kpi(C.batt, 'From battery', S.bout, '') + '</div></div>' +
    legend([[C.solar, 'Solar ' + Math.round(S.home ? S.Pc / S.home * 100 : 0) + '%'], [C.batt, 'Battery ' + Math.round(S.home ? S.Bc / S.home * 100 : 0) + '%'], [C.grid, n + ' ' + Math.round(S.home ? S.Gc / S.home * 100 : 0) + '%'], S.gc > 0.05 ? [C.gen, 'Generator ' + Math.round(S.gc / S.home * 100) + '%'] : null]) +
    (CA ? '<div class="note" style="margin-top:8px">Arrows compare the daily average with ' + prevName + '.</div>' : '') + '</div>']);

  // 2. energy flow
  out.push(['flow', card('How energy moved', '', chartBox(220)) + sig(S), function (el) { drawSankey(el.querySelector('.chart'), S, n) }]);

  // 3. main chart: where the home's power came from (up) and what was stored or sent out (down)
  var M = null;
  if (P.r === 'day') {
    if (haveHours(P.keys)) {
      var hrs = hoursOf(P.keys[0]);
      M = { n: hrs.length, o: hrs.map(function (h) { return h.o }), xl: function (i) { return i % 6 === 0 ? pad(i) : '' }, title: function (i) { return pad(i) + ':00–' + pad(i + 1) + ':00' } };
    }
  } else if (P.r === 'year') M = { n: 12, o: rows.map(function (r) { return r.o }), xl: function (i) { return MON[i][0] }, title: function (i) { return MONF[i] + ' ' + P.label }, fade: function (i) { return rows[i].k > t.slice(0, 7) } };
  else M = { n: rows.length, o: rows.map(function (r) { return r.o }), xl: P.r === 'week' ? function (i) { return wd(rows[i].k) } : function (i) { var d = kp(rows[i].k).d; return d === 1 || d % 5 === 0 ? '' + d : '' }, title: function (i) { return dLabel(rows[i].k) }, fade: function (i) { return rows[i].k > t } };
  if (M) {
    var f = function (c) { return M.o.map(function (o) { return o ? +o[c] || 0 : 0 }) };
    var hasGen = S.gc + S.gb > 0.05, hasOut = S.gout > 0.01;
    out.push(['main', card('Where your power came from', '', chartBox(200) + legend([[C.solar, 'Solar'], [C.batt, 'Battery'], [C.grid, n], hasGen ? [C.gen, 'Generator'] : null]) +
      legend([['#e0b43a', 'Below the line: into the battery'], hasOut ? [C.exp, 'sent out'] : null]) + '<div class="note" style="margin-top:6px">Touch and slide across the chart for details.</div>') + sig([P.label, P.r, M.o]), function (el) {
      drawBars(el.querySelector('.chart'), { n: M.n, h: 200, top: [{ c: C.solar, v: f('Pc') }, { c: C.batt, v: f('Bc') }, { c: C.grid, v: f('Gc') }, { c: C.gen, v: f('gc') }],
        bot: [{ c: '#e0b43a', v: f('Pb') }, { c: FL.Gb.c, v: f('Gb') }, { c: FL.gb.c, v: f('gb') }, { c: C.exp, v: f('Pg').map(function (v, i) { return v + f('Bg')[i] }) }],
        xl: M.xl, fade: M.fade, tip: function (i) { return M.o[i] ? flowTip(M.title(i), M.o[i]) : '' } });
    }]);
  } else out.push(['main', card('Where your power came from', '', '<div class="spin">Loading the hours</div>')]);

  // 4. solar production
  (function () {
    var v, xl, title, avg = null, mark = -1, ghost = null, note = '';
    if (P.r === 'day') {
      if (!haveHours(P.keys)) return;
      var hrs = hoursOf(P.keys[0]), now = Date.now(), fc = {}; (H.db.fc || []).forEach(function (p) { fc[p[0]] = p[1] / 1000 });
      v = hrs.map(function (h) { return h.o ? tot(h.o).solar : 0 }); xl = function (i) { return i % 6 === 0 ? pad(i) : '' }; title = function (i) { return pad(i) + ':00–' + pad(i + 1) + ':00' };
      if (P.keys[0] === t) ghost = hrs.map(function (h, i) { return h.t + 3600e3 > now && fc[h.t] ? Math.max(0, fc[h.t] - v[i]) : 0 });
      var bi = 0; v.forEach(function (x, i) { if (x > v[bi]) bi = i }); if (v[bi] > 0) note = 'Best hour: <b>' + title(bi) + '</b> with ' + nf(v[bi]) + ' kWh.';
    } else {
      v = rows.map(function (r) { return r.t ? r.t.solar : 0 });
      xl = M ? M.xl : function () { return '' }; title = function (i) { return P.r === 'year' ? MONF[i] : dLabel(rows[i].k) };
      var have = v.filter(function (x, i) { return rows[i].t && (P.r === 'year' ? rows[i].k < t.slice(0, 7) : rows[i].k < t) });
      if (have.length) { avg = have.reduce(function (a, b) { return a + b }, 0) / have.length }
      v.forEach(function (x, i) { if (mark < 0 || x > v[mark]) mark = i });
      if (mark >= 0 && v[mark] > 0) note = 'Best ' + (P.r === 'year' ? 'month' : 'day') + ': <b>' + title(mark) + '</b> with ' + nf(v[mark]) + ' kWh.';
    }
    var fcT = forecast(), tm = addDays(t, 1);
    if (P.r !== 'year' && P.r !== 'day' && HVS.end === t && fcT && fcT[tm]) note += ' Tomorrow ' + wxIcon(fcT[tm].code) + ' about <b>' + nf(fcT[tm].kwh) + ' kWh</b> is expected.';
    out.push(['solar', card('Solar made', nf(S.solar) + ' kWh', chartBox(160) + (note ? '<div class="note" style="margin-top:8px">' + note + '</div>' : '')) + sig([P.label, P.r, v, ghost]), function (el) {
      drawBars(el.querySelector('.chart'), { n: v.length, h: 160, top: [{ c: C.solar, v: v }], ghost: ghost ? { c: C.solar, v: ghost } : null, avg: avg, avgLabel: avg ? 'average ' + nf(avg) : '', mark: P.r === 'day' ? -1 : mark,
        xl: xl, tip: function (i) { return '<b>' + title(i) + '</b>' + tr(C.solar, 'Solar', nf(v[i])) + (ghost && ghost[i] > 0.01 ? tr('rgba(255,210,74,.4)', 'Expected', nf(v[i] + ghost[i])) : '') } });
    }]);
  })();

  // 5. battery level
  (function () {
    var D = H.db, res = reserve(), a, b, pts = [], band = [], xt = [];
    if (P.r === 'day' || P.r === 'week') {
      a = kStart(P.keys[0]); b = kStart(addDays(P.keys[P.keys.length - 1], 1));
      pts = D.soc15.filter(function (p) { return p[0] >= a && p[0] < b });
      if (pts.length < 8) { pts = []; for (var ts in D.socH) if (+ts >= a && +ts < b) pts.push([+ts, D.socH[ts]]); pts.sort(function (x, y) { return x[0] - y[0] }) }
      if (P.r === 'day' && P.keys[0] === t && A.live.soc != null && !D.sample) pts.push([Date.now(), A.live.soc]);
      xt = P.r === 'day' ? dayTicks(a) : P.keys.map(function (k) { return [kStart(k) + 12 * 3600e3, wd(k)] });
      if (P.r === 'week' && pts.length < 8) { pts = []; band = []; P.keys.forEach(function (k) { var s = D.socd[k]; if (s) { var m = kStart(k) + 12 * 3600e3; pts.push([m, s[0]]); band.push([m, s[1], s[2]]) } }) }
    } else {
      var keys = P.r === 'month' ? P.keys : (function () { var o = []; P.months.forEach(function (m) { for (var d = 1; d <= dim(kp(m).y, kp(m).m); d++) o.push(m + '-' + pad(d)) }); return o })();
      a = kStart(keys[0]); b = kStart(addDays(keys[keys.length - 1], 1));
      keys.forEach(function (k) { var s = D.socd[k]; if (s) { var m = kStart(k) + 12 * 3600e3; pts.push([m, s[0]]); band.push([m, s[1], s[2]]) } });
      xt = P.r === 'month' ? [1, 8, 15, 22, 29].filter(function (d) { return d <= keys.length }).map(function (d) { return [kStart(keys[d - 1]) + 12 * 3600e3, '' + d] }) : P.months.filter(function (m, i) { return i % 3 === 0 }).map(function (m) { return [kStart(m + '-15'), MON[kp(m).m - 1]] });
    }
    if (pts.length < 2) return;
    var lo = 101, hi = -1; (band.length ? band : pts.map(function (p) { return [p[0], p[1], p[1]] })).forEach(function (x) { lo = Math.min(lo, x[1]); hi = Math.max(hi, x[2]) });
    out.push(['batt', card('Battery level', 'lowest ' + nf(lo, 0) + '% · highest ' + nf(hi, 0) + '%', chartBox(150) + (band.length ? legend([['rgba(63,224,138,.35)', 'Daily low to high'], [C.batt, 'Daily average']]) : '')) + sig([P.label, P.r, pts.length, lo, hi]), function (el) {
      drawLine(el.querySelector('.chart'), { x0: a, x1: b, pts: pts, band: band, min: 0, max: 100, unit: '%', c: C.batt, ref: res, refLabel: res ? 'reserve ' + res + '%' : '', xt: xt, gap: band.length ? 2.5 * 86400e3 : 2 * 3600e3, dot: P.r === 'day' && P.keys[0] === t,
        tip: function (p) { var bb = band.length ? band.filter(function (x) { return x[0] === p[0] })[0] : null; return '<b>' + (band.length ? dLabel(dk(p[0])) : (P.r === 'week' ? wd(dk(p[0])) + ' ' : '') + hm(p[0])) + '</b>' + tr(C.batt, band.length ? 'Average' : 'Charged', nf(p[1], 0), '%') + (bb ? tr('', 'Range', nf(bb[1], 0) + '–' + nf(bb[2], 0), '%') : '') } });
    }]);
  })();

  // 6. grid availability (Day and Week)
  if (P.r === 'day' || P.r === 'week') (function () {
    var gl = [], tm = 0, src = null;
    if (!haveHours(P.keys)) return;
    P.keys.forEach(function (k) { var g = gridCells(k); if (g) { gl.push([k, g]); tm += g.min; src = src || g.src } });
    if (!gl.length) return;
    var lab = src === 'voltage' ? n + ' availability' : 'Hours you used ' + n.toLowerCase() + ' power';
    var body = P.r === 'day' ? stripHTML(gl[0][1]) : gl.map(function (x) { return '<div style="display:flex;align-items:center;gap:8px;margin-bottom:5px"><span style="width:30px;font-size:11.5px;color:var(--ink-3)">' + wd(x[0]) + '</span><div style="flex:1">' + '<div class="strip" style="height:14px">' + x[1].cells.map(function (c) { return '<b style="background:' + (c == null ? 'transparent' : c ? '#6fe3a2' : 'rgba(255,159,67,.5)') + '"></b>' }).join('') + '</div></div><span style="width:52px;text-align:right;font-size:11.5px;color:var(--ink-2)">' + dur(x[1].min).replace(' min', 'm').replace(' h', 'h') + '</span></div>' }).join('') +
      '<div class="strip-l" style="margin-left:38px;margin-right:60px"><span>00</span><span>06</span><span>12</span><span>18</span><span>24</span></div>';
    out.push(['avail', card(lab, P.r === 'day' ? dur(tm) : 'about ' + dur(tm / gl.length) + ' a day', body + legend([['#6fe3a2', src === 'voltage' ? 'Available' : 'Used'], ['rgba(255,159,67,.55)', src === 'voltage' ? 'Off' : 'Not used']]))]);
  })();

  // 7. money
  var saved = S.home - S.gin;
  out.push(['money', card('Savings', pr ? '$' + pr + ' per kWh <button data-act="clearprice" style="color:var(--ink-3);text-decoration:underline">change</button>' : '', pr ?
    '<div class="kv"><div><span>Solar and battery saved</span><b>' + money(Math.max(0, saved) * pr) + '</b><p>' + nf(Math.max(0, saved)) + ' kWh you didn\'t have to buy</p></div><div><span>Spent on ' + n.toLowerCase() + '</span><b>' + money(S.gin * pr) + '</b><p>' + nf(S.gin) + ' kWh</p></div></div><div class="note" style="margin-top:10px">Estimated at your price per kWh.</div>' :
    '<div class="note">Enter what you pay per kWh to see how much your solar and battery save you.</div><div class="price"><input id="pIn" inputmode="decimal" placeholder="Price per kWh, e.g. 0.30"><button data-act="price">Save</button></div>')]);

  // 8. records and comparisons
  (function () {
    var D = H.db, best = null, top = null, offDays = 0, days = 0, ins = '';
    for (var k in D.day) { var x = tot(D.day[k]); if (!best || x.solar > best[1]) best = [k, x.solar]; if (!top || x.home > top[1]) top = [k, x.home] }
    if (P.r !== 'year') rows.forEach(function (r) { if (r.t && r.k <= t) { days++; if (r.t.gin < 0.1) offDays++ } });
    var item = function (bg, ic, title, sub) { return '<div class="ins"><div class="ic" style="background:' + bg + '">' + ic + '</div><div class="t"><b>' + title + '</b><span>' + sub + '</span></div></div>' };
    if (P.r !== 'year' && days > 1) ins += item('rgba(63,224,138,.14)', '🔋', offDays + ' of ' + days + ' days', 'without buying any ' + n.toLowerCase() + ' power');
    if (CA && PA.solar > 0.2) { var ch = pctChange(CA.solar, PA.solar); if (ch != null) ins += item('rgba(255,210,74,.14)', '☀️', (ch >= 0 ? '+' : '') + Math.round(ch) + '% solar a day', 'compared with ' + prevName); }
    if (best) ins += item('rgba(255,210,74,.14)', '🏆', 'Best solar day: ' + nf(best[1]) + ' kWh', dLabel(best[0]) + (kp(best[0]).y !== kp(t).y ? ' ' + kp(best[0]).y : ''));
    if (top) ins += item('rgba(86,182,255,.14)', '🏠', 'Busiest day: ' + nf(top[1]) + ' kWh used', dLabel(top[0]) + (kp(top[0]).y !== kp(t).y ? ' ' + kp(top[0]).y : ''));
    var life = sumT(/^solarcharger\/\d+\/Yield\/User$/); if (life) ins += item('rgba(181,140,255,.14)', '⚡', mwh(life) + ' since installation', 'made by your panels');
    if (ins) out.push(['rec', card('Highlights', '', ins)]);
  })();

  var foot = H.mode === 'ready' ? 'History from Victron VRM, updated ' + ago(H.status && H.status.gen || H.db.gen) + (H.why === 'stale' ? ' · couldn\'t refresh just now' : '') : '';
  if (foot) out.push(['foot', '<div class="note" style="text-align:center;margin-top:4px">' + foot + '</div>']);
  sections(HVB, out);
  if (reset && HVS.focus) { var el = HVB.querySelector('[data-k="' + ({ solar: 'solar', batt: 'batt', grid: 'avail', home: 'main' })[HVS.focus] + '"]'); HVS.focus = null; if (el) setTimeout(function () { HV.querySelector('.hv-b').scrollTo({ top: el.offsetTop - 8, behavior: 'smooth' }) }, 380) }
}
function ago(ms) { if (!ms) return 'a while ago'; var m = Math.round((Date.now() - ms) / 60000); return m < 2 ? 'just now' : m < 90 ? m + ' min ago' : m < 48 * 60 ? Math.round(m / 60) + ' h ago' : Math.round(m / 1440) + ' days ago' }

/* ---------------- the history card on the main screen ---------------- */
function renderCard() {
  var host = $('hcard'); if (!host) return;
  var t = todayK(), bars = [], sub = 'Day, week, month and year — touch to explore', D = histOK() ? H.db : null;
  if (D) {
    var w = last7().map(function (k) { return [k, dayTot(k)] }), S = null;
    w.forEach(function (x) { if (x[1]) S = addInto(S, H.db.day[x[0]]) }); S = S ? tot(S) : null;
    if (S) sub = 'Last 7 days: ' + nf(S.solar, 0) + ' kWh of solar · ' + nf(S.self, 0) + '% self-powered';
    var mx = 0.1; w.forEach(function (x) { if (x[1]) mx = Math.max(mx, x[1].solar, x[1].home) });
    bars = w.map(function (x) { return [wd(x[0])[0], x[1] ? x[1].solar / mx : 0, x[1] ? x[1].home / mx : 0] });
  } else {
    var d = mqttDaily(); if (d.length > 2) { var mx2 = 0.1; for (var i = 6; i >= 0; i--) mx2 = Math.max(mx2, d[i] || 0); for (i = 6; i >= 0; i--) bars.push([wd(addDays(t, -i))[0], (d[i] || 0) / mx2, null]) }
  }
  var h = '<div class="hc" role="button" tabindex="0"><div class="hc-h"><b>Energy history</b><span>See all ›</span></div><div class="hc-s">' + sub + '</div>';
  if (bars.length) h += '<div class="mini">' + bars.map(function (b) { return '<div><div class="bx"><i style="height:' + Math.max(3, Math.round(b[1] * 42)) + 'px;background:' + C.solar + '"></i>' + (b[2] != null ? '<i style="height:' + Math.max(3, Math.round(b[2] * 42)) + 'px;background:' + C.home + ';opacity:.85"></i>' : '') + '</div><em>' + b[0] + '</em></div>' }).join('') + '</div>';
  h += '</div>';
  if (host.__h !== h) { host.__h = h; host.innerHTML = h; host.firstChild.onclick = function () { openHistory() } }
}

/* ---------------- wiring ---------------- */
function refresh() { renderCard(); if (CUR) renderSheet(); if (HVS.open) renderHV(false) }
document.querySelectorAll('[data-open]').forEach(function (el) {
  el.addEventListener('click', function () { openSheet(el.getAttribute('data-open')) });
  el.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openSheet(el.getAttribute('data-open')) } });
});
function trackGrid() {
  var L = A.live; if (L.gridOff == null || A.isDemo()) return;
  var st = ls('gridState').split('|'), cur = L.gridOff ? 'off' : 'on';
  if (st[0] !== cur) ls('gridState', cur + '|' + Date.now() + '|' + (st[0] ? 'seen' : 'first'));
}
var lastLive = 0, lastDemo = A.isDemo();
A.hooks.push(function () { trackGrid(); if (A.isDemo() !== lastDemo) { lastDemo = A.isDemo(); loadHistory(true) } var n = Date.now(); if (n - lastLive > 1500) { lastLive = n; if (CUR) renderSheet(); renderCard() } });
var rz = 0; window.addEventListener('resize', function () { clearTimeout(rz); rz = setTimeout(function () { [DSB, HVB].forEach(function (h) { Array.prototype.forEach.call(h.children, function (c) { c.__h = null }) }); refresh() }, 250) });
document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') setTimeout(function () { loadHistory() }, 1500) });
if (A.isDemo()) setTimeout(loadHistory, 300);
setTimeout(function () { loadHistory(); loadFC() }, 2500);
setInterval(function () { if (document.visibilityState === 'visible') loadHistory() }, 15 * 60e3);
renderCard();
window.SOLAR_MORE = { openSheet: openSheet, openHistory: openHistory, H: H, refresh: refresh };
})();
