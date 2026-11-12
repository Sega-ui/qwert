(function (g) {
  const FONTS = ['Segoe UI', 'Bahnschrift', 'Trebuchet MS', 'Verdana', 'Georgia', 'Palatino Linotype', 'Constantia', 'Candara', 'Consolas', 'Arial'];
  const ENUMS = {
    font: FONTS,
    colorMode: ['album', 'solid', 'gradient', 'rainbow'],
    animIn: ['none', 'fade', 'slide', 'zoom', 'blur', 'wave', 'typewriter', 'scatter'],
    animMove: ['none', 'float', 'breathe', 'sway', 'pulse'],
    animLeave: ['none', 'fade', 'slideup', 'zoom', 'blur'],
    wCoverShape: ['round', 'square', 'circle'],
    textH: ['auto', 'left', 'center', 'right'],
    textV: ['top', 'center', 'bottom'],
    visCtl: ['always', 'hover'],
    visInfo: ['always', 'hover'],
    visProg: ['always', 'hover'],
    progOrient: ['h', 'vr', 'vl'],
  };
  const RANGES = {
    size: [16, 64], bg: [0, 100], tint: [0, 60], textX: [-300, 300], textY: [-300, 300], radius: [0, 40], letter: [-3, 20], lineGap: [0, 30], lines: [1, 7],
    rainbowSpeed: [2, 20], glow: [0, 100], outline: [0, 4], animSpeed: [50, 200], partyDensity: [10, 100],
    coverW: [40, 400], coverH: [40, 400], miniCover: [32, 72], offset: [-5000, 5000], pollMs: [1000, 5000],
    hoverIn: [0, 2000], hoverOut: [0, 2000], hoverDelay: [0, 5000],
    coverX: [-500, 500], coverY: [-500, 500], coverZ: [0, 10],
    nowX: [-500, 500], nowY: [-500, 500], nowZ: [0, 10], nowW: [0, 600], nowH: [0, 200], nowScale: [50, 200],
    nextX: [-500, 500], nextY: [-500, 500], nextZ: [0, 10], nextW: [0, 600], nextH: [0, 200], nextScale: [50, 200],
    ctlX: [-500, 500], ctlY: [-500, 500], ctlZ: [0, 10],
    progX: [-500, 500], progY: [-500, 500], progZ: [0, 10],
    lyrZ: [0, 10], lyrW: [0, 800], lyrH: [0, 400],
    ctlScale: [50, 200],
    progW: [0, 800], progH: [1, 12],
    glassBlur: [0, 60], glassSat: [100, 250],
    hudSize: [0, 40], hudGlow: [0, 100],
  };
  const COLORS = ['color1', 'color2', 'outlineColor', 'bgColor', 'hudColor'];
  const FLAGS = ['autohide', 'onTop', 'openAtLogin', 'bold', 'upper', 'sparkle', 'party', 'wCover', 'wInfo', 'wNext', 'wProg', 'wCtl', 'lyrics', 'dodge', 'hoverAll', 'glass', 'hud'];
  const DEFAULTS = {
    offset: 0, autohide: 1, onTop: 1, openAtLogin: 0, pollMs: 2000, lyrics: 1, dodge: 0, hoverAll: 0,
    size: 30, font: 'Segoe UI', bold: 1, upper: 0, letter: 0, lineGap: 8, lines: 4,
    colorMode: 'album', color1: '#ffffff', color2: '#7ab8ff', rainbowSpeed: 6,
    glow: 0, sparkle: 0, outline: 0, outlineColor: '#000000',
    bg: 55, bgColor: '#0e0e12', radius: 18, tint: 14,
    textH: 'auto', textV: 'center', textX: 0, textY: 0,
    animIn: 'slide', animMove: 'none', animLeave: 'fade', animSpeed: 100,
    party: 0, partyDensity: 50,
    wCover: 1, wCoverShape: 'round', coverW: 96, coverH: 96, wInfo: 1, wNext: 1, wProg: 1, wCtl: 1,
    miniCover: 48, visCtl: 'always', visInfo: 'always', visProg: 'always',
    hoverIn: 250, hoverOut: 250, hoverDelay: 0,
    coverX: 0, coverY: 0, coverZ: 1,
    nowX: 0, nowY: 0, nowZ: 1, nowW: 0, nowH: 0, nowScale: 100,
    nextX: 0, nextY: 0, nextZ: 1, nextW: 0, nextH: 0, nextScale: 100,
    ctlX: 0, ctlY: 0, ctlZ: 1, ctlScale: 100,
    progX: 0, progY: 0, progZ: 1, progW: 0, progH: 3, progOrient: 'h',
    lyrZ: 1, lyrW: 0, lyrH: 0,
    glass: 0, glassBlur: 20, glassSat: 180,
    hud: 0, hudSize: 4, hudColor: '#8ab4ff', hudGlow: 0,
    presets: [null, null, null, null, null, null, null, null, null, null, null, null], migrated: 0,
  };
  const PRESET_KEYS = ['size', 'font', 'bold', 'upper', 'letter', 'lineGap', 'lines', 'colorMode', 'color1', 'color2', 'rainbowSpeed',
    'glow', 'sparkle', 'outline', 'outlineColor', 'bg', 'bgColor', 'radius', 'animIn', 'animMove', 'animLeave', 'animSpeed',
    'party', 'partyDensity', 'wCover', 'wCoverShape', 'coverW', 'coverH', 'wInfo', 'wNext', 'wProg', 'wCtl',
    'tint', 'textH', 'textV', 'textX', 'textY', 'miniCover', 'visCtl', 'visInfo', 'visProg',
    'hoverIn', 'hoverOut', 'hoverDelay',
    'coverX', 'coverY', 'coverZ', 'ctlX', 'ctlY', 'ctlZ', 'progX', 'progY', 'progZ', 'lyrZ',
    'nowX', 'nowY', 'nowZ', 'nowW', 'nowH', 'nowScale',
    'nextX', 'nextY', 'nextZ', 'nextW', 'nextH', 'nextScale',
    'lyrW', 'lyrH', 'ctlScale', 'progW', 'progH', 'progOrient',
    'glass', 'glassBlur', 'glassSat',
    'hud', 'hudSize', 'hudColor', 'hudGlow'];

  function sanitize(obj) {
    const out = {};
    if (!obj || typeof obj !== 'object') return out;
    for (const k of PRESET_KEYS) {
      if (!(k in obj)) continue;
      const v = obj[k];
      if (ENUMS[k]) { if (ENUMS[k].includes(v)) out[k] = v; }
      else if (COLORS.includes(k)) { if (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v)) out[k] = v.toLowerCase(); }
      else if (FLAGS.includes(k)) out[k] = v ? 1 : 0;
      else if (typeof DEFAULTS[k] === 'number') {
        const n = Number(v);
        if (Number.isFinite(n)) { const r = RANGES[k]; out[k] = r ? Math.min(r[1], Math.max(r[0], n)) : n; }
      }
    }
    return out;
  }
  function pick(o, keys) { const r = {}; keys.forEach((k) => { if (k in o) r[k] = o[k]; }); return r; }
  function encode(data) {
    const bytes = new TextEncoder().encode(JSON.stringify(data));
    let s = ''; bytes.forEach((b) => { s += String.fromCharCode(b); });
    return 'SLO1:' + btoa(s);
  }
  function decode(code) {
    const m = /^\s*SLO1:([A-Za-z0-9+/=]+)\s*$/.exec(code || '');
    if (!m) return null;
    try { return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(m[1]), (c) => c.charCodeAt(0)))); } catch { return null; }
  }
  const SLO = { FONTS, ENUMS, RANGES, DEFAULTS, PRESET_KEYS, sanitize, pick, encode, decode };
  g.SLO = SLO;
  if (typeof module !== 'undefined' && module.exports) module.exports = SLO;
})(typeof globalThis !== 'undefined' ? globalThis : this);