(function (g) {
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const rnd = (a, b) => a + Math.random() * (b - a);
  const hexToRgb = (h) => { const m = /^#?([0-9a-f]{6})$/i.exec(h || ''); const n = m ? parseInt(m[1], 16) : 0xffffff; return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const toHex = (c) => '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
  function hslToRgb(h, s, l) {
    s /= 100; l /= 100;
    const k = (n) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
    const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return [f(0) * 255, f(8) * 255, f(4) * 255];
  }
  function dominantRgb(img) {
    const c = document.createElement('canvas'); c.width = c.height = 24;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(img, 0, 0, 24, 24);
    const d = x.getImageData(0, 0, 24, 24).data;
    let r = 0, g2 = 0, b = 0, w = 0;
    for (let i = 0; i < d.length; i += 4) {
      const mx = Math.max(d[i], d[i + 1], d[i + 2]), mn = Math.min(d[i], d[i + 1], d[i + 2]);
      const sat = mx ? (mx - mn) / mx : 0, wt = 0.02 + sat * sat;
      r += d[i] * wt; g2 += d[i + 1] * wt; b += d[i + 2] * wt; w += wt;
    }
    return [r / w, g2 / w, b / w];
  }
  function accentFromRgb([r, g2, b]) {
    r /= 255; g2 /= 255; b /= 255;
    const mx = Math.max(r, g2, b), mn = Math.min(r, g2, b), d = mx - mn;
    let h = 0;
    if (d) { if (mx === r) h = ((g2 - b) / d) % 6; else if (mx === g2) h = (b - r) / d + 2; else h = (r - g2) / d + 4; h *= 60; if (h < 0) h += 360; }
    const l0 = (mx + mn) / 2, s0 = d ? d / (1 - Math.abs(2 * l0 - 1)) : 0;
    if (s0 < 0.12) return [255, 255, 255];
    return hslToRgb(h, Math.min(0.9, Math.max(0.45, s0)) * 100, 72);
  }
  function parseLRC(s) {
    const out = [];
    for (const line of s.split('\n')) {
      const m = [...line.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)];
      if (!m.length) continue;
      const text = line.replace(/\[[^\]]*\]/g, '').trim() || '♪';
      for (const x of m) out.push({ t: (+x[1] * 60 + +x[2]) * 1000, text });
    }
    return out.sort((a, b) => a.t - b.t);
  }
  const fmt = (ms) => { ms = Math.max(0, Math.round(ms / 1000)); return Math.floor(ms / 60) + ':' + String(ms % 60).padStart(2, '0'); };
  const ICON = (p) => '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="' + p + '"/></svg>';
  const I_PREV = ICON('M6 6h2v12H6zM9.5 12 18 6v12z'), I_NEXT = ICON('M16 6h2v12h-2zM6 18V6l8.5 6z');
  const I_PLAY = ICON('M8 5v14l11-7z'), I_PAUSE = ICON('M6 5h4v14H6zM14 5h4v14h-4z');

  const ENTER = {
    fade: [{ opacity: 0 }, { opacity: 1 }],
    slide: [{ opacity: 0, transform: 'translateY(18px)' }, { opacity: 1, transform: 'none' }],
    zoom: [{ opacity: 0, transform: 'scale(.9)' }, { opacity: 1, transform: 'none' }],
    blur: [{ opacity: 0, filter: 'blur(10px)' }, { opacity: 1, filter: 'none' }],
  };
  const EXIT = {
    fade: [{ opacity: 1 }, { opacity: 0 }],
    slideup: [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-14px)' }],
    zoom: [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(.92)' }],
    blur: [{ opacity: 1, filter: 'none' }, { opacity: 0, filter: 'blur(8px)' }],
  };

  function create(root, opts) {
    opts = opts || {};
    let cfg = { ...SLO.DEFAULTS };
    let pb = null, syncAt = 0, lines = [], state = 'wait', shown = -2, nextInfo = null;
    let hasCover = false, albumRgb = null, swapTok = 0;
    let idle = false;

    root.classList.add('lv');
    root.innerHTML = '<div class="lv-party"></div><img class="lv-cover" alt=""><div class="lv-lyr"></div><div class="lv-spark"></div>' +
      '<div class="lv-foot"><div class="lv-meta"><div class="lv-now"><span class="mq-in"></span></div><div class="lv-nxt"><div class="nxt-t"><span class="mq-in"></span></div><span class="nxt-c"></span></div></div>' +
      '<div class="lv-ctl"><button data-a="previous" title="Önceki">' + I_PREV + '</button><button data-a="pp" title="Oynat / Duraklat"></button>' +
      '<button data-a="next" title="Sonraki">' + I_NEXT + '</button></div></div><div class="lv-prog"><i></i></div>';
    const q = (c) => root.querySelector('.lv-' + c);
    const lyr = q('lyr'), cover = q('cover'), now = q('now'), nxt = q('nxt'), pf = q('prog').firstChild, party = q('party'), spark = q('spark'), pp = root.querySelector('[data-a=pp]');

    const setClass = (prefix, val) => {
      [...root.classList].filter((c) => c.startsWith(prefix)).forEach((c) => root.classList.remove(c));
      root.classList.add(prefix + val);
    };
    const raw = () => (pb ? Math.min(pb.duration, pb.progress + (pb.playing ? performance.now() - syncAt : 0)) : 0);
    const mainRgb = () => (cfg.colorMode === 'album' ? albumRgb || [255, 255, 255] : cfg.colorMode === 'rainbow' ? [255, 255, 255] : hexToRgb(cfg.color1));
    const updatePP = () => { pp.innerHTML = pb && pb.playing ? I_PAUSE : I_PLAY; };
    const nowIn = now.firstChild, nxtBox = nxt.firstChild, nxtIn = nxtBox.firstChild, nxtC = nxt.lastChild;
    function fit(box) {
      const inner = box.firstChild;
      box.classList.remove('mq');
      if (!root.classList.contains('mini')) return;
      const over = inner.offsetWidth - box.clientWidth;
      if (over > 2) { box.style.setProperty('--mq', -(over + 6) + 'px'); box.style.setProperty('--mqd', ((over / 35) * 2 + 4).toFixed(1) + 's'); box.classList.add('mq'); }
    }
    function setText(inner, text) { if (inner.textContent !== text) { inner.textContent = text; fit(inner.parentNode); } }
    function refit() { fit(now); fit(nxtBox); }

    function widgetClasses() {
      const t = (c, v) => root.classList.toggle(c, v);
      t('no-cover', !cfg.wCover || !hasCover); t('no-info', !cfg.wInfo); t('no-next', !cfg.wNext);
      t('no-prog', !cfg.wProg); t('no-ctl', !cfg.wCtl); t('no-foot', !cfg.wInfo && !cfg.wNext && !cfg.wCtl);
      layoutText();
    }
    function layoutText() {
      const s = root.style, c = root.classList;
      const h = cfg.textH === 'auto' ? (c.contains('no-cover') || c.contains('narrow') ? 'center' : 'left') : cfg.textH;
      s.setProperty('--ta', h);
      s.setProperty('--av', { top: 'start', center: 'center', bottom: 'end' }[cfg.textV] || 'center');
      s.setProperty('--tx', cfg.textX + 'px'); s.setProperty('--ty', cfg.textY + 'px');
    }
    function applyAccent() { root.style.setProperty('--accent', toHex(mainRgb())); }

    function setConfig(c) {
      cfg = { ...SLO.DEFAULTS, ...c };
      const s = root.style, [br, bgc, bb] = hexToRgb(cfg.bgColor);
      s.setProperty('--size', cfg.size + 'px');
      s.setProperty('--bgc', 'rgba(' + br + ',' + bgc + ',' + bb + ',' + cfg.bg / 100 + ')');
      s.setProperty('--radius', cfg.radius + 'px');
      s.setProperty('--font', '"' + cfg.font + '", "Segoe UI", sans-serif');
      s.setProperty('--ls', cfg.letter / 100 + 'em');
      s.setProperty('--gap', cfg.lineGap + 'px');
      s.setProperty('--glow', cfg.glow);
      s.setProperty('--ol', cfg.outline);
      s.setProperty('--olc', cfg.outlineColor);
      s.setProperty('--k', (100 / cfg.animSpeed).toFixed(3));
      s.setProperty('--rb', cfg.rainbowSpeed);
      s.setProperty('--tint', cfg.tint / 100);
      s.setProperty('--mc', cfg.miniCover + 'px');
      s.setProperty('--wt', cfg.bold ? 700 : 400);
      s.setProperty('--wt2', cfg.bold ? 600 : 400);
      s.setProperty('--hover-in', (cfg.hoverIn / 1000).toFixed(3) + 's');
      s.setProperty('--hover-out', (cfg.hoverOut / 1000).toFixed(3) + 's');
      s.setProperty('--hover-delay', (cfg.hoverDelay / 1000).toFixed(3) + 's');
      /* Kapak */
      s.setProperty('--cover-w', cfg.coverW + 'px');
      s.setProperty('--cover-h', cfg.coverH + 'px');
      s.setProperty('--cover-tx', cfg.coverX + 'px');
      s.setProperty('--cover-ty', cfg.coverY + 'px');
      s.setProperty('--cover-z', cfg.coverZ);
      /* Şarkı adı */
      s.setProperty('--now-tx', cfg.nowX + 'px');
      s.setProperty('--now-ty', cfg.nowY + 'px');
      s.setProperty('--now-z', cfg.nowZ);
      s.setProperty('--now-scale', (cfg.nowScale / 100).toFixed(3));
      if (cfg.nowW > 0) s.setProperty('--now-w', cfg.nowW + 'px'); else s.removeProperty('--now-w');
      if (cfg.nowH > 0) s.setProperty('--now-h', cfg.nowH + 'px'); else s.removeProperty('--now-h');
      /* Sıradaki */
      s.setProperty('--next-tx', cfg.nextX + 'px');
      s.setProperty('--next-ty', cfg.nextY + 'px');
      s.setProperty('--next-z', cfg.nextZ);
      s.setProperty('--next-scale', (cfg.nextScale / 100).toFixed(3));
      if (cfg.nextW > 0) s.setProperty('--next-w', cfg.nextW + 'px'); else s.removeProperty('--next-w');
      if (cfg.nextH > 0) s.setProperty('--next-h', cfg.nextH + 'px'); else s.removeProperty('--next-h');
      /* Medya butonları */
      s.setProperty('--ctl-tx', cfg.ctlX + 'px');
      s.setProperty('--ctl-ty', cfg.ctlY + 'px');
      s.setProperty('--ctl-z', cfg.ctlZ);
      s.setProperty('--ctl-scale', (cfg.ctlScale / 100).toFixed(3));
      /* İlerleme çubuğu */
      s.setProperty('--prog-tx', cfg.progX + 'px');
      s.setProperty('--prog-ty', cfg.progY + 'px');
      s.setProperty('--prog-z', cfg.progZ);
      if (cfg.progW > 0) s.setProperty('--prog-w', cfg.progW + 'px'); else s.removeProperty('--prog-w');
      s.setProperty('--prog-h', cfg.progH + 'px');
      setClass('po-', cfg.progOrient || 'h');
      /* Sözler */
      s.setProperty('--lyr-z', cfg.lyrZ);
      if (cfg.lyrW > 0) s.setProperty('--lyr-w', cfg.lyrW + 'px'); else s.removeProperty('--lyr-w');
      if (cfg.lyrH > 0) s.setProperty('--lyr-h', cfg.lyrH + 'px'); else s.removeProperty('--lyr-h');
      /* Glass */
      s.setProperty('--glass-blur', cfg.glassBlur + 'px');
      s.setProperty('--glass-sat', cfg.glassSat + '%');
      /* HUD */
      s.setProperty('--hud-size', cfg.hudSize + 'px');
      s.setProperty('--hud-color', cfg.hudColor);
      s.setProperty('--hud-glow', cfg.hudGlow);

      setClass('cm-', cfg.colorMode); setClass('ai-', cfg.animIn); setClass('mv-', cfg.animMove); setClass('sh-', cfg.wCoverShape);
      root.classList.toggle('glass', !!cfg.glass);
      root.classList.toggle('hud', !!cfg.hud);
      root.classList.toggle('upper', !!cfg.upper);
      root.classList.toggle('glow', cfg.glow > 0);
      root.classList.toggle('party-on', !!cfg.party);
      root.classList.toggle('mini', !cfg.lyrics);
      root.classList.toggle('hv-all', !!cfg.hoverAll && !opts.ignoreHoverAll);
      root.classList.toggle('hv-ctl', cfg.visCtl === 'hover');
      root.classList.toggle('hv-info', cfg.visInfo === 'hover');
      root.classList.toggle('hv-prog', cfg.visProg === 'hover');
      root.classList.toggle('away', !pb && !!cfg.autohide && idle);
      widgetClasses(); applyAccent();
      if (state === 'ok' && pb) render(true);
      refit();
    }

    function curHtml(text) {
      const mode = cfg.colorMode, a = cfg.animIn;
      const split = mode === 'gradient' || mode === 'rainbow' || a === 'wave' || a === 'typewriter' || a === 'scatter';
      if (!split) return '<div class="line cur"><span class="in">' + esc(text) + '</span></div>';
      const n = [...text].filter((ch) => !/\s/.test(ch)).length || 1;
      const step = Math.min(a === 'typewriter' ? 40 : a === 'scatter' ? 14 : 32, 800 / n);
      const c1 = hexToRgb(cfg.color1), c2 = hexToRgb(cfg.color2);
      let i = 0, h = '';
      for (const w of text.split(/(\s+)/)) {
        if (!w) continue;
        if (/^\s+$/.test(w)) { h += ' '; continue; }
        h += '<span class="w">';
        for (const ch of [...w]) {
          let st = '--i:' + i + ';';
          if (mode === 'gradient') st += 'color:' + toHex(mix(c1, c2, n > 1 ? i / (n - 1) : 0)) + ';';
          else if (mode === 'rainbow') st += 'color:hsl(' + ((i * 16) % 360) + ' 90% 68%);';
          if (a === 'scatter') st += '--dx:' + rnd(-70, 70).toFixed(0) + 'px;--dy:' + rnd(-45, 45).toFixed(0) + 'px;--r:' + rnd(-100, 100).toFixed(0) + 'deg;';
          h += '<span class="c" style="' + st + '">' + esc(ch) + '</span>'; i++;
        }
        h += '</span>';
      }
      return '<div class="line cur" style="--st:' + step.toFixed(1) + 'ms"><span class="in">' + h + '</span></div>';
    }
    async function swap(html, instant) {
      const tok = ++swapTok, k = 100 / cfg.animSpeed;
      const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
      const can = !instant && !reduce && typeof lyr.animate === 'function';
      if (can && EXIT[cfg.animLeave] && lyr.innerHTML) {
        try { await lyr.animate(EXIT[cfg.animLeave], { duration: 120 * k, fill: 'forwards' }).finished; } catch {}
        if (tok !== swapTok) return;
      }
      if (typeof lyr.getAnimations === 'function') lyr.getAnimations().forEach((x) => x.cancel());
      lyr.innerHTML = html;
      if (!can) return;
      const a = cfg.animIn, letters = a === 'wave' || a === 'typewriter' || a === 'scatter';
      const kf = ENTER[a] || (letters ? ENTER.fade : null);
      if (kf) lyr.animate(kf, { duration: (ENTER[a] ? 340 : 160) * k, easing: 'cubic-bezier(.2,.8,.2,1)' });
    }
    function message(html) { shown = -2; swap('<div class="lv-msg">' + html + '</div>'); }

    function draw(i, instant) {
      const n = cfg.lines, before = Math.round((n - 1) / 2 - 0.25), after = n - 1 - before;
      let h = '';
      for (let k = i - before; k <= i + after; k++) {
        if (k === i) h += curHtml(i < 0 ? '♪' : lines[i].text);
        else h += '<div class="line">' + esc(k >= 0 && k < lines.length ? lines[k].text : '\u00a0') + '</div>';
      }
      swap(h, instant);
    }
    function render(force) {
      if (!pb || state !== 'ok' || !cfg.lyrics) return;
      const p = raw() + cfg.offset;
      let i = -1, lo = 0, hi = lines.length - 1;
      while (lo <= hi) { const m = (lo + hi) >> 1; if (lines[m].t <= p) { i = m; lo = m + 1; } else hi = m - 1; }
      if (i === shown && !force) return;
      const changed = i !== shown;
      shown = i;
      draw(i, !changed);
      if (changed && cfg.party) for (let k = 0; k < 3; k++) note();
    }
    function updateFoot() {
      if (!pb) {
        if (cfg.progOrient === 'h') { pf.style.width = '0'; pf.style.height = ''; }
        else { pf.style.height = '0'; pf.style.width = ''; }
        return;
      }
      const pct = pb.duration ? (raw() / pb.duration) * 100 : 0;
      if (cfg.progOrient === 'h') { pf.style.width = pct + '%'; pf.style.height = ''; }
      else { pf.style.height = pct + '%'; pf.style.width = ''; }
      const left = fmt(pb.duration - raw());
      setText(nxtIn, nextInfo ? 'Sıradaki: ' + nextInfo.title + ' — ' + nextInfo.artist : 'Şarkının bitmesine');
      const c = nextInfo ? '· ' + left + ' sonra' : left;
      if (nxtC.textContent !== c) nxtC.textContent = c;
    }

    function effectColor() {
      if (cfg.colorMode === 'rainbow') return 'hsl(' + Math.floor(rnd(0, 360)) + ' 90% 70%)';
      return toHex(mainRgb());
    }
    function note() {
      if (party.children.length > 32) return;
      const el = document.createElement('span');
      el.className = 'pt';
      el.textContent = ['♪', '♫', '♬', '♩'][Math.floor(rnd(0, 4))];
      el.style.cssText = 'left:' + rnd(2, 96).toFixed(1) + '%;font-size:' + rnd(14, 26).toFixed(0) + 'px;color:' + effectColor() +
        ';--sx:' + rnd(-40, 40).toFixed(0) + 'px;--ph:' + root.clientHeight + 'px;animation-duration:' + rnd(3.5, 6).toFixed(1) + 's';
      el.addEventListener('animationend', () => el.remove());
      party.appendChild(el);
    }
    function sparkle() {
      const cur = lyr.querySelector('.cur .in');
      if (!cur || spark.children.length > 14) return;
      const rr = root.getBoundingClientRect(), r = cur.getBoundingClientRect();
      const el = document.createElement('span');
      el.className = 'sp';
      el.textContent = Math.random() < 0.5 ? '✦' : '✧';
      el.style.cssText = 'left:' + (r.left - rr.left + rnd(0, r.width)).toFixed(0) + 'px;top:' + (r.top - rr.top + rnd(-6, r.height)).toFixed(0) + 'px;color:' + effectColor();
      el.addEventListener('animationend', () => el.remove());
      spark.appendChild(el);
    }
    function fx() {
      if (root.classList.contains('away') || (typeof document !== 'undefined' && document.hidden)) return;
      const playing = pb && pb.playing;
      if (cfg.party && playing && Math.random() < (cfg.partyDensity / 100) * 0.4) note();
      if (cfg.sparkle && playing && state === 'ok' && Math.random() < 0.55) sparkle();
    }

    function setStatus(s, msg) {
      pb = null; lines = []; nextInfo = null; state = 'wait'; hasCover = false;
      idle = s === 'idle';
      setText(nowIn, ''); setText(nxtIn, ''); nxtC.textContent = '';
      pf.removeAttribute('style'); updatePP(); widgetClasses();
      root.classList.toggle('away', idle && !!cfg.autohide);
      if (s === 'login') message('Spotify hesabına bağlan.<br><button data-login>Spotify ile giriş yap</button>');
      else if (s === 'idle') message('Şu an Spotify\'da bir şarkı çalmıyor.');
      else message('Giriş yapılamadı: ' + esc(msg || ''));
    }
    function setPlayback(d) {
      const changed = !pb || pb.id !== d.id;
      pb = { ...d }; syncAt = performance.now(); idle = false;
      root.classList.remove('away');
      setText(nowIn, d.title + ' — ' + d.artist);
      updatePP();
      if (changed) { lines = []; state = 'wait'; nextInfo = null; shown = -2; message('Sözler aranıyor…'); }
      return changed;
    }
    function setLines(arr) {
      lines = arr; state = lines.length ? 'ok' : 'none'; shown = -2;
      if (state === 'none') message('Bu şarkı için senkronize söz bulunamadı.');
    }
    function setLyricsFor(id, synced) {
      if (!pb || pb.id !== id) return;
      setLines(synced ? parseLRC(synced) : []);
    }
    function setCoverFor(id, url) {
      if (!pb || pb.id !== id) return;
      if (!url) { hasCover = false; widgetClasses(); return; }
      cover.onload = () => {
        hasCover = true; albumRgb = accentFromRgb(dominantRgb(cover)); widgetClasses(); applyAccent();
        if (typeof cover.animate === 'function') cover.animate([{ opacity: 0, transform: 'scale(.94)' }, { opacity: 1, transform: 'none' }], { duration: 420, easing: 'ease-out' });
      };
      cover.src = url;
    }
    function setNext(info) { nextInfo = info; }

    root.addEventListener('click', (e) => {
      if (e.target.closest('[data-login]')) { if (opts.onLogin) opts.onLogin(); return; }
      const b = e.target.closest('.lv-ctl button');
      if (!b) return;
      const a = b.dataset.a;
      if (a === 'pp') {
        if (!pb) { if (opts.onControl) opts.onControl('play'); return; }
        const play = !pb.playing;
        pb.progress = raw(); syncAt = performance.now(); pb.playing = play; updatePP();
        if (opts.onControl) opts.onControl(play ? 'play' : 'pause');
      } else if (opts.onControl) opts.onControl(a);
    });
    if (typeof ResizeObserver === 'function') new ResizeObserver(() => { root.classList.toggle('narrow', root.clientWidth < 460 && !root.classList.contains('mini')); layoutText(); refit(); }).observe(root);
    if (opts.localHover) { root.addEventListener('mouseenter', () => root.classList.add('hov')); root.addEventListener('mouseleave', () => root.classList.remove('hov')); }
    setInterval(() => { render(); updateFoot(); }, 100);
    setInterval(fx, 160);
    updatePP(); setConfig(cfg);

    return { setConfig, setStatus, setPlayback, setLines, setLyricsFor, setCoverFor, setNext, message, getPlayback: () => pb, raw, setHover: (v) => root.classList.toggle('hov', !!v) };
  }
  g.LyricsView = { create };
})(typeof globalThis !== 'undefined' ? globalThis : this);