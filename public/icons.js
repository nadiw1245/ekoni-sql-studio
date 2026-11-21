(function (global) {
  'use strict';

  function svg(paths, size = 16) {
    return `<svg class="ui-icon" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
  }

  // Sleek duotone smooth SVG icon set (Linear / Supabase aesthetic)
  const ICONS = {
    home: (s) => svg('<path d="M3 10.5L12 3l9 7.5V20a1 1 0 0 1-1 1h-5.5v-6.5h-5V21H4a1 1 0 0 1-1-1v-9.5z" fill="currentColor" fill-opacity="0.14"/>', s),
    database: (s) => svg('<ellipse cx="12" cy="5.5" rx="8.5" ry="3" fill="currentColor" fill-opacity="0.18"/><path d="M3.5 5.5v13c0 1.66 3.8 3 8.5 3s8.5-1.34 8.5-3v-13"/><path d="M3.5 12c0 1.66 3.8 3 8.5 3s8.5-1.34 8.5-3"/>', s),
    table: (s) => svg('<rect x="3" y="3.5" width="18" height="17" rx="2.5" fill="currentColor" fill-opacity="0.10"/><path d="M3 9.5h18"/><path d="M3 15h18"/><path d="M9.5 3.5v17"/>', s),
    browse: (s) => svg('<rect x="3" y="4" width="18" height="16" rx="2.5" fill="currentColor" fill-opacity="0.12"/><path d="M3 9.5h18"/><path d="M9.5 9.5v10.5"/>', s),
    structure: (s) => svg('<path d="M12 2.5L2.5 7.5 12 12.5l9.5-5L12 2.5z" fill="currentColor" fill-opacity="0.18"/><path d="M2.5 12.5L12 17.5l9.5-5"/><path d="M2.5 17L12 22l9.5-5"/>', s),
    code: (s) => svg('<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/><line x1="14" y1="4" x2="10" y2="20" opacity="0.5"/>', s),
    terminal: (s) => svg('<rect x="2.5" y="4" width="19" height="16" rx="3" fill="currentColor" fill-opacity="0.12"/><polyline points="7.5 15 11.5 11.5 7.5 8"/><line x1="13" y1="15" x2="17" y2="15"/>', s),
    builder: (s) => svg('<rect x="3" y="3" width="7.5" height="7.5" rx="2" fill="currentColor" fill-opacity="0.18"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="2"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="2"/><path d="M17.25 13.5v7.5"/><path d="M13.5 17.25h7.5"/>', s),
    profiler: (s) => svg('<path d="M3 3v18h18"/><rect x="6.5" y="12" width="3" height="6" rx="1" fill="currentColor" fill-opacity="0.25"/><rect x="11.5" y="7" width="3" height="11" rx="1" fill="currentColor" fill-opacity="0.25"/><rect x="16.5" y="10" width="3" height="8" rx="1" fill="currentColor" fill-opacity="0.25"/>', s),
    api: (s) => svg('<circle cx="12" cy="12" r="9" fill="currentColor" fill-opacity="0.12"/><path d="M8 9.5L5.5 12 8 14.5"/><path d="M16 9.5L18.5 12 16 14.5"/><line x1="13.5" y1="8" x2="10.5" y2="16"/>', s),
    triggers: (s) => svg('<polygon points="13 2 3 14 11.5 14 10.5 22 21 10 12.5 10 13 2" fill="currentColor" fill-opacity="0.18"/>', s),
    search: (s) => svg('<circle cx="11" cy="11" r="7.5" fill="currentColor" fill-opacity="0.12"/><line x1="20.5" y1="20.5" x2="16.5" y2="16.5"/>', s),
    plusSquare: (s) => svg('<rect x="3" y="3" width="18" height="18" rx="3" fill="currentColor" fill-opacity="0.14"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>', s),
    plus: (s) => svg('<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>', s),
    play: (s) => svg('<polygon points="6 4 20 12 6 20 6 4" fill="currentColor" stroke="currentColor" stroke-width="1.5"/>', s),
    wand: (s) => svg('<path d="M15 4V2"/><path d="M15 16v-2"/><path d="M8 9h2"/><path d="M20 9h2"/><path d="M17.8 11.8L19 13"/><path d="M15 9h.01"/><path d="M17.8 6.2L19 5"/><path d="M3 21l9-9"/><path d="M12.2 6.2L11 5"/>', s),
    zap: (s) => svg('<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" fill="currentColor" fill-opacity="0.18"/>', s),
    chart: (s) => svg('<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/>', s),
    braces: (s) => svg('<path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5c0 1.1.9 2 2 2h1"/><path d="M16 21h1a2 2 0 0 0 2-2v-5c0-1.1.9-2 2-2a2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1"/>', s),
    diagram: (s) => svg('<rect x="2.5" y="3" width="7" height="6" rx="1.5" fill="currentColor" fill-opacity="0.18"/><rect x="14.5" y="3" width="7" height="6" rx="1.5" fill="currentColor" fill-opacity="0.18"/><rect x="8.5" y="15" width="7" height="6" rx="1.5" fill="currentColor" fill-opacity="0.18"/><path d="M9.5 6h5"/><path d="M12 6v9"/>', s),
    sliders: (s) => svg('<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><circle cx="4" cy="12" r="2" fill="currentColor" fill-opacity="0.2"/><circle cx="12" cy="10" r="2" fill="currentColor" fill-opacity="0.2"/><circle cx="20" cy="14" r="2" fill="currentColor" fill-opacity="0.2"/>', s),
    bookmark: (s) => svg('<path d="M19 21l-7-4.5L5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" fill="currentColor" fill-opacity="0.16"/>', s),
    snapshot: (s) => svg('<circle cx="12" cy="12" r="9" fill="currentColor" fill-opacity="0.12"/><polyline points="12 7 12 12 15.5 14"/><path d="M3.5 12H1.5"/>', s),
    dice: (s) => svg('<rect x="3" y="3" width="18" height="18" rx="3.5" fill="currentColor" fill-opacity="0.14"/><circle cx="8.5" cy="8.5" r="1.2" fill="currentColor"/><circle cx="15.5" cy="8.5" r="1.2" fill="currentColor"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/><circle cx="8.5" cy="15.5" r="1.2" fill="currentColor"/><circle cx="15.5" cy="15.5" r="1.2" fill="currentColor"/>', s),
    upload: (s) => svg('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>', s),
    download: (s) => svg('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>', s),
    book: (s) => svg('<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" fill="currentColor" fill-opacity="0.12"/>', s),
    clock: (s) => svg('<circle cx="12" cy="12" r="9.5" fill="currentColor" fill-opacity="0.12"/><polyline points="12 6.5 12 12 16 14"/>', s),
    palette: (s) => svg('<circle cx="13.5" cy="6.5" r=".7" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".7" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".7" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".7" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.93 0 1.65-.75 1.65-1.69 0-.44-.18-.84-.44-1.13-.29-.29-.44-.65-.44-1.12a1.64 1.64 0 0 1 1.67-1.67h2c3.05 0 5.56-2.5 5.56-5.55C21.97 6.01 17.46 2 12 2z" fill="currentColor" fill-opacity="0.12"/>', s),
    sparkles: (s) => svg('<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z" fill="currentColor" fill-opacity="0.22"/><path d="M19 3l.7 1.8L21.5 5.5l-1.8.7L19 8l-.7-1.8-1.8-.7 1.8-.7L19 3z"/>', s),
    keyboard: (s) => svg('<rect x="2" y="4.5" width="20" height="15" rx="2.5" fill="currentColor" fill-opacity="0.12"/><path d="M6 8.5h.01"/><path d="M10 8.5h.01"/><path d="M14 8.5h.01"/><path d="M18 8.5h.01"/><path d="M8 12h.01"/><path d="M12 12h.01"/><path d="M16 12h.01"/><path d="M7 15.5h10"/>', s),
    refresh: (s) => svg('<polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>', s),
    edit: (s) => svg('<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" fill="currentColor" fill-opacity="0.18"/>', s),
    copy: (s) => svg('<rect x="9" y="9" width="12.5" height="12.5" rx="2" fill="currentColor" fill-opacity="0.14"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>', s),
    trash: (s) => svg('<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" fill="currentColor" fill-opacity="0.12"/>', s),
    key: (s) => svg('<path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.78 7.78 5.5 5.5 0 0 1 7.78-7.78zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>', s),
    link: (s) => svg('<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>', s),
    eye: (s) => svg('<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" fill="currentColor" fill-opacity="0.12"/><circle cx="12" cy="12" r="3"/>', s),
    check: (s) => svg('<polyline points="20 6 9 17 4 12"/>', s),
    x: (s) => svg('<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>', s),
    sidebar: (s) => svg('<rect x="3" y="3.5" width="18" height="17" rx="2.5" fill="currentColor" fill-opacity="0.10"/><line x1="9" y1="3.5" x2="9" y2="20.5"/>', s),
    chevLeft: (s) => svg('<polyline points="15 18 9 12 15 6"/>', s),
    chevRight: (s) => svg('<polyline points="9 18 15 12 9 6"/>', s),
  };

  global.SqlIcons = ICONS;
})(window);
