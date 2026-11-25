// Solar Home history collector.
// Runs hourly on GitHub Actions. Victron's VRM history service does not accept requests from web
// pages, so this fetches the history on the server side and saves it, encrypted, on the
// `history-data` branch, where the Solar Home page reads it.
//
// Encryption: AES-256-GCM. The key is SHA-256("solarhome-history-v1:" + VRM access key), so only a
// device that holds the same VRM access key can read the files. `kf` (the first 8 hex digits of
// SHA-256(key)) tells a device whether its key matches, without revealing anything.
//
// Usage: node solar-history.mjs <previous-data-dir> <output-dir>
// Env:   VRM_TOKEN (required), VRM_PORTAL (portal id), VRM_API (base URL, for tests)
// Always exits 0: problems are written to status.json, so a VRM outage does not send failure emails.

import { webcrypto as wc } from 'node:crypto'
import zlib from 'node:zlib'
import fs from 'node:fs'
import path from 'node:path'

const [, , PREV = 'data', OUT = 'out'] = process.argv
const TOKEN = (process.env.VRM_TOKEN || '').trim().replace(/^Token\s+/i, '')
const PORTAL = (process.env.VRM_PORTAL || '').trim().toLowerCase()
const API = (process.env.VRM_API || 'https://vrmapi.victronenergy.com/v2').replace(/\/$/, '')
const BACKFILL_MONTHS = 13 // hourly detail kept for the current month plus 12 before it
const NEW_MONTHS_PER_RUN = 3

const status = { v: 1, run: Date.now(), ok: false, steps: {} }
fs.mkdirSync(OUT, { recursive: true })
const writeStatus = () => fs.writeFileSync(path.join(OUT, 'status.json'), JSON.stringify(status, null, 1))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const enc = new TextEncoder()
const hex = (b) => Buffer.from(b).toString('hex')

async function api (p) {
  for (let attempt = 0; attempt < 3; attempt++) {
    let r
    try {
      r = await fetch(API + p, {
        headers: {
          'X-Authorization': 'Token ' + TOKEN,
          Accept: 'application/json',
          'User-Agent': 'SolarHome-history/1.0'
        },
        signal: AbortSignal.timeout(45000)
      })
    } catch (e) {
      if (attempt === 2) throw new Error('network: ' + (e.cause?.code || e.name))
      await sleep(5000)
      continue
    }
    if (r.status === 429 || r.status >= 500) {
      if (attempt === 2) throw new Error('HTTP ' + r.status)
      await sleep(Math.min(60, +r.headers.get('retry-after') || 15) * 1000)
      continue
    }
    const t = await r.text()
    let j
    try { j = JSON.parse(t) } catch (e) { throw new Error('HTTP ' + r.status + ' (not JSON: ' + t.slice(0, 60).replace(/\s+/g, ' ') + ')') }
    if (!r.ok || j.success === false) {
      const why = [j.error_code, j.errors && (typeof j.errors === 'string' ? j.errors : JSON.stringify(j.errors))].filter(Boolean).join(' ')
      throw new Error('HTTP ' + r.status + (why ? ' ' + why.slice(0, 140) : ''))
    }
    return j
  }
}

// ---------- time in the installation's time zone ----------
let TZ = 'Asia/Beirut'
function parts (ms) {
  const o = {}
  new Intl.DateTimeFormat('en-US', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    .formatToParts(new Date(ms)).forEach((p) => { o[p.type] = p.value })
  return { y: +o.year, m: +o.month, d: +o.day, h: +o.hour % 24, mi: +o.minute }
}
function offset (ms) { const p = parts(ms); return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi) - Math.floor(ms / 60000) * 60000 }
function localMidnight (y, m, d) { const g = Date.UTC(y, m - 1, d); let t = g - offset(g); t = g - offset(t); return t }
const sec = (ms) => Math.floor(ms / 1000)
const monthKey = (y, m) => y + '-' + String(m).padStart(2, '0')

// ---------- turning VRM records into compact columns ----------
const ms = (t) => (t < 1e12 ? t * 1000 : t)
const r3 = (v) => (v == null || !isFinite(v) ? null : Math.round(v * 1000) / 1000)
function columns (records, skip = ['kwh']) {
  // records: { code: [[ts, value, ...], ...] } -> { t: [...], code: [...] }
  const codes = Object.keys(records || {}).filter((c) => Array.isArray(records[c]) && !skip.includes(c))
  const ts = new Set()
  codes.forEach((c) => records[c].forEach((row) => { if (Array.isArray(row)) ts.add(ms(+row[0])) }))
  const t = [...ts].sort((a, b) => a - b)
  const idx = new Map(t.map((x, i) => [x, i]))
  const out = { t }
  codes.forEach((c) => {
    const col = new Array(t.length).fill(0)
    records[c].forEach((row) => { if (Array.isArray(row)) col[idx.get(ms(+row[0]))] = r3(+row[1]) || 0 })
    out[c] = col
  })
  return out
}
function socColumns (rows) {
  // VRM returns [ts, mean, min, max] for state of charge
  const out = { t: [], v: [], lo: [], hi: [] }
  ;(rows || []).forEach((row) => {
    if (!Array.isArray(row) || row[1] == null) return
    out.t.push(ms(+row[0])); out.v.push(r3(+row[1]))
    out.lo.push(r3(row[2] == null ? +row[1] : +row[2])); out.hi.push(r3(row[3] == null ? +row[1] : +row[3]))
  })
  return out
}
const count = (c) => (c && c.t ? c.t.length : 0)

// ---------- encryption ----------
let KEY, KF
async function setupKey () {
  const raw = new Uint8Array(await wc.subtle.digest('SHA-256', enc.encode('solarhome-history-v1:' + TOKEN)))
  KF = hex(await wc.subtle.digest('SHA-256', raw)).slice(0, 8)
  KEY = await wc.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt'])
}
async function save (name, obj) {
  const iv = wc.getRandomValues(new Uint8Array(12))
  const z = zlib.gzipSync(Buffer.from(JSON.stringify(obj)), { level: 9 })
  const ct = new Uint8Array(await wc.subtle.encrypt({ name: 'AES-GCM', iv }, KEY, z))
  fs.writeFileSync(path.join(OUT, name), JSON.stringify({ v: 1, z: 1, kf: KF, iv: Buffer.from(iv).toString('base64'), ct: Buffer.from(ct).toString('base64') }))
}

async function step (name, fn) {
  try {
    const r = await fn()
    status.steps[name] = 'ok' + (r != null ? ' ' + r : '')
  } catch (e) {
    status.steps[name] = 'failed: ' + String(e.message || e).replace(TOKEN, '***').slice(0, 200)
  }
}

async function main () {
  if (!TOKEN) { status.error = 'no-token'; return }
  await setupKey()
  status.kf = KF

  // keep last run's month files when they were made with the same key
  let prev = {}
  try { prev = JSON.parse(fs.readFileSync(path.join(PREV, 'status.json'), 'utf8')) } catch (e) {}
  const kept = new Set()
  if (prev.kf === KF) {
    // the last good summary stays in place until a new one is saved
    for (const f of fs.readdirSync(PREV).filter((f) => /^(m-\d{4}-\d{2}|summary)\.json$/.test(f))) {
      fs.copyFileSync(path.join(PREV, f), path.join(OUT, f)); kept.add(f)
    }
    status.gen = prev.gen
  }

  // which installation
  let site
  try {
    const me = await api('/users/me')
    const list = (await api('/users/' + me.user.id + '/installations')).records || []
    site = list.find((r) => String(r.identifier || '').toLowerCase() === PORTAL) || (list.length === 1 ? list[0] : null)
    if (!site) throw new Error('installation ' + PORTAL + ' not found among ' + list.length)
  } catch (e) {
    status.error = 'sign-in: ' + String(e.message || e).slice(0, 200)
    return
  }
  if (site.timezone) { try { new Intl.DateTimeFormat('en-US', { timeZone: site.timezone }); TZ = site.timezone } catch (e) {} }
  const id = site.idSite
  const stats = (q) => api('/installations/' + id + '/stats?' + q)
  const now = Date.now()
  const p = parts(now)
  const today0 = localMidnight(p.y, p.m, p.d)
  const DAY = 86400000

  const sum = { v: 1, gen: now, site: { tz: TZ } }
  await step('days', async () => {
    const j = await stats(`type=kwh&interval=days&start=${sec(today0 - 400 * DAY)}&end=${sec(now)}`)
    sum.days = columns(j.records); return count(sum.days)
  })
  await step('months', async () => {
    const j = await stats(`type=kwh&interval=months&start=${sec(localMidnight(p.y - 4, 1, 1))}&end=${sec(now)}`)
    sum.months = columns(j.records); return count(sum.months)
  })
  await step('socDays', async () => {
    const j = await stats(`type=custom&attributeCodes[]=bs&interval=days&start=${sec(today0 - 400 * DAY)}&end=${sec(now)}`)
    sum.socd = socColumns(j.records && j.records.bs); return count(sum.socd)
  })
  await step('soc15', async () => {
    const j = await stats(`type=custom&attributeCodes[]=bs&interval=15mins&start=${sec(today0 - 7 * DAY)}&end=${sec(now)}`)
    sum.soc15 = socColumns(j.records && j.records.bs); return count(sum.soc15)
  })
  await step('gridVoltage', async () => {
    const j = await stats(`type=custom&attributeCodes[]=IV1&interval=15mins&start=${sec(today0 - 7 * DAY)}&end=${sec(now)}`)
    const c = socColumns(j.records && j.records.IV1)
    if (count(c)) sum.iv = { t: c.t, v: c.v }
    return count(c)
  })
  await step('forecast', async () => {
    const j = await stats(`type=forecast&interval=hours&start=${sec(today0)}&end=${sec(today0 + 2 * DAY)}`)
    sum.fc = columns(j.records, []); return count(sum.fc)
  })

  if (!count(sum.days) && !count(sum.months)) {
    status.error = 'no data: ' + (status.steps.days || '')
    return
  }
  await save('summary.json', sum)

  // hourly detail, one file per month
  const months = []
  for (let i = 0; i < BACKFILL_MONTHS; i++) {
    const d = new Date(Date.UTC(p.y, p.m - 1 - i, 1))
    months.push([d.getUTCFullYear(), d.getUTCMonth() + 1])
  }
  let fresh = 0
  for (const [y, m] of months) {
    const key = monthKey(y, m)
    const file = 'm-' + key + '.json'
    const current = y === p.y && m === p.m
    const justEnded = !current && months[1][0] === y && months[1][1] === m && p.d <= 2
    if (!current && !justEnded && kept.has(file)) continue
    if (!current && !justEnded && fresh >= NEW_MONTHS_PER_RUN) continue
    if (!current && !justEnded) fresh++
    const a = localMidnight(y, m, 1)
    const nx = new Date(Date.UTC(y, m, 1))
    const b = Math.min(now, localMidnight(nx.getUTCFullYear(), nx.getUTCMonth() + 1, 1))
    await step(key, async () => {
      const kw = await stats(`type=kwh&interval=hours&start=${sec(a)}&end=${sec(b)}`)
      let soc = null
      try { soc = await stats(`type=custom&attributeCodes[]=bs&interval=hours&start=${sec(a)}&end=${sec(b)}`) } catch (e) {}
      const obj = { v: 1, month: key, hours: columns(kw.records), soch: socColumns(soc && soc.records && soc.records.bs) }
      await save(file, obj)
      return count(obj.hours)
    })
  }
  status.months = fs.readdirSync(OUT).filter((f) => /^m-/.test(f)).map((f) => f.slice(2, 9)).sort()
  status.ok = true
  status.gen = now
}

main()
  .catch((e) => { status.error = 'crash: ' + String(e.message || e).replace(TOKEN, '***').slice(0, 200) })
  .finally(() => { status.took = Date.now() - status.run; writeStatus() })
