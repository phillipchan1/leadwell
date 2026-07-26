/** Curated SVG avatar presets — stored as data URLs so they work offline. */

export type AvatarOption = {
  id: string;
  label: string;
  src: string;
};

export type AvatarTheme = {
  id: string;
  label: string;
  blurb: string;
  avatars: AvatarOption[];
};

function svgDataUrl(svg: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg.replace(/\s+/g, " ").trim())}`;
}

function circleAvatar(
  bg: string,
  accents: string,
  id: string
): string {
  return svgDataUrl(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">
      <defs>
        ${accents}
      </defs>
      <rect width="128" height="128" fill="${bg}"/>
      ${id}
    </svg>
  `);
}

/** Horizon — warm dusk landscapes */
const horizon = [
  {
    id: "horizon-ridge",
    label: "Ridge",
    src: circleAvatar(
      "#1c1917",
      `<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#f97316"/>
        <stop offset="45%" stop-color="#fb7185"/>
        <stop offset="100%" stop-color="#1c1917"/>
      </linearGradient>`,
      `<rect width="128" height="128" fill="url(#sky)"/>
       <circle cx="92" cy="38" r="14" fill="#fef3c7" opacity="0.9"/>
       <path d="M0 78 Q32 58 64 74 T128 70 L128 128 L0 128Z" fill="#292524"/>
       <path d="M0 92 Q40 78 72 90 T128 86 L128 128 L0 128Z" fill="#1c1917"/>`
    ),
  },
  {
    id: "horizon-bloom",
    label: "Bloom",
    src: circleAvatar(
      "#fff7ed",
      `<linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#fdba74"/>
        <stop offset="100%" stop-color="#fb7185"/>
      </linearGradient>`,
      `<circle cx="64" cy="54" r="28" fill="url(#g)"/>
       <path d="M40 96 Q64 72 88 96" stroke="#9a3412" stroke-width="3" fill="none" stroke-linecap="round"/>
       <circle cx="36" cy="40" r="6" fill="#fbbf24"/>
       <circle cx="96" cy="48" r="4" fill="#f472b6"/>
       <circle cx="78" cy="28" r="3" fill="#fb923c"/>`
    ),
  },
  {
    id: "horizon-mesa",
    label: "Mesa",
    src: circleAvatar(
      "#431407",
      "",
      `<rect width="128" height="128" fill="#7c2d12"/>
       <rect y="0" height="52" width="128" fill="#ea580c"/>
       <rect y="52" height="18" width="128" fill="#c2410c"/>
       <path d="M0 70 h128 v58 H0Z" fill="#431407"/>
       <rect x="28" y="58" width="22" height="28" fill="#9a3412"/>
       <rect x="78" y="50" width="30" height="36" fill="#7c2d12"/>
       <circle cx="98" cy="28" r="10" fill="#fde68a" opacity="0.85"/>`
    ),
  },
  {
    id: "horizon-lantern",
    label: "Lantern",
    src: circleAvatar(
      "#1c1917",
      `<radialGradient id="glow" cx="50%" cy="42%" r="45%">
        <stop offset="0%" stop-color="#fbbf24"/>
        <stop offset="55%" stop-color="#ea580c" stop-opacity="0.55"/>
        <stop offset="100%" stop-color="#1c1917" stop-opacity="0"/>
      </radialGradient>`,
      `<rect width="128" height="128" fill="#1c1917"/>
       <circle cx="64" cy="54" r="48" fill="url(#glow)"/>
       <rect x="54" y="38" width="20" height="28" rx="3" fill="#f59e0b"/>
       <rect x="58" y="32" width="12" height="8" rx="2" fill="#fbbf24"/>
       <path d="M54 66 h20 l-4 14 h-12Z" fill="#d97706"/>
       <circle cx="64" cy="50" r="5" fill="#fef3c7"/>`
    ),
  },
];

/** Ocean — deep water & reefs */
const ocean = [
  {
    id: "ocean-depth",
    label: "Depth",
    src: circleAvatar(
      "#0c4a6e",
      `<linearGradient id="sea" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#38bdf8"/>
        <stop offset="55%" stop-color="#0284c7"/>
        <stop offset="100%" stop-color="#0c4a6e"/>
      </linearGradient>`,
      `<rect width="128" height="128" fill="url(#sea)"/>
       <path d="M0 48 Q20 40 40 48 T80 48 T120 48 T160 48" stroke="#e0f2fe" stroke-width="2.5" fill="none" opacity="0.55"/>
       <path d="M-10 62 Q16 52 42 62 T94 62 T146 62" stroke="#bae6fd" stroke-width="2" fill="none" opacity="0.4"/>
       <ellipse cx="88" cy="86" rx="18" ry="10" fill="#0ea5e9" opacity="0.7"/>
       <circle cx="34" cy="78" r="3" fill="#67e8f9" opacity="0.8"/>
       <circle cx="48" cy="92" r="2" fill="#a5f3fc" opacity="0.7"/>`
    ),
  },
  {
    id: "ocean-reef",
    label: "Reef",
    src: circleAvatar(
      "#042f2e",
      "",
      `<rect width="128" height="128" fill="#115e59"/>
       <circle cx="36" cy="78" r="16" fill="#14b8a6"/>
       <circle cx="58" cy="88" r="12" fill="#0d9488"/>
       <circle cx="84" cy="74" r="20" fill="#2dd4bf"/>
       <path d="M70 40 Q78 20 86 40 Q94 20 102 40" stroke="#5eead4" stroke-width="4" fill="none" stroke-linecap="round"/>
       <circle cx="28" cy="40" r="4" fill="#99f6e4"/>
       <circle cx="100" cy="96" r="5" fill="#f472b6" opacity="0.85"/>
       <circle cx="48" cy="52" r="3" fill="#fbbf24"/>`
    ),
  },
  {
    id: "ocean-sail",
    label: "Sail",
    src: circleAvatar(
      "#082f49",
      `<linearGradient id="sky2" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#7dd3fc"/>
        <stop offset="60%" stop-color="#0ea5e9"/>
        <stop offset="100%" stop-color="#075985"/>
      </linearGradient>`,
      `<rect width="128" height="128" fill="url(#sky2)"/>
       <path d="M0 86 h128 v42 H0Z" fill="#0369a1"/>
       <path d="M58 34 L58 86" stroke="#0c4a6e" stroke-width="3"/>
       <path d="M60 36 L96 72 L60 72Z" fill="#f8fafc"/>
       <path d="M56 48 L34 72 L56 72Z" fill="#e2e8f0"/>
       <ellipse cx="70" cy="90" rx="28" ry="6" fill="#0c4a6e" opacity="0.35"/>`
    ),
  },
  {
    id: "ocean-pearl",
    label: "Pearl",
    src: circleAvatar(
      "#134e4a",
      `<radialGradient id="shell" cx="45%" cy="40%" r="55%">
        <stop offset="0%" stop-color="#f0fdfa"/>
        <stop offset="40%" stop-color="#5eead4"/>
        <stop offset="100%" stop-color="#0f766e"/>
      </radialGradient>`,
      `<rect width="128" height="128" fill="#134e4a"/>
       <ellipse cx="64" cy="70" rx="42" ry="28" fill="url(#shell)"/>
       <circle cx="64" cy="62" r="12" fill="#ecfeff" opacity="0.95"/>
       <path d="M30 62 Q64 40 98 62" stroke="#99f6e4" stroke-width="2" fill="none" opacity="0.6"/>`
    ),
  },
];

/** Forest — moss, canopy, trail */
const forest = [
  {
    id: "forest-canopy",
    label: "Canopy",
    src: circleAvatar(
      "#14532d",
      `<linearGradient id="leaf" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#86efac"/>
        <stop offset="100%" stop-color="#166534"/>
      </linearGradient>`,
      `<rect width="128" height="128" fill="#052e16"/>
       <circle cx="40" cy="52" r="28" fill="url(#leaf)"/>
       <circle cx="78" cy="44" r="32" fill="#22c55e"/>
       <circle cx="96" cy="68" r="24" fill="#15803d"/>
       <rect x="58" y="72" width="10" height="36" fill="#3f2a14"/>
       <rect x="34" y="78" width="8" height="30" fill="#452a12"/>`
    ),
  },
  {
    id: "forest-fern",
    label: "Fern",
    src: circleAvatar(
      "#ecfccb",
      "",
      `<rect width="128" height="128" fill="#ecfccb"/>
       <path d="M64 108 C64 70 40 60 28 40" stroke="#3f6212" stroke-width="3" fill="none"/>
       <path d="M64 108 C64 66 88 56 100 36" stroke="#4d7c0f" stroke-width="3" fill="none"/>
       <ellipse cx="36" cy="52" rx="10" ry="5" fill="#65a30d" transform="rotate(-35 36 52)"/>
       <ellipse cx="44" cy="68" rx="11" ry="5" fill="#84cc16" transform="rotate(-25 44 68)"/>
       <ellipse cx="92" cy="48" rx="10" ry="5" fill="#65a30d" transform="rotate(35 92 48)"/>
       <ellipse cx="84" cy="64" rx="11" ry="5" fill="#84cc16" transform="rotate(25 84 64)"/>
       <circle cx="64" cy="28" r="5" fill="#a3e635"/>`
    ),
  },
  {
    id: "forest-trail",
    label: "Trail",
    src: circleAvatar(
      "#1a2e05",
      "",
      `<rect width="128" height="128" fill="#365314"/>
       <path d="M48 128 Q58 90 52 60 Q46 30 64 8 Q82 30 76 60 Q70 90 80 128" fill="#a8a29e" opacity="0.55"/>
       <circle cx="24" cy="40" r="18" fill="#4d7c0f"/>
       <circle cx="108" cy="52" r="22" fill="#3f6212"/>
       <circle cx="20" cy="88" r="14" fill="#65a30d"/>
       <circle cx="110" cy="96" r="16" fill="#4d7c0f"/>`
    ),
  },
  {
    id: "forest-spore",
    label: "Spore",
    src: circleAvatar(
      "#022c22",
      `<radialGradient id="cap" cx="50%" cy="40%" r="50%">
        <stop offset="0%" stop-color="#fca5a5"/>
        <stop offset="100%" stop-color="#b91c1c"/>
      </radialGradient>`,
      `<rect width="128" height="128" fill="#064e3b"/>
       <ellipse cx="64" cy="54" rx="34" ry="22" fill="url(#cap)"/>
       <rect x="56" y="54" width="16" height="34" rx="4" fill="#fef3c7"/>
       <circle cx="48" cy="48" r="3" fill="#fef2f2" opacity="0.9"/>
       <circle cx="70" cy="44" r="2.5" fill="#fff" opacity="0.85"/>
       <circle cx="82" cy="54" r="2" fill="#fee2e2"/>
       <circle cx="30" cy="90" r="4" fill="#34d399" opacity="0.7"/>
       <circle cx="96" cy="96" r="3" fill="#6ee7b7" opacity="0.6"/>`
    ),
  },
];

/** Aurora — night sky light shows */
const aurora = [
  {
    id: "aurora-veil",
    label: "Veil",
    src: circleAvatar(
      "#020617",
      `<linearGradient id="a1" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#22d3ee" stop-opacity="0.9"/>
        <stop offset="50%" stop-color="#a78bfa" stop-opacity="0.75"/>
        <stop offset="100%" stop-color="#34d399" stop-opacity="0.5"/>
      </linearGradient>`,
      `<rect width="128" height="128" fill="#020617"/>
       <path d="M0 80 Q20 30 40 70 T80 50 T128 75 L128 128 L0 128Z" fill="url(#a1)" opacity="0.85"/>
       <circle cx="24" cy="28" r="1.5" fill="#fff"/>
       <circle cx="48" cy="18" r="1" fill="#e0f2fe"/>
       <circle cx="90" cy="24" r="1.5" fill="#fff"/>
       <circle cx="108" cy="40" r="1" fill="#ddd6fe"/>
       <circle cx="70" cy="14" r="1" fill="#fff"/>`
    ),
  },
  {
    id: "aurora-pulse",
    label: "Pulse",
    src: circleAvatar(
      "#0f172a",
      `<linearGradient id="a2" x1="0" y1="1" x2="0" y2="0">
        <stop offset="0%" stop-color="#0f172a"/>
        <stop offset="40%" stop-color="#312e81"/>
        <stop offset="100%" stop-color="#67e8f9"/>
      </linearGradient>`,
      `<rect width="128" height="128" fill="url(#a2)"/>
       <path d="M16 96 Q40 40 64 88 T112 56" stroke="#a5f3fc" stroke-width="6" fill="none" opacity="0.55" stroke-linecap="round"/>
       <path d="M8 88 Q36 28 64 76 T120 48" stroke="#c4b5fd" stroke-width="4" fill="none" opacity="0.7" stroke-linecap="round"/>
       <circle cx="96" cy="22" r="2" fill="#fff"/>
       <circle cx="30" cy="30" r="1.5" fill="#e0e7ff"/>`
    ),
  },
  {
    id: "aurora-comet",
    label: "Comet",
    src: circleAvatar(
      "#020617",
      "",
      `<rect width="128" height="128" fill="#020617"/>
       <path d="M20 90 L78 40" stroke="#67e8f9" stroke-width="3" stroke-linecap="round" opacity="0.7"/>
       <path d="M28 98 L82 48" stroke="#a78bfa" stroke-width="2" stroke-linecap="round" opacity="0.5"/>
       <circle cx="86" cy="36" r="10" fill="#e0f2fe"/>
       <circle cx="86" cy="36" r="5" fill="#fff"/>
       <circle cx="24" cy="28" r="1.2" fill="#fff"/>
       <circle cx="50" cy="20" r="1" fill="#c7d2fe"/>
       <circle cx="108" cy="70" r="1.3" fill="#fff"/>
       <circle cx="40" cy="60" r="1" fill="#a5f3fc"/>`
    ),
  },
  {
    id: "aurora-ring",
    label: "Ring",
    src: circleAvatar(
      "#0b1020",
      `<radialGradient id="planet" cx="40%" cy="35%" r="60%">
        <stop offset="0%" stop-color="#c4b5fd"/>
        <stop offset="55%" stop-color="#6366f1"/>
        <stop offset="100%" stop-color="#1e1b4b"/>
      </radialGradient>`,
      `<rect width="128" height="128" fill="#0b1020"/>
       <ellipse cx="64" cy="68" rx="46" ry="12" fill="none" stroke="#67e8f9" stroke-width="3" opacity="0.65" transform="rotate(-18 64 68)"/>
       <circle cx="64" cy="64" r="26" fill="url(#planet)"/>
       <circle cx="22" cy="30" r="1.5" fill="#fff"/>
       <circle cx="104" cy="24" r="1" fill="#e0e7ff"/>
       <circle cx="96" cy="100" r="1.2" fill="#a5f3fc"/>`
    ),
  },
];

/** Geometry — bold bauhaus-ish marks */
const geometry = [
  {
    id: "geo-split",
    label: "Split",
    src: circleAvatar(
      "#fafaf9",
      "",
      `<rect width="64" height="128" fill="#0f766e"/>
       <rect x="64" width="64" height="128" fill="#f59e0b"/>
       <circle cx="64" cy="64" r="28" fill="#fafaf9"/>
       <circle cx="64" cy="64" r="14" fill="#1c1917"/>`
    ),
  },
  {
    id: "geo-arcs",
    label: "Arcs",
    src: circleAvatar(
      "#1c1917",
      "",
      `<rect width="128" height="128" fill="#1c1917"/>
       <path d="M8 96 A56 56 0 0 1 120 96" fill="none" stroke="#14b8a6" stroke-width="10"/>
       <path d="M24 96 A40 40 0 0 1 104 96" fill="none" stroke="#f59e0b" stroke-width="8"/>
       <path d="M40 96 A24 24 0 0 1 88 96" fill="none" stroke="#f43f5e" stroke-width="6"/>
       <circle cx="64" cy="96" r="6" fill="#fafaf9"/>`
    ),
  },
  {
    id: "geo-blocks",
    label: "Blocks",
    src: circleAvatar(
      "#fffbeb",
      "",
      `<rect width="128" height="128" fill="#fffbeb"/>
       <rect x="18" y="18" width="44" height="44" fill="#0d9488"/>
       <rect x="66" y="18" width="44" height="44" fill="#f59e0b"/>
       <rect x="18" y="66" width="44" height="44" fill="#e11d48"/>
       <circle cx="88" cy="88" r="22" fill="#1c1917"/>`
    ),
  },
  {
    id: "geo-orbit",
    label: "Orbit",
    src: circleAvatar(
      "#f5f5f4",
      "",
      `<rect width="128" height="128" fill="#f5f5f4"/>
       <circle cx="64" cy="64" r="36" fill="none" stroke="#292524" stroke-width="3"/>
       <circle cx="64" cy="64" r="12" fill="#0d9488"/>
       <circle cx="64" cy="28" r="8" fill="#f59e0b"/>
       <circle cx="96" cy="80" r="7" fill="#e11d48"/>
       <circle cx="32" cy="78" r="6" fill="#6366f1"/>`
    ),
  },
];

/** Ink — brushy, journal-like marks */
const ink = [
  {
    id: "ink-seal",
    label: "Seal",
    src: circleAvatar(
      "#fafaf9",
      "",
      `<rect width="128" height="128" fill="#fafaf9"/>
       <circle cx="64" cy="64" r="38" fill="#9f1239"/>
       <circle cx="64" cy="64" r="28" fill="none" stroke="#fafaf9" stroke-width="3"/>
       <path d="M52 58 Q64 48 76 58 Q64 72 52 58Z" fill="#fafaf9"/>
       <circle cx="64" cy="78" r="4" fill="#fafaf9"/>`
    ),
  },
  {
    id: "ink-stroke",
    label: "Stroke",
    src: circleAvatar(
      "#1c1917",
      "",
      `<rect width="128" height="128" fill="#1c1917"/>
       <path d="M24 88 C40 40 56 40 64 64 C72 88 88 88 104 40" stroke="#fafaf9" stroke-width="10" fill="none" stroke-linecap="round"/>
       <circle cx="96" cy="36" r="6" fill="#14b8a6"/>`
    ),
  },
  {
    id: "ink-mark",
    label: "Mark",
    src: circleAvatar(
      "#f5f5f4",
      "",
      `<rect width="128" height="128" fill="#f5f5f4"/>
       <ellipse cx="58" cy="60" rx="34" ry="40" fill="#1c1917"/>
       <path d="M78 36 C98 48 102 78 84 96" stroke="#0d9488" stroke-width="8" fill="none" stroke-linecap="round"/>
       <circle cx="40" cy="92" r="5" fill="#f59e0b"/>`
    ),
  },
  {
    id: "ink-crest",
    label: "Crest",
    src: circleAvatar(
      "#0c0a09",
      "",
      `<rect width="128" height="128" fill="#0c0a09"/>
       <path d="M64 22 L96 40 L88 90 L64 108 L40 90 L32 40Z" fill="none" stroke="#d6d3d1" stroke-width="3"/>
       <circle cx="64" cy="60" r="14" fill="#14b8a6"/>
       <path d="M64 74 V92" stroke="#d6d3d1" stroke-width="3"/>
       <path d="M52 84 H76" stroke="#d6d3d1" stroke-width="3"/>`
    ),
  },
];

/** Citrus — bright, energetic pops */
const citrus = [
  {
    id: "citrus-slice",
    label: "Slice",
    src: circleAvatar(
      "#fff7ed",
      "",
      `<rect width="128" height="128" fill="#fff7ed"/>
       <circle cx="64" cy="64" r="42" fill="#f97316"/>
       <circle cx="64" cy="64" r="32" fill="#fdba74"/>
       <path d="M64 32 V96 M32 64 H96 M41 41 L87 87 M87 41 L41 87" stroke="#fff7ed" stroke-width="3"/>
       <circle cx="64" cy="64" r="8" fill="#fff7ed"/>`
    ),
  },
  {
    id: "citrus-zest",
    label: "Zest",
    src: circleAvatar(
      "#365314",
      "",
      `<rect width="128" height="128" fill="#3f6212"/>
       <circle cx="48" cy="56" r="26" fill="#a3e635"/>
       <circle cx="84" cy="72" r="22" fill="#facc15"/>
       <circle cx="70" cy="40" r="14" fill="#f97316"/>
       <path d="M20 100 Q64 80 108 100" stroke="#ecfccb" stroke-width="4" fill="none" stroke-linecap="round" opacity="0.5"/>`
    ),
  },
  {
    id: "citrus-pop",
    label: "Pop",
    src: circleAvatar(
      "#831843",
      "",
      `<rect width="128" height="128" fill="#9d174d"/>
       <circle cx="40" cy="40" r="18" fill="#fbbf24"/>
       <circle cx="88" cy="48" r="24" fill="#fb7185"/>
       <circle cx="60" cy="88" r="28" fill="#f472b6"/>
       <circle cx="96" cy="92" r="10" fill="#fde68a"/>`
    ),
  },
  {
    id: "citrus-sun",
    label: "Sun",
    src: circleAvatar(
      "#0c4a6e",
      `<radialGradient id="sun" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#fef08a"/>
        <stop offset="70%" stop-color="#f59e0b"/>
        <stop offset="100%" stop-color="#ea580c"/>
      </radialGradient>`,
      `<rect width="128" height="128" fill="#0c4a6e"/>
       <circle cx="64" cy="64" r="30" fill="url(#sun)"/>
       <g stroke="#fde68a" stroke-width="4" stroke-linecap="round">
         <path d="M64 18 V28"/><path d="M64 100 V110"/>
         <path d="M18 64 H28"/><path d="M100 64 H110"/>
         <path d="M30 30 L37 37"/><path d="M91 91 L98 98"/>
         <path d="M98 30 L91 37"/><path d="M37 91 L30 98"/>
       </g>`
    ),
  },
];

export const AVATAR_THEMES: AvatarTheme[] = [
  { id: "horizon", label: "Horizon", blurb: "Dusk ridges & warm light", avatars: horizon },
  { id: "ocean", label: "Ocean", blurb: "Depth, reef, and sail", avatars: ocean },
  { id: "forest", label: "Forest", blurb: "Canopy, fern, and trail", avatars: forest },
  { id: "aurora", label: "Aurora", blurb: "Night sky & comet trails", avatars: aurora },
  { id: "geometry", label: "Geometry", blurb: "Bold shapes & marks", avatars: geometry },
  { id: "ink", label: "Ink", blurb: "Journal seals & strokes", avatars: ink },
  { id: "citrus", label: "Citrus", blurb: "Bright energetic pops", avatars: citrus },
];

export const ALL_AVATARS: AvatarOption[] = AVATAR_THEMES.flatMap((t) => t.avatars);
