// Solar Home widget for Scriptable (iPhone home screen and lock screen)
// Shows the Yarze solar system from Victron VRM. Your VRM access key stays in the iPhone's keychain.
//
// Options: long-press the widget > Edit Widget > Parameter, and type one of:
//   Small:  overview · battery · solar · grid
//   Medium: overview · today · chart
//   Large:  dashboard
//   Lock screen: works on its own (circle, rectangle or one line)
// Leave Parameter empty for each size's default. Run the script in the Scriptable app to preview every option.

const PORTAL = 'c0619ab55707'
const TZ = 'Asia/Beirut'
const API = 'https://vrmapi.victronenergy.com/v2'
const PAGE = 'https://elmizni.github.io/solar/'
const K_TOKEN = 'solarhome_vrm_token', K_SITE = 'solarhome_vrm_site'
const C = {
  bg1: new Color('#161e2a'), bg2: new Color('#0a0e14'), card: new Color('#ffffff', 0.07),
  solar: new Color('#ffd24a'), batt: new Color('#3fe08a'), home: new Color('#56b6ff'), grid: new Color('#9aa3ae'), gen: new Color('#ff9f43'),
  ink: new Color('#ffffff'), ink2: new Color('#ffffff', 0.72), ink3: new Color('#ffffff', 0.48), track: new Color('#ffffff', 0.12)
}
// widget width in points for this iPhone (medium and large share it; small is a bit under half)
function widgetWidth (fam) {
  let sw = 390; try { const z = Device.screenSize(); sw = Math.min(z.width, z.height) } catch (e) { }
  const m = sw >= 428 ? 364 : sw >= 414 ? 360 : sw >= 400 ? 348 : sw >= 390 ? 338 : 329
  return fam === 'small' ? Math.round(m * 0.468) : m
}
const OPTIONS = { small: ['overview', 'battery', 'solar', 'grid'], medium: ['overview', 'today', 'chart'], large: ['dashboard'] }

// ---------------- time in Beirut ----------------
function parts (ms) {
  const o = {}
  new Intl.DateTimeFormat('en-US', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    .formatToParts(new Date(ms)).forEach((p) => { o[p.type] = p.value })
  return { y: +o.year, m: +o.month, d: +o.day, h: +o.hour % 24, mi: +o.minute }
}
function offset (ms) { const p = parts(ms); return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi) - Math.floor(ms / 60000) * 60000 }
function midnight (ms) { const p = parts(ms), g = Date.UTC(p.y, p.m - 1, p.d); let t = g - offset(g); return g - offset(t) }
const pad = (n) => (n < 10 ? '0' : '') + n
const hm = (ms) => { const p = parts(ms); return pad(p.h) + ':' + pad(p.mi) }
const dayKey = (ms) => { const p = parts(ms); return p.y + '-' + pad(p.m) + '-' + pad(p.d) }
const WD = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

// ---------------- numbers ----------------
const kw = (w) => (w == null ? '–' : (Math.abs(w) / 1000).toFixed(1))
const kwh = (v) => (v == null ? '–' : v < 10 ? v.toFixed(1) : String(Math.round(v)))
function dur (min) { if (min == null || !isFinite(min)) return ''; min = Math.round(min); const h = Math.floor(min / 60), m = min % 60; return h ? h + 'h' + (m ? ' ' + m + 'm' : '') : m + 'm' }

// ---------------- VRM ----------------
function token () { return Keychain.contains(K_TOKEN) ? Keychain.get(K_TOKEN) : '' }
async function api (path) {
  const r = new Request(API + path)
  r.headers = { 'X-Authorization': 'Token ' + token(), Accept: 'application/json' }
  r.timeoutInterval = 25
  const j = await r.loadJSON()
  const code = r.response ? r.response.statusCode : 0
  if (code >= 400 || !j || j.success === false) {
    const e = new Error(code === 401 || code === 403 ? 'VRM did not accept the key' : 'VRM error ' + code)
    e.status = code
    throw e
  }
  return j
}
async function site () {
  if (Keychain.contains(K_SITE)) return Keychain.get(K_SITE)
  const me = await api('/users/me')
  const list = (await api('/users/' + me.user.id + '/installations')).records || []
  const s = list.find((r) => String(r.identifier || '').toLowerCase() === PORTAL) || (list.length === 1 ? list[0] : null)
  if (!s) throw new Error('Your installation was not found in VRM')
  Keychain.set(K_SITE, String(s.idSite))
  return String(s.idSite)
}
async function fetchData () {
  const id = await site()
  const now = Date.now(), t0 = midnight(now), w0 = t0 - 6 * 86400000
  const D = { at: now, now: {}, today: null, hours: [], week: [], soc: [], seen: null }
  // latest readings, as VRM last received them
  try {
    const recs = (await api('/installations/' + id + '/diagnostics?count=1000')).records || []
    const sys = (paths) => {
      let s = null, t = null
      recs.forEach((r) => {
        if (r && r.dbusServiceType === 'system' && paths.includes(r.dbusPath) && r.rawValue != null && isFinite(+r.rawValue)) {
          s = (s || 0) + +r.rawValue
          if (r.timestamp) t = Math.max(t || 0, +r.timestamp * (r.timestamp < 1e12 ? 1000 : 1))
        }
      })
      if (t) D.seen = Math.max(D.seen || 0, t)
      return s
    }
    const ph = (pre) => ['L1', 'L2', 'L3'].map((l) => pre + l + '/Power')
    D.now.pv = (sys(['/Dc/Pv/Power']) || 0) + (sys(ph('/Ac/PvOnGrid/').concat(ph('/Ac/PvOnOutput/'), ph('/Ac/PvOnGenset/'))) || 0)
    D.now.load = sys(ph('/Ac/Consumption/'))
    D.now.grid = sys(ph('/Ac/Grid/'))
    D.now.gen = sys(ph('/Ac/Genset/'))
    D.now.bp = sys(['/Dc/Battery/Power'])
    D.now.soc = sys(['/Dc/Battery/Soc'])
    if (D.now.soc == null) { const r = recs.find((x) => x && +x.idDataAttribute === 144 && isFinite(+x.rawValue)); if (r) D.now.soc = +r.rawValue }
    D.now.src = sys(['/Ac/ActiveIn/Source'])
    if (D.now.src == null) {
      // no source reading: treat a dead inverter input as the grid being off
      const v = recs.find((r) => r && r.dbusServiceType === 'vebus' && r.dbusPath === '/Ac/ActiveIn/L1/V' && isFinite(+r.rawValue))
      if (v) D.now.src = +v.rawValue < 100 ? 240 : 1
    }
    D.now.ttg = sys(['/Dc/Battery/TimeToGo'])
  } catch (e) { D.nowError = e.message }
  // energy hour by hour for the last 7 days
  const k = await api('/installations/' + id + '/stats?type=kwh&interval=hours&start=' + Math.floor(w0 / 1000) + '&end=' + Math.floor(now / 1000))
  const rec = k.records || {}, byT = {}
  Object.keys(rec).forEach((c) => { if (c !== 'kwh' && Array.isArray(rec[c])) rec[c].forEach((row) => { const t = +row[0] < 1e12 ? +row[0] * 1000 : +row[0]; (byT[t] = byT[t] || {})[c] = +row[1] || 0 }) })
  const days = {}
  Object.keys(byT).map(Number).sort((a, b) => a - b).forEach((t) => {
    const o = byT[t], key = dayKey(t)
    days[key] = days[key] || {}
    for (const c in o) days[key][c] = (days[key][c] || 0) + o[c]
    if (t >= t0) D.hours.push([parts(t).h, o])
  })
  for (let i = 6; i >= 0; i--) { const key = dayKey(t0 - i * 86400000 + 43200000); D.week.push([key, tot(days[key] || {})]) }
  D.today = D.week[6][1]
  try {
    const s = await api('/installations/' + id + '/stats?type=custom&attributeCodes[]=bs&interval=hours&start=' + Math.floor(t0 / 1000) + '&end=' + Math.floor(now / 1000))
    D.soc = ((s.records && s.records.bs) || []).map((r) => [parts(+r[0] < 1e12 ? +r[0] * 1000 : +r[0]).h, +r[1]])
  } catch (e) { }
  return D
}
function tot (o) {
  const g = (k) => +o[k] || 0
  const r = { Pc: g('Pc'), Pb: g('Pb'), Pg: g('Pg'), Gc: g('Gc'), Gb: g('Gb'), Bc: g('Bc'), Bg: g('Bg') }
  r.solar = r.Pc + r.Pb + r.Pg; r.home = r.Pc + r.Bc + r.Gc; r.gin = r.Gc + r.Gb; r.bout = r.Bc + r.Bg
  r.self = r.home > 0.05 ? Math.round(Math.max(0, Math.min(100, (r.home - r.Gc) / r.home * 100))) : null
  return r
}

// cache, so the widget still shows the last numbers when there's no signal
const fm = FileManager.local()
const cacheFile = fm.joinPath(fm.cacheDirectory(), 'solarhome-widget.json')
function saveCache (D) { try { fm.writeString(cacheFile, JSON.stringify(D)) } catch (e) { } }
function readCache () { try { return fm.fileExists(cacheFile) ? JSON.parse(fm.readString(cacheFile)) : null } catch (e) { return null } }

// ---------------- drawing helpers ----------------
function ring (frac, color, size, lw, center, sub, centerSize) {
  const d = new DrawContext(); d.size = new Size(size, size); d.opaque = false; d.respectScreenScale = true
  const r = (size - lw) / 2, cx = size / 2, cy = size / 2
  d.setStrokeColor(C.track); d.setLineWidth(lw); d.strokeEllipse(new Rect(lw / 2, lw / 2, size - lw, size - lw))
  const f = Math.max(0, Math.min(1, frac || 0))
  if (f > 0.005) {
    const n = Math.max(8, Math.round(120 * f)), p = new Path()
    for (let i = 0; i <= n; i++) { const a = -Math.PI / 2 + 2 * Math.PI * f * i / n, pt = new Point(cx + r * Math.cos(a), cy + r * Math.sin(a)); if (i) p.addLine(pt); else p.move(pt) }
    d.addPath(p); d.setStrokeColor(color); d.setLineWidth(lw); d.strokePath()
    d.setFillColor(color)
    ;[0, f].forEach((q) => { const a = -Math.PI / 2 + 2 * Math.PI * q; d.fillEllipse(new Rect(cx + r * Math.cos(a) - lw / 2, cy + r * Math.sin(a) - lw / 2, lw, lw)) })
  }
  if (center) {
    d.setTextAlignedCenter(); d.setTextColor(C.ink); d.setFont(Font.boldRoundedSystemFont(centerSize || size * 0.26))
    const fh = (centerSize || size * 0.26) * 1.2
    d.drawTextInRect(center, new Rect(0, cy - fh / 2 - (sub ? size * 0.06 : 0), size, fh))
    if (sub) { d.setTextColor(C.ink3); d.setFont(Font.semiboldSystemFont(size * 0.105)); d.drawTextInRect(sub, new Rect(0, cy + fh / 2 - size * 0.06, size, size * 0.16)) }
  }
  return d.getImage()
}
function segRing (parts_, size, lw, center, sub) {
  const d = new DrawContext(); d.size = new Size(size, size); d.opaque = false; d.respectScreenScale = true
  const r = (size - lw) / 2, cx = size / 2, cy = size / 2
  d.setStrokeColor(C.track); d.setLineWidth(lw); d.strokeEllipse(new Rect(lw / 2, lw / 2, size - lw, size - lw))
  let a0 = -Math.PI / 2
  parts_.forEach(([f, col]) => {
    if (!(f > 0.01)) return
    const sweep = 2 * Math.PI * f - 0.06, n = Math.max(4, Math.round(80 * f)), p = new Path()
    for (let i = 0; i <= n; i++) { const a = a0 + sweep * i / n, pt = new Point(cx + r * Math.cos(a), cy + r * Math.sin(a)); if (i) p.addLine(pt); else p.move(pt) }
    d.addPath(p); d.setStrokeColor(col); d.setLineWidth(lw); d.strokePath()
    a0 += 2 * Math.PI * f
  })
  d.setTextAlignedCenter(); d.setTextColor(C.ink); d.setFont(Font.boldRoundedSystemFont(size * 0.25))
  d.drawTextInRect(center, new Rect(0, cy - size * 0.2, size, size * 0.3))
  d.setTextColor(C.ink3); d.setFont(Font.semiboldSystemFont(size * 0.1)); d.drawTextInRect(sub, new Rect(0, cy + size * 0.1, size, size * 0.14))
  return d.getImage()
}
// stacked bars; each column is a list of [value, color]
function bars (cols, w, h, opts) {
  opts = opts || {}
  const d = new DrawContext(); d.size = new Size(w, h); d.opaque = false; d.respectScreenScale = true
  const lab = opts.labels ? 13 : 0, ch = h - lab, n = cols.length
  let max = opts.max || 0; cols.forEach((c) => { let s = 0; c.forEach((x) => { s += Math.max(0, x[0]) }); max = Math.max(max, s) })
  if (!(max > 0)) max = 1
  const slot = w / n, bw = Math.max(2, Math.min(opts.bw || 14, slot * 0.66))
  d.setFillColor(C.track); d.fillRect(new Rect(0, ch - 1, w, 1))
  cols.forEach((c, i) => {
    let y = ch - 1; const x = slot * i + (slot - bw) / 2
    c.forEach(([v, col]) => {
      const hh = Math.max(0, v) / max * (ch - 4); if (hh < 0.6) return
      y -= hh; const p = new Path(); p.addRoundedRect(new Rect(x, y, bw, hh), Math.min(2, bw / 3), Math.min(2, bw / 3)); d.addPath(p); d.setFillColor(col); d.fillPath()
    })
  })
  if (opts.labels) {
    d.setFont(Font.mediumSystemFont(9.5)); d.setTextColor(C.ink3); d.setTextAlignedCenter()
    cols.forEach((c, i) => { const l = opts.labels(i); if (l) d.drawTextInRect(l, new Rect(slot * i - 6, ch + 1, slot + 12, 12)) })
  }
  return d.getImage()
}
function hourCols (D, kind) {
  const cols = []
  for (let h = 0; h < 24; h++) {
    const row = D.hours.find((x) => x[0] === h), o = row ? row[1] : {}
    const g = (k) => +o[k] || 0
    if (kind === 'solar') cols.push([[g('Pc') + g('Pb') + g('Pg'), C.solar]])
    else cols.push([[g('Pc'), C.solar], [g('Bc'), C.batt], [g('Gc'), C.grid]])
  }
  return cols
}
function txt (stack, s, size, color, weight, opts) {
  const t = stack.addText(String(s))
  t.font = weight === 'round' ? Font.boldRoundedSystemFont(size) : weight === 'bold' ? Font.boldSystemFont(size) : weight === 'semi' ? Font.semiboldSystemFont(size) : Font.mediumSystemFont(size)
  t.textColor = color || C.ink
  t.lineLimit = 1
  t.minimumScaleFactor = opts && opts.scale ? opts.scale : 0.6
  return t
}
function dot (stack, color, size) { const d = new DrawContext(); const s = size || 7; d.size = new Size(s, s); d.opaque = false; d.respectScreenScale = true; d.setFillColor(color); d.fillEllipse(new Rect(0, 0, s, s)); const i = stack.addImage(d.getImage()); i.imageSize = new Size(s, s); return i }
function label (stack, color, s) { const r = stack.addStack(); r.centerAlignContent(); dot(r, color, 6); r.addSpacer(4); txt(r, s, 10.5, C.ink2, 'semi'); return r }
function frame () {
  const w = new ListWidget()
  const g = new LinearGradient(); g.colors = [C.bg1, C.bg2]; g.locations = [0, 1]; g.startPoint = new Point(0, 0); g.endPoint = new Point(1, 1)
  w.backgroundGradient = g; w.url = PAGE
  w.refreshAfterDate = new Date(Date.now() + 10 * 60000)
  return w
}
function gridState (D) {
  const n = D.now, gen = n.src === 2 || (n.gen != null && Math.abs(n.gen) > 50 && !(n.grid && Math.abs(n.grid) > 50))
  const v = gen ? n.gen : n.grid, off = n.src === 240 && !gen
  return { name: gen ? 'Generator' : 'Grid', off, v, color: gen ? C.gen : C.grid }
}
function gridOffSince (D) {
  // the last hour today that used grid power
  let last = null; D.hours.forEach(([h, o]) => { if ((+o.Gc || 0) + (+o.Gb || 0) > 0.03) last = h })
  return last == null ? null : pad(Math.min(23, last + 1)) + ':00'
}
function battLine (D) {
  const n = D.now, bp = n.bp || 0
  if (bp > 40) return 'Charging ' + kw(bp) + ' kW'
  if (bp < -40) return n.ttg ? 'Lasts ~' + dur(n.ttg / 60) : 'Supplying ' + kw(-bp) + ' kW'
  return (n.soc || 0) >= 99 ? 'Full' : 'Standing by'
}
function footer (w, D, stale) {
  const f = w.addStack(); f.centerAlignContent()
  const t = D.seen || D.at
  txt(f, (stale ? 'Offline · ' : '') + 'as of ' + hm(t), 9.5, stale ? C.gen : C.ink3, 'med')
}
function header (w, title, D, stale) {
  const h = w.addStack(); h.centerAlignContent()
  const s = SFSymbol.named('bolt.circle.fill'); const im = h.addImage(s.image); im.imageSize = new Size(14, 14); im.tintColor = C.solar
  h.addSpacer(5); txt(h, title, 12.5, C.ink, 'bold'); h.addSpacer()
  txt(h, (stale ? '⚠︎ ' : '') + hm(D.seen || D.at), 10.5, stale ? C.gen : C.ink3, 'med')
}

// ---------------- layouts ----------------
function smallOverview (D, stale) {
  const w = frame(); w.setPadding(13, 14, 12, 14)
  header(w, 'Solar', D, stale); w.addSpacer(8)
  const n = D.now, g = gridState(D)
  const cell = (row, color, name, value, unit) => {
    const c = row.addStack(); c.layoutVertically()
    label(c, color, name); c.addSpacer(1)
    const v = c.addStack(); v.bottomAlignContent(); txt(v, value, 21, C.ink, 'round'); if (unit) { v.addSpacer(1); txt(v, unit, 11, C.ink2, 'semi') }
    return c
  }
  const r1 = w.addStack(); cell(r1, C.solar, 'Solar', kw(n.pv), 'kW'); r1.addSpacer(); cell(r1, C.home, 'Home', kw(n.load), 'kW')
  w.addSpacer(7)
  const r2 = w.addStack(); cell(r2, C.batt, 'Battery', n.soc == null ? '–' : Math.round(n.soc), '%'); r2.addSpacer(); cell(r2, g.color, g.name, g.off ? 'Off' : kw(g.v), g.off ? '' : 'kW')
  w.addSpacer()
  return w
}
function smallBattery (D, stale) {
  const w = frame(); w.setPadding(12, 12, 11, 12)
  const n = D.now
  header(w, 'Battery', D, stale); w.addSpacer(4)
  const r = w.addStack(); r.addSpacer()
  const im = r.addImage(ring((n.soc || 0) / 100, C.batt, 96, 11, n.soc == null ? '–' : Math.round(n.soc) + '%', 'charged')); im.imageSize = new Size(96, 96)
  r.addSpacer(); w.addSpacer(5)
  const b = w.addStack(); b.addSpacer(); txt(b, battLine(D), 12, (n.bp || 0) > 40 ? C.batt : C.ink2, 'semi'); b.addSpacer()
  w.addSpacer()
  return w
}
function smallSolar (D, stale) {
  const w = frame(); w.setPadding(13, 14, 12, 14)
  header(w, 'Solar', D, stale); w.addSpacer(6)
  const v = w.addStack(); v.bottomAlignContent(); txt(v, kw(D.now.pv), 32, C.ink, 'round'); v.addSpacer(2); txt(v, 'kW', 14, C.ink2, 'semi')
  txt(w, 'Today ' + kwh(D.today && D.today.solar) + ' kWh', 12, C.solar, 'semi')
  w.addSpacer()
  const sw_ = widgetWidth('small') - 28, im = w.addImage(bars(hourCols(D, 'solar'), sw_, 38, { bw: 4.5 })); im.imageSize = new Size(sw_, 38)
  return w
}
function smallGrid (D, stale) {
  const w = frame(); w.setPadding(13, 14, 12, 14)
  const g = gridState(D)
  header(w, g.name, D, stale); w.addSpacer(8)
  if (g.off) {
    txt(w, 'Off', 34, C.gen, 'round')
    const since = gridOffSince(D); txt(w, since ? 'since about ' + since : 'no ' + g.name.toLowerCase() + ' power', 12, C.ink2, 'semi')
  } else {
    const v = w.addStack(); v.bottomAlignContent(); txt(v, kw(g.v), 32, C.ink, 'round'); v.addSpacer(2); txt(v, 'kW', 14, C.ink2, 'semi')
    txt(w, (g.v || 0) > 40 ? 'Supplying your home' : (g.v || 0) < -40 ? 'Sending power out' : 'Available, not in use', 12, C.ink2, 'semi')
  }
  w.addSpacer()
  const hrs = D.hours.filter(([h, o]) => (+o.Gc || 0) + (+o.Gb || 0) > 0.03).length
  txt(w, 'Grid power today: ' + hrs + ' h', 11, C.ink3, 'med')
  txt(w, 'Bought ' + kwh(D.today && D.today.gin) + ' kWh', 11, C.ink3, 'med')
  return w
}
function mediumOverview (D, stale) {
  const w = frame(); w.setPadding(13, 15, 12, 15)
  header(w, 'Solar Home', D, stale); w.addSpacer(6)
  const n = D.now, g = gridState(D), row = w.addStack(); row.centerAlignContent()
  const im = row.addImage(ring((n.soc || 0) / 100, C.batt, 92, 10, n.soc == null ? '–' : Math.round(n.soc) + '%', 'battery')); im.imageSize = new Size(92, 92)
  row.addSpacer(14)
  const col = row.addStack(); col.layoutVertically(); col.size = new Size(widgetWidth('medium') - 30 - 92 - 14, 0)
  const line = (color, name, value, unit, sub) => {
    const l = col.addStack(); l.centerAlignContent(); dot(l, color, 7); l.addSpacer(6); txt(l, name, 12.5, C.ink2, 'semi'); l.addSpacer()
    txt(l, value, 17, C.ink, 'round'); if (unit) { l.addSpacer(2); txt(l, unit, 10.5, C.ink2, 'semi') }
    col.addSpacer(5)
  }
  line(C.solar, 'Solar', kw(n.pv), 'kW'); line(C.home, 'Home', kw(n.load), 'kW'); line(g.color, g.name, g.off ? 'Off' : kw(g.v), g.off ? '' : 'kW')
  txt(col, battLine(D), 11, (n.bp || 0) > 40 ? C.batt : C.ink3, 'semi')
  w.addSpacer()
  const t = D.today
  if (t) { const f = w.addStack(); txt(f, 'Today  ☀︎ ' + kwh(t.solar) + ' kWh made  ·  ' + (t.self == null ? '–' : t.self) + '% self-powered', 11, C.ink3, 'med') }
  return w
}
function mediumToday (D, stale) {
  const w = frame(); w.setPadding(13, 15, 12, 15)
  header(w, 'Today', D, stale); w.addSpacer(7)
  const t = D.today || tot({}), row = w.addStack(); row.centerAlignContent()
  const parts_ = t.home > 0 ? [[t.Pc / t.home, C.solar], [t.Bc / t.home, C.batt], [t.Gc / t.home, C.grid]] : []
  const im = row.addImage(segRing(parts_, 92, 10, (t.self == null ? '–' : t.self) + '%', 'self-powered')); im.imageSize = new Size(92, 92)
  row.addSpacer(14)
  const grid = row.addStack(); grid.layoutVertically(); grid.size = new Size(widgetWidth('medium') - 30 - 92 - 14, 0)
  const pair = (a, b) => { const r = grid.addStack(); a(r); r.addSpacer(); b(r); grid.addSpacer(8) }
  const cw = Math.floor((widgetWidth('medium') - 30 - 92 - 14 - 6) / 2), cell = (color, name, v) => (r) => { const c = r.addStack(); c.layoutVertically(); c.size = new Size(cw, 0); label(c, color, name); const s = c.addStack(); s.bottomAlignContent(); txt(s, kwh(v), 19, C.ink, 'round'); s.addSpacer(2); txt(s, 'kWh', 10, C.ink2, 'semi') }
  pair(cell(C.solar, 'Solar made', t.solar), cell(C.home, 'Home used', t.home))
  pair(cell(C.grid, 'Grid bought', t.gin), cell(C.batt, 'From battery', t.bout))
  w.addSpacer()
  return w
}
function mediumChart (D, stale) {
  const w = frame(); w.setPadding(13, 15, 11, 15)
  header(w, 'Today hour by hour', D, stale); w.addSpacer(6)
  const cwid = widgetWidth('medium') - 30, im = w.addImage(bars(hourCols(D, 'mix'), cwid, 86, { bw: 9, labels: (i) => (i % 6 === 0 ? pad(i) : '') })); im.imageSize = new Size(cwid, 86)
  w.addSpacer(5)
  const l = w.addStack(); l.centerAlignContent()
  const t = D.today || tot({})
  label(l, C.solar, 'Solar ' + kwh(t.Pc)); l.addSpacer(10); label(l, C.batt, 'Battery ' + kwh(t.Bc)); l.addSpacer(10); label(l, C.grid, 'Grid ' + kwh(t.Gc)); l.addSpacer()
  txt(l, kwh(t.home) + ' kWh', 10.5, C.ink2, 'semi')
  return w
}
function largeDashboard (D, stale) {
  const w = frame(); w.setPadding(15, 15, 13, 15)
  header(w, 'Solar Home', D, stale); w.addSpacer(8)
  const n = D.now, g = gridState(D), t = D.today || tot({})
  const W = widgetWidth('large') - 30, tw = Math.floor((W - 8) / 2)
  const tile = (row, color, name, value, unit, sub) => {
    const c = row.addStack(); c.layoutVertically(); c.backgroundColor = C.card; c.cornerRadius = 14; c.setPadding(8, 11, 8, 8); c.size = new Size(tw, 0)
    label(c, color, name); c.addSpacer(3)
    const v = c.addStack(); v.bottomAlignContent(); txt(v, value, 22, C.ink, 'round'); if (unit) { v.addSpacer(2); txt(v, unit, 11, C.ink2, 'semi') }
    c.addSpacer(2); txt(c, sub, 10, C.ink3, 'med')
  }
  const r1 = w.addStack(); tile(r1, C.solar, 'Solar', kw(n.pv), 'kW', 'Today ' + kwh(t.solar) + ' kWh'); r1.addSpacer(); tile(r1, g.color, g.name, g.off ? 'Off' : kw(g.v), g.off ? '' : 'kW', g.off ? (gridOffSince(D) ? 'since about ' + gridOffSince(D) : 'not available') : 'Bought ' + kwh(t.gin) + ' kWh today')
  w.addSpacer(8)
  const r2 = w.addStack(); tile(r2, C.batt, 'Battery', n.soc == null ? '–' : Math.round(n.soc), '%', battLine(D)); r2.addSpacer(); tile(r2, C.home, 'Home', kw(n.load), 'kW', (t.self == null ? '–' : t.self) + '% self-powered today')
  w.addSpacer(9)
  const h = w.addStack(); txt(h, 'TODAY', 10, C.ink3, 'bold'); h.addSpacer(); txt(h, kwh(t.home) + ' kWh used', 10, C.ink3, 'med')
  w.addSpacer(4)
  const im = w.addImage(bars(hourCols(D, 'mix'), W, 58, { bw: 9, labels: (i) => (i % 6 === 0 ? pad(i) : '') })); im.imageSize = new Size(W, 58)
  w.addSpacer(8)
  const h2 = w.addStack(); txt(h2, 'SOLAR, LAST 7 DAYS', 10, C.ink3, 'bold'); h2.addSpacer(); txt(h2, kwh(D.week.reduce((a, b) => a + b[1].solar, 0)) + ' kWh', 10, C.ink3, 'med')
  w.addSpacer(4)
  const wk = w.addImage(bars(D.week.map(([k, o]) => [[o.solar, C.solar]]), W, 42, { bw: 26, labels: (i) => { const [y, m, d] = D.week[i][0].split('-').map(Number); return WD[new Date(Date.UTC(y, m - 1, d)).getUTCDay()] } })); wk.imageSize = new Size(W, 42)
  w.addSpacer()
  return w
}
function lockCircular (D) {
  const w = new ListWidget(); w.addAccessoryWidgetBackground = true; w.url = PAGE
  const n = D.now
  const im = w.addImage(ring((n.soc || 0) / 100, C.ink, 60, 6, n.soc == null ? '–' : String(Math.round(n.soc)), '%', 20)); im.imageSize = new Size(60, 60)
  return w
}
function lockRect (D) {
  const w = new ListWidget(); w.url = PAGE
  const n = D.now, g = gridState(D)
  const a = w.addStack(); a.centerAlignContent(); txt(a, '🔋 ' + (n.soc == null ? '–' : Math.round(n.soc) + '%'), 15, C.ink, 'round'); a.addSpacer(8); txt(a, '☀︎ ' + kw(n.pv) + ' kW', 15, C.ink, 'round')
  txt(w, 'Home ' + kw(n.load) + ' kW · ' + g.name + ' ' + (g.off ? 'off' : kw(g.v) + ' kW'), 12, C.ink2, 'semi')
  txt(w, 'Today ' + kwh(D.today && D.today.solar) + ' kWh solar', 12, C.ink2, 'semi')
  return w
}
function lockInline (D) {
  const w = new ListWidget(); w.url = PAGE
  const n = D.now
  txt(w, '☀︎ ' + kw(n.pv) + ' kW  🔋 ' + (n.soc == null ? '–' : Math.round(n.soc) + '%'), 12, C.ink, 'semi')
  return w
}
function message (title, body) {
  const w = frame(); w.setPadding(14, 14, 14, 14)
  txt(w, title, 14, C.solar, 'bold'); w.addSpacer(4)
  const t = w.addText(body); t.font = Font.mediumSystemFont(11.5); t.textColor = C.ink2; t.minimumScaleFactor = 0.7
  w.addSpacer()
  return w
}

function build (family, option, D, stale) {
  if (family === 'accessoryCircular') return lockCircular(D)
  if (family === 'accessoryRectangular') return lockRect(D)
  if (family === 'accessoryInline') return lockInline(D)
  const o = (option || '').trim().toLowerCase()
  if (family === 'small') return ({ battery: smallBattery, solar: smallSolar, grid: smallGrid })[o] ? ({ battery: smallBattery, solar: smallSolar, grid: smallGrid })[o](D, stale) : smallOverview(D, stale)
  if (family === 'medium') return ({ today: mediumToday, chart: mediumChart })[o] ? ({ today: mediumToday, chart: mediumChart })[o](D, stale) : mediumOverview(D, stale)
  return largeDashboard(D, stale)
}

async function getData () {
  try { const D = await fetchData(); saveCache(D); return { D, stale: false } } catch (e) {
    const D = readCache()
    if (D) return { D, stale: true, error: e.message }
    throw e
  }
}
async function askKey (again) {
  let note = ''
  for (let tries = 0; tries < 4; tries++) {
    const a = new Alert()
    a.title = again ? 'Change your VRM key' : 'Connect your solar system'
    a.message = (note ? note + '\n\n' : '') + 'Copy your VRM access key first, then tap the box below and choose Paste. The key is kept in this iPhone\'s keychain and only sent to Victron.'
    a.addTextField('Paste your VRM access key here', '')
    a.addAction('Save'); a.addCancelAction('Cancel')
    if (await a.presentAlert() === -1) return false
    const k = String(a.textFieldValue(0) || '').trim().replace(/^Token\s+/i, '')
    if (!k) { note = 'Nothing was pasted into the box.'; continue }
    const old = token()
    Keychain.set(K_TOKEN, k); if (Keychain.contains(K_SITE)) Keychain.remove(K_SITE)
    try { await api('/users/me'); return true } catch (e) {
      if (e.status === 401 || e.status === 403) {
        if (old) Keychain.set(K_TOKEN, old); else Keychain.remove(K_TOKEN)
        note = 'Victron did not accept that key. Make sure you copied all of it.'
        continue
      }
      return true // no signal right now: keep the key and try again later
    }
  }
  return false
}

async function main () {
  const family = config.widgetFamily || 'medium'
  if (config.runsInWidget) {
    let w
    if (!token()) w = message('Open Scriptable', 'Run the Solar script in the Scriptable app once to connect your system.')
    else {
      try { const r = await getData(); w = build(family, args.widgetParameter, r.D, r.stale) } catch (e) { w = message('Can\'t reach VRM', e.message) }
    }
    Script.setWidget(w); Script.complete(); return
  }
  // in the app: connect, then preview the options
  if (!token() && !(await askKey(false))) { Script.complete(); return }
  let r
  try { r = await getData() } catch (e) {
    const a = new Alert(); a.title = 'Could not load your system'; a.message = e.message; a.addAction('Change key'); a.addCancelAction('Close')
    if (await a.presentAlert() === 0 && await askKey(true)) return main()
    Script.complete(); return
  }
  const menu = []
  OPTIONS.small.forEach((o) => menu.push(['small', o])); OPTIONS.medium.forEach((o) => menu.push(['medium', o])); OPTIONS.large.forEach((o) => menu.push(['large', o]))
  while (true) {
    const a = new Alert(); a.title = 'Solar widget'; a.message = 'Preview an option. To use one, add a Scriptable widget of that size and type its name in Parameter.'
    menu.forEach(([f, o]) => a.addAction(f[0].toUpperCase() + f.slice(1) + ' · ' + o))
    a.addAction('Change VRM key'); a.addCancelAction('Done')
    const i = await a.presentSheet()
    if (i === -1) break
    if (i === menu.length) { await askKey(true); try { r = await getData() } catch (e) { } continue }
    const [f, o] = menu[i], w = build(f, o, r.D, r.stale)
    if (f === 'small') await w.presentSmall(); else if (f === 'medium') await w.presentMedium(); else await w.presentLarge()
  }
  Script.complete()
}
await main()
