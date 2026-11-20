/* Solar Home live scene. Usage: SolarScene({ canvas, plate: <img>, style, maxWidth, fps, now, onReady, onFail, onPerf }) */
window.SolarScene = function (OPT) {
'use strict';
// ── Relighting engine: one real photograph of the terrace, re-lit for any hour ──
// Everything below works in "plate percent" coordinates: x 0..100 left→right, y 0..100 top→bottom.
const Q = new URLSearchParams(location.search);
const STILL = Q.has('still');
const W = 1920, H = 1080;
const canvas = OPT.canvas;
const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, preserveDrawingBuffer: !!OPT.keepBuffer, powerPreference: 'high-performance' });
if (!gl) throw new Error('WebGL2 is not available');
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;

// ── Hand-traced regions of the photograph, rasterised to mask textures at load ──
const PX = v => (v / 100) * W, PY = v => (v / 100) * H;
function layer() { const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, W, H); g.globalCompositeOperation = 'lighter'; return [c, g]; }
const chan = (ch, a) => { const v = Math.round(255 * clamp(a, 0, 1)); return ch === 'r' ? `rgb(${v},0,0)` : ch === 'g' ? `rgb(0,${v},0)` : ch === 'b' ? `rgb(0,0,${v})` : `rgb(${v},${v},${v})`; };
// Soft edges: the canvas blur filter where the browser has it, otherwise the same Gaussian drawn as an offset shadow (Safari).
const HAS_FILTER = !Q.has('nofilter') && typeof document.createElement('canvas').getContext('2d').filter === 'string';
function soften(g, blur, color) { if (!blur) return; if (HAS_FILTER) g.filter = `blur(${blur}px)`; else { g.shadowColor = color; g.shadowBlur = blur * 2; g.shadowOffsetX = 9000; g.translate(-9000, 0); } }
function path(g, pts, close = true) { g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(PX(x), PY(y)) : g.moveTo(PX(x), PY(y))); if (close) g.closePath(); }
function poly(g, ch, pts, a = 1, blur = 0) { g.save(); g.fillStyle = chan(ch, a); soften(g, blur, g.fillStyle); path(g, pts); g.fill(); g.restore(); }
function cut(g, pts, blur = 0) { g.save(); g.globalCompositeOperation = 'source-over'; g.fillStyle = '#000'; soften(g, blur, '#000'); path(g, pts); g.fill(); g.restore(); }
function cutChan(g, ch, pts, blur = 0) { g.save(); g.globalCompositeOperation = 'multiply'; g.fillStyle = ch === 'r' ? '#0ff' : ch === 'g' ? '#f0f' : '#ff0'; soften(g, blur, g.fillStyle); path(g, pts); g.fill(); g.restore(); }
function spot(g, ch, x, y, rx, ry, a = 1) {
  g.save(); g.translate(PX(x), PY(y)); g.scale(PX(rx), PY(ry));
  const r = g.createRadialGradient(0, 0, 0, 0, 0, 1); r.addColorStop(0, chan(ch, a)); r.addColorStop(0.35, chan(ch, a * 0.5)); r.addColorStop(0.7, chan(ch, a * 0.14)); r.addColorStop(1, chan(ch, 0));
  g.fillStyle = r; g.beginPath(); g.arc(0, 0, 1, 0, 7); g.fill(); g.restore();
}
function stroke(g, ch, pts, w, a = 1, blur = 0) { g.save(); g.strokeStyle = chan(ch, a); soften(g, blur, g.strokeStyle); g.lineWidth = w; g.lineCap = 'round'; g.lineJoin = 'round'; path(g, pts, false); g.stroke(); g.restore(); }

// Landmarks
const ROOF_TOP = [[0, 7.2], [41.9, 25.6]];
const FLOOR = [[0, 71.9], [34.3, 63.4], [36.6, 61.2], [49, 62], [49.2, 67.9], [72.6, 72.6], [75.3, 70.7], [75.4, 67], [77.5, 66.8], [77.5, 66.5], [79.4, 66.5], [79.4, 67], [83.6, 66.7], [84, 69.6], [83.8, 74.8], [76.3, 78], [60, 95.8], [56, 100], [0, 100]];
const DECK = [[60, 95.8], [76.3, 78], [83.8, 74.8], [83.6, 70], [89.5, 64.6], [92.2, 65.4], [100, 66], [100, 100], [56, 100]];
const WOOD_IN = [[0, 71.5], [34.2, 63], [33.4, 58.8], [11.6, 54.6], [11.6, 66.5], [0, 69.5]];
const ROOM = [[0, 30.2], [18.6, 31], [18.6, 57], [11.6, 55.2], [11.6, 66.5], [0, 69.5]];
const SOFFIT = [[0, 24.5], [37.6, 29.9], [36, 30.7], [0, 30.4]];
const SLATS = [[59.4, 29.6], [78.2, 27.2], [78.2, 52], [59.4, 51.5]];
const PERGOLA_ROOF = [[48.5, 24.9], [71.3, 21.1], [79.6, 25.6], [79.4, 27.4], [59.4, 30.8], [58.6, 30.3]];
const TV = [[21.4, 37.7], [28.8, 37.7], [28.8, 51.2], [21.4, 51.2]];
const WALL_LIGHTS = [[32.9, 50.6], [39.9, 51.9], [48.3, 53.5]];
const DINING = [[33.5, 57.3], [36.5, 56.4], [43.3, 56], [47.5, 56.4], [52.4, 58], [58.1, 62.2], [58, 72], [57.7, 78.6], [55.4, 80.4], [42.5, 80], [37.8, 78.2], [34, 71.5]];
const BOLLARD = [[65.0, 84.2], [66.75, 84.2], [66.75, 89.6], [65.0, 89.6]];
const TABLE_TOP = [46.1, 61.25, 10.1, 3.55];                                                  // ellipse: cx, cy, rx, ry
const BRIGHT_SOFT = [[[88, 76.2], [100, 76.2], [100, 96.6], [84.2, 90.7]], [[92.2, 62], [100, 62], [100, 78], [92.6, 78], [91, 70]], [[75.5, 100], [79, 91.4], [88, 88.4], [100, 93], [100, 100]]];   // marble table, sofa cushions
function cutEllipse(g, ch, [cx, cy, rx, ry]) { g.save(); g.globalCompositeOperation = 'multiply'; g.fillStyle = ch === 'r' ? '#0ff' : ch === 'g' ? '#f0f' : '#ff0'; soften(g, 1.5, g.fillStyle); g.beginPath(); g.ellipse(PX(cx), PY(cy), PX(rx), PY(ry), 0, 0, 7); g.fill(); g.restore(); }

// mask 1 — R: where sky may appear, G: lit interior, B: porcelain floor (sun-shadow removal)
const [m1c, m1] = layer();
poly(m1, 'r', [[54, 0], [100, 0], [100, 10.8], [93, 11.4], [88, 11.8], [84, 13], [80, 14.8], [76, 16.8], [73, 18.4], [70.2, 19.7], [68.6, 19.7], [66.5, 16], [62, 11], [56, 6]], 1, 5);
poly(m1, 'g', ROOM, 1, 5); poly(m1, 'g', SOFFIT, 0.95, 4);
poly(m1, 'b', FLOOR, 1, 3); cutChan(m1, 'b', DINING, 7); cutChan(m1, 'b', BOLLARD, 0);       // open floor only: furniture is handled separately
// mask 3 — R: floor seen between the dining chairs (same surface, but full of legs and rope)
const [m3c, m3] = layer();
poly(m3, 'r', DINING, 1, 7); poly(m3, 'r', BOLLARD, 1, 0); cutEllipse(m3, 'r', TABLE_TOP);
{ const t = document.createElement('canvas'); t.width = W; t.height = H; const tg = t.getContext('2d'); tg.fillStyle = '#000'; tg.fillRect(0, 0, W, H); tg.fillStyle = '#fff'; soften(tg, 3, '#fff'); tg.beginPath(); FLOOR.forEach(([x, y], i) => i ? tg.lineTo(PX(x), PY(y)) : tg.moveTo(PX(x), PY(y))); tg.closePath(); tg.fill();
  m3.globalCompositeOperation = 'multiply'; m3.drawImage(t, 0, 0); }
m3.globalCompositeOperation = 'lighter'; m3.save(); m3.fillStyle = chan('g', 1); soften(m3, 1.5, m3.fillStyle); m3.beginPath(); m3.ellipse(PX(TABLE_TOP[0]), PY(TABLE_TOP[1]), PX(TABLE_TOP[2]), PY(TABLE_TOP[3]), 0, 0, 7); m3.fill(); m3.restore();   // G: marble table top...
for (const d of [[[46.7, 64.6], [51, 64.6], [51, 76.8], [46.7, 76.8]], [[39.7, 66.6], [43, 66.6], [43, 74.6], [39.7, 74.6]]]) poly(m3, 'g', d, 0.85, 2);   // ...and its two stone drums
poly(m3, 'b', [[0, 0], [70.5, 0], [70.5, 20], [59, 22.5], [59, 45], [18.7, 43], [18.7, 31], [0, 24]], 1, 8);     // B: the wooded hillside close behind the terrace (leaves move in the wind)...
for (const [x, y, rx, ry] of [[23.6, 50.6, 2.3, 4.2], [34.6, 52.4, 2.5, 4.4]]) spot(m3, 'b', x, y, rx, ry, 1);   // ...and the two potted shrubs
// mask 2 — R: timber deck + lounge (shadow removal), G: surfaces that turn glossy in rain, B: distant background
const [m2c, m2] = layer();
poly(m2, 'r', DECK, 1, 3); for (const p of BRIGHT_SOFT) cutChan(m2, 'r', p, 2);
poly(m2, 'g', FLOOR, 1, 4); poly(m2, 'g', [[60, 95.8], [76.3, 78], [83.8, 74.8], [84.5, 90.5], [76, 89], [66, 100], [56, 100]], 0.7, 4);
poly(m2, 'b', [[0, 0], [100, 0], [100, 57.5], [90, 58.5], [79.5, 57], [75.5, 55], [74.5, 53], [49, 50], [47.8, 49.3], [40, 49.2], [18.7, 46.5], [18.7, 31], [37.5, 30.2], [41.9, 29.7], [41.9, 25.6], [0, 7.2]], 1, 0);
for (const p of [TV, PERGOLA_ROOF, SLATS, [[37.4, 30], [38.5, 30], [38.5, 50], [37.4, 50]], [[58.6, 30], [59.5, 30], [59.5, 50.5], [58.6, 50.5]], [[78.1, 26], [79.5, 26], [79.5, 57], [78.1, 57]], [[25.2, 51], [26, 51], [26, 57.5], [25.2, 57.5]]]) cutChan(m2, 'b', p);
{ const t = document.createElement('canvas'); t.width = W; t.height = H; const tg = t.getContext('2d'); if (HAS_FILTER) { tg.filter = 'blur(2.5px)'; tg.drawImage(m2c, 0, 0); } else { tg.globalCompositeOperation = 'lighter'; tg.globalAlpha = 1 / 9; for (const dx of [-2, 0, 2]) for (const dy of [-2, 0, 2]) tg.drawImage(m2c, dx, dy); } m2.globalCompositeOperation = 'source-over'; m2.drawImage(t, 0, 0); }

// mask 4 — R: the timber floor under the pavilion roof, G: the rug lying on it (both re-lit as the sun moves round)
const RUG = [[10.4, 60.2], [18.2, 58.5], [22.4, 59.4], [21.6, 60.4], [15.6, 62], [10.4, 62.7]];
const [m4c, m4] = layer();
poly(m4, 'r', WOOD_IN, 1, 2); cutChan(m4, 'r', RUG, 1.5);
{ const t = document.createElement('canvas'); t.width = W; t.height = H; const tg = t.getContext('2d'); tg.fillStyle = '#000'; tg.fillRect(0, 0, W, H); tg.fillStyle = '#fff'; soften(tg, 2, '#fff'); tg.beginPath(); WOOD_IN.forEach(([x, y], i) => i ? tg.lineTo(PX(x), PY(y)) : tg.moveTo(PX(x), PY(y))); tg.closePath(); tg.fill();
  const [rc, rg] = layer(); poly(rg, 'g', RUG, 1, 1.5); rg.globalCompositeOperation = 'multiply'; rg.drawImage(t, 0, 0); m4.drawImage(rc, 0, 0); }
// light map — R: lamp light falling on surfaces, G: visible warm sources and their halos, B: distant lights
const [ltc, lt] = layer();
poly(lt, 'r', WOOD_IN, 0.8, 10);                                                             // covered veranda floor
poly(lt, 'r', [[0, 71], [34, 63], [44, 64], [34, 82], [0, 95]], 0.26, 46);                   // spill across the terrace
poly(lt, 'r', [[18.6, 31], [37.4, 30.5], [37.4, 58], [18.6, 55]], 0.2, 14);                  // post, TV back, planters under the canopy
spot(lt, 'r', 45, 61.5, 13, 5.5, 0.26);                                                      // dining table catches it too
for (const [x, y] of WALL_LIGHTS) { spot(lt, 'r', x, y + 2.6, 2.4, 3.6, 0.95); spot(lt, 'r', x, y + 9.5, 5.5, 2.6, 0.42); }
poly(lt, 'r', SLATS, 0.34, 8); poly(lt, 'r', [[59.4, 29.6], [78.2, 27.2], [78.2, 38], [59.4, 39]], 0.3, 14);   // pergola screen, brighter at the top
poly(lt, 'r', [[50, 25.5], [71.3, 22.4], [78.4, 26.2], [59.6, 30.2]], 0.6, 5);                // pergola soffit
poly(lt, 'r', [[47.8, 49.2], [74.2, 52.6], [74.2, 55.2], [49, 52.8]], 0.75, 4);               // bar shelf + worktop
poly(lt, 'r', [[49.1, 52.6], [75.4, 55.4], [75.4, 63], [49.1, 61]], 0.62, 10);                // LED wash down the stone
poly(lt, 'r', [[49.1, 60], [75.4, 62.5], [75.3, 70.5], [72.6, 72.4], [49.1, 67.8]], 0.2, 12);
poly(lt, 'r', [[49, 68], [72.6, 72.6], [70, 80], [50, 75.5]], 0.2, 20);
stroke(lt, 'r', [[58.5, 96.5], [75.6, 77.6]], 78, 0.36, 26);                                  // deck-edge strip washing the floor
stroke(lt, 'r', [[83.9, 75.2], [76.6, 78.3]], 40, 0.3, 16);
poly(lt, 'r', [[84, 70.2], [88.6, 71.2], [88.4, 74.8], [83.9, 73.6]], 0.5, 5);                // bench face
poly(lt, 'r', DECK, 0.1, 30);
spot(lt, 'r', 65.9, 89.6, 7.5, 4.2, 0.5);                                                    // floor bollard
// visible sources
stroke(lt, 'g', [[48.6, 51.25], [74.0, 54.65]], 3, 1); stroke(lt, 'g', [[48.6, 51.25], [74.0, 54.65]], 16, 0.34, 9);
stroke(lt, 'g', [[59.2, 96.4], [76.2, 78.05]], 3, 1); stroke(lt, 'g', [[59.2, 96.4], [76.2, 78.05]], 20, 0.34, 11);
stroke(lt, 'g', [[76.2, 78.05], [83.8, 74.85]], 3, 0.95); stroke(lt, 'g', [[76.2, 78.05], [83.8, 74.85]], 16, 0.3, 9);
stroke(lt, 'g', [[84.1, 74.2], [88.5, 75.1]], 3, 0.8); stroke(lt, 'g', [[84.1, 74.2], [88.5, 75.1]], 12, 0.25, 7);
stroke(lt, 'g', [[0.4, 24.75], [37.2, 29.95]], 3, 0.5); stroke(lt, 'g', [[0.4, 24.75], [37.2, 29.95]], 18, 0.2, 10);   // cove along the canopy
for (const [x, y] of [[7, 27.2], [17, 28.3], [27, 29.2]]) { spot(lt, 'g', x, y, 0.45, 0.5, 1); spot(lt, 'g', x, y, 2.4, 1.5, 0.35); }
for (const [x, y] of WALL_LIGHTS) { spot(lt, 'g', x, y + 0.75, 0.9, 0.55, 1); spot(lt, 'g', x, y + 1.4, 2.6, 2.4, 0.3); }
for (const [x, y] of [[64.5, 27.0], [72.5, 25.6]]) { spot(lt, 'g', x, y, 0.5, 0.55, 1); spot(lt, 'g', x, y + 0.6, 3.4, 2.6, 0.32); }
spot(lt, 'g', 65.85, 84.4, 0.7, 0.5, 0.9); spot(lt, 'g', 65.85, 84.8, 3, 2.2, 0.26);
// distant: the neighbour's glazing and houses on the far hill
{ let s = 7; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 26; i++) { const x = 84 + rnd() * 16, y = 11.6 + (x - 84) * -0.03 + rnd() * 7.5; spot(lt, 'b', x, y, 0.09 + rnd() * 0.1, 0.13 + rnd() * 0.12, 0.45 + rnd() * 0.45); }
  for (let i = 0; i < 9; i++) { const x = 70.5 + rnd() * 9, y = 17 + rnd() * 3.2; spot(lt, 'b', x, y, 0.09, 0.12, 0.4 + rnd() * 0.4); } }

// ── GL plumbing ──────────────────────────────────────────────────────────────
function compile(type, src) { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) + '\n' + src.split('\n').map((l, i) => (i + 1) + ': ' + l).join('\n')); return s; }
function texFrom(source, unit, { srgb = false, mips = true } = {}) {
  const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D, 0, srgb ? gl.SRGB8_ALPHA8 : gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, source);
  if (mips) gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mips ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}
const VERT = `#version 300 es
out vec2 vUv;
void main() { vec2 p = vec2( float( ( gl_VertexID << 1 ) & 2 ), float( gl_VertexID & 2 ) ); vUv = vec2( p.x, 1.0 - p.y ); gl_Position = vec4( p * 2.0 - 1.0, 0.0, 1.0 ); }`;

const FRAG = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 outColor;
uniform sampler2D uPlate, uMask1, uMask2, uMask3, uMask4, uLight;
uniform vec2 uRes; uniform float uTime;
uniform float uExpo, uGamma, uFlat, uFlatLevel, uSat, uCon, uLights, uLampGain, uInterior, uDeflare, uWet, uRain, uVig, uBgDim, uMist;
uniform float uCloud, uCloudDetail, uStars, uMoon, uSunGlow, uDisc, uGrain;
uniform vec3 uShadeTint, uSunTint, uFlatTint, uLampCol, uSkyTop, uSkyLow, uGlowCol, uCloudLit, uCloudDark, uTint, uMistCol, uBgTint;
uniform vec2 uSunUV, uMoonUV;
uniform vec3 uVeil;
uniform float uWind, uCloudSpd, uCloudSh, uBirds, uTwinkle, uShimmer;   // live layer
uniform vec3 uCam;
uniform vec3 uSun, uSunCol; uniform float uDay, uVib, uDbg;                     // sun direction in the terrace's own frame, colour/strength of direct light, how much the floor is sun-lit, vibrancy                                                      // x, y offset and zoom

const vec2 SUN0 = vec2( 0.69, -0.23 );          // where the sun sits in the photograph (just above frame)
const float ASPECT = 1.7778;
float lum( vec3 c ) { return dot( c, vec3( 0.2126, 0.7152, 0.0722 ) ); }
float h21( vec2 p ) { p = fract( p * vec2( 123.34, 456.21 ) ); p += dot( p, p + 45.32 ); return fract( p.x * p.y ); }
float vn( vec2 p ) { vec2 i = floor( p ), f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( h21( i ), h21( i + vec2( 1, 0 ) ), f.x ), mix( h21( i + vec2( 0, 1 ) ), h21( i + vec2( 1, 1 ) ), f.x ), f.y ); }
float fbm( vec2 p ) { float s = 0.0, a = 0.5; for ( int i = 0; i < 5; i ++ ) { s += a * vn( p ); p = p * 2.03 + vec2( 17.1, 9.2 ); a *= 0.5; } return s; }

// Sky seen through the gap above the far hills: gradient, sun or moon, clouds, stars.
vec3 skyColor( vec2 uv ) {
  float t = clamp( uv.y / 0.2, 0.0, 1.0 );
  vec3 col = mix( uSkyTop, uSkyLow, pow( t, 0.85 ) );
  vec2 d = ( uv - uSunUV ) * vec2( ASPECT, 1.0 ); float r = length( d );
  col += uGlowCol * uSunGlow * ( exp( - r * r / 0.006 ) * 1.5 + exp( - r * r / 0.07 ) * 0.6 + exp( - r / 0.55 ) * 0.22 );
  if ( uStars > 0.001 ) {
    vec2 sp = uv * vec2( ASPECT, 1.0 ) * 150.0; vec2 ip = floor( sp ), fp = fract( sp ); float s = h21( ip );
    if ( s > 0.82 ) { vec2 c2 = vec2( h21( ip + 3.1 ), h21( ip + 7.7 ) ) * 0.6 + 0.2; float tw = 0.7 + 0.3 * sin( uTime * ( 1.5 + s * 5.0 ) + s * 60.0 );
      col += mix( vec3( 1.0, 0.88, 0.76 ), vec3( 0.82, 0.9, 1.0 ), h21( ip + 1.7 ) ) * smoothstep( 0.13, 0.0, length( fp - c2 ) ) * pow( ( s - 0.82 ) * 5.5, 2.0 ) * 2.4 * tw * uStars; }
  }
  float occl = 0.0;
  if ( uCloud > 0.001 ) {
    float ct = uTime * 0.004 * uCloudSpd;
    vec2 q = vec2( uv.x * 3.4 + ct, uv.y * 11.0 + ct * 0.12 );
    float n = fbm( q ) * 0.72 + fbm( q * 2.7 + 5.0 + vec2( ct * 0.6, ct * 0.35 ) ) * 0.34;
    float cov = smoothstep( 1.02 - uCloud, 1.32 - uCloud, n + ( 1.0 - t ) * 0.06 );
    vec2 toSun = normalize( uSunUV - uv + 1e-4 );
    float lit = clamp( 0.55 + ( n - ( fbm( q + toSun * vec2( 0.2, 0.5 ) ) * 0.72 + 0.17 ) ) * 3.2, 0.0, 1.0 );
    vec3 cc = mix( uCloudDark, uCloudLit, lit ) + uGlowCol * uSunGlow * exp( - r * r / 0.12 ) * 0.5;
    col = mix( col, cc, cov * 0.93 ); occl = cov;
  }
  col += uGlowCol * uDisc * smoothstep( 0.0125, 0.0095, r ) * ( 1.0 - occl * 0.9 );
  if ( uMoon > 0.001 ) {
    vec2 dm = ( uv - uMoonUV ) * vec2( ASPECT, 1.0 ); float rm = length( dm );
    float disc = smoothstep( 0.0148, 0.0132, rm ), maria = 0.82 + 0.18 * vn( dm * 190.0 + 3.0 );
    col += vec3( 1.0, 0.96, 0.86 ) * uMoon * ( disc * maria * 2.6 + exp( - rm * rm / 0.0014 ) * 0.34 + exp( - rm / 0.12 ) * 0.1 ) * ( 1.0 - occl * 0.85 );
  }
  return col;
}


// ── Sun shadows ──────────────────────────────────────────────────────────────
// The terrace measured from the photograph itself (vanishing points → camera; metres; x east, y north, z up, camera at the origin, 1.8 m up).
// Each floor pixel is traced towards the sun against the real structures, so shadows swing and stretch with the hour.
const float DECK_Z = 0.3, TABLE_Z = 0.70;
vec3 scenePoint( vec2 uv, float z ) {
  vec2 d = uv * vec2( 1920.0, 1080.0 ) - vec2( 960.0, 424.46 );
  float u = d.x * 0.9998 + d.y * 0.01994, v = - d.x * 0.01994 + d.y * 0.9998;
  vec3 r = vec3( - 0.7852, - 0.6193, 0.0 ) * u + vec3( 0.6193, - 0.7852, 0.0 ) * 1458.3 - vec3( 0.0, 0.0, 1.0 ) * v;
  return vec3( 0.0, 0.0, 1.8 ) + r * ( ( z - 1.8 ) / min( r.z, - 1.0 ) );
}
float chord( vec3 o, vec3 s, vec3 a, vec3 b ) {                    // length of the sun ray inside a box (<= 0: misses)
  vec3 inv = 1.0 / s, t0 = ( a - o ) * inv, t1 = ( b - o ) * inv, lo = min( t0, t1 ), hi = max( t0, t1 );
  return min( min( hi.x, hi.y ), hi.z ) - max( max( lo.x, lo.y ), max( lo.z, 0.0 ) );
}
float boxS( vec3 o, vec3 s, vec3 a, vec3 b, float soft ) { return smoothstep( 0.0, soft, chord( o, s, a, b ) ); }
float pulse( float c, float duty, float e ) { float d = abs( fract( c ) - 0.5 ); return 1.0 - smoothstep( duty * 0.5 - e, duty * 0.5 + e, d ); }
float sunLit( vec2 uv, float zr, float self ) {
  vec3 o = scenePoint( uv, zr ), s = uSun; s.xy += vec2( 1e-4 ) * step( abs( s.xy ), vec2( 1e-4 ) );
  float lit = 1.0;
  // pavilion roof: a slab rising gently to the north, with its corner post
  { vec3 a = vec3( 7.25, - 7.42, 2.57 ), b = vec3( 40.0, 14.0, 6.0 ), inv = 1.0 / s, t0 = ( a - o ) * inv, t1 = ( b - o ) * inv, lo = min( t0, t1 ), hi = max( t0, t1 );
    float tn = max( max( lo.x, lo.y ), max( lo.z, 0.0 ) ), tf = min( min( hi.x, hi.y ), hi.z );
    float ns = s.z - 0.07 * s.y, lim = ( 3.3894 - ( o.z - 0.07 * o.y ) ) / ns; if ( ns > 0.0 ) tf = min( tf, lim ); else tn = max( tn, lim );
    lit *= 1.0 - smoothstep( 0.0, 0.05 + 0.02 * tn, tf - tn ); }
  lit *= 1.0 - boxS( o, s, vec3( 7.94, - 7.48, 0.0 ), vec3( 8.1, - 7.32, 2.57 ), 0.06 );                      // its two posts along the south edge...
  lit *= 1.0 - boxS( o, s, vec3( 10.97, - 7.48, 0.0 ), vec3( 11.13, - 7.32, 2.57 ), 0.06 );
  lit *= 1.0 - boxS( o, s, vec3( 10.1, - 7.45, 0.67 ), vec3( 12.25, - 7.35, 1.85 ), 0.04 );                  // ...the television hung on the second one...
  { vec2 SH[2] = vec2[2]( vec2( 12.14, - 7.78 ), vec2( 9.71, - 8.31 ) );                                        // ...and the two potted shrubs
    for ( int i = 0; i < 2; i ++ ) { vec3 c = vec3( SH[i], 0.72 ) - o; lit *= 1.0 - 0.92 * smoothstep( 0.36, 0.26, length( cross( c, s ) ) ) * step( 0.0, dot( c, s ) );
      lit *= 1.0 - boxS( o, s, vec3( SH[i] - 0.2, 0.0 ), vec3( SH[i] + 0.2, 0.45 ), 0.05 ); } }
  // south parapet wall
  lit *= 1.0 - boxS( o, s, vec3( - 12.0, - 9.98, 0.0 ), vec3( 9.2, - 9.72, 0.68 ), 0.08 );
  // pergola: two posts, the slatted screen between them, the louvred roof
  lit *= 1.0 - boxS( o, s, vec3( 2.97, - 9.62, 0.0 ), vec3( 3.1, - 9.49, 2.85 ), 0.05 );
  lit *= 1.0 - boxS( o, s, vec3( 5.8, - 9.62, 0.0 ), vec3( 5.93, - 9.49, 2.85 ), 0.05 );
  { float t = ( - 9.55 - o.y ) / s.y; if ( t > 0.0 ) { vec3 h = o + s * t; float pen = 0.015 + 0.0093 * t;
      float inside = smoothstep( 3.09 - pen, 3.09 + pen, h.x ) * smoothstep( 5.8 + pen, 5.8 - pen, h.x ) * smoothstep( 0.99 - pen, 0.99 + pen, h.z ) * smoothstep( 2.72 + pen, 2.72 - pen, h.z );
      float c = h.z / 0.068, e = clamp( 0.5 * 0.0093 * t / 0.068 + fwidth( c ) * 0.8, 0.03, 0.6 );
      lit *= 1.0 - inside * mix( pulse( c, 0.55, e ), 0.55, smoothstep( 0.35, 0.6, e ) ); } }
  { float t = ( 2.78 - o.z ) / s.z; vec3 h = o + s * t; float pen = 0.02 + 0.0093 * t;
    float inside = smoothstep( 3.0 - pen, 3.0 + pen, h.x ) * smoothstep( 6.15 + pen, 6.15 - pen, h.x ) * smoothstep( - 9.62 - pen, - 9.62 + pen, h.y ) * smoothstep( - 7.25 + pen, - 7.25 - pen, h.y ) * step( o.z, 2.7 );
    float open = max( 0.0, 0.085 - 0.10 * abs( s.x ) / s.z ) / 0.11;                                                   // light only slips between the blades when the sun lines up with them
    float frame = 1.0 - smoothstep( 3.0 + 0.09, 3.0 + 0.09 + pen, h.x ) * smoothstep( 6.15 - 0.09, 6.15 - 0.09 - pen, h.x ) * smoothstep( - 9.62 + 0.09, - 9.62 + 0.09 + pen, h.y ) * smoothstep( - 7.25 - 0.09, - 7.25 - 0.09 - pen, h.y );
    float c = h.x / 0.11, e = clamp( 0.5 * 0.0093 * t / 0.11 + fwidth( c ) * 0.8, 0.03, 0.6 ), duty = 1.0 - open;
    lit *= 1.0 - inside * max( frame, open > 0.002 ? mix( pulse( c, duty, e ), duty, smoothstep( 0.35, 0.6, e ) ) : 1.0 ); }
  // bar: stone counter and the timber shelf standing off it
  lit *= 1.0 - boxS( o, s, vec3( 2.85, - 7.83, 0.0 ), vec3( 5.72, - 7.18, 0.92 ), 0.07 );
  lit *= 1.0 - boxS( o, s, vec3( 2.7, - 7.38, 1.08 ), vec3( 5.75, - 6.93, 1.14 ), 0.03 );
  if ( self > 0.5 ) {
    // dining table: marble top on two stone drums, six rope chairs
    { float t = ( 0.70 - o.z ) / s.z; vec2 h = ( o.xy + s.xy * t - vec2( 4.5, - 5.12 ) ) / vec2( 1.0, 0.5 ); float pen = 0.03 + 0.0093 * t;
      float r = pow( pow( abs( h.x ), 2.6 ) + pow( abs( h.y ), 2.6 ), 1.0 / 2.6 );
      lit *= 1.0 - smoothstep( 1.0 + pen, 1.0 - pen, r ); }
    lit *= 1.0 - boxS( o, s, vec3( 3.93, - 5.34, 0.0 ), vec3( 4.35, - 4.94, 0.68 ), 0.07 );
    lit *= 1.0 - boxS( o, s, vec3( 4.76, - 5.3, 0.0 ), vec3( 5.1, - 4.96, 0.68 ), 0.07 );
    vec2 CH[6] = vec2[6]( vec2( 5.1, - 4.42 ), vec2( 4.25, - 4.42 ), vec2( 3.42, - 4.72 ), vec2( 5.97, - 5.2 ), vec2( 5.0, - 5.86 ), vec2( 4.1, - 5.86 ) );
    for ( int i = 0; i < 6; i ++ ) {
      vec3 cs = vec3( CH[i], 0.44 ) - o, cb = vec3( CH[i], 0.62 ) - o;                                          // seat, and the woven rope shell around it (lets some light through)
      float ds = length( cross( cs, s ) ), db = length( cross( cb, s ) );
      lit *= ( 1.0 - 0.9 * smoothstep( 0.3, 0.22, ds ) * step( 0.0, dot( cs, s ) ) ) * ( 1.0 - 0.6 * smoothstep( 0.4, 0.3, db ) * step( 0.0, dot( cb, s ) ) );
    }
  }
  return lit;
}

// The re-lit photograph at one point (linear light).
vec3 shade( vec2 uv ) {
  vec3 p = texture( uPlate, uv ).rgb;
  // live: leaves stir in the breeze (only the green of the hillside and the potted shrubs moves)
  if ( uWind > 0.001 ) {
    float fol = texture( uMask3, uv ).b, hill = fol * smoothstep( 0.78, 0.98, textureLod( uMask2, uv, 3.5 ).b ) * smoothstep( 0.47, 0.455, uv.y ), pot = fol * smoothstep( 0.455, 0.47, uv.y );
    float gust = 0.3 + 0.7 * smoothstep( 0.25, 0.75, fbm( uv * vec2( 2.2, 3.0 ) + vec2( uTime * 0.13, uTime * 0.04 ) ) );
    vec2 big = vec2( vn( uv * vec2( 13.0, 9.0 ) + vec2( uTime * 0.32, uTime * 0.1 ) ), vn( uv * vec2( 13.0, 9.0 ) + vec2( - uTime * 0.2, uTime * 0.27 ) + 3.1 ) ) - 0.5;      // boughs sway
    vec2 fine = vec2( vn( uv * vec2( 70.0, 44.0 ) + vec2( uTime * 1.5, uTime * 0.5 ) ), vn( uv * vec2( 70.0, 44.0 ) + vec2( - uTime * 0.9, uTime * 1.3 ) + 7.3 ) ) - 0.5;   // leaves flutter
    vec2 off = ( big * vec2( 0.0075, 0.004 ) + fine * 0.0034 ) * gust * hill;
    off += ( vec2( sin( uTime * 1.3 + uv.y * 30.0 ) * 0.0022, 0.0 ) + fine * 0.0026 ) * gust * pot * smoothstep( 0.56, 0.5, uv.y );
    p = texture( uPlate, uv + off * uWind ).rgb;
  }
  vec3 m1 = texture( uMask1, uv ).rgb, m2 = texture( uMask2, uv ).rgb, lt = texture( uLight, uv ).rgb;
  float L0 = lum( p );
  // 1. lift the lens-flare veil the morning sun left over the hill
  vec2 dv = ( uv - SUN0 ) * vec2( ASPECT, 1.0 ); float veil = exp( - dot( dv, dv ) / 0.073 );
  vec3 q = max( p - vec3( 0.72, 0.66, 1.05 ) * veil * uDeflare, 0.0 ) / ( 1.0 - 0.45 * veil * uDeflare );
  q += uVeil * veil;                                 // ...and, at golden hour, put a warm one back
  // 2. remove the baked sun/shadow pattern from the big uniform surfaces
  vec3 m3 = texture( uMask3, uv ).rgb; float L = lum( q ), md = m3.r, mt = m3.g;
  //    open porcelain: rebuild it as one even surface, keeping only its fine grain (and none of it along old shadow edges)
  vec3 pb = textureLod( uPlate, uv, 2.2 ).rgb, pb5 = textureLod( uPlate, uv, 5.0 ).rgb;
  float L5 = lum( pb5 );
  vec3 grainTex = pow( clamp( p / max( pb, vec3( 2e-3 ) ), 0.6, 1.6 ), vec3( 0.6 ) );
  grainTex = mix( vec3( 1.0 ), grainTex, 1.0 - smoothstep( 0.04, 0.14, abs( log( ( lum( pb ) + 2e-3 ) / ( L5 + 2e-3 ) ) ) ) );
  const vec3 FLOOR_REF = vec3( 0.058, 0.094, 0.172 );
  vec3 P0 = scenePoint( uv, 0.0 );                                                                             // this pixel on the terrace floor, in metres
  vec2 jd = abs( fract( P0.xy / 1.2 + 0.5 ) - 0.5 ) * 1.2, jw = fwidth( P0.xy ) * 0.9 + 0.004;
  float joint = max( 1.0 - smoothstep( 0.0, jw.x, jd.x ), 1.0 - smoothstep( 0.0, jw.y, jd.y ) ) * smoothstep( 0.06, 0.012, max( jw.x, jw.y ) );   // tile joints, fading with distance
  float mottle = ( 0.84 + 0.32 * fbm( P0.xy * 1.6 + 3.0 ) ) * ( 0.94 + 0.12 * fbm( P0.xy * 11.0 ) );
  vec3 cleanF = FLOOR_REF * grainTex * mottle * ( 1.0 - 0.3 * joint );
  //    floor under the dining set, the timber deck and the marble top: per-pixel, so furniture keeps its own tones.
  //    Each divides out the share of direct sun a pixel received (linear between that surface's shade and sun levels).
  float keepWhite = 1.0 - smoothstep( 0.92, 0.985, L );
  vec3 flatF = q / mix( vec3( 1.0 ), vec3( 10.5, 7.0, 3.5 ), clamp( ( L - 0.085 ) / 0.545, 0.0, 1.0 ) * keepWhite );
  vec3 flatD = q / mix( vec3( 1.0 ), vec3( 4.4, 4.0, 3.2 ), clamp( ( L - 0.165 ) / 0.555, 0.0, 1.0 ) * keepWhite );
  vec3 flatT = q / mix( vec3( 1.0 ), vec3( 4.4, 3.1, 1.87 ), clamp( ( L - 0.256 ) / 0.55, 0.0, 1.0 ) ) * vec3( 1.38, 1.0, 0.685 );
  vec3 m4 = texture( uMask4, uv ).rgb;
  const vec3 RW = vec3( 14.3, 12.7, 8.7 ), RR = vec3( 6.4, 5.8, 4.2 );                                         // how much brighter the timber and the rug are in sun than in the roof's shade
  vec3 flatW = q / mix( vec3( 1.0 ), RW, clamp( ( L - 0.045 ) / 0.5, 0.0, 1.0 ) * keepWhite );
  vec3 flatR = q / mix( vec3( 1.0 ), RR, clamp( ( L - 0.16 ) / 0.72, 0.0, 1.0 ) );
  vec3 qFlat = mix( mix( mix( mix( q, flatD, m2.r ), flatF, md ), cleanF, m1.b ), flatT, mt );
  float fm = max( max( max( m1.b, m2.r ), md ), mt ), isFloor = max( m1.b, md );
  vec3 relit = qFlat * mix( 0.58 * uFlatLevel * mix( vec3( 1.0 ), uFlatTint, 0.3 ), uFlatLevel * uFlatTint, isFloor );   // timber is warmer and darker than porcelain
  relit = mix( relit, qFlat * 0.72 * uFlatLevel, mt );
  q = mix( q, mix( q, relit, fm ), uFlat );
  q = mix( q, mix( mix( q, flatW * 1.5, m4.r ), flatR * 1.2, m4.g ), uFlat );                                 // evening: no stale patches of morning sun indoors
  // 2a. under the roof: the timber floor and rug take whatever sun reaches in beneath it at this hour
  if ( uDay > 0.001 && m4.r + m4.g > 0.004 ) {
    float litIn = sunLit( uv, 0.0, 0.0 );
    vec3 dayIn = mix( flatW * ( 1.0 + ( RW - 1.0 ) * uSunCol * 0.82 * litIn ), flatR * ( 1.0 + ( RR - 1.0 ) * uSunCol * 0.85 * litIn ), m4.g / max( m4.r + m4.g, 1e-3 ) );
    q = mix( q, dayIn, clamp( m4.r + m4.g, 0.0, 1.0 ) * uDay );
  }
  // 2b. daylight: the floor, deck and table start from their shade tone, and the sun is added back wherever it reaches now
  if ( uDay > 0.001 && fm > 0.004 ) {
    float open = max( max( m1.b, m2.r ), mt );
    if ( open > 0.004 ) {
      float lit = sunLit( uv, mix( mix( 0.0, DECK_Z, m2.r ), TABLE_Z, mt ), 1.0 - mt );
      vec3 ratio = mix( mix( vec3( 10.5, 7.0, 3.5 ), vec3( 4.4, 4.0, 3.2 ), m2.r ), vec3( 4.4, 3.1, 1.87 ), mt );
      vec3 base = mix( mix( mix( q, flatD, m2.r ), cleanF, m1.b ), flatT / vec3( 1.38, 1.0, 0.685 ), mt );
      float gain = mix( mix( 0.66, 0.42, m2.r ), 0.9, mt );
      q = mix( q, mix( q, base * ( 1.0 + ( ratio - 1.0 ) * uSunCol * gain * lit ), open ), uDay );
    }
    // the dining set keeps its photographed light, and only darkens when the pergola, bar or roof shade it
    float set = md * ( 1.0 - open );
    if ( set > 0.004 ) {
      float cover = 1.0 - sunLit( uv, 0.0, 0.0 );
      vec3 kept = q / mix( vec3( 1.0 ), vec3( 10.5, 7.0, 3.5 ), clamp( ( L - 0.085 ) / 0.545, 0.0, 1.0 ) * keepWhite * cover );
      // ...while the floor showing between the legs follows the new shadows like the rest of the terrace
      float isF = smoothstep( 0.42, 0.5, L ) * smoothstep( 0.76, 0.68, L ) * smoothstep( 0.2, 0.12, ( max( q.r, max( q.g, q.b ) ) - min( q.r, min( q.g, q.b ) ) ) / ( L + 1e-3 ) )
                + smoothstep( 0.05, 0.065, L ) * smoothstep( 0.14, 0.115, L ) * smoothstep( 1.9, 2.5, q.b / ( q.r + 1e-3 ) );
      float litSet = sunLit( uv, 0.0, 1.0 );
      vec3 floorNow = cleanF * ( 1.0 + ( vec3( 10.5, 7.0, 3.5 ) - 1.0 ) * uSunCol * 0.66 * litSet );
      // deep-shade pixels that were not clearly floor (rope, legs, the floor right under a seat) lift part-way when the sun now reaches them
      float deep = smoothstep( 0.07, 0.03, L ) * smoothstep( 1.4, 2.0, q.b / ( q.r + 1e-3 ) );
      kept *= 1.0 + vec3( 3.2, 2.6, 1.7 ) * deep * litSet * min( 1.0, uSunCol.g );
      q = mix( q, mix( kept, floorNow, clamp( isF, 0.0, 1.0 ) ), set * uDay );
    }
  }
  // 3. overall dynamic range (overcast and night light is soft)
  q = 0.18 * pow( q / 0.18, vec3( uGamma ) );
  L = lum( q );
  // 4. colour of the light: cool in shade, warm in sun
  vec3 c = q * mix( uShadeTint, uSunTint, smoothstep( 0.05, 0.42, L ) ) * uExpo;
  c *= mix( vec3( 1.0 ), vec3( 0.9, 1.1, 0.84 ), clamp( m3.b * m2.b * uVib * 1.2, 0.0, 1.0 ) );               // the hillside reads greener
  c = mix( c, c * uBgTint, m2.b * uBgDim );
  // live: the shadow of a passing cloud crosses the terrace and the hill
  if ( uCloudSh > 0.001 ) {
    vec2 g = vec2( uv.x * 1.5 + uv.y * 1.1, uv.y * 2.4 - uv.x * 0.25 );
    float sh = smoothstep( 0.47, 0.67, fbm( g * 1.15 + vec2( - uTime * 0.0045 * uCloudSpd, uTime * 0.0009 * uCloudSpd ) ) );
    float sunl = smoothstep( 0.05, 0.42, L );
    c *= mix( vec3( 1.0 ), mix( vec3( 0.9, 0.93, 0.98 ), vec3( 0.55, 0.6, 0.7 ), sunl ), sh * uCloudSh );
  }
  float mistDrift = 0.72 + 0.56 * fbm( uv * vec2( 2.4, 5.0 ) + vec2( uTime * 0.035 * uShimmer, uTime * 0.008 * uShimmer ) );
  c = mix( c, uMistCol, clamp( m2.b * uMist * mix( 1.0, mistDrift, step( 0.001, uShimmer ) ) * ( 0.35 + 0.65 * smoothstep( 0.5, 0.05, uv.y ) ), 0.0, 1.0 ) );
  // 5. the house lights
  if ( uLights > 0.001 ) {
    vec3 alb = min( qFlat * 3.4, vec3( 0.95 ) );
    alb = mix( alb, min( mix( flatW * 12.0, flatR * 5.0, m4.g / max( m4.r + m4.g, 1e-3 ) ), vec3( 0.95 ) ), clamp( m4.r + m4.g, 0.0, 1.0 ) );
    alb = mix( vec3( lum( alb ) ), alb, 0.8 );
    vec3 lamp = alb * uLampCol * lt.r * uLampGain;
    vec3 inter = p * vec3( 1.0, 0.8, 0.55 ) * uInterior * m1.g;
    vec2 tc = floor( uv * vec2( 480.0, 270.0 ) ); float th = h21( tc );
    float tw = 1.0 - uTwinkle * 0.6 * ( 0.5 + 0.5 * sin( uTime * ( 1.6 + 5.0 * th ) + th * 50.0 ) );                      // far lights scintillate
    float breathe = 1.0 + uShimmer * 0.035 * sin( uTime * 0.9 + uv.x * 9.0 ) * step( 0.001, lt.g );                       // warm sources are never perfectly steady
    vec3 glow = uLampCol * ( lt.g * 2.2 + lt.g * lt.g * 3.0 ) * breathe + vec3( 1.0, 0.84, 0.62 ) * lt.b * 1.5 * tw;
    float halo = textureLod( uMask1, uv, 6.0 ).g;
    c += ( lamp + inter + glow + uLampCol * halo * 0.06 ) * uLights;
  }
  // 6. sky
  float key = m1.r * smoothstep( 0.5, 0.74, pow( L0, 0.4545 ) );
  vec3 sky = skyColor( uv ) * mix( 1.0, clamp( L0 / 0.7, 0.72, 1.22 ), uCloudDetail );
  return mix( c, sky, key );
}
// Line where standing things meet the floor (for puddle reflections).
float reflBase( float x ) {
  vec2 P[7] = vec2[7]( vec2( 0.0, 0.715 ), vec2( 0.34, 0.632 ), vec2( 0.49, 0.612 ), vec2( 0.492, 0.679 ), vec2( 0.726, 0.726 ), vec2( 0.754, 0.668 ), vec2( 1.0, 0.668 ) );
  float y = P[0].y;
  for ( int i = 0; i < 6; i ++ ) if ( x >= P[i].x ) y = mix( P[i].y, P[i + 1].y, clamp( ( x - P[i].x ) / ( P[i + 1].x - P[i].x ), 0.0, 1.0 ) );
  return y;
}
float rain( vec2 uv, float t ) {
  float acc = 0.0;
  for ( int i = 0; i < 4; i ++ ) {
    float fi = float( i );
    vec2 p = uv * vec2( 74.0 + fi * 48.0, 3.0 + fi * 1.3 );
    p.x += uv.y * ( 8.0 + fi * 3.0 ); p.y -= t * ( 7.0 + fi * 3.5 ) + fi * 3.7;
    vec2 ip = floor( p ); float r = h21( ip + fi * 17.0 ), fy = fract( p.y );
    float x = fract( p.x ) - 0.5 + ( r - 0.5 ) * 0.5;
    acc += smoothstep( 0.05, 0.0, abs( x ) ) * step( 0.62, r ) * smoothstep( 0.0, 0.3, fy ) * smoothstep( 1.0, 0.5, fy ) * ( 0.55 - fi * 0.1 );
  }
  return acc;
}
// A small flock crossing in front of the hill.
float birds( vec2 uv, float t ) {
  float acc = 0.0;
  for ( int i = 0; i < 4; i ++ ) {
    float fi = float( i ), period = 34.0 + fi * 9.0, ph = fract( ( t + fi * 13.7 ) / period );
    vec2 c = vec2( mix( 1.08, - 0.08, ph ) + fi * 0.012, 0.085 + 0.035 * fi + 0.02 * sin( ph * 9.0 + fi * 2.0 ) - ph * 0.03 );
    vec2 d = ( uv - c ) * vec2( ASPECT, 1.0 ) / ( 0.0085 - fi * 0.0008 );
    float flap = sin( t * ( 7.0 + fi ) + fi * 1.7 ) * 0.55;
    float wing = abs( d.y + abs( d.x ) * flap - 0.12 * ( 1.0 - d.x * d.x ) );
    acc += smoothstep( 0.2, 0.05, wing ) * smoothstep( 1.0, 0.75, abs( d.x ) );
  }
  return clamp( acc, 0.0, 1.0 );
}
void main() {
  vec2 uv = ( vUv - 0.5 ) / uCam.z + 0.5 + uCam.xy;
  vec3 c = shade( uv );
  if ( uBirds > 0.001 ) c = mix( c, c * 0.22, birds( uv, uTime ) * uBirds * texture( uMask2, uv ).b );
  if ( uWet > 0.001 ) {
    float gloss = texture( uMask2, uv ).g;
    if ( gloss > 0.01 ) {
      float yb = reflBase( uv.x ), dy = uv.y - yb;
      float rip = ( vn( uv * vec2( 90.0, 260.0 ) + uTime * 0.6 ) - 0.5 ) * 0.006 + ( vn( uv * vec2( 14.0, 40.0 ) ) - 0.5 ) * 0.01;
      vec3 refl = vec3( 0.0 );
      for ( int i = 0; i < 4; i ++ ) { float k = 1.0 + float( i ) * 0.07; refl += shade( clamp( vec2( uv.x + rip, yb - dy * k + rip ), 0.0, 1.0 ) ); }
      refl *= 0.25;
      float fres = 0.1 + 0.5 * smoothstep( 1.0, 0.62, uv.y );
      float puddle = smoothstep( 0.35, 0.65, fbm( uv * vec2( 7.0, 18.0 ) + 3.0 ) );
      c = mix( c * mix( 1.0, 0.8, uWet ), refl, gloss * uWet * fres * ( 0.55 + 0.45 * puddle ) * step( 0.0, dy ) );
    }
  }
  // lens + film
  float l = lum( c );
  c = mix( vec3( l ), c, uSat );
  { float mx = max( c.r, max( c.g, c.b ) ), mn = min( c.r, min( c.g, c.b ) ), sat = ( mx - mn ) / ( mx + 1e-3 );       // vibrancy: lift the quieter colours most
    c = max( mix( vec3( l ), c, 1.0 + uVib * ( 1.0 - sat ) ), 0.0 ); }
  c = max( 0.18 * pow( max( c, 0.0 ) / 0.18, vec3( uCon ) ), 0.0 ) * uTint;
  c = mix( c, 0.82 + 0.18 * tanh( ( c - 0.82 ) / 0.18 ), step( 0.82, c ) );
  if ( uRain > 0.001 ) c += vec3( 0.7, 0.76, 0.84 ) * rain( uv, uTime ) * 0.1 * uRain;
  vec2 vq = ( uv - 0.5 ) * vec2( 1.0, 0.82 );
  c *= 1.0 - uVig * smoothstep( 0.3, 0.86, length( vq ) );
  c = clamp( c, 0.0, 1.0 );
  c = mix( c * 12.92, 1.055 * pow( c, vec3( 1.0 / 2.4 ) ) - 0.055, step( 0.0031308, c ) );
  c += ( h21( uv * uRes + fract( uTime ) * 91.7 ) - 0.5 ) * uGrain;
  if ( uDbg > 0.5 ) { float g = sunLit( uv, 0.0, 1.0 ); vec3 P = scenePoint( uv, 0.0 ); float grid = step( 0.96, fract( P.x ) ) + step( 0.96, fract( P.y ) ); c = mix( c, vec3( g, g * 0.9 + 0.1 * grid, 0.3 + 0.7 * grid ), 0.7 * step( 0.3945, uv.y ) ); }
  outColor = vec4( c, 1.0 );
}`;

const prog = gl.createProgram();
gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT)); gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
gl.linkProgram(prog);
if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
gl.useProgram(prog);
const UL = {};
for (let i = 0, n = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS); i < n; i++) { const u = gl.getActiveUniform(prog, i); UL[u.name] = { loc: gl.getUniformLocation(prog, u.name), type: u.type }; }
function setUniform(name, v) {
  const u = UL[name]; if (!u) return;
  if (u.type === gl.FLOAT) gl.uniform1f(u.loc, v);
  else if (u.type === gl.FLOAT_VEC2) gl.uniform2f(u.loc, v[0], v[1]);
  else if (u.type === gl.FLOAT_VEC3) gl.uniform3f(u.loc, v[0], v[1], v[2]);
}
texFrom(m1c, 1); gl.uniform1i(UL.uMask1.loc, 1);
texFrom(m2c, 2); gl.uniform1i(UL.uMask2.loc, 2);
texFrom(ltc, 3); gl.uniform1i(UL.uLight.loc, 3);
texFrom(m3c, 4); gl.uniform1i(UL.uMask3.loc, 4);
texFrom(m4c, 5); gl.uniform1i(UL.uMask4.loc, 5);
gl.uniform1i(UL.uPlate.loc, 0);
let plateReady = false;
const plateImg = OPT.plate;
function plateLoaded() { texFrom(plateImg, 0, { srgb: true }); plateReady = true; }

// ── The twelve moments: how the photograph is lit, and what the home is doing ──
// Light values are linear multipliers on the daylight plate. "flat" removes the baked sun/shadow pattern.
const LOOK0 = {
  expo: 1, gamma: 1, flat: 0, flatLevel: 2.4, flatTint: [1.5, 0.9, 0.5], shadeTint: [1, 1, 1], sunTint: [1, 1, 1],
  sat: 1.04, con: 1.03, tint: [1, 1, 1], vig: 0.2, grain: 0.012,
  lights: 0, lampGain: 1.05, interior: 0.85, lampCol: [1.0, 0.63, 0.3],
  deflare: 0.15, veil: [0, 0, 0],
  skyTop: [0.36, 0.56, 0.86], skyLow: [0.8, 0.89, 0.96], sunUV: [0.69, -0.23], glowCol: [1.0, 0.95, 0.86], sunGlow: 0.55, disc: 0,
  cloud: 0.42, cloudLit: [1.0, 1.0, 1.0], cloudDark: [0.72, 0.78, 0.88], cloudDetail: 0.55, stars: 0, moon: 0, moonUV: [0.795, 0.062],
  bgDim: 0, bgTint: [1, 1, 1], mist: 0, mistCol: [0.6, 0.65, 0.72], wet: 0, rain: 0,
};
const STATES = [
  { id: 'dawn', label: 'Dawn', time: '05:48',
    look: { expo: 0.52, gamma: 0.8, flat: 1, flatLevel: 1.7, flatTint: [1.25, 0.93, 0.66], shadeTint: [0.5, 0.6, 0.88], sunTint: [0.56, 0.62, 0.86], sat: 0.96, vig: 0.3,
      lights: 0.85, lampGain: 0.95, interior: 0.72, deflare: 1,
      skyTop: [0.085, 0.13, 0.31], skyLow: [0.62, 0.4, 0.4], sunUV: [0.76, 0.24], glowCol: [1.0, 0.52, 0.3], sunGlow: 0.42,
      cloud: 0.4, cloudLit: [0.62, 0.42, 0.46], cloudDark: [0.12, 0.14, 0.26], cloudDetail: 0.2, stars: 0.3,
      bgDim: 0.5, bgTint: [0.6, 0.68, 0.9], mist: 0.1, mistCol: [0.2, 0.23, 0.36] },
    wx: { temp: 11, cond: 'Clear', icon: 'moon', hi: 21, lo: 11 },
    en: { solar: 0, today: 0, grid: 0, batt: 34, flow: -0.8, home: 0.8 }, status: ['Running on battery', 'First light in 26 minutes'] },
  { id: 'sunrise', label: 'Sunrise', time: '06:14',
    look: { expo: 0.84, gamma: 0.93, shadeTint: [0.66, 0.66, 0.84], sunTint: [1.3, 0.82, 0.48], sat: 1.08, vig: 0.26,
      lights: 0.3, lampGain: 0.8, interior: 0.5, deflare: 1, veil: [0.62, 0.34, 0.12],
      skyTop: [0.26, 0.38, 0.7], skyLow: [1.0, 0.7, 0.46], sunUV: [0.705, 0.03], glowCol: [1.0, 0.62, 0.28], sunGlow: 1.25, disc: 7,
      cloud: 0.44, cloudLit: [1.0, 0.72, 0.56], cloudDark: [0.46, 0.42, 0.58], cloudDetail: 0.35 },
    wx: { temp: 11, cond: 'Clear', icon: 'sunrise', hi: 21, lo: 11 },
    en: { solar: 0.2, today: 0.0, grid: 0, batt: 31, flow: -0.7, home: 0.9 }, status: ['Solar is waking up', 'The battery carries the home a little longer'] },
  { id: 'morning', label: 'Morning', time: '08:30',
    look: { expo: 0.98, sunTint: [1.1, 1.0, 0.86], shadeTint: [0.94, 0.97, 1.05], deflare: 0.35, veil: [0.2, 0.15, 0.08], skyTop: [0.38, 0.56, 0.84], skyLow: [0.95, 0.9, 0.82], glowCol: [1.0, 0.9, 0.72], sunGlow: 0.7, cloudLit: [1.0, 0.95, 0.88] },
    wx: { temp: 13, cond: 'Sunny', icon: 'sun', hi: 21, lo: 11 },
    en: { solar: 2.1, today: 1.9, grid: 0, batt: 38, flow: 0.9, home: 1.2 }, status: ['Running on solar', 'Extra sunshine is charging the battery'] },
  { id: 'late-morning', label: 'Late morning', time: '10:30',
    look: { expo: 1.03, sunTint: [1.03, 1.0, 0.95], deflare: 0.6, skyTop: [0.28, 0.5, 0.86], skyLow: [0.72, 0.85, 0.96], sunUV: [0.66, -0.45], sunGlow: 0.4, cloud: 0.36 },
    wx: { temp: 17, cond: 'Sunny', icon: 'sun', hi: 21, lo: 11 },
    en: { solar: 3.9, today: 7.4, grid: 0, batt: 55, flow: 2.3, home: 1.6 }, status: ['Running on solar', 'Battery will be full around 13:30'] },
  { id: 'noon', label: 'Noon', time: '12:11',
    look: { expo: 1.07, gamma: 0.97, con: 1.06, sat: 1.07, shadeTint: [1.04, 1.02, 0.98], sunTint: [1.0, 1.0, 1.0], deflare: 1, skyTop: [0.2, 0.43, 0.88], skyLow: [0.6, 0.78, 0.97], sunUV: [0.6, -0.8], sunGlow: 0.2, cloud: 0.4 },
    wx: { temp: 18, cond: 'Sunny', icon: 'sun', hi: 21, lo: 11 },
    en: { solar: 4.5, today: 13.8, grid: 0, batt: 76, flow: 2.2, home: 2.3 }, status: ['Running on solar', 'Extra sunshine is charging the battery'] },
  { id: 'afternoon', label: 'Afternoon', time: '14:20',
    look: { expo: 1.0, gamma: 0.97, sunTint: [1.13, 1.0, 0.82], shadeTint: [0.98, 0.97, 1.02], sat: 1.06, deflare: 0.8, veil: [0.16, 0.12, 0.06], skyTop: [0.3, 0.5, 0.84], skyLow: [0.9, 0.88, 0.84], sunUV: [0.85, -0.3], glowCol: [1.0, 0.9, 0.7], sunGlow: 0.5, cloud: 0.34, cloudLit: [1.0, 0.96, 0.88] },
    wx: { temp: 20, cond: 'Sunny', icon: 'sun', hi: 21, lo: 11 },
    en: { solar: 3.6, today: 21.6, grid: 0, batt: 93, flow: 1.6, home: 2.0 }, status: ['Running on solar', 'Battery is nearly full'] },
  { id: 'golden-hour', label: 'Golden hour', time: '15:50',
    look: { expo: 0.96, gamma: 0.95, sunTint: [1.34, 0.9, 0.52], shadeTint: [0.82, 0.8, 0.96], sat: 1.1, vig: 0.26,
      lights: 0.18, lampGain: 0.7, interior: 0.4, deflare: 1, veil: [0.6, 0.36, 0.14],
      skyTop: [0.34, 0.45, 0.72], skyLow: [1.0, 0.78, 0.5], sunUV: [0.69, -0.07], glowCol: [1.0, 0.7, 0.34], sunGlow: 1.0,
      cloud: 0.42, cloudLit: [1.0, 0.82, 0.58], cloudDark: [0.58, 0.54, 0.66], cloudDetail: 0.4 },
    wx: { temp: 21, cond: 'Sunny', icon: 'sun', hi: 21, lo: 11 },
    en: { solar: 1.4, today: 25.9, grid: 0, batt: 100, flow: 0, home: 1.4 }, status: ['Running on solar', 'Battery is full and ready for tonight'] },
  { id: 'sunset', label: 'Sunset', time: '16:34',
    look: { expo: 0.66, gamma: 0.84, flat: 0.93, flatLevel: 2.2, flatTint: [1.5, 0.86, 0.6], shadeTint: [0.86, 0.66, 0.7], sunTint: [1.08, 0.72, 0.56], sat: 1.08, vig: 0.3,
      lights: 0.68, lampGain: 0.95, interior: 0.7, deflare: 1, veil: [0.16, 0.07, 0.04],
      skyTop: [0.24, 0.27, 0.56], skyLow: [1.0, 0.5, 0.27], sunUV: [0.8, 0.2], glowCol: [1.0, 0.45, 0.2], sunGlow: 0.85,
      cloud: 0.5, cloudLit: [1.0, 0.52, 0.36], cloudDark: [0.32, 0.26, 0.44], cloudDetail: 0.3,
      bgDim: 0.35, bgTint: [0.78, 0.66, 0.78] },
    wx: { temp: 21, cond: 'Clear', icon: 'sunset', hi: 21, lo: 11 },
    en: { solar: 0.2, today: 26.8, grid: 0, batt: 98, flow: -1.6, home: 1.8 }, status: ['Switching to battery', 'The sun is setting, stored energy takes over'] },
  { id: 'dusk', label: 'Dusk', time: '17:10',
    look: { expo: 0.4, gamma: 0.78, flat: 1, flatLevel: 1.6, flatTint: [1.25, 0.93, 0.66], shadeTint: [0.36, 0.44, 0.78], sunTint: [0.38, 0.46, 0.78], sat: 1.0, vig: 0.34,
      lights: 1, lampGain: 1.12, interior: 0.9, deflare: 1,
      skyTop: [0.04, 0.07, 0.22], skyLow: [0.36, 0.25, 0.4], sunUV: [0.82, 0.24], glowCol: [1.0, 0.42, 0.24], sunGlow: 0.3,
      cloud: 0.4, cloudLit: [0.4, 0.26, 0.38], cloudDark: [0.05, 0.06, 0.16], cloudDetail: 0.15, stars: 0.5,
      bgDim: 0.6, bgTint: [0.52, 0.58, 0.85] },
    wx: { temp: 20, cond: 'Clear', icon: 'moon', hi: 21, lo: 11 },
    en: { solar: 0, today: 26.9, grid: 0, batt: 92, flow: -2.6, home: 2.6 }, status: ['Running on battery', 'Enough stored energy for the night'] },
  { id: 'night', label: 'Night', time: '22:40',
    look: { expo: 0.3, gamma: 0.76, flat: 1, flatLevel: 1.5, flatTint: [1.2, 0.95, 0.72], shadeTint: [0.17, 0.24, 0.5], sunTint: [0.2, 0.27, 0.52], sat: 0.96, vig: 0.4,
      lights: 1, lampGain: 1.22, interior: 1.0, deflare: 1,
      skyTop: [0.011, 0.018, 0.055], skyLow: [0.028, 0.042, 0.105], sunUV: [0.795, 0.062], glowCol: [0.6, 0.7, 1.0], sunGlow: 0.0,
      cloud: 0.36, cloudLit: [0.1, 0.12, 0.2], cloudDark: [0.012, 0.016, 0.04], cloudDetail: 0.1, stars: 1, moon: 1,
      bgDim: 0.75, bgTint: [0.42, 0.5, 0.8] },
    wx: { temp: 15, cond: 'Clear', icon: 'moon', hi: 21, lo: 11 },
    en: { solar: 0, today: 26.9, grid: 0, batt: 61, flow: -1.1, home: 1.1 }, status: ['Running on battery', 'On track to last until sunrise'] },
  { id: 'cloudy', label: 'Cloudy', time: '13:00',
    look: { expo: 0.98, gamma: 0.62, flat: 0.94, flatLevel: 3.1, flatTint: [1.5, 0.9, 0.5], shadeTint: [1.12, 1.0, 0.88], sunTint: [0.94, 0.96, 1.0], sat: 0.84, con: 1.08, vig: 0.24,
      lights: 0.1, lampGain: 0.6, interior: 0.3, deflare: 1,
      skyTop: [0.5, 0.54, 0.6], skyLow: [0.7, 0.72, 0.76], sunUV: [0.6, -0.6], sunGlow: 0.0,
      cloud: 1.25, cloudLit: [0.8, 0.82, 0.86], cloudDark: [0.46, 0.5, 0.56], cloudDetail: 0.1 },
    wx: { temp: 19, cond: 'Overcast', icon: 'cloud', hi: 21, lo: 11 },
    en: { solar: 1.3, today: 6.2, grid: 0, batt: 58, flow: -0.8, home: 2.1 }, status: ['Solar and battery', 'Cloud cover — the battery is topping up the home'] },
  { id: 'rain', label: 'Rain', time: '14:30',
    look: { expo: 0.74, gamma: 0.62, flat: 1, flatLevel: 2.5, flatTint: [1.45, 0.9, 0.54], shadeTint: [0.98, 0.98, 1.0], sunTint: [0.76, 0.82, 0.92], sat: 0.76, con: 1.06, vig: 0.32,
      lights: 0.52, lampGain: 0.9, interior: 0.62, deflare: 1,
      skyTop: [0.3, 0.33, 0.39], skyLow: [0.43, 0.46, 0.51], sunUV: [0.6, -0.6], sunGlow: 0.0,
      cloud: 1.35, cloudLit: [0.52, 0.55, 0.6], cloudDark: [0.27, 0.3, 0.35], cloudDetail: 0.08,
      bgDim: 0.2, bgTint: [0.8, 0.84, 0.92], mist: 0.34, mistCol: [0.42, 0.45, 0.5], wet: 1, rain: 1 },
    wx: { temp: 20, cond: 'Rain', icon: 'rain', hi: 21, lo: 11 },
    en: { solar: 0.4, today: 2.4, grid: 1.8, batt: 41, flow: 0, home: 2.2 }, status: ['Running on grid', 'Low sunlight — the grid is covering the rest'] },
];
STATES.forEach(s => { s.look = { ...LOOK0, ...s.look }; });
function blendLook(a, b, t, out = {}) {
  for (const k in a) { const va = a[k], vb = b[k]; out[k] = Array.isArray(va) ? va.map((v, i) => lerp(v, vb[i], t)) : lerp(va, vb, t); }
  return out;
}
const UNI = { expo: 'uExpo', gamma: 'uGamma', flat: 'uFlat', flatLevel: 'uFlatLevel', flatTint: 'uFlatTint', shadeTint: 'uShadeTint', sunTint: 'uSunTint', sat: 'uSat', con: 'uCon', tint: 'uTint', vig: 'uVig', grain: 'uGrain',
  lights: 'uLights', lampGain: 'uLampGain', interior: 'uInterior', lampCol: 'uLampCol', deflare: 'uDeflare', veil: 'uVeil', skyTop: 'uSkyTop', skyLow: 'uSkyLow', sunUV: 'uSunUV', glowCol: 'uGlowCol', sunGlow: 'uSunGlow', disc: 'uDisc',
  cloud: 'uCloud', cloudLit: 'uCloudLit', cloudDark: 'uCloudDark', cloudDetail: 'uCloudDetail', stars: 'uStars', moon: 'uMoon', moonUV: 'uMoonUV', bgDim: 'uBgDim', bgTint: 'uBgTint', mist: 'uMist', mistCol: 'uMistCol', wet: 'uWet', rain: 'uRain' };
function applyLook(L) { for (const k in UNI) setUniform(UNI[k], L[k]); }

// ── Live layer: motion styles, and the real sun ──
const LAT = 33.8414, LON = 35.5509;
const AXIS = 15;                       // the terrace's long axis points about 15° east of true south (measured from the photograph's own shadows)
function sunPos(d) {                   // NOAA approximation → { az, el } in degrees, az clockwise from north
  const rad = Math.PI / 180, jd = d.getTime() / 86400000 + 2440587.5, n = jd - 2451545.0;
  const L = (280.46 + 0.9856474 * n) % 360, g = ((357.528 + 0.9856003 * n) % 360) * rad;
  const lam = (L + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * rad, eps = (23.439 - 0.0000004 * n) * rad;
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lam), Math.cos(lam)), dec = Math.asin(Math.sin(eps) * Math.sin(lam));
  const gmst = (18.697374558 + 24.06570982441908 * n) % 24, lst = (gmst * 15 + LON) * rad, ha = lst - ra, la = LAT * rad;
  const el = Math.asin(Math.sin(la) * Math.sin(dec) + Math.cos(la) * Math.cos(dec) * Math.cos(ha));
  const az = Math.atan2(-Math.sin(ha), Math.tan(dec) * Math.cos(la) - Math.sin(la) * Math.cos(ha));
  return { az: (az / rad + 360) % 360, el: el / rad };
}
const hourOf = s => { const p = s.time.split(':'); return +p[0] + (+p[1]) / 60; };
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
// cam = [pan x, pan y, zoom amount]; sun: shadows follow the real sun; vib: richer colour
const LIVE = {
  still:     { wind: 0,    cloudSpd: 1,   cloudSh: 0,    birds: 0, twinkle: 0,   shimmer: 0, cam: [0, 0, 0], sun: 0, vib: 0 },
  calm:      { wind: 0.55, cloudSpd: 3.5, cloudSh: 0,    birds: 0, twinkle: 0.5, shimmer: 0.6, cam: [0, 0, 0], sun: 1, vib: 1 },
  breeze:    { wind: 1.0,  cloudSpd: 7,   cloudSh: 0.85, birds: 1, twinkle: 0.9, shimmer: 1, cam: [0, 0, 0], sun: 1, vib: 1 },
  cinematic: { wind: 1.0,  cloudSpd: 7,   cloudSh: 0.85, birds: 1, twinkle: 0.9, shimmer: 1, cam: [0.012, 0.006, 0.05], sun: 1, vib: 1 },
};
function applyLive(st, L, t, hour) {
  const day = clamp(1 - L.lights * 1.25, 0, 1) * (L.cloud > 1 ? 0 : 1);          // cloud shadows and birds belong to clear daylight
  setUniform('uWind', st.wind * (L.rain > 0.5 ? 1.5 : 1)); setUniform('uCloudSpd', st.cloudSpd * (L.cloud > 1 ? 2.2 : 1));
  setUniform('uCloudSh', st.cloudSh * day); setUniform('uBirds', st.birds * clamp(1 - L.lights * 2.5, 0, 1) * (L.rain > 0.5 ? 0 : 1));
  setUniform('uTwinkle', st.twinkle); setUniform('uShimmer', st.shimmer);
  const a = t * 2 * Math.PI / 48, z = 1 + st.cam[2] * (0.5 - 0.5 * Math.cos(a)), k = (z - 1) / Math.max(st.cam[2], 1e-6);   // slow 48-second breath
  setUniform('uCam', [st.cam[0] * Math.sin(a) * k, st.cam[1] * Math.sin(a * 0.5) * k, z]);
  // the sun, where it really is at this hour above Yarze
  const d0 = new Date(); d0.setHours(0, 0, 0, 0); const p = sunPos(new Date(d0.getTime() + hour * 3600e3));
  const e = Math.max(p.el, 0.6) * Math.PI / 180, az = (p.az + AXIS) * Math.PI / 180;
  setUniform('uSun', [Math.sin(az) * Math.cos(e), Math.cos(az) * Math.cos(e), Math.sin(e)]);
  const reach = p.az < 180 ? smooth(6, 13, p.el) : smooth(1, 6, p.el);            // the eastern hill hides the first hour of sun
  const str = Math.min(1.45, Math.sin(e) / 0.358) * reach * 0.92;
  const lo = clamp((p.el - 6) / 15, 0, 1), up = clamp((p.el - 21) / 14, 0, 1);                                   // amber when low, neutral at the photograph's own hour, a touch cooler at midday
  setUniform('uSunCol', [lerp(1.12, lerp(1, 0.96, up), lo) * str, lerp(0.82, 1, lo) * str, lerp(0.55, lerp(1, 1.07, up), lo) * str]);
  setUniform('uDbg', 0);
  setUniform('uDay', st.sun * (1 - L.flat) * (L.cloud > 1 ? 0 : 1));
  setUniform('uVib', 0.8 * st.vib); setUniform('uSat', L.sat * (1 + 0.3 * st.vib)); setUniform('uCon', L.con * (1 + 0.07 * st.vib));
  setUniform('uDeflare', Math.max(L.deflare, 0.9 * st.vib));
}


// ── Driver: real clock, real sun, real weather ──
const STYLE = LIVE[OPT.style || 'cinematic'] || LIVE.cinematic;
const byId = {}; STATES.forEach(s => { byId[s.id] = s; });
const nowFn = OPT.now || (() => new Date());
let wx = { cloud: 0, rain: 0, code: 0 };
// The moments are keyed to how high the sun stands, so the light is right in any season.
const dayCache = {};
function dayInfo(d) { const k = d.toDateString(); if (dayCache[k]) return dayCache[k];
  const b = new Date(d); b.setHours(0, 0, 0, 0); let M = -90, noon = 720;
  for (let m = 0; m <= 1440; m += 4) { const e = sunPos(new Date(b.getTime() + m * 60000)).el; if (e > M) { M = e; noon = m; } }
  return dayCache[k] = { M, noon,
    am: [[-14, 'night'], [-5.5, 'dawn'], [-0.5, 'sunrise'], [0.6 * M, 'morning'], [0.93 * M, 'late-morning'], [M, 'noon']],
    pm: [[-14, 'night'], [-7.5, 'dusk'], [0, 'sunset'], [Math.min(9, 0.3 * M), 'golden-hour'], [0.65 * M, 'afternoon'], [M, 'noon']] }; }
const look = { ...STATES[0].look }; let hour = 12, phase = '';
function updateLook() {
  const d = nowFn(), m = d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60, di = dayInfo(d), el = sunPos(d).el; hour = m / 60;
  const keys = m < di.noon ? di.am : di.pm; let fa = 'night', fb = 'night', w = 0;
  if (el >= keys[keys.length - 1][0]) fa = fb = 'noon';
  else for (let i = 0; i < keys.length - 1; i++) if (el >= keys[i][0] && el < keys[i + 1][0]) { fa = keys[i][1]; fb = keys[i + 1][1]; w = (el - keys[i][0]) / (keys[i + 1][0] - keys[i][0]); break; }
  w = w * w * (3 - 2 * w); blendLook(byId[fa].look, byId[fb].look, w, look);
  let ovc = clamp((wx.cloud / 100 - 0.45) / 0.45, 0, 1); if (wx.rain > 0) ovc = Math.max(ovc, 0.9);
  if (el > 6) { if (ovc > 0.001) blendLook({ ...look }, byId[wx.rain > 0 ? 'rain' : 'cloudy'].look, ovc * Math.min(1, (el - 6) / 6), look); }
  else if (ovc > 0.001) {                                   // cloud and rain after dark: no stars, a veiled moon, wet stone
    look.stars *= 1 - ovc; look.moon *= 1 - 0.85 * ovc; look.cloud = lerp(look.cloud, 1.25, ovc); look.sunGlow *= 1 - ovc;
    if (wx.rain > 0) { look.wet = 1; look.rain = 1; look.mist = Math.max(look.mist, 0.22); look.mistCol = [0.1, 0.11, 0.14]; }
  }
  if (wx.code === 45 || wx.code === 48) { look.mist = Math.max(look.mist, 0.6); if (el > 0) look.mistCol = [0.62, 0.65, 0.7]; }
  phase = fa + '>' + fb + ' ' + w.toFixed(2);
}
// resolution and frame rate adapt to what the device can draw smoothly
const maxW = OPT.maxWidth || 1920, minScale = OPT.minScale || 0.42, minFps = OPT.minFps || 0; let fpsCap = OPT.fps || 60, scale = OPT.scale || 1, cw = 0;
function fit() {
  const w = canvas.clientWidth || 1280, pr = Math.min(window.devicePixelRatio || 1, 2);
  const W2 = Math.max(480, Math.round(Math.min(maxW, w * pr) * scale)), H2 = Math.round(W2 * 9 / 16);
  if (W2 !== cw) { cw = W2; canvas.width = W2; canvas.height = H2; gl.viewport(0, 0, W2, H2); }
}
const api = { cam: [0, 0, 1], fps: 0, scale: 1, running: false, failed: false,
  setWeather(o) { wx = { cloud: +o.cloud || 0, rain: +o.rain || 0, code: +o.code || 0 }; updateLook(); },
  stop() { api.running = false; }, info: () => phase + ' ' + cw + 'px ' + api.fps.toFixed(0) + 'fps' };
let last = 0, lastLook = 0, acc = 0, n = 0, slow = 0, t0 = 0, rounds = 0, big = 0;
function frame(now) {
  if (!api.running) return; requestAnimationFrame(frame);
  if (now - last < 1000 / fpsCap - 3) return;
  const dt = now - last; last = now;
  if (now - lastLook > 1000) { lastLook = now; updateLook(); fit(); }
  applyLook(look); applyLive(STYLE, look, now / 1000, hour);
  { const a = (now / 1000) * 2 * Math.PI / 48, z = 1 + STYLE.cam[2] * (0.5 - 0.5 * Math.cos(a)), k = (z - 1) / Math.max(STYLE.cam[2], 1e-6);
    api.cam = [STYLE.cam[0] * Math.sin(a) * k, STYLE.cam[1] * Math.sin(a * 0.5) * k, z]; }
  setUniform('uTime', now / 1000); setUniform('uRes', [canvas.width, canvas.height]);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  big = dt >= 500 ? big + 1 : 0;                                     // one long gap is the screen waking up; several in a row is a screen that cannot keep up
  if (now - t0 > 2500 && (dt < 500 || big >= 3)) { acc += dt; n++;
    if (n >= 45 || (acc > 2500 && n >= 4)) { const avg = acc / n, target = 1000 / fpsCap; api.fps = 1000 / avg; acc = 0; n = 0;
      if (avg > target * 1.45 && avg > 30) {
        if (avg > 250) { api.failed = true; api.running = false; if (OPT.onFail) OPT.onFail('far too slow: ' + avg.toFixed(0) + ' ms a frame'); return; }   // no graphics chip behind this page: stop at once
        if (scale > minScale * 1.02) { scale = Math.max(minScale, scale * Math.max(0.5, Math.min(0.8, Math.sqrt(target * 1.15 / avg)))); slow = 0; fit(); }   // first give up sharpness (a lot at once if it is far off)
        else if (minFps && fpsCap > minFps) { fpsCap = minFps; slow = 0; }                                                                       // then smoothness
        else if (++slow >= 2 && avg > 62) { api.failed = true; api.running = false; if (OPT.onFail) OPT.onFail('too slow: ' + avg.toFixed(0) + ' ms a frame'); }   // then hand back to the still pictures
      } else slow = 0;
      api.scale = scale; if (OPT.onPerf && (++rounds <= 6 || rounds % 40 === 0)) OPT.onPerf(api.info()); } }
}
canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); api.running = false; api.failed = true; if (OPT.onFail) OPT.onFail('graphics context lost'); });
function start() { plateLoaded(); updateLook(); fit(); api.running = true; t0 = last = performance.now(); requestAnimationFrame(frame); if (OPT.onReady) OPT.onReady(); }
if (plateImg.complete && plateImg.naturalWidth) start(); else { plateImg.addEventListener('load', start); plateImg.addEventListener('error', () => { api.failed = true; if (OPT.onFail) OPT.onFail('photo did not load'); }); }
return api;
};
