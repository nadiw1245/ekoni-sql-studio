(function (global) {
  'use strict';

  const THEMES = {
    'tokyo-night': {
      name: 'Tokyo Night',
      tagline: 'Deep twilight indigo & electric sky',
      isLight: false,
      swatches: ['#1a1b26', '#7aa2f7', '#bb9af7', '#9ece6a', '#f7768e'],
      vars: {
        '--bg-desktop': '#0d0e17',
        '--bg-bar': 'rgba(22, 22, 34, 0.85)',
        '--bg-pane-solid': '#1a1b26',
        '--bg-surface': '#1f2335',
        '--bg-surface-hover': '#292e42',
        '--bg-input': 'rgba(15, 16, 26, 0.62)',
        '--border-inactive': 'rgba(122, 162, 247, 0.16)',
        '--border-active': '#7aa2f7',
        '--glow-active': 'rgba(122, 162, 247, 0.26)',
        '--text-primary': '#c0caf5',
        '--text-muted': '#828bb8',
        '--text-dim': '#565f89',
        '--accent': '#7aa2f7',
        '--accent-2': '#bb9af7',
        '--accent-soft': 'rgba(122, 162, 247, 0.16)',
        '--caret': '#7aa2f7',
        '--success': '#9ece6a',
        '--warning': '#e0af68',
        '--danger': '#f7768e',
        '--cyan': '#7dcfff',
        '--sql-kw': '#bb9af7',
        '--sql-fn': '#7dcfff',
        '--sql-str': '#9ece6a',
        '--sql-num': '#ff9e64',
        '--sql-table': '#7aa2f7',
        '--sql-op': '#89ddff',
        '--sql-comment': '#565f89',
      },
    },
    'ubuntu-yaru': {
      name: 'Ubuntu Yaru',
      tagline: 'Signature Aubergine & Yaru Orange',
      isLight: false,
      swatches: ['#2c001e', '#e95420', '#8ae234', '#729fcf', '#fce94f'],
      vars: {
        '--bg-desktop': '#180311',
        '--bg-bar': 'rgba(31, 20, 27, 0.88)',
        '--bg-pane-solid': '#2c001e',
        '--bg-surface': '#2b1323',
        '--bg-surface-hover': '#401b34',
        '--bg-input': 'rgba(20, 2, 15, 0.60)',
        '--border-inactive': 'rgba(255, 255, 255, 0.12)',
        '--border-active': '#e95420',
        '--glow-active': 'rgba(233, 84, 32, 0.30)',
        '--text-primary': '#f2f2f2',
        '--text-muted': '#bba4b2',
        '--text-dim': '#896e7f',
        '--accent': '#e95420',
        '--accent-2': '#ad7fa8',
        '--accent-soft': 'rgba(233, 84, 32, 0.20)',
        '--caret': '#e95420',
        '--success': '#8ae234',
        '--warning': '#fce94f',
        '--danger': '#ff5c5c',
        '--cyan': '#34e2e2',
        '--sql-kw': '#e95420',
        '--sql-fn': '#34e2e2',
        '--sql-str': '#fce94f',
        '--sql-num': '#ad7fa8',
        '--sql-table': '#729fcf',
        '--sql-op': '#ff9f43',
        '--sql-comment': '#896e7f',
      },
    },
    catppuccin: {
      name: 'Catppuccin Mocha',
      tagline: 'Soothing pastel mocha & lavender',
      isLight: false,
      swatches: ['#1e1e2e', '#cba6f7', '#a6e3a1', '#89b4fa', '#f38ba8'],
      vars: {
        '--bg-desktop': '#11111b',
        '--bg-bar': 'rgba(24, 24, 37, 0.86)',
        '--bg-pane-solid': '#1e1e2e',
        '--bg-surface': '#252538',
        '--bg-surface-hover': '#313244',
        '--bg-input': 'rgba(17, 17, 27, 0.62)',
        '--border-inactive': 'rgba(203, 166, 247, 0.14)',
        '--border-active': '#cba6f7',
        '--glow-active': 'rgba(203, 166, 247, 0.26)',
        '--text-primary': '#cdd6f4',
        '--text-muted': '#a6adc8',
        '--text-dim': '#6c7086',
        '--accent': '#cba6f7',
        '--accent-2': '#f5c2e7',
        '--accent-soft': 'rgba(203, 166, 247, 0.17)',
        '--caret': '#f5e0dc',
        '--success': '#a6e3a1',
        '--warning': '#f9e2af',
        '--danger': '#f38ba8',
        '--cyan': '#89dceb',
        '--sql-kw': '#cba6f7',
        '--sql-fn': '#89dceb',
        '--sql-str': '#a6e3a1',
        '--sql-num': '#fab387',
        '--sql-table': '#89b4fa',
        '--sql-op': '#f5c2e7',
        '--sql-comment': '#6c7086',
      },
    },
    gruvbox: {
      name: 'Gruvbox Dark',
      tagline: 'Retro warm earth & golden groove',
      isLight: false,
      swatches: ['#282828', '#fe8019', '#b8bb26', '#83a598', '#fb4934'],
      vars: {
        '--bg-desktop': '#1d2021',
        '--bg-bar': 'rgba(29, 32, 33, 0.88)',
        '--bg-pane-solid': '#282828',
        '--bg-surface': '#32302f',
        '--bg-surface-hover': '#3c3836',
        '--bg-input': 'rgba(20, 22, 23, 0.62)',
        '--border-inactive': 'rgba(235, 219, 178, 0.12)',
        '--border-active': '#fe8019',
        '--glow-active': 'rgba(254, 128, 25, 0.26)',
        '--text-primary': '#ebdbb2',
        '--text-muted': '#bdae93',
        '--text-dim': '#928374',
        '--accent': '#fe8019',
        '--accent-2': '#fabd2f',
        '--accent-soft': 'rgba(254, 128, 25, 0.18)',
        '--caret': '#fabd2f',
        '--success': '#b8bb26',
        '--warning': '#fabd2f',
        '--danger': '#fb4934',
        '--cyan': '#8ec07c',
        '--sql-kw': '#fe8019',
        '--sql-fn': '#8ec07c',
        '--sql-str': '#b8bb26',
        '--sql-num': '#d3869b',
        '--sql-table': '#83a598',
        '--sql-op': '#fabd2f',
        '--sql-comment': '#928374',
      },
    },
    nord: {
      name: 'Nord Arctic',
      tagline: 'Polar night & crisp glacial frost',
      isLight: false,
      swatches: ['#2e3440', '#88c0d0', '#a3be8c', '#81a1c1', '#bf616a'],
      vars: {
        '--bg-desktop': '#242933',
        '--bg-bar': 'rgba(36, 41, 51, 0.88)',
        '--bg-pane-solid': '#2e3440',
        '--bg-surface': '#3b4252',
        '--bg-surface-hover': '#434c5e',
        '--bg-input': 'rgba(30, 35, 44, 0.65)',
        '--border-inactive': 'rgba(136, 192, 208, 0.14)',
        '--border-active': '#88c0d0',
        '--glow-active': 'rgba(136, 192, 208, 0.25)',
        '--text-primary': '#eceff4',
        '--text-muted': '#d8dee9',
        '--text-dim': '#7b88a1',
        '--accent': '#88c0d0',
        '--accent-2': '#81a1c1',
        '--accent-soft': 'rgba(136, 192, 208, 0.18)',
        '--caret': '#88c0d0',
        '--success': '#a3be8c',
        '--warning': '#ebcb8b',
        '--danger': '#bf616a',
        '--cyan': '#8fbcbb',
        '--sql-kw': '#81a1c1',
        '--sql-fn': '#88c0d0',
        '--sql-str': '#a3be8c',
        '--sql-num': '#b48ead',
        '--sql-table': '#8fbcbb',
        '--sql-op': '#ebcb8b',
        '--sql-comment': '#7b88a1',
      },
    },
    kanagawa: {
      name: 'Kanagawa Wave',
      tagline: 'Sumi ink & Japanese wave indigo',
      isLight: false,
      swatches: ['#1f1f28', '#7e9cd8', '#98bb6c', '#ffa066', '#e46876'],
      vars: {
        '--bg-desktop': '#16161d',
        '--bg-bar': 'rgba(22, 22, 29, 0.88)',
        '--bg-pane-solid': '#1f1f28',
        '--bg-surface': '#2a2a37',
        '--bg-surface-hover': '#363646',
        '--bg-input': 'rgba(20, 20, 26, 0.62)',
        '--border-inactive': 'rgba(220, 215, 186, 0.12)',
        '--border-active': '#7e9cd8',
        '--glow-active': 'rgba(126, 156, 216, 0.26)',
        '--text-primary': '#dcd7ba',
        '--text-muted': '#a6a69c',
        '--text-dim': '#727169',
        '--accent': '#7e9cd8',
        '--accent-2': '#957fb8',
        '--accent-soft': 'rgba(126, 156, 216, 0.18)',
        '--caret': '#c8c093',
        '--success': '#98bb6c',
        '--warning': '#e6c384',
        '--danger': '#e46876',
        '--cyan': '#7fb4ca',
        '--sql-kw': '#957fb8',
        '--sql-fn': '#7fb4ca',
        '--sql-str': '#98bb6c',
        '--sql-num': '#ffa066',
        '--sql-table': '#7e9cd8',
        '--sql-op': '#e6c384',
        '--sql-comment': '#727169',
      },
    },
    everforest: {
      name: 'Everforest',
      tagline: 'Organic pine green & moss serenity',
      isLight: false,
      swatches: ['#2d353b', '#a7c080', '#83c092', '#7fbbb3', '#e67e80'],
      vars: {
        '--bg-desktop': '#232a2e',
        '--bg-bar': 'rgba(35, 42, 46, 0.88)',
        '--bg-pane-solid': '#2d353b',
        '--bg-surface': '#343f44',
        '--bg-surface-hover': '#3d484d',
        '--bg-input': 'rgba(28, 34, 38, 0.64)',
        '--border-inactive': 'rgba(167, 192, 128, 0.14)',
        '--border-active': '#a7c080',
        '--glow-active': 'rgba(167, 192, 128, 0.25)',
        '--text-primary': '#d3c6aa',
        '--text-muted': '#9da9a0',
        '--text-dim': '#7a8478',
        '--accent': '#a7c080',
        '--accent-2': '#83c092',
        '--accent-soft': 'rgba(167, 192, 128, 0.17)',
        '--caret': '#a7c080',
        '--success': '#a7c080',
        '--warning': '#dbbc7f',
        '--danger': '#e67e80',
        '--cyan': '#83c092',
        '--sql-kw': '#e67e80',
        '--sql-fn': '#83c092',
        '--sql-str': '#a7c080',
        '--sql-num': '#d699b6',
        '--sql-table': '#7fbbb3',
        '--sql-op': '#dbbc7f',
        '--sql-comment': '#7a8478',
      },
    },
    'rose-pine': {
      name: 'Rosé Pine',
      tagline: 'Soho pine, love rose & iris gold',
      isLight: false,
      swatches: ['#191724', '#ebbcba', '#c4a7e7', '#9ccfd8', '#eb6f92'],
      vars: {
        '--bg-desktop': '#13111c',
        '--bg-bar': 'rgba(25, 23, 36, 0.86)',
        '--bg-pane-solid': '#191724',
        '--bg-surface': '#1f1d2e',
        '--bg-surface-hover': '#26233a',
        '--bg-input': 'rgba(15, 13, 24, 0.62)',
        '--border-inactive': 'rgba(235, 188, 186, 0.14)',
        '--border-active': '#ebbcba',
        '--glow-active': 'rgba(235, 188, 186, 0.25)',
        '--text-primary': '#e0def4',
        '--text-muted': '#908caa',
        '--text-dim': '#6e6a86',
        '--accent': '#ebbcba',
        '--accent-2': '#c4a7e7',
        '--accent-soft': 'rgba(235, 188, 186, 0.17)',
        '--caret': '#ebbcba',
        '--success': '#9ccfd8',
        '--warning': '#f6c177',
        '--danger': '#eb6f92',
        '--cyan': '#9ccfd8',
        '--sql-kw': '#c4a7e7',
        '--sql-fn': '#9ccfd8',
        '--sql-str': '#f6c177',
        '--sql-num': '#eb6f92',
        '--sql-table': '#ebbcba',
        '--sql-op': '#31748f',
        '--sql-comment': '#6e6a86',
      },
    },
    dracula: {
      name: 'Dracula',
      tagline: 'High-contrast neon violet & synth',
      isLight: false,
      swatches: ['#282a36', '#bd93f9', '#50fa7b', '#8be9fd', '#ff79c6'],
      vars: {
        '--bg-desktop': '#191a21',
        '--bg-bar': 'rgba(30, 31, 41, 0.88)',
        '--bg-pane-solid': '#282a36',
        '--bg-surface': '#21222c',
        '--bg-surface-hover': '#383a59',
        '--bg-input': 'rgba(20, 21, 28, 0.64)',
        '--border-inactive': 'rgba(189, 147, 249, 0.14)',
        '--border-active': '#bd93f9',
        '--glow-active': 'rgba(189, 147, 249, 0.26)',
        '--text-primary': '#f8f8f2',
        '--text-muted': '#a6acc8',
        '--text-dim': '#6272a4',
        '--accent': '#bd93f9',
        '--accent-2': '#ff79c6',
        '--accent-soft': 'rgba(189, 147, 249, 0.18)',
        '--caret': '#ff79c6',
        '--success': '#50fa7b',
        '--warning': '#f1fa8c',
        '--danger': '#ff5555',
        '--cyan': '#8be9fd',
        '--sql-kw': '#ff79c6',
        '--sql-fn': '#8be9fd',
        '--sql-str': '#f1fa8c',
        '--sql-num': '#bd93f9',
        '--sql-table': '#50fa7b',
        '--sql-op': '#ffb86c',
        '--sql-comment': '#6272a4',
      },
    },
    'matte-black': {
      name: 'Matte Black',
      tagline: 'Stealth OLED obsidian & crisp amber',
      isLight: false,
      swatches: ['#0c0c0d', '#f59e0b', '#22c55e', '#38bdf8', '#ef4444'],
      vars: {
        '--bg-desktop': '#050506',
        '--bg-bar': 'rgba(12, 12, 14, 0.92)',
        '--bg-pane-solid': '#101012',
        '--bg-surface': '#17171a',
        '--bg-surface-hover': '#242429',
        '--bg-input': 'rgba(8, 8, 10, 0.72)',
        '--border-inactive': 'rgba(255, 255, 255, 0.08)',
        '--border-active': '#f59e0b',
        '--glow-active': 'rgba(245, 158, 11, 0.25)',
        '--text-primary': '#ededef',
        '--text-muted': '#9a9aa6',
        '--text-dim': '#5f5f6b',
        '--accent': '#f59e0b',
        '--accent-2': '#38bdf8',
        '--accent-soft': 'rgba(245, 158, 11, 0.16)',
        '--caret': '#f59e0b',
        '--success': '#22c55e',
        '--warning': '#f59e0b',
        '--danger': '#ef4444',
        '--cyan': '#38bdf8',
        '--sql-kw': '#f59e0b',
        '--sql-fn': '#38bdf8',
        '--sql-str': '#4ade80',
        '--sql-num': '#c084fc',
        '--sql-table': '#60a5fa',
        '--sql-op': '#fb923c',
        '--sql-comment': '#5f5f6b',
      },
    },
    ristretto: {
      name: 'Ristretto',
      tagline: 'Rich espresso crema & roasted copper',
      isLight: false,
      swatches: ['#2c2525', '#f38d70', '#adda78', '#85dacc', '#fd6883'],
      vars: {
        '--bg-desktop': '#1e1919',
        '--bg-bar': 'rgba(34, 28, 28, 0.88)',
        '--bg-pane-solid': '#2c2525',
        '--bg-surface': '#362e2e',
        '--bg-surface-hover': '#463b3b',
        '--bg-input': 'rgba(26, 21, 21, 0.65)',
        '--border-inactive': 'rgba(255, 241, 243, 0.11)',
        '--border-active': '#f38d70',
        '--glow-active': 'rgba(243, 141, 112, 0.26)',
        '--text-primary': '#fff1f3',
        '--text-muted': '#c3b7b8',
        '--text-dim': '#948a8b',
        '--accent': '#f38d70',
        '--accent-2': '#a8a9eb',
        '--accent-soft': 'rgba(243, 141, 112, 0.18)',
        '--caret': '#f38d70',
        '--success': '#adda78',
        '--warning': '#f9cc6c',
        '--danger': '#fd6883',
        '--cyan': '#85dacc',
        '--sql-kw': '#fd6883',
        '--sql-fn': '#85dacc',
        '--sql-str': '#f9cc6c',
        '--sql-num': '#a8a9eb',
        '--sql-table': '#f38d70',
        '--sql-op': '#adda78',
        '--sql-comment': '#948a8b',
      },
    },
    'lumon-light': {
      name: 'Lumon Daylight',
      tagline: 'Crisp minimalist daylight precision',
      isLight: true,
      swatches: ['#f4f7f9', '#0f62fe', '#198038', '#007d79', '#da1e28'],
      vars: {
        '--bg-desktop': '#dde5ec',
        '--bg-bar': 'rgba(244, 247, 250, 0.90)',
        '--bg-pane-solid': '#ffffff',
        '--bg-surface': '#edf2f7',
        '--bg-surface-hover': '#dce5ef',
        '--bg-input': 'rgba(235, 241, 247, 0.90)',
        '--border-inactive': 'rgba(15, 23, 42, 0.12)',
        '--border-active': '#0f62fe',
        '--glow-active': 'rgba(15, 98, 254, 0.20)',
        '--text-primary': '#16202a',
        '--text-muted': '#4c5d70',
        '--text-dim': '#7d8fa3',
        '--accent': '#0f62fe',
        '--accent-2': '#8a3ffc',
        '--accent-soft': 'rgba(15, 98, 254, 0.12)',
        '--caret': '#0f62fe',
        '--success': '#198038',
        '--warning': '#b28600',
        '--danger': '#da1e28',
        '--cyan': '#007d79',
        '--sql-kw': '#8a3ffc',
        '--sql-fn': '#007d79',
        '--sql-str': '#198038',
        '--sql-num': '#ba4e00',
        '--sql-table': '#0f62fe',
        '--sql-op': '#0f62fe',
        '--sql-comment': '#7d8fa3',
      },
    },
  };

  const WALLPAPERS = [
    {
      id: 'aurora',
      name: 'Aurora Mesh',
      css: 'radial-gradient(ellipse at 18% 20%, color-mix(in srgb, var(--accent) 36%, transparent) 0%, transparent 55%), radial-gradient(ellipse at 82% 78%, color-mix(in srgb, var(--accent-2) 32%, transparent) 0%, transparent 55%), var(--bg-desktop)',
    },
    {
      id: 'cyber-grid',
      name: 'Hyprland Grid',
      css: 'linear-gradient(color-mix(in srgb, var(--accent) 11%, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in srgb, var(--accent) 11%, transparent) 1px, transparent 1px), radial-gradient(circle at 75% 20%, color-mix(in srgb, var(--accent) 26%, transparent), transparent 55%), var(--bg-desktop)',
      size: '34px 34px, 34px 34px, auto, auto',
    },
    {
      id: 'horizon',
      name: 'Alpine Dusk',
      css: 'linear-gradient(155deg, color-mix(in srgb, var(--accent) 26%, var(--bg-desktop)) 0%, var(--bg-desktop) 48%, color-mix(in srgb, var(--accent-2) 28%, var(--bg-desktop)) 100%)',
    },
    {
      id: 'rings',
      name: 'Orbital Rings',
      css: 'repeating-radial-gradient(circle at 80% 25%, color-mix(in srgb, var(--accent) 14%, transparent) 0 1px, transparent 1px 44px), radial-gradient(circle at 20% 85%, color-mix(in srgb, var(--accent-2) 26%, transparent), transparent 55%), var(--bg-desktop)',
    },
    {
      id: 'dots',
      name: 'Precision Matrix',
      css: 'radial-gradient(color-mix(in srgb, var(--accent) 24%, transparent) 1.2px, transparent 1.2px), radial-gradient(circle at 50% 0%, color-mix(in srgb, var(--accent) 20%, transparent), transparent 60%), var(--bg-desktop)',
      size: '22px 22px, auto, auto',
    },
    { id: 'pure', name: 'Pure Minimal', css: 'var(--bg-desktop)' },
  ];

  const DEFAULTS = {
    theme: 'tokyo-night',
    wallpaper: 'aurora',
    accentOverride: '',
    glassOpacity: 0.88,
    blur: 14,
    gap: 9,
    radius: 10,
    fontSize: 13.5,
  };

  let state = (() => {
    try {
      const raw = localStorage.getItem('ekoni_sql_aether_v1');
      if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
    } catch {}
    return { ...DEFAULTS };
  })();

  const listeners = new Set();

  function save() {
    try { localStorage.setItem('ekoni_sql_aether_v1', JSON.stringify(state)); } catch {}
  }

  function hexToRgba(hex, a) {
    const c = String(hex || '').replace('#', '');
    if (c.length !== 6) return null;
    return `rgba(${parseInt(c.slice(0, 2), 16)},${parseInt(c.slice(2, 4), 16)},${parseInt(c.slice(4, 6), 16)},${a})`;
  }

  function applyAll() {
    const t = THEMES[state.theme] || THEMES['tokyo-night'];
    const root = document.documentElement;
    root.dataset.theme = state.theme;
    root.dataset.mode = t.isLight ? 'light' : 'dark';
    for (const [k, v] of Object.entries(t.vars)) root.style.setProperty(k, v);

    const paneRgba = hexToRgba(t.vars['--bg-pane-solid'], state.glassOpacity);
    if (paneRgba) root.style.setProperty('--bg-pane', paneRgba);

    if (state.accentOverride) {
      root.style.setProperty('--accent', state.accentOverride);
      root.style.setProperty('--border-active', state.accentOverride);
      root.style.setProperty('--caret', state.accentOverride);
      const soft = hexToRgba(state.accentOverride, 0.18);
      const glow = hexToRgba(state.accentOverride, 0.28);
      if (soft) root.style.setProperty('--accent-soft', soft);
      if (glow) root.style.setProperty('--glow-active', glow);
    }

    root.style.setProperty('--pane-blur', `${state.blur}px`);
    root.style.setProperty('--wm-gap', `${state.gap}px`);
    root.style.setProperty('--pane-radius', `${state.radius}px`);
    root.style.setProperty('--editor-font-size', `${state.fontSize}px`);

    const wp = WALLPAPERS.find((w) => w.id === state.wallpaper) || WALLPAPERS[0];
    const bg = document.getElementById('desktopWallpaper');
    if (bg) {
      bg.style.background = wp.css;
      bg.style.backgroundSize = wp.size || 'auto';
    }
    for (const fn of listeners) fn(state, t);
  }

  function setTheme(id, previewOnly = false) {
    if (!THEMES[id]) return false;
    state.theme = id;
    state.accentOverride = '';
    if (!previewOnly) save();
    applyAll();
    return true;
  }

  function setWallpaper(id) {
    if (id === 'next') {
      const i = WALLPAPERS.findIndex((w) => w.id === state.wallpaper);
      state.wallpaper = WALLPAPERS[(i + 1) % WALLPAPERS.length].id;
    } else if (WALLPAPERS.some((w) => w.id === id)) {
      state.wallpaper = id;
    }
    save();
    applyAll();
    return WALLPAPERS.find((w) => w.id === state.wallpaper);
  }

  function updateAether(patch) {
    state = { ...state, ...patch };
    save();
    applyAll();
  }

  function resetAether() {
    state = { ...DEFAULTS };
    save();
    applyAll();
  }

  global.SqlThemes = {
    THEMES,
    WALLPAPERS,
    applyAll,
    setTheme,
    setWallpaper,
    updateAether,
    resetAether,
    getState: () => ({ ...state }),
    onChange: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
  };
})(window);
