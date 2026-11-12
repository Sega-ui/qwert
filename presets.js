(function (g) {
  const TEMPLATES = [
    { name: 'Klasik', desc: 'Albüm rengi, yumuşak kayma', data: {} },
    { name: 'Neon', desc: 'Pembe-camgöbeği gradyan, parıltı, dalga', data: { font: 'Bahnschrift', colorMode: 'gradient', color1: '#ff2bd6', color2: '#00e5ff', glow: 60, animIn: 'wave', animMove: 'breathe', bg: 35, bgColor: '#080012' } },
    { name: 'Gökkuşağı', desc: 'Akan renkler, ışıltı ve dalga', data: { colorMode: 'rainbow', rainbowSpeed: 5, glow: 30, animIn: 'wave', animMove: 'float', sparkle: 1 } },
    { name: 'Minimal', desc: 'Sade, sadece sözler', data: { colorMode: 'solid', color1: '#ffffff', wCover: 0, wNext: 0, wProg: 0, animIn: 'fade', bg: 25, lines: 3, size: 28 } },
    { name: 'Retro Terminal', desc: 'Yeşil, daktilo gibi yazılan büyük harfler', data: { font: 'Consolas', colorMode: 'solid', color1: '#7cff6b', animIn: 'typewriter', upper: 1, letter: 6, glow: 25, bg: 75, bgColor: '#06110a', radius: 4, wCover: 0 } },
    { name: 'Altyazı', desc: 'Film altyazısı gibi tek satır', data: { font: 'Georgia', colorMode: 'solid', color1: '#ffffff', outline: 2, bg: 0, lines: 1, animIn: 'fade', animLeave: 'fade', wCover: 0, wInfo: 0, wNext: 0, wProg: 0, wCtl: 0, size: 36 } },
    { name: 'Parti', desc: 'Uçuşan notalar, ışıltı, nabız', data: { party: 1, partyDensity: 75, animIn: 'scatter', animMove: 'pulse', sparkle: 1 } },
    { name: 'Gün batımı', desc: 'Turuncu-pembe gradyan, hafif salınım', data: { font: 'Georgia', colorMode: 'gradient', color1: '#ffb36b', color2: '#ff5e8a', glow: 35, animIn: 'slide', animMove: 'sway', bg: 40, bgColor: '#1a0b14' } },
  ];
  const GALLERY = [
    { name: 'Okyanus', desc: 'Mavi tonlar, sakin süzülme', data: { font: 'Candara', colorMode: 'gradient', color1: '#7be0ff', color2: '#5b7bff', glow: 28, animIn: 'blur', animMove: 'float', bg: 45, bgColor: '#061226', radius: 24 } },
    { name: 'Sakura', desc: 'Pembe, yumuşak, notalı', data: { font: 'Palatino Linotype', colorMode: 'solid', color1: '#ffb7d5', glow: 20, animIn: 'slide', animMove: 'sway', party: 1, partyDensity: 30, bg: 40, bgColor: '#1f0d16', radius: 26 } },
    { name: 'Cyberpunk', desc: 'Sarı-mor, keskin, büyük harf', data: { font: 'Bahnschrift', colorMode: 'gradient', color1: '#fcee09', color2: '#ff2a6d', upper: 1, letter: 4, outline: 1, glow: 45, animIn: 'scatter', animMove: 'pulse', bg: 70, bgColor: '#0a0612', radius: 6 } },
    { name: 'Kahve Molası', desc: 'Sıcak tonlar, serif yazı', data: { font: 'Georgia', colorMode: 'solid', color1: '#f2d7b6', animIn: 'fade', animMove: 'breathe', bg: 60, bgColor: '#1d130d', radius: 20, lines: 3 } },
    { name: 'Gece Yarısı', desc: 'Koyu mavi, ince parıltı, yıldızlar', data: { font: 'Segoe UI', colorMode: 'solid', color1: '#c9d6ff', glow: 40, sparkle: 1, animIn: 'zoom', animMove: 'breathe', bg: 55, bgColor: '#05060f' } },
    { name: 'Altın Saat', desc: 'Altın sarısı, geniş harf aralığı', data: { font: 'Constantia', colorMode: 'gradient', color1: '#ffe29a', color2: '#ffa751', letter: 5, glow: 30, animIn: 'wave', animMove: 'float', bg: 45, bgColor: '#150d05', radius: 22 } },
    { name: 'Cam Panel', desc: 'Glassmorphism + modern görünüm', data: { glass: 1, glassBlur: 22, glassSat: 200, bg: 30, bgColor: '#0a0a14', radius: 22, font: 'Segoe UI', colorMode: 'album', glow: 20 } },
    { name: 'HUD Frame', desc: 'Dış çerçeve + neon kenar', data: { hud: 1, hudSize: 4, hudColor: '#8ab4ff', hudGlow: 40, bg: 40, bgColor: '#0a0a14', radius: 12, glow: 25 } },
  ];
  g.PRESETS = { TEMPLATES, GALLERY };
})(typeof globalThis !== 'undefined' ? globalThis : this);