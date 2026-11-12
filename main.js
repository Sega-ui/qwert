const { app, BrowserWindow, ipcMain, shell, globalShortcut, clipboard, screen } = require('electron');
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const SLO = require('./defaults.js');

const CLIENT_ID = require('./config.json').clientId;
const REDIRECT = 'http://127.0.0.1:8888/callback';
const SCOPE = 'user-read-currently-playing user-read-playback-state user-modify-playback-state';
const UA = { 'User-Agent': 'SpotifyLyricsOverlay/0.3' };

let win, setWin, tokens = null, currentId = null, locked = false;
let polling = false, pollTimer = null, lastQueue = 0;
const lyricsCache = new Map();
const coverCache = new Map();
const ud = (f) => path.join(app.getPath('userData'), f);
const send = (ch, data) => win && !win.isDestroyed() && win.webContents.send(ch, data);

/* ---------- Hata günlüğü ---------- */
const LOG_MAX = 256 * 1024;
function logErr(tag, err) {
  try {
    const f = ud('hata.log');
    try { if (fs.existsSync(f) && fs.statSync(f).size > LOG_MAX) fs.renameSync(f, f + '.old'); } catch {}
    const msg = err && (err.stack || err.message) ? (err.stack || err.message) : String(err);
    fs.appendFileSync(f, '[' + new Date().toISOString() + '] ' + tag + ': ' + msg + '\n');
  } catch {}
}
let quitting = false;
process.on('uncaughtException', (e) => logErr('uncaughtException', e));
process.on('unhandledRejection', (e) => logErr('unhandledRejection', e));
app.on('child-process-gone', (_e, d) => logErr('child-process-gone', JSON.stringify(d)));

/* ---------- Ayarlar (cfg.json) ---------- */
let cfg = { ...SLO.DEFAULTS };
function loadCfg() {
  try { cfg = { ...SLO.DEFAULTS, ...JSON.parse(fs.readFileSync(ud('cfg.json'), 'utf8')) }; } catch {}
  if (!Array.isArray(cfg.presets) || cfg.presets.length !== 12) cfg.presets = [...SLO.DEFAULTS.presets];
}
let saveT;
function saveCfg() { clearTimeout(saveT); saveT = setTimeout(flushCfg, 300); }
function flushCfg() { try { fs.writeFileSync(ud('cfg.json'), JSON.stringify(cfg)); } catch {} }
function broadcast(ch, data, except) {
  BrowserWindow.getAllWindows().forEach((w) => { if (w.webContents !== except) w.webContents.send(ch, data); });
}
function applyLogin(v) {
  try { app.setLoginItemSettings({ openAtLogin: !!v, path: process.execPath, args: [app.getAppPath()] }); } catch {}
}

/* ---------- Ctrl izleyici (PowerShell yardımcısı) ---------- */
let ctrlHeld = false;
let ctrlProc = null;
let ctrlWatcherOk = false;
const PS_SCRIPT = [
  'Add-Type @"',
  'using System;',
  'using System.Runtime.InteropServices;',
  'public class SLOK {',
  '  [DllImport("user32.dll")] public static extern short GetAsyncKeyState(int vKey);',
  '}',
  '"@',
  '$prev = $false',
  'while ($true) {',
  '  $now = ([SLOK]::GetAsyncKeyState(0x11) -band 0x8000) -ne 0',
  '  if ($now -ne $prev) {',
  "    [Console]::Out.WriteLine($(if($now){'1'}else{'0'}))",
  '    [Console]::Out.Flush()',
  '    $prev = $now',
  '  }',
  '  Start-Sleep -Milliseconds 50',
  '}',
].join('\n');

function startCtrlWatcher() {
  try {
    const b64 = Buffer.from(PS_SCRIPT, 'utf16le').toString('base64');
    ctrlProc = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', b64], {
      windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'],
    });
    ctrlProc.stdout.setEncoding('utf8');
    let buf = '';
    ctrlProc.stdout.on('data', (chunk) => {
      buf += chunk;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (line === '1') ctrlHeld = true;
        else if (line === '0') ctrlHeld = false;
      }
    });
    ctrlProc.on('error', (e) => { logErr('ctrl-watcher:error', e); ctrlWatcherOk = false; });
    ctrlProc.on('exit', () => {
      ctrlProc = null;
      if (!quitting) setTimeout(startCtrlWatcher, 2000);
    });
    ctrlWatcherOk = true;
  } catch (e) {
    logErr('ctrl-watcher:spawn', e);
    ctrlWatcherOk = false;
    ctrlHeld = false;
  }
}
function stopCtrlWatcher() {
  try { if (ctrlProc) ctrlProc.kill(); } catch {}
  ctrlProc = null;
}

/* ---------- Spotify giriş (PKCE) ---------- */
const b64url = (b) => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function tokenRequest(params) {
  const r = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID, ...params }),
  });
  if (!r.ok) throw new Error('token ' + r.status);
  const d = await r.json();
  tokens = {
    access: d.access_token,
    refresh: d.refresh_token || (tokens && tokens.refresh),
    expires: Date.now() + d.expires_in * 1000 - 30000,
    scope: SCOPE,
  };
  fs.writeFileSync(ud('token.json'), JSON.stringify(tokens));
}

async function login() {
  const verifier = b64url(crypto.randomBytes(64));
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
  const state = b64url(crypto.randomBytes(8));
  const code = await new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const u = new URL(req.url, 'http://127.0.0.1:8888');
      if (u.pathname !== '/callback') { res.end(); return; }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<h3>Giriş tamamlandı, bu sekmeyi kapatabilirsin.</h3>');
      server.close();
      const c = u.searchParams.get('code');
      if (u.searchParams.get('state') !== state || !c) return reject(new Error('Giriş başarısız'));
      resolve(c);
    });
    server.on('error', reject);
    server.listen(8888, '127.0.0.1');
    const q = new URLSearchParams({
      response_type: 'code', client_id: CLIENT_ID, scope: SCOPE, redirect_uri: REDIRECT,
      state, code_challenge_method: 'S256', code_challenge: challenge,
    });
    shell.openExternal('https://accounts.spotify.com/authorize?' + q);
  });
  await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT, code_verifier: verifier });
  pollNow();
}

async function getToken() {
  if (!tokens) return null;
  if (Date.now() > tokens.expires) {
    try { await tokenRequest({ grant_type: 'refresh_token', refresh_token: tokens.refresh }); }
    catch { tokens = null; return null; }
  }
  return tokens.access;
}

/* ---------- LRCLIB ---------- */
async function fetchLyrics(t) {
  const artist = t.artists[0].name;
  const dur = Math.round(t.duration_ms / 1000);
  try {
    const p = new URLSearchParams({ track_name: t.name, artist_name: artist, album_name: t.album.name, duration: dur });
    let r = await fetch('https://lrclib.net/api/get?' + p, { headers: UA });
    if (r.ok) { const d = await r.json(); if (d.syncedLyrics) return d.syncedLyrics; }
    const s = new URLSearchParams({ track_name: t.name, artist_name: artist });
    r = await fetch('https://lrclib.net/api/search?' + s, { headers: UA });
    if (r.ok) {
      const best = (await r.json())
        .filter((x) => x.syncedLyrics)
        .sort((a, b) => Math.abs(a.duration - dur) - Math.abs(b.duration - dur))[0];
      if (best) return best.syncedLyrics;
    }
  } catch (e) { console.error('lrclib', e.message); }
  return null;
}

/* ---------- Albüm kapağı ve sıradaki şarkı ---------- */
function sendCover(t) {
  if (coverCache.has(t.id)) { send('cover', { id: t.id, url: coverCache.get(t.id) }); return; }
  const imgs = t.album.images || [];
  const im = imgs[1] || imgs[0];
  if (!im) { send('cover', { id: t.id, url: null }); return; }
  fetch(im.url).then((r) => r.arrayBuffer()).then((buf) => {
    const url = 'data:image/jpeg;base64,' + Buffer.from(buf).toString('base64');
    coverCache.set(t.id, url);
    send('cover', { id: t.id, url });
  }).catch(() => send('cover', { id: t.id, url: null }));
}

async function fetchNext(token) {
  try {
    const r = await fetch('https://api.spotify.com/v1/me/player/queue', { headers: { Authorization: 'Bearer ' + token } });
    if (!r.ok) return;
    const d = await r.json();
    const n = d.queue && d.queue[0];
    send('next', n ? { title: n.name, artist: n.artists.map((a) => a.name).join(', ') } : null);
  } catch (e) { console.error('queue', e.message); }
}

/* ---------- Çalan şarkıyı sorgula ---------- */
async function poll() {
  if (polling) return;
  polling = true;
  let next = Number(cfg.pollMs) || 2000;
  try {
    const token = await getToken();
    if (!token) send('status', { state: CLIENT_ID.startsWith('BURAYA') ? 'noclient' : 'login' });
    else {
      const r = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
        headers: { Authorization: 'Bearer ' + token },
      });
      if (r.status === 429) next = (Number(r.headers.get('retry-after')) || 5) * 1000;
      else if (r.status === 204) send('status', { state: 'idle' });
      else if (r.ok) {
        const d = await r.json();
        const t = d.item;
        if (!t || d.currently_playing_type !== 'track') send('status', { state: 'idle' });
        else {
          send('playback', {
            id: t.id, title: t.name, artist: t.artists.map((a) => a.name).join(', '),
            progress: d.progress_ms, duration: t.duration_ms, playing: d.is_playing,
          });
          if (t.id !== currentId) {
            currentId = t.id;
            lastQueue = 0;
            sendCover(t);
            if (lyricsCache.has(t.id)) send('lyrics', { id: t.id, synced: lyricsCache.get(t.id) });
            else fetchLyrics(t).then((synced) => {
              lyricsCache.set(t.id, synced);
              send('lyrics', { id: t.id, synced });
            });
          }
          if (Date.now() - lastQueue > 20000) { lastQueue = Date.now(); fetchNext(token); }
        }
      } else if (r.status === 401) tokens = null;
    }
  } catch (e) { console.error('poll', e.message); }
  polling = false;
  pollTimer = setTimeout(poll, next);
}
function pollNow() { clearTimeout(pollTimer); poll(); }

/* ---------- Medya kontrolleri ---------- */
const CTL = { play: ['PUT', 'play'], pause: ['PUT', 'pause'], next: ['POST', 'next'], previous: ['POST', 'previous'] };
ipcMain.on('control', async (_e, action) => {
  const c = CTL[action];
  if (!c) return;
  try {
    const token = await getToken();
    if (!token) return;
    const r = await fetch('https://api.spotify.com/v1/me/player/' + c[1], {
      method: c[0], headers: { Authorization: 'Bearer ' + token },
    });
    if (r.status === 403) send('toast', 'Medya butonları için Spotify Premium gerekir.');
    else if (r.status === 404) send('toast', 'Aktif bir Spotify cihazı bulunamadı.');
    else if (r.status === 401) tokens = null;
    if (action === 'next' || action === 'previous') lastQueue = 0;
    setTimeout(pollNow, 500);
  } catch (e) { console.error('control', e.message); }
});

/* ---------- Pencere durumu ve kaçma ---------- */
const STATE = { HOME: 'home', DODGING: 'dodging', AWAY: 'away', RETURNING: 'returning' };
let winState = STATE.HOME;
let homeRect = null, awayRect = null;
let animT = null, cooldownUntil = 0;
let hoverNow = false, dwellAt = 0;
const COOLDOWN_MS = 400;
const ANIM_MS = 220;

let sizes = { full: { width: 680, height: 280 }, mini: { width: 400, height: 84 } };
const isMini = () => !cfg.lyrics;
const modeKey = () => (isMini() ? 'mini' : 'full');
const MINS = { full: [380, 150, 1600, 800], mini: [260, 56, 1000, 200] };
const inside = (p, r, m) => p.x >= r.x - m && p.x < r.x + r.width + m && p.y >= r.y - m && p.y < r.y + r.height + m;

const isAnimating = () => winState === STATE.DODGING || winState === STATE.RETURNING;
const isAway = () => winState !== STATE.HOME;

function applyMins() { const m = MINS[modeKey()]; win.setMinimumSize(m[0], m[1]); }
function updateIgnore() { if (win && !win.isDestroyed()) win.setIgnoreMouseEvents(locked || (!!cfg.hoverAll && !hoverNow), { forward: true }); }
function setLocked(v) { locked = v; updateIgnore(); send('locked', locked); }

function saveBounds() {
  if (!win || win.isDestroyed() || isAnimating()) return;
  const b = (isAway() && homeRect) ? homeRect : win.getBounds();
  sizes[modeKey()] = { width: b.width, height: b.height };
  try { fs.writeFileSync(ud('settings.json'), JSON.stringify({ x: b.x, y: b.y, sizes })); } catch {}
}

function mirrorX(b) {
  const wa = screen.getDisplayMatching(b).workArea;
  return wa.x + wa.width - (b.x - wa.x) - b.width;
}

function clearAnim() {
  if (animT) { clearInterval(animT); animT = null; }
}

function animateTo(target, nextState) {
  if (!win || win.isDestroyed()) return;
  clearAnim();
  let s0;
  try { s0 = win.getBounds(); } catch (e) { logErr('animateTo:getBounds', e); winState = STATE.HOME; homeRect = null; awayRect = null; return; }
  const from = { x: s0.x, y: s0.y, width: s0.width, height: s0.height };
  const to = { x: Math.round(target.x), y: Math.round(target.y), width: from.width, height: from.height };
  const t0 = Date.now();
  animT = setInterval(() => {
    if (!win || win.isDestroyed()) { clearAnim(); return; }
    try {
      const k = Math.min(1, (Date.now() - t0) / ANIM_MS);
      const e = 1 - Math.pow(1 - k, 3);
      win.setBounds({
        x: Math.round(from.x + (to.x - from.x) * e),
        y: Math.round(from.y + (to.y - from.y) * e),
        width: from.width,
        height: from.height,
      });
      if (k >= 1) {
        clearAnim();
        try { win.setBounds(to); } catch (e2) { logErr('animateTo:finalSnap', e2); }
        winState = nextState;
        cooldownUntil = Date.now() + COOLDOWN_MS;
      }
    } catch (e) {
      logErr('animateTo:step', e);
      clearAnim();
      winState = STATE.HOME;
      homeRect = null; awayRect = null;
      try { win.setBounds(to); } catch {}
    }
  }, 16);
}

function startDodge() {
  if (!win || win.isDestroyed()) return;
  const b = win.getBounds();
  const nx = mirrorX(b);
  if (Math.abs(nx - b.x) < 24) return;
  homeRect = { x: b.x, y: b.y, width: b.width, height: b.height };
  awayRect = { x: nx, y: b.y, width: b.width, height: b.height };
  winState = STATE.DODGING;
  animateTo(awayRect, STATE.AWAY);
}

function returnHome() {
  if (!win || win.isDestroyed()) return;
  if (winState !== STATE.AWAY || !homeRect) return;
  winState = STATE.RETURNING;
  animateTo(homeRect, STATE.HOME);
}

function tick() {
  if (!win || win.isDestroyed()) return;
  try {
    const p = screen.getCursorScreenPoint();
    const cur = win.getBounds();
    const home = homeRect || cur;
    const animating = isAnimating();
    const hov = !animating && inside(p, cur, 0);
    if (hov !== hoverNow) { hoverNow = hov; send('hover', hov); updateIgnore(); }

    if (!cfg.dodge || locked) {
      if (winState === STATE.AWAY || winState === STATE.DODGING || winState === STATE.RETURNING) returnHome();
      dwellAt = 0;
      return;
    }
    if (winState === STATE.AWAY && !inside(p, home, 28)) { returnHome(); return; }
    if (winState !== STATE.HOME) return;
    if (Date.now() < cooldownUntil) return;
    if (inside(p, home, 0) && !ctrlHeld) {
      if (!dwellAt) dwellAt = Date.now();
      else if (Date.now() - dwellAt >= 130) { dwellAt = 0; startDodge(); }
    } else dwellAt = 0;
  } catch (e) {
    logErr('tick', e);
  }
}

function ensureOnScreen() {
  if (!win || win.isDestroyed()) return;
  try {
    const b = win.getBounds();
    const wa = screen.getDisplayMatching(b).workArea;
    let x = b.x, y = b.y, w = b.width, h = b.height, changed = false;
    if (w < 100 || h < 40 || w > 4000 || h > 2000) {
      const m = MINS[modeKey()];
      w = Math.max(m[0], Math.min(m[2], 680));
      h = Math.max(m[1], Math.min(m[3], 280));
      changed = true;
    }
    const visible = b.x + b.width > wa.x && b.x < wa.x + wa.width && b.y + b.height > wa.y && b.y < wa.y + wa.height;
    if (!visible) {
      x = Math.round(wa.x + (wa.width - w) / 2);
      y = wa.y + wa.height - h - 60;
      changed = true;
    }
    if (changed) {
      logErr('ensureOnScreen', `fix ${JSON.stringify(b)} -> {x:${x},y:${y},w:${w},h:${h}}`);
      win.setBounds({ x, y, width: w, height: h });
      saveBounds();
    }
  } catch (e) { logErr('ensureOnScreen:err', e); }
}

function switchMode(wasMini) {
  if (!win || win.isDestroyed()) return;
  clearAnim();
  let b;
  try { b = (winState === STATE.HOME) ? win.getBounds() : (homeRect || win.getBounds()); }
  catch { b = { x: 0, y: 0, width: 680, height: 280 }; }
  winState = STATE.HOME; homeRect = null; awayRect = null;
  sizes[wasMini ? 'mini' : 'full'] = { width: b.width, height: b.height };
  const ns = sizes[modeKey()], wa = screen.getDisplayMatching(b).workArea;
  const right = b.x + b.width / 2 > wa.x + wa.width / 2;
  applyMins();
  win.setBounds({ x: right ? b.x + b.width - ns.width : b.x, y: b.y, width: ns.width, height: ns.height });
  saveBounds();
}

function applyPatch(patch, except) {
  const wasMini = isMini();
  cfg = { ...cfg, ...patch };
  saveCfg();
  if ('onTop' in patch && win) win.setAlwaysOnTop(!!cfg.onTop, 'screen-saver');
  if ('openAtLogin' in patch) applyLogin(cfg.openAtLogin);
  if ('pollMs' in patch) pollNow();
  if (win && isMini() !== wasMini) switchMode(wasMini);
  if (win && 'hoverAll' in patch) updateIgnore();
  if (win && 'dodge' in patch && !cfg.dodge && (winState === STATE.AWAY || winState === STATE.DODGING)) returnHome();
  broadcast('cfg', cfg, except);
}

/* ---------- Ayarlar penceresi ---------- */
function openSettings() {
  if (setWin && !setWin.isDestroyed()) { setWin.show(); setWin.focus(); return; }
  setWin = new BrowserWindow({
    width: 900, height: 780, minWidth: 780, minHeight: 620, title: 'Söz Overlay Ayarları', backgroundColor: '#16161c',
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true },
  });
  setWin.setMenu(null);
  setWin.setAlwaysOnTop(true, 'screen-saver');
  setWin.loadFile('settings.html');
  setWin.webContents.on('render-process-gone', (_e, d) => logErr('settings:render-process-gone', JSON.stringify(d)));
  setWin.webContents.on('unresponsive', () => logErr('settings:unresponsive', ''));
  setWin.webContents.on('preload-error', (_e, p, err) => logErr('settings:preload-error', p + ' :: ' + (err && err.stack || err)));
  setWin.on('closed', () => { setWin = null; });
}

ipcMain.handle('cfg:get', () => cfg);
ipcMain.handle('cfg:set', (e, patch) => { applyPatch(patch, e.sender); return cfg; });
ipcMain.handle('cfg:reset', (e) => {
  const wasMini = isMini();
  cfg = { ...SLO.DEFAULTS, presets: cfg.presets, migrated: 1 };
  saveCfg();
  if (win) {
    win.setAlwaysOnTop(true, 'screen-saver');
    if (isMini() !== wasMini) switchMode(wasMini);
    updateIgnore();
    if (winState === STATE.AWAY || winState === STATE.DODGING) returnHome();
  }
  applyLogin(0);
  broadcast('cfg', cfg, e.sender);
  return cfg;
});
ipcMain.handle('clip:write', (_e, t) => { clipboard.writeText(String(t).slice(0, 20000)); return true; });
ipcMain.handle('clip:read', () => clipboard.readText());
ipcMain.on('open-settings', openSettings);
ipcMain.on('open-data-dir', () => shell.openPath(app.getPath('userData')));
ipcMain.on('log-error', (_e, tag, msg) => logErr('renderer:' + (tag || 'error'), msg));
ipcMain.on('open-log', () => { try { shell.openPath(ud('hata.log')); } catch {} });
ipcMain.on('toggle-mini', () => applyPatch({ lyrics: cfg.lyrics ? 0 : 1 }));
ipcMain.on('reset-window', () => {
  if (!win) return;
  clearAnim(); winState = STATE.HOME; homeRect = null; awayRect = null;
  const wa = screen.getPrimaryDisplay().workArea, sz = sizes[modeKey()];
  win.setBounds({ x: Math.round(wa.x + (wa.width - sz.width) / 2), y: wa.y + wa.height - sz.height - 60, width: sz.width, height: sz.height });
  saveBounds();
});
ipcMain.on('lock', () => setLocked(true));
ipcMain.on('quit', () => app.quit());
ipcMain.on('login', async () => {
  try { await login(); } catch (e) { send('status', { state: 'error', message: e.message }); }
});
ipcMain.on('resize', (_e, { w, h }) => {
  if (!win || isAway()) return;
  const m = MINS[modeKey()], b = win.getBounds();
  win.setBounds({
    x: b.x, y: b.y,
    width: Math.min(m[2], Math.max(m[0], Math.round(w))),
    height: Math.min(m[3], Math.max(m[1], Math.round(h))),
  });
});
ipcMain.on('resize-end', saveBounds);

app.whenReady().then(() => {
  loadCfg();
  try {
    tokens = JSON.parse(fs.readFileSync(ud('token.json'), 'utf8'));
    if (tokens.scope !== SCOPE) tokens = null;
  } catch {}
  let pos = {};
  try {
    const j = JSON.parse(fs.readFileSync(ud('settings.json'), 'utf8'));
    if (j.sizes) sizes = { full: { ...sizes.full, ...j.sizes.full }, mini: { ...sizes.mini, ...j.sizes.mini } };
    else if (j.width) sizes.full = { width: j.width, height: j.height };
    if (Number.isFinite(j.x) && Number.isFinite(j.y)) pos = { x: j.x, y: j.y };
  } catch {}
  const sz = sizes[modeKey()];

  win = new BrowserWindow({
    ...pos, width: sz.width, height: sz.height,
    transparent: true, frame: false, hasShadow: false, thickFrame: false,
    alwaysOnTop: true, resizable: true, maximizable: false, fullscreenable: false, skipTaskbar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true },
  });
  applyMins();
  win.setAlwaysOnTop(!!cfg.onTop, 'screen-saver');
  win.loadFile('index.html');
  win.webContents.on('render-process-gone', (_e, d) => logErr('overlay:render-process-gone', JSON.stringify(d)));
  win.webContents.on('unresponsive', () => logErr('overlay:unresponsive', ''));
  win.webContents.on('preload-error', (_e, p, err) => logErr('overlay:preload-error', p + ' :: ' + (err && err.stack || err)));
  win.on('moved', () => { if (!isAnimating() && !isAway()) saveBounds(); });
  win.webContents.on('did-finish-load', () => { pollNow(); updateIgnore(); ensureOnScreen(); });
  setInterval(tick, 60);

  startCtrlWatcher();

  globalShortcut.register('Control+Alt+L', () => setLocked(!locked));
  globalShortcut.register('Control+Alt+S', openSettings);
  globalShortcut.register('Control+Alt+M', () => applyPatch({ lyrics: cfg.lyrics ? 0 : 1 }));
});

app.on('before-quit', () => { quitting = true; stopCtrlWatcher(); flushCfg(); });
app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => app.quit());