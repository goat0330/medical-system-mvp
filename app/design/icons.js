const svg = (body, viewBox = '0 0 24 24') => `<svg viewBox="${viewBox}" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

const ICONS = Object.freeze({
  logo: svg('<path d="M12 3v18M3 12h18"/><path d="M6.2 6.2l11.6 11.6M17.8 6.2L6.2 17.8"/>'),
  overview: svg('<rect x="3" y="3" width="7" height="7" rx="1.2"/><rect x="14" y="3" width="7" height="7" rx="1.2"/><rect x="3" y="14" width="7" height="7" rx="1.2"/><rect x="14" y="14" width="7" height="7" rx="1.2"/>'),
  document: svg('<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h5M9 12h6M9 16h6"/>'),
  frontpage: svg('<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h3M13 12h3M8 16h8"/>'),
  settlement: svg('<path d="M4 4h16v16H4z"/><path d="M8 8h8M8 12h8M8 16h4"/><path d="M16 14v4M14 16h4"/>'),
  grouping: svg('<circle cx="5" cy="12" r="2.2"/><circle cx="12" cy="6" r="2.2"/><circle cx="19" cy="12" r="2.2"/><circle cx="12" cy="18" r="2.2"/><path d="M7 11l3-3M14 8l3 3M17 13l-3 3M10 16l-3-3"/>'),
  audit: svg('<path d="M9 11l2 2 4-4"/><path d="M12 3l7 3v5c0 4.8-2.9 8.2-7 10-4.1-1.8-7-5.2-7-10V6z"/>'),
  mic: svg('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0014 0M12 18v3M9 21h6"/>'),
  refresh: svg('<path d="M20 6v5h-5M4 18v-5h5"/><path d="M7.2 7.2A7 7 0 0118.8 9M5.2 15A7 7 0 0016.8 16.8"/>'),
  send: svg('<path d="M4 4l16 8-16 8 3-8z"/><path d="M7 12h13"/>'),
  check: svg('<path d="M5 12l4 4L19 6"/>'),
  chevronRight: svg('<path d="M9 5l7 7-7 7"/>'),
  search: svg('<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>'),
  evidence: svg('<path d="M4 5h16v14H4z"/><path d="M7 9h10M7 13h7M7 17h5"/>'),
  warning: svg('<path d="M12 3l9 17H3z"/><path d="M12 9v4M12 17h.01"/>'),
  arrowRight: svg('<path d="M5 12h14M14 7l5 5-5 5"/>'),
  user: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0116 0"/>'),
  calendar: svg('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18"/>'),
  clock: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v6l4 2"/>'),
  hospital: svg('<path d="M4 21V7h16v14M8 7V3h8v4M10 11h4M12 9v4M8 17h2M14 17h2"/>'),
});

export function icon(name) { return ICONS[name] || ICONS.document; }
