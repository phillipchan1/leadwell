/* LeadWell landing — vanilla, no dependencies.
 *
 * The page is one day at the well, 06:30 to 22:50. One water surface sits
 * behind the whole page (WebGL, with a 2D canvas fallback). Its color, light
 * and reflections come from the hour of the chapter in view; it ripples where
 * a drop lands, where you tap and where the pointer passes; at nightfall the
 * view tilts up to a horizon, the sun sets into its own reflection, and at the
 * end it tilts back down into the well.
 *
 * Everything here is an enhancement. With no script the page is complete
 * plain flow and each chapter paints its own background color. Under
 * prefers-reduced-motion nothing pins and nothing drifts: the water is one
 * still frame per chapter, each sequence shows its finished state, and the
 * controls still work.
 *
 * Startup is split so no task runs long on a slow phone: this file only
 * compiles in the parser's task, sets up in the next one, draws the hero once
 * the first frame is out, lays the chapters out one per task, and starts the
 * water last. */
setTimeout(() => {
  "use strict";

  const root = document.documentElement;
  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  let still = motionQuery.matches;
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));
  const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (t) => t * t * (3 - 2 * t);
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const SVGNS = "http://www.w3.org/2000/svg";
  const TAU = Math.PI * 2;
  const K = 0.35; // the water scrolls at this fraction of the page: it's deeper than the paper
  const svgEl = (tag, attrs = {}, parent) => {
    const el = document.createElementNS(SVGNS, tag);
    for (const k in attrs) el.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(el);
    return el;
  };
  // Read in the first task after this one: reading them now would force the
  // first layout into the script's own task.
  let W = 0;
  let H = 0;
  // Set once every chapter has been laid out (see the warm-up at the end).
  let warm = false;
  let wantChart = false;
  let nightClear = 0;

  /* ── Headings: split into words just before they're needed ───────── */

  function split(el) {
    if (el.classList.contains("is-split")) return;
    let n = 0;
    const walk = (node) => {
      for (const child of Array.from(node.childNodes)) {
        if (child.nodeType === 1) {
          walk(child);
          continue;
        }
        if (child.nodeType !== 3) continue;
        const frag = document.createDocumentFragment();
        for (const part of child.textContent.split(/(\s+)/)) {
          if (!part) continue;
          if (/^\s+$/.test(part)) {
            frag.append(part);
            continue;
          }
          const w = document.createElement("span");
          const i = document.createElement("span");
          w.className = "w";
          i.className = "w__i";
          i.textContent = part;
          i.style.setProperty("--wi", n++);
          w.append(i);
          frag.append(w);
        }
        child.replaceWith(frag);
      }
    };
    walk(el);
    el.classList.add("is-split");
  }

  const revealables = $$("[data-reveal], [data-split]");
  const placeEls = $$(".place");
  if ("IntersectionObserver" in window) {
    const pre = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          if (!still) split(e.target);
          pre.unobserve(e.target);
        }
      },
      { rootMargin: "0px 0px 60% 0px" }
    );
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          if (!still && e.target.hasAttribute("data-split")) split(e.target);
          e.target.classList.add("is-in");
          io.unobserve(e.target);
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.06 }
    );
    $$("[data-split]").forEach((el) => pre.observe(el));
    revealables.forEach((el) => io.observe(el));
  } else {
    revealables.forEach((el) => el.classList.add("is-in"));
    placeEls.forEach((el) => el.classList.add("is-in"));
  }

  /* ── Palettes: one per hour ───────────────────────────────────────── */
  // [chapter background, water base, light, accent, [caustics, ripple light, glints], light-pool]
  // Light chapters render their water a shade under the paper so the caustics
  // can brighten toward white; the average stays on the chapter's color.
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const pal = (bg, base, lite, acc, prm, glow) => ({ bg: hex(bg), base: hex(base), lite: hex(lite), acc: hex(acc), prm, glow });
  const PAL = {
    dawn: pal("#013133", "#013133", "#3f9a91", "#e1b34d", [0.3, 0.9, 0.7], 0.3),
    // The day's light chapters sit a shade deeper than their paper, so the
    // caustics, the light pool and every ring read as moving light around the cards.
    morning: pal("#eef3f1", "#dde8e4", "#ffffff", "#e8c470", [1.0, 0.9, 0.45], 0.24),
    forenoon: pal("#023436", "#023436", "#46a399", "#e1b34d", [0.28, 0.9, 0.6], 0.16),
    "late-morning": pal("#eef3f1", "#dce7e3", "#ffffff", "#e8c470", [1.05, 0.9, 0.45], 0.26),
    noon: pal("#f3f5f1", "#e3e9e2", "#ffffff", "#f0d590", [1.05, 0.9, 0.5], 0.28),
    afternoon: pal("#f0f2ec", "#dfe5da", "#ffffff", "#ebc77c", [1.1, 0.95, 0.5], 0.32),
    late: pal("#f4f0e6", "#e7dfcf", "#fffbf2", "#e8b964", [1.1, 0.95, 0.5], 0.34),
    golden: pal("#0b2e30", "#0b2e30", "#7a9a78", "#eaa64e", [0.28, 0.9, 0.8], 0.3),
    dusk: pal("#15122b", "#15122b", "#4b3f7a", "#f0a868", [0.2, 0.8, 0.6], 0.1),
    night: pal("#15122b", "#15122b", "#463c84", "#c3b3f6", [0.22, 0.8, 0.5], 0.08),
    deep: pal("#0f1427", "#0f1427", "#33427a", "#c3b3f6", [0.24, 0.85, 0.5], 0.08),
  };
  const mixPal = (a, b, t) => {
    if (t <= 0 || a === b) return a;
    if (t >= 1) return b;
    const m = (x, y) => x.map((v, i) => lerp(v, y[i], t));
    return { bg: m(a.bg, b.bg), base: m(a.base, b.base), lite: m(a.lite, b.lite), acc: m(a.acc, b.acc), prm: m(a.prm, b.prm), glow: lerp(a.glow, b.glow, t) };
  };

  // The sky at nightfall, keyed by the pinned sequence's progress.
  const SKY = [
    { p: 0, z: hex("#2b3b68"), h: hex("#f0ad6c"), s: hex("#ffd98a"), sh: 4.2 },
    { p: 0.3, z: hex("#25245a"), h: hex("#e8875c"), s: hex("#ffbe66"), sh: 1.9 },
    { p: 0.55, z: hex("#1c1842"), h: hex("#b9587a"), s: hex("#ff9d5c"), sh: 0.15 },
    { p: 0.7, z: hex("#17132f"), h: hex("#62406f"), s: hex("#ff8f5a"), sh: -1.5 },
    { p: 0.86, z: hex("#141128"), h: hex("#3a2c5e"), s: hex("#ff8f5a"), sh: -2.2 },
    { p: 1, z: hex("#120f25"), h: hex("#2b2551"), s: hex("#ff8f5a"), sh: -2.6 },
  ];
  function skyAt(p) {
    let i = 0;
    while (i < SKY.length - 2 && p > SKY[i + 1].p) i++;
    const a = SKY[i];
    const b = SKY[i + 1];
    const t = smooth(clamp((p - a.p) / (b.p - a.p)));
    const m = (x, y) => x.map((v, k) => lerp(v, y[k], t));
    return { z: m(a.z, b.z), h: m(a.h, b.h), s: m(a.s, b.s), sh: lerp(a.sh, b.sh, t) };
  }

  /* ── Chapters, measured once per layout ───────────────────────────── */

  const chapterEls = $$("main > section, .foot");
  const pins = {};
  $$("[data-pin]").forEach((el) => (pins[el.dataset.pin] = { el, top: 0, h: 0 }));
  let chapters = [];
  const toMin = (s) => {
    const [h, m] = s.split(":").map(Number);
    return h * 60 + m;
  };
  const docTop = (el) => el.getBoundingClientRect().top + window.scrollY;
  function measure() {
    W = window.innerWidth;
    H = window.innerHeight;
    keepOut();
    if (!warm) return;
    chapters = chapterEls.map((el, i) => {
      const top = docTop(el);
      const [cTop, cBottom] = contentEdges(el);
      const next = chapterEls[i + 1];
      const hour = el.dataset.hour;
      const h0 = hour ? toMin(hour) : 22 * 60 + 50;
      const nextHour = next && next.dataset.hour;
      const h1 = "hold" in el.dataset ? h0 : el.dataset.hourEnd ? toMin(el.dataset.hourEnd) : nextHour ? toMin(nextHour) : 22 * 60 + 50;
      return { el, top, bottom: top + el.offsetHeight, cTop, cBottom, pal: PAL[el.dataset.pal] || PAL.deep, palEnd: PAL[el.dataset.palEnd || el.dataset.pal] || PAL.deep, h0, h1, name: el.classList[0] };
    });
    for (const k in pins) {
      pins[k].top = docTop(pins[k].el);
      pins[k].h = pins[k].el.offsetHeight;
    }
    // Where one hour gives way to the next: in the gap between their content,
    // never over text, and never faster than 20% of the screen.
    chapters.forEach((c, i) => {
      if (!i) return (c.edge = { c: -1e5, half: 1 });
      const prev = chapters[i - 1];
      const gap = Math.max(0, c.cTop - prev.cBottom);
      c.edge = { c: (prev.cBottom + c.cTop) / 2, half: clamp(gap / 2, H * 0.1, H * 0.16) };
    });
    measureLocal();
    measureClock();
    const nt = $(".nightfall__title");
    const ns = nt && nt.closest(".pin__stage");
    nightClear = ns && !still ? nt.getBoundingClientRect().bottom - ns.getBoundingClientRect().top + 18 : 0;
    dirty = true;
  }

  /* ── One clock: the header and every chapter's eyebrow read it ─────── */
  // Each eyebrow time is a stop. The clock reaches a stop's hour as its
  // eyebrow comes fully on screen, and runs to the stop's end hour (the next
  // stop's, or the chapter's own `data-hour-end`) as you read on, so an
  // eyebrow on screen never shows a later hour than the header.
  const fmt = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  const stamps = $$(".eyebrow__t");
  stamps.forEach((el) => (el.dataset.t = el.textContent.trim()));
  let stops = [];
  function measureClock() {
    const HDR = 50; // an eyebrow whose top is this far down is under the header
    const list = [{ y: 0, out: 0, h0: toMin(chapters[0].el.dataset.hour || "06:30"), el: null, sec: chapters[0].el }];
    for (const el of stamps) {
      const sec = el.closest("main > section");
      const stage = !still && el.closest(".pin__stage");
      const h0 = toMin(el.dataset.t);
      if (!el.getClientRects().length) {
        // Not shown at this width (People on a phone): the stop is where the chapter takes the screen.
        const y = docTop(sec) - H * 0.6;
        list.push({ y, out: y, h0, el, sec });
        continue;
      }
      // `y`: the scroll at which the eyebrow is fully on screen; `out`: at which it has gone under the header.
      let top;
      let out;
      if (stage) {
        const pin = stage.parentElement;
        const off = el.getBoundingClientRect().top - stage.getBoundingClientRect().top;
        top = docTop(pin) + off;
        out = docTop(pin) + Math.max(0, pin.offsetHeight - H) + off - HDR;
      } else {
        // From offsets, not the box on screen: a reveal may still be sliding it in.
        top = 0;
        for (let n = el; n; n = n.offsetParent) top += n.offsetTop;
        out = top - HDR;
      }
      list.push({ y: top + el.offsetHeight - 2 - H, out, h0, el, sec });
    }
    const ct = chapterBy("cta");
    if (ct) list.push({ y: ct.top - H * 0.5, out: ct.top - H * 0.5, h0: ct.h0, el: null, sec: ct.el });
    list.sort((a, b) => a.y - b.y);
    list.forEach((s, i) => {
      s.y = Math.max(s.y, i ? list[i - 1].y + 1 : 0);
      const next = list[i + 1];
      const first = s.el && s.sec && $(".eyebrow__t", s.sec) === s.el;
      if (s.sec && "hold" in s.sec.dataset) s.h1 = s.h0;
      else if (first && s.sec.dataset.hourEnd) s.h1 = toMin(s.sec.dataset.hourEnd);
      else s.h1 = next ? next.h0 : 22 * 60 + 50;
      // Shown up to the next stop's hour, so a passed eyebrow still on screen reads what the header does.
      s.cap = Math.max(s.h1, next ? next.h0 : s.h1);
    });
    const end = Math.max(1, document.documentElement.scrollHeight - H);
    list.forEach((s, i) => {
      s.y2 = i + 1 < list.length ? list[i + 1].y : Math.max(s.y + 1, end);
      // The hour holds until the last eyebrow has gone under the header, then runs.
      s.run = i ? clamp(list[i - 1].out, s.y, s.y2 - 1) : s.y;
    });
    stops = list;
    lastStamp = -1;
  }
  function clockAt(y) {
    if (!stops.length) return 390;
    let s = stops[0];
    for (const x of stops) if (y >= x.y) s = x;
    return Math.round(lerp(s.h0, s.h1, clamp((y - s.run) / Math.max(1, s.y2 - s.run))));
  }
  let lastStamp = -1;
  function paintStamps(m) {
    if (m === lastStamp) return;
    lastStamp = m;
    for (const s of stops) {
      if (!s.el) continue;
      const t = fmt(clamp(m, s.h0, s.cap));
      if (s.el.textContent !== t) s.el.textContent = t;
    }
  }
  function contentEdges(el) {
    let lo = Infinity;
    let hi = -Infinity;
    for (const kid of el.children) {
      if (kid.getAttribute("aria-hidden") === "true" || kid.classList.contains("sr-only")) continue;
      let a;
      let b;
      const stage = kid.classList.contains("pin") && !still && $(".pin__stage", kid);
      if (stage) {
        const sr = stage.getBoundingClientRect();
        const ir = stage.firstElementChild.getBoundingClientRect();
        const pt = docTop(kid);
        a = pt + (ir.top - sr.top);
        b = pt + kid.offsetHeight - (sr.bottom - ir.bottom);
      } else {
        const r = kid.getBoundingClientRect();
        a = r.top + window.scrollY;
        b = r.bottom + window.scrollY;
      }
      lo = Math.min(lo, a);
      hi = Math.max(hi, b);
    }
    const top = docTop(el);
    return lo === Infinity ? [top, top + el.offsetHeight] : [lo, hi];
  }
  if ("IntersectionObserver" in window) {
    const near = new IntersectionObserver((es) => es.forEach((e) => e.target.classList.toggle("is-near", e.isIntersecting)), { rootMargin: "50% 0px" });
    for (const k in pins) near.observe(pins[k].el);
  }
  const pinProgress = (k, y) => {
    const p = pins[k];
    if (!p || still) return still ? 1 : 0;
    const travel = p.h - H;
    return travel > 0 ? clamp((y - p.top) / travel) : 1;
  };
  const chapterBy = (name) => chapters.find((c) => c.name === name);

  /* ── The day: everything the water and the header need, from scroll ─ */

  const day = {
    y: 0, S: 0, p0: PAL.dawn, p1: PAL.dawn, p2: PAL.dawn, s1: -1e5, s2: 1e5, soft: 100, soft2: 100,
    hz: -1, tilt: 0, skyTop: -1e5, waterBottom: 1e5,
    sun: [0, 0, 60, 0], sky: SKY[0], stars: 0, moon: [0, 0, 0], glow: [0, 0, 1, 0], night: false, minute: 390,
  };

  function computeDay(y) {
    day.y = y;
    day.S = y * K;
    if (!chapters.length) return;
    const c = y + H / 2;
    let i = 0;
    for (let k = 0; k < chapters.length; k++) if (c >= chapters[k].edge.c) i = k;
    const ch = chapters[i];
    const prev = chapters[i - 1];
    const next = chapters[i + 1];
    const prog = clamp((c - ch.top) / Math.max(1, ch.bottom - ch.top));
    day.p1 = still ? ch.pal : mixPal(ch.pal, ch.palEnd, prog);
    day.p0 = prev ? prev.palEnd : day.p1;
    day.p2 = next ? next.pal : day.p1;
    day.s1 = ch.edge.c - y;
    day.soft = ch.edge.half;
    day.s2 = next ? next.edge.c - y : 1e5;
    day.soft2 = next ? next.edge.half : 1;

    day.minute = clockAt(y);

    // Light pool: the sun crosses the page from the right in the morning to the left by evening.
    const frac = clamp((day.minute - 390) / (1370 - 390));
    day.glow = [lerp(0.92, 0.08, frac) * W, -0.25 * H, 0.95 * H, 1];
    if (heroWell.cx != null && y < H * 1.2) {
      const hp = clamp(y / H);
      const hx = heroWell.cx;
      const hy = heroWell.cy - y * K;
      day.glow = [lerp(hx, day.glow[0], hp), lerp(hy, day.glow[1], hp), lerp(heroWell.R * 0.6, day.glow[2], hp), 1];
    }

    // Nightfall, prayer, the end: a horizon comes down, then lifts away.
    const nf = chapterBy("nightfall");
    const pr = chapterBy("prayer");
    const ct = chapterBy("cta");
    day.hz = -1;
    day.tilt = 0;
    day.skyTop = -1e5;
    day.waterBottom = 1e5;
    day.stars = 0;
    const moonX = (W < 700 ? 0.88 : 0.78) * W;
    day.moon = [moonX, 0, 0];
    day.sun = [0.5 * W, 0, Math.min(W, H) * 0.062, 0];
    day.night = day.minute >= 21 * 60 + 5;
    if (!nf) return;
    const r = day.sun[2];
    let p = -1;
    const hzF = 0.66;
    if (still) {
      // One still frame: the sun just gone, the afterglow on the water, the first stars.
      if (y + H > nf.top && y < (pr ? pr.bottom : nf.bottom)) {
        p = 0.72;
        day.tilt = 1;
        day.skyTop = nf.top - y;
        day.waterBottom = nf.bottom - y;
        day.hz = day.skyTop + (nf.bottom - nf.top) * hzF;
      }
    } else if (y >= nf.top - 1) {
      p = pinProgress("night", y);
      const down = smooth(clamp(p / 0.16));
      day.tilt = down;
      day.hz = lerp(-0.04, hzF, down) * H;
      if (ct && y + H > ct.top) {
        const e = clamp(1 - (ct.top - y) / H);
        day.hz = lerp(hzF, -0.06, smooth(e)) * H;
        day.tilt = 1 - smooth(clamp((e - 0.35) / 0.65));
      }
      if (ct && y > ct.top) day.tilt = 0;
    }
    if (p >= 0) {
      const s = skyAt(still ? p : Math.min(1, p));
      day.sky = s;
      // The sun never climbs into the headline: its disc and the brightest of
      // its glow stay under the copy, however tall the copy wraps.
      const cap = still ? 9 : (day.hz - nightClear) / r - 1.9;
      const h = Math.min(s.sh, cap);
      day.sun = [0.5 * W, day.hz - h * r, r, clamp((h + 2.4) / 1.4)];
      day.stars = clamp((-1 - h) / 0.7);
      day.night = h < -1;
      const ma = clamp((p - 0.74) / 0.2);
      const rise = still ? 0.3 * H : clamp(day.hz - nightClear - 30, 0.08 * H, 0.3 * H);
      day.moon = [moonX, day.hz - lerp(0.05 * H, rise, ma), still ? 0.8 : ma];
      if (pr && y > pr.top - H) {
        day.stars = 1;
        day.moon[2] = 1;
        day.moon[1] = day.hz - rise;
      }
    }
    if (ct && y + H * 0.5 > ct.top) {
      day.stars = 1;
      day.night = true;
    }
  }

  /* ── Drops: the water's memory of where it was touched ────────────── */

  const drops = [];
  let clock0 = performance.now();
  const now = () => (performance.now() - clock0) / 1000;
  function toWater(x, y) {
    let tilt = day.tilt;
    if (!(y > day.skyTop && y < day.waterBottom)) tilt = 0;
    const yy = Math.max(y - day.hz, 1.5);
    const d = Math.min((0.3 * H) / yy, 40);
    const ps = lerp(1, d, tilt);
    return [(x - W / 2) * ps + W / 2, lerp(y, 0.3 * H * d * 2, tilt) + day.S];
  }
  function drop(x, y, s) {
    if (still) return;
    const [wx, wy] = toWater(x, y);
    drops.push({ x: wx, y: wy, t0: now(), s });
    if (drops.length > 10) drops.shift();
    kick();
  }
  const dropAtWater = (wx, wy, s) => {
    if (still) return;
    drops.push({ x: wx, y: wy, t0: now(), s });
    if (drops.length > 10) drops.shift();
  };

  /* ── The water: WebGL ──────────────────────────────────────────────── */

  const FRAG = `
precision highp float;
uniform vec2 uR; uniform float uK, uT, uS;
uniform vec3 uA[4]; uniform vec3 uB[4]; uniform vec3 uC[4];
uniform vec4 uSp; uniform vec4 uHz; uniform vec4 uSun; uniform vec3 uSky0, uSky1, uSunC;
uniform vec4 uNt; uniform vec4 uGlow; uniform vec4 uD[10]; uniform float uQ;
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float caustic(vec2 uv, float t){
  vec2 p = mod(uv * 6.28318, 6.28318) - 250.0; vec2 i = p; float c = 1.0;
  for (int n = 0; n < 3; n++) {
    if (float(n) >= uQ) break;
    float tt = t * (1.0 - (3.5 / float(n + 1)));
    i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
    c += 1.0 / length(vec2(p.x / (sin(i.x + tt) / 0.005), p.y / (cos(i.y + tt) / 0.005)));
  }
  c = 1.17 - pow(c / uQ, 1.4);
  return clamp(pow(abs(c), 8.0), 0.0, 1.0);
}
float stars(vec2 q, float cell){
  vec2 g = floor(q / cell); vec2 f = fract(q / cell) - 0.5; float h = hash(g);
  if (h < 0.8) return 0.0;
  vec2 o = vec2(hash(g + 3.7), hash(g + 9.1)) - 0.5;
  float d = length(f - o * 0.7) * cell;
  float rr = max(1.6, uK * 0.9);
  return smoothstep(rr, rr * 0.2, d) * (0.6 + 0.4 * sin(uT * 1.7 + h * 50.0)) * (h - 0.8) * 5.0;
}
vec3 sky(vec2 q, float hz){
  float t = clamp((hz - q.y) / max(hz, 60.0), 0.0, 1.0);
  vec3 c = mix(uSky1, uSky0, smoothstep(0.0, 1.0, pow(t, 0.6)));
  float ds = length(q - uSun.xy);
  float core = smoothstep(uSun.z + uK, uSun.z - uK, ds);
  c = mix(c, uSunC * (1.05 - 0.25 * ds / uSun.z) + vec3(0.12, 0.08, 0.0), core * uSun.w);
  c += uSunC * uSun.w * (exp(-ds / (uSun.z * 1.2)) * 0.32 + exp(-ds / (uSun.z * 5.0)) * 0.2);
  c += uSky1 * exp(-(hz - q.y) / 16.0) * 0.2;
  vec2 mq = q - uNt.zw;
  float md = length(mq);
  float disc = smoothstep(15.0 + uK, 15.0 - uK, md) * (1.0 - 0.94 * smoothstep(15.0 + uK, 15.0 - uK, length(mq - vec2(-7.0, -3.5))));
  c += (vec3(0.96, 0.94, 0.86) * disc + vec3(0.55, 0.52, 0.8) * exp(-md / 70.0) * 0.2) * uNt.y;
  if (uNt.x > 0.001) c += vec3(0.92, 0.9, 1.0) * stars(q, 30.0) * uNt.x * smoothstep(0.04, 0.3, t);
  return c;
}
void main(){
  vec2 p = vec2(gl_FragCoord.x * uK, uR.y - gl_FragCoord.y * uK);
  float m1 = smoothstep(uSp.x - uSp.z, uSp.x + uSp.z, p.y);
  float m2 = smoothstep(uSp.y - uSp.w, uSp.y + uSp.w, p.y);
  vec3 base = mix(mix(uA[0], uB[0], m1), uC[0], m2);
  vec3 lite = mix(mix(uA[1], uB[1], m1), uC[1], m2);
  vec3 acc = mix(mix(uA[2], uB[2], m1), uC[2], m2);
  vec3 prm = mix(mix(uA[3], uB[3], m1), uC[3], m2);
  float hz = uHz.x;
  float band = 0.18 * uR.y;
  float tilt = uHz.y * smoothstep(uHz.z, uHz.z + band, p.y) * (1.0 - smoothstep(uHz.w - band, uHz.w, p.y));
  vec3 col;
  {
    float yy = max(p.y - hz, 1.5);
    float d = min(0.3 * uR.y / yy, 40.0);
    float ps = mix(1.0, d, tilt);
    vec2 w = vec2((p.x - 0.5 * uR.x) * ps + 0.5 * uR.x, mix(p.y, 0.6 * uR.y * d, tilt) + uS);
    vec2 k1 = vec2(0.018, 0.011); vec2 k2 = vec2(-0.012, 0.02); vec2 k3 = vec2(0.031, -0.024);
    vec2 g = cos(dot(k1, w) + uT * 0.8) * k1 + cos(dot(k2, w) - uT * 0.6) * k2 * 0.9 + cos(dot(k3, w) + uT * 1.3) * k3 * 0.45;
    for (int i = 0; i < 10; i++) {
      vec4 dr = uD[i];
      if (dr.w <= 0.0) continue;
      vec2 v = w - dr.xy; float r = length(v) + 0.001;
      float x = r - dr.z * 230.0;
      if (abs(x) > 200.0) continue; // a ring is a band: past 200px its envelope is under 1e-4
      float env = exp(-x * x / 4200.0) * dr.w * exp(-dr.z * 0.55) * smoothstep(0.0, 40.0, r);
      float ph = x * 0.085;
      g += env * (cos(ph) * 0.085 - sin(ph) * x / 2100.0) * (v / r) * 6.0;
    }
    vec3 top = base;
    if (tilt < 0.999) {
      float c = caustic((w + g * 46.0) / 620.0, uT * 0.33);
      top = base + (lite - base) * c * prm.x;
      float sl = dot(g, vec2(-0.6, -0.8));
      top += (lite * 0.5 + 0.18) * sl * prm.y * 0.55;
      vec3 n = normalize(vec3(-g * 1.5, 1.0));
      top += acc * pow(max(dot(n, normalize(vec3(-0.35, -0.5, 0.8))), 0.0), 90.0) * prm.z;
      float gd = length(p - uGlow.xy);
      top += acc * uGlow.w * exp(-gd / max(uGlow.z, 1.0)) * (0.55 + 0.45 * c);
      if (uNt.x > 0.001) top += vec3(0.9, 0.88, 1.0) * stars(w + g * 30.0, 36.0) * uNt.x * 0.6;
    }
    vec3 hor = base;
    if (tilt > 0.001 && p.y < hz) {
      hor = sky(p, hz);
    } else if (tilt > 0.001) {
      float near = clamp(yy / (uR.y * 0.42), 0.0, 1.0);
      float wob = sin(w.y * 0.045 + uT * 1.6) * 0.6 + sin(w.y * 0.11 - uT * 2.3 + w.x * 0.004) * 0.4;
      vec2 pm = vec2(p.x + g.x * 150.0 / max(ps, 1.0) + wob * (4.0 + yy * 0.09), hz - yy * 0.62 + g.y * 260.0 / sqrt(max(ps, 1.0)));
      pm.y = min(pm.y, hz - 0.5);
      vec3 refl = sky(pm, hz);
      hor = mix(base * 0.8, refl, mix(0.94, 0.55, near));
      float colW = 12.0 + yy * 0.55;
      float sunVis = uSun.w * clamp((hz - uSun.y + uSun.z) / (2.0 * uSun.z), 0.0, 1.0);
      float n1 = sin(w.x * 0.07 + sin(w.y * 0.05 + uT) * 2.0 + uT * 1.3) * sin(w.y * 0.13 - uT * 1.1 + sin(w.x * 0.03) * 2.0);
      float gl = smoothstep(0.5, 0.95, n1 + g.y * 10.0);
      hor += uSunC * gl * exp(-pow((p.x - uSun.x) / colW, 2.0)) * (0.4 + 1.2 * sunVis) * (0.45 + 0.55 * (1.0 - near));
      hor += vec3(0.85, 0.85, 1.0) * gl * exp(-pow((p.x - uNt.z) / (colW * 0.55), 2.0)) * uNt.y * 0.55;
    }
    col = mix(top, hor, smoothstep(0.0, 1.0, tilt));
  }
  col += (hash(gl_FragCoord.xy + fract(uT * 7.0)) - 0.5) * 0.02;
  gl_FragColor = vec4(col, 1.0);
}`;
  const VERT = "attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}";

  const water = {
    canvas: null, gl: null, prog: null, u: {}, ext: null, ready: false, mode: "", scale: 0.6, minScale: 0.24,
    ft: 0, lastFrame: 0, slow: 0, n: 0,
  };

  function startWater() {
    const canvas = document.createElement("canvas");
    canvas.className = "water";
    canvas.setAttribute("aria-hidden", "true");
    document.body.insertBefore(canvas, document.body.firstChild);
    water.canvas = canvas;
    let gl = null;
    try {
      gl = canvas.getContext("webgl", { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false, powerPreference: "low-power" });
    } catch (e) {
      gl = null;
    }
    if (gl) {
      // The context is this task; compiling is the next one.
      water.mode = "gl";
      water.gl = gl;
      setTimeout(() => initGL(gl), 0);
    } else fallback2D(canvas);
  }
  function fallback2D(canvas) {
    water.ctx = canvas.getContext("2d");
    water.mode = water.ctx ? "2d" : "";
    water.scale = 0.5;
    if (water.mode) resizeWater();
    water.ready = !!water.mode;
    kick();
  }

  function initGL(gl) {
    // Asked for before compiling, so the link can be polled without blocking.
    water.ext = gl.getExtension("KHR_parallel_shader_compile");
    const hi = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
    const src = hi && hi.precision > 0 ? FRAG : FRAG.replace("precision highp", "precision mediump");
    const sh = (type, s) => {
      const o = gl.createShader(type);
      gl.shaderSource(o, s);
      gl.compileShader(o);
      return o;
    };
    const vs = sh(gl.VERTEX_SHADER, VERT);
    const fs = sh(gl.FRAGMENT_SHADER, src);
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    water.prog = prog;
    water.vs = vs;
    water.fs = fs;
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    const renderer = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "";
    const soft = /swiftshader|llvmpipe|software|basic render/i.test(renderer);
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    water.soft = soft;
    water.scale = soft ? 0.3 : coarse ? 0.5 : 0.6;
    water.minScale = soft ? 0.2 : 0.3;
    water.q = soft ? 2 : 3;
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    canvas_lost(gl);
    kick();
  }

  function canvas_lost(gl) {
    water.canvas.addEventListener("webglcontextlost", (e) => {
      e.preventDefault();
      water.ready = false;
      water.mode = "";
      water.canvas.classList.remove("is-on");
    });
  }

  function linkDone() {
    const { gl, prog, ext } = water;
    if (!prog) return false;
    if (water.primeAt) {
      if (performance.now() - water.primeAt < 180) return false;
      resizeWater();
      water.ready = true;
      return true;
    }
    if (ext && !gl.getProgramParameter(prog, ext.COMPLETION_STATUS_KHR)) return false;
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      // No shader on this device: fall back to the 2D water.
      water.mode = "";
      water.canvas.remove();
      water.canvas = null;
      const c2 = document.createElement("canvas");
      c2.className = "water";
      c2.setAttribute("aria-hidden", "true");
      document.body.insertBefore(c2, document.body.firstChild);
      water.canvas = c2;
      water.ctx = c2.getContext("2d");
      water.mode = water.ctx ? "2d" : "";
      water.scale = 0.5;
      resizeWater();
      water.ready = !!water.mode;
      return false;
    }
    gl.useProgram(prog);
    const names = ["uQ", "uR", "uK", "uT", "uS", "uA", "uB", "uC", "uSp", "uHz", "uSun", "uSky0", "uSky1", "uSunC", "uNt", "uGlow", "uD"];
    for (const n of names) water.u[n] = gl.getUniformLocation(prog, n);
    const loc = gl.getAttribLocation(prog, "a");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    resizeWater();
    prime(gl);
    water.primeAt = performance.now();
    return false;
  }

  // One draw into a 1×1 target off screen. A software renderer compiles the
  // shader for real on its first draw; done here, nothing on screen waits for
  // it, and the first visible frame a few frames later is an ordinary one.
  function prime(gl) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    // RGB, like the canvas (no alpha), so a software renderer builds the routine the screen will use.
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, 1, 1, 0, gl.RGB, gl.UNSIGNED_BYTE, null);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.viewport(0, 0, 1, 1);
    drawGL(0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(fb);
    gl.deleteTexture(tex);
    gl.viewport(0, 0, water.canvas.width, water.canvas.height);
  }

  function resizeWater() {
    const c = water.canvas;
    if (!c) return;
    const r = c.getBoundingClientRect();
    water.cssW = r.width || W;
    water.cssH = r.height || H;
    c.width = Math.max(2, Math.round(water.cssW * water.scale));
    c.height = Math.max(2, Math.round(water.cssH * water.scale));
    if (water.gl && water.mode === "gl") water.gl.viewport(0, 0, c.width, c.height);
    water.k = water.cssW / c.width;
  }

  const dropData = new Float32Array(40);
  const palArr = (p) => new Float32Array([...p.base, ...p.lite, ...p.acc, ...p.prm]);

  function drawGL(t) {
    const { gl, u } = water;
    gl.uniform1f(u.uQ, water.q || 3);
    gl.uniform2f(u.uR, water.cssW, water.cssH);
    gl.uniform1f(u.uK, water.k);
    gl.uniform1f(u.uT, t);
    gl.uniform1f(u.uS, day.S % 26000);
    gl.uniform3fv(u.uA, palArr(day.p0));
    gl.uniform3fv(u.uB, palArr(day.p1));
    gl.uniform3fv(u.uC, palArr(day.p2));
    gl.uniform4f(u.uSp, day.s1, day.s2, day.soft, day.soft2);
    gl.uniform4f(u.uHz, day.hz, day.tilt, day.skyTop, day.waterBottom);
    gl.uniform4f(u.uSun, day.sun[0], day.sun[1], day.sun[2], day.sun[3]);
    gl.uniform3fv(u.uSky0, day.sky.z);
    gl.uniform3fv(u.uSky1, day.sky.h);
    gl.uniform3fv(u.uSunC, day.sky.s);
    gl.uniform4f(u.uNt, day.stars, day.moon[2], day.moon[0], day.moon[1]);
    const gs = day.p1.glow * day.glow[3];
    gl.uniform4f(u.uGlow, day.glow[0], day.glow[1], day.glow[2], gs);
    dropData.fill(0);
    const tn = now();
    drops.forEach((d, i) => {
      const age = tn - d.t0;
      // Retired at 4.5s, when a ring is down to a tenth of its strength: every live ring costs every pixel.
      dropData.set([d.x, d.y - Math.floor(day.S / 26000) * 26000, age, age < 4.5 ? d.s : 0], i * 4);
    });
    gl.uniform4fv(u.uD, dropData);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  // The 2D water: the same day, drawn plainly.
  const css = (c, a = 1) => `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${a})`;
  function draw2D(t) {
    const ctx = water.ctx;
    const s = 1 / water.k;
    const w = water.cssW;
    const h = water.cssH;
    ctx.setTransform(s, 0, 0, s, 0, 0);
    const g = ctx.createLinearGradient(0, 0, 0, h);
    const stop = (y, c) => g.addColorStop(clamp(y / h), css(c));
    stop(day.s1 - day.soft, day.p0.base);
    stop(day.s1 + day.soft, day.p1.base);
    stop(day.s2 - day.soft2, day.p1.base);
    stop(day.s2 + day.soft2, day.p2.base);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    const rg = ctx.createRadialGradient(day.glow[0], day.glow[1], 0, day.glow[0], day.glow[1], day.glow[2] * 1.6);
    rg.addColorStop(0, css(day.p1.acc, 0.28 * day.p1.glow / 0.3));
    rg.addColorStop(1, css(day.p1.acc, 0));
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, w, h);
    if (day.tilt > 0.01) {
      const top = Math.max(0, day.skyTop);
      const bottom = Math.min(h, day.waterBottom);
      const hz = day.hz;
      ctx.globalAlpha = day.tilt;
      const sg = ctx.createLinearGradient(0, Math.min(top, hz), 0, hz);
      sg.addColorStop(0, css(day.sky.z));
      sg.addColorStop(1, css(day.sky.h));
      ctx.fillStyle = sg;
      ctx.fillRect(0, top, w, Math.max(0, hz - top));
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, top, w, Math.max(0, hz - top));
      ctx.clip();
      ctx.fillStyle = css(day.sky.s, day.sun[3]);
      ctx.beginPath();
      ctx.arc(day.sun[0], day.sun[1], day.sun[2], 0, TAU);
      ctx.fill();
      ctx.restore();
      const wg = ctx.createLinearGradient(0, hz, 0, bottom);
      wg.addColorStop(0, css(day.sky.h, 0.9));
      wg.addColorStop(1, css(day.p1.base));
      ctx.fillStyle = wg;
      ctx.fillRect(0, hz, w, Math.max(0, bottom - hz));
      for (let i = 0; i < 22; i++) {
        const y = hz + 4 + Math.pow(i / 22, 1.6) * (bottom - hz) * 0.8;
        const jitter = Math.sin(i * 12.9 + t * 1.3) * (6 + i * 1.5);
        const len = (14 + i * 4) * (0.6 + 0.4 * Math.sin(i * 3.1 + t));
        ctx.fillStyle = css(day.sky.s, (0.5 - i / 50) * (0.35 + 0.65 * day.sun[3]));
        ctx.fillRect(day.sun[0] - len / 2 + jitter, y, len, 2);
      }
      ctx.globalAlpha = 1;
    }
    const tn = now();
    for (const d of drops) {
      const age = tn - d.t0;
      const rad = age * 230;
      const a = d.s * Math.exp(-age * 0.55) * 0.5;
      if (a < 0.01 || day.tilt > 0.5) continue;
      ctx.strokeStyle = css(day.p1.lite, a);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(d.x, d.y - day.S, rad, 0, TAU);
      ctx.stroke();
    }
  }

  function renderWater(t) {
    if (!water.mode) return;
    if (water.mode === "gl") {
      if (!water.ready) {
        if (!linkDone()) return;
      }
      if (water.mode === "gl") drawGL(t);
      else draw2D(t);
    } else draw2D(t);
    if (!water.canvas.classList.contains("is-on")) {
      water.canvas.classList.add("is-on");
      root.classList.add("has-water");
    }
  }

  // Software renderers get a smaller buffer; a device that keeps missing
  // frames gets smaller still (a few late frames in a second is enough).
  function adapt(dt) {
    if (!water.ready || still || dt > 250) return;
    if (dt > 20) water.slow++;
    if (++water.n < 60) return;
    if (water.slow > 3 && water.scale > water.minScale) {
      water.scale = Math.max(water.minScale, water.scale * 0.85);
      resizeWater();
    }
    water.n = 0;
    water.slow = 0;
  }

  /* ── The header: tinted by the hour under it ──────────────────────── */

  const top = $("[data-top]");
  let hdrKey = "";
  function paintHeader() {
    if (!top) return;
    const y = 34;
    let c;
    if (day.tilt > 0.5 && y < day.hz && y > day.skyTop) c = day.sky.z;
    else {
      const m1 = smooth(clamp((y - (day.s1 - day.soft)) / (2 * day.soft)));
      const m2 = smooth(clamp((y - (day.s2 - day.soft2)) / (2 * day.soft2)));
      const a = day.p0.bg;
      const b = day.p1.bg;
      const d = day.p2.bg;
      c = a.map((v, i) => lerp(lerp(v, b[i], m1), d[i], m2));
    }
    const lum = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    const key = c.map((v) => Math.round(v * 255)).join(",");
    if (key === hdrKey) return;
    hdrKey = key;
    top.style.setProperty("--hdr-bg", `rgba(${key},.74)`);
    top.style.setProperty("--hdr-solid", `rgb(${key})`);
    top.classList.toggle("is-light", lum > 0.45);
  }

  const clockEl = $("[data-clock]");
  const clockTime = $("[data-clock-time]");
  let lastMinute = -1;
  let lastNight = null;
  function paintClock() {
    if (!clockEl) return;
    if (day.minute !== lastMinute) {
      lastMinute = day.minute;
      clockTime.textContent = fmt(day.minute);
    }
    paintStamps(day.minute);
    // The moon comes out the moment the sun's top edge goes under the water.
    if (day.night !== lastNight) {
      lastNight = day.night;
      clockEl.classList.toggle("is-night", day.night);
    }
  }

  /* ── Hero: the people on the rings, over the water ────────────────── */

  const FLAME = typeof Path2D === "function" ? new Path2D("M12 3.2c2.7 3.2 4.8 5.8 4.8 9a4.8 4.8 0 0 1-9.6 0c0-3.2 2.1-5.8 4.8-9z") : null;
  const LEVEL = { thriving: "#6fcf97", solid: "#8fc1b7", watch: "#e9b54c", strained: "#f08a5b" };
  const heroWell = { canvas: $("[data-well]"), wrap: $("[data-hero-well]"), raf: 0, visible: true, t: 0 };
  const heroEl = $(".hero");
  const heroCopy = $("[data-hero-copy]");
  const HERO_NODES = [
    { ring: 0.36, a: -90, w: 0.05, ini: "M", g: "flame-carrying" },
    { ring: 0.36, a: 30, w: 0.05, ini: "O" },
    { ring: 0.36, a: 150, w: 0.05, ini: "L", g: "flame-answered" },
    { ring: 0.62, a: -150, w: -0.034, ini: "T", g: "meter", v: ["watch", 3] },
    { ring: 0.62, a: -20, w: -0.034, ini: "G", g: "flame" },
    { ring: 0.62, a: 90, w: -0.034, ini: "A", g: "ring", v: 0.72 },
    { ring: 0.9, a: -95, w: 0.021, ini: "R" },
    { ring: 0.9, a: 140, w: 0.021, ini: "I" },
    { ring: 0.9, a: 35, w: 0.021, ini: "J" },
    { ring: 0.9, a: 200, w: 0.021, ini: "N" },
  ].map((n) => ({ ...n, a: (n.a * Math.PI) / 180, dx: 0, dy: 0 }));

  function sizeHero() {
    const c = heroWell.canvas;
    if (!c || !heroWell.wrap) return;
    const r = heroWell.wrap.getBoundingClientRect();
    if (!r.width) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const wide = r.width > 900;
    heroWell.cx = wide ? r.width * 0.7 : r.width * 0.56;
    heroWell.cy = wide ? r.height * 0.52 : r.height * 0.25;
    heroWell.R = wide ? Math.min(r.height * 0.44, r.width * 0.3) : Math.min(r.width * 0.5, r.height * 0.23);
    heroWell.sc = clamp(heroWell.R / 300, 0.72, 1.25);
    // On a phone the well is the top of the screen, so the canvas stops just
    // under it: half the pixels to fill and hand over every frame.
    const h = wide ? r.height : Math.min(r.height, Math.ceil(heroWell.cy + heroWell.R + 48));
    c.style.height = `${h}px`;
    heroWell.w = r.width;
    heroWell.h = h;
    c.width = Math.round(r.width * dpr);
    c.height = Math.round(h * dpr);
    heroWell.ctx = c.getContext("2d");
    heroWell.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    keepOut();
  }

  // Keep-out zones: the hero's copy, each padded by 24px. A node that drifts
  // toward one dips under the water (it shrinks and fades) and is gone before
  // it could touch a letter; it surfaces again on the far side.
  const PAD = 24;
  const heroKeep = [];
  const inked = document.createRange();
  const boxIn = (el, rootEl) => {
    // Across: what's actually set (a row of buttons, not the full-width block it sits in);
    // the parallax only moves things up and down, so the screen is right for this.
    inked.selectNodeContents(el);
    const ink = inked.getBoundingClientRect();
    const x = ink.left - rootEl.getBoundingClientRect().left;
    // Down: from offsets, which no animation or parallax has moved.
    let y = 0;
    for (let n = el; n && n !== rootEl; n = n.offsetParent) y += n.offsetTop;
    // The last entry: whether it rides with the copy's parallax (the caption doesn't).
    return [x - PAD, y - PAD, ink.width + 2 * PAD, el.offsetHeight + 2 * PAD, !!(heroCopy && heroCopy.contains(el))];
  };
  function keepOut() {
    heroKeep.length = 0;
    if (!heroEl) return;
    $$(".hero__eyebrow, .hero__title, .hero__lede, .hero__actions, .hero__note, .hero__caption", heroEl).forEach((el) => {
      if (el.offsetWidth) heroKeep.push(boxIn(el, heroEl));
    });
  }
  // 0 inside a zone, 1 once a circle is 28px clear of every zone.
  function clearOf(x, y, r, y0) {
    let d = Infinity;
    for (const [kx, ky, kw, kh, moves] of heroKeep) {
      // In the canvas's frame the well drifts down by (1 - K)·y and the copy up by 0.12·y.
      const top = ky - (moves ? 1.12 - K : 1 - K) * y0;
      const dx = Math.max(kx - x, 0, x - (kx + kw));
      const dy = Math.max(top - y, 0, y - (top + kh));
      d = Math.min(d, Math.hypot(dx, dy) - r);
    }
    return smooth(clamp(d / 28));
  }

  function stepHero(dt) {
    const hw = heroWell;
    hw.t += dt;
    if (!hw.splashed && hw.t >= 0.9) {
      hw.splashed = true;
      dropAtWater(hw.cx, hw.cy, 1.4);
      setTimeout(() => dropAtWater(hw.cx, hw.cy, 0.8), 260);
      hw.nextAmbient = hw.t + 2.8;
    }
    if (hw.splashed && hw.t >= hw.nextAmbient) {
      hw.nextAmbient = hw.t + 3.2;
      if (day.y < H) dropAtWater(hw.cx, hw.cy, 0.55);
    }
    const tn = now();
    for (const n of HERO_NODES) {
      n.a += n.w * dt;
      const x = hw.cx + Math.cos(n.a) * hw.R * n.ring;
      const y = hw.cy + Math.sin(n.a) * hw.R * n.ring;
      let tx = 0;
      let ty = 0;
      for (const r of drops) {
        const age = tn - r.t0;
        const dx = x - r.x;
        const dy = y - r.y;
        const d = Math.hypot(dx, dy) || 1;
        const delta = d - age * 230;
        if (Math.abs(delta) > 50) continue;
        const push = Math.cos((delta / 50) * (Math.PI / 2)) * 10 * r.s * Math.exp(-age * 0.55);
        tx += (dx / d) * push;
        ty += (dy / d) * push;
      }
      n.dx += (tx - n.dx) * Math.min(1, dt * 9);
      n.dy += (ty - n.dy) * Math.min(1, dt * 9);
    }
  }

  function drawHero() {
    const hw = heroWell;
    const ctx = hw.ctx;
    if (!ctx) return;
    const { w, h, cx, cy, R, sc } = hw;
    const t = still ? 4 : hw.t;
    ctx.clearRect(0, 0, w, h);
    const show = (delay, dur = 0.8) => smooth(clamp((t - delay) / dur));
    const line = "172,195,193";
    const gilt = "225,179,77";
    ctx.lineCap = "round";
    ctx.save();
    ctx.translate(cx, cy);
    ctx.globalAlpha = show(1.0, 1.2);
    ctx.strokeStyle = `rgba(${line},.42)`;
    ctx.lineWidth = 2.2 * sc;
    ctx.rotate(-0.35 + t * 0.02);
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.36, 0, TAU * 0.76);
    ctx.stroke();
    ctx.rotate(-t * 0.02);
    ctx.lineWidth = 1.1;
    ctx.strokeStyle = `rgba(${line},.2)`;
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.62, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([2, 7]);
    ctx.strokeStyle = `rgba(${line},.2)`;
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.9, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // Without the shader, the rings are drawn here instead.
    if (water.mode !== "gl" || !water.ready) {
      const tn = now();
      for (const r of drops) {
        const age = tn - r.t0;
        const a = r.s * Math.exp(-age * 0.55) * 0.5;
        if (a < 0.01) continue;
        ctx.globalAlpha = 1;
        ctx.strokeStyle = `rgba(${gilt},${a.toFixed(3)})`;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(r.x, r.y, age * 230, 0, TAU);
        ctx.stroke();
      }
    }

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const sy = still ? 0 : day.y;
    const seen = hw.canvas.__nodes || (hw.canvas.__nodes = []);
    seen.length = 0;
    HERO_NODES.forEach((n, i) => {
      const x = cx + Math.cos(n.a) * R * n.ring + n.dx;
      const y = cy + Math.sin(n.a) * R * n.ring + n.dy;
      const far = n.ring > 0.8;
      const full = (far ? 12 : n.ring > 0.5 ? 17 : 20) * sc;
      const gx = x + full * 0.55;
      const gy = y - full * 1.55;
      const clear = Math.min(clearOf(x + 3, y + 3, full * 1.1, sy), n.g ? clearOf(gx, gy, 13 * sc, sy) : 1);
      const appear = show(1.15 + n.ring * 0.45 + i * 0.04, 0.9) * clear;
      if (appear <= 0.01) return;
      const rad = full * (0.6 + 0.4 * appear);
      seen.push({ ini: n.ini, x, y, r: full * 1.1, gx: n.g ? gx : null, gy, a: appear });
      ctx.globalAlpha = appear * 0.5;
      ctx.fillStyle = "rgba(0,12,14,.6)";
      ctx.beginPath();
      ctx.ellipse(x + 3, y + 5, rad * 1.05, rad * 0.95, 0, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = appear;
      const pg = ctx.createRadialGradient(x - rad * 0.4, y - rad * 0.5, rad * 0.1, x, y, rad);
      pg.addColorStop(0, far ? "#2a5a5a" : "#3d7d72");
      pg.addColorStop(1, far ? "#0f3e40" : "#16483f");
      ctx.fillStyle = pg;
      ctx.strokeStyle = `rgba(${line},${far ? 0.3 : 0.55})`;
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.arc(x, y, rad, n.a + 0.2, n.a + TAU - 0.2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = far ? "#acc3c1" : "#eef3f1";
      ctx.font = `600 ${Math.round((far ? 10.5 : 14) * sc)}px "Instrument Sans", sans-serif`;
      ctx.fillText(n.ini, x, y + 0.5);
      if (n.g) glyph(ctx, n.g, x + rad * 0.55, y - rad * 1.55, sc, n.v);
      ctx.globalAlpha = 1;
    });

    const landed = show(0.9, 0.5);
    ctx.globalAlpha = landed;
    ctx.strokeStyle = `rgba(${line},.95)`;
    ctx.lineWidth = 3 * sc;
    ctx.beginPath();
    ctx.arc(cx, cy, R * 0.15 * (0.7 + 0.3 * landed), 0, TAU);
    ctx.stroke();
    // The glow is a gradient, not shadowBlur: a blur every frame is costly on phones.
    const gr = R * 0.062 * landed;
    if (gr > 0.5) {
      const glow = ctx.createRadialGradient(cx, cy, gr * 0.6, cx, cy, gr + 22);
      glow.addColorStop(0, `rgba(${gilt},.55)`);
      glow.addColorStop(1, `rgba(${gilt},0)`);
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(cx, cy, gr + 22, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = `rgb(${gilt})`;
    ctx.beginPath();
    ctx.arc(cx, cy, gr, 0, TAU);
    ctx.fill();
    if (!still && t < 0.9) {
      const k = t / 0.9;
      const y = lerp(-40, cy, k * k);
      ctx.globalAlpha = 1;
      const tail = ctx.createLinearGradient(cx, y - 90 * k, cx, y);
      tail.addColorStop(0, `rgba(${gilt},0)`);
      tail.addColorStop(1, `rgba(${gilt},.6)`);
      ctx.strokeStyle = tail;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx, y - 90 * k);
      ctx.lineTo(cx, y);
      ctx.stroke();
      ctx.fillStyle = `rgb(${gilt})`;
      ctx.beginPath();
      ctx.arc(cx, y, R * 0.04, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function glyph(ctx, kind, x, y, sc, v) {
    const s = 0.85 * sc;
    if (kind.startsWith("flame") && FLAME) {
      ctx.save();
      ctx.translate(x - 12 * s, y - 12 * s);
      ctx.scale(s, s);
      ctx.lineWidth = 1.9;
      if (kind === "flame") {
        ctx.fillStyle = "#8d74e0";
        ctx.fill(FLAME);
      } else if (kind === "flame-answered") {
        ctx.fillStyle = "#e1b34d";
        ctx.fill(FLAME);
      } else {
        ctx.strokeStyle = "#c3b3f6";
        ctx.stroke(FLAME);
      }
      ctx.restore();
    } else if (kind === "meter") {
      ctx.fillStyle = "rgba(4,25,27,.85)";
      ctx.fillRect(x - 13 * s, y - 9 * s, 27 * s, 18 * s);
      for (let i = 0; i < 5; i++) {
        const bh = (4 + i * 2) * s;
        ctx.fillStyle = i < v[1] ? LEVEL[v[0]] : "rgba(172,195,193,.28)";
        ctx.fillRect(x - 10 * s + i * 4.4 * s, y + 6 * s - bh, 2.6 * s, bh);
      }
    } else if (kind === "ring") {
      ctx.lineWidth = 2.4 * s;
      ctx.strokeStyle = "rgba(172,195,193,.28)";
      ctx.beginPath();
      ctx.arc(x, y, 7 * s, 0, TAU);
      ctx.stroke();
      ctx.strokeStyle = LEVEL.thriving;
      ctx.beginPath();
      ctx.arc(x, y, 7 * s, -Math.PI / 2, -Math.PI / 2 + TAU * v);
      ctx.stroke();
    }
  }

  if (heroWell.canvas && heroWell.canvas.getContext) {
    if (still) heroWell.splashed = true;
    if ("IntersectionObserver" in window) new IntersectionObserver(([e]) => (heroWell.visible = e.isIntersecting)).observe(heroWell.canvas);
  }

  /* ── Lettering: drawn on load, the drop lands, the water answers ──── */

  const sheen = $("[data-sheen]");
  const letters = $$("[data-letter]");
  letters.forEach((svg) => {
    $$("path", svg).forEach((p, i) => p.style.setProperty("--g", i));
    const fire = () => {
      svg.classList.add("is-drawn");
      if (still) return;
      setTimeout(() => {
        const d = $(".letter__drop", svg);
        if (!d) return;
        const r = d.getBoundingClientRect();
        if (r.bottom > 0 && r.top < H) drop(r.left + r.width / 2, r.top + r.height / 2, 0.9);
      }, 2150);
    };
    if (svg.closest(".hero")) requestAnimationFrame(fire);
    else if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver(([e]) => {
        if (!e.isIntersecting) return;
        io.disconnect();
        fire();
      }, { threshold: 0.6 });
      io.observe(svg);
    } else fire();
  });
  let sheenKey = "";
  function paintSheen(t) {
    if (!sheen || still || !W) return;
    // The highlight follows the light on the water: the well's glow, or the moon.
    const lx = day.moon[2] > 0.2 ? day.moon[0] : day.glow[0];
    const x = ((lx / W - 0.5) * 0.8 + Math.sin(t * 0.4) * 0.25).toFixed(3);
    if (x === sheenKey) return;
    sheenKey = x;
    sheen.setAttribute("gradientTransform", `translate(${x} 0)`);
  }

  /* ── Touch the water ──────────────────────────────────────────────── */

  let lastPtr = 0;
  let lpx = -1e3;
  let lpy = -1e3;
  document.addEventListener("pointermove", (e) => {
    if (still || e.pointerType !== "mouse" || !water.ready) return;
    const t = performance.now();
    if (t - lastPtr < 140 || Math.hypot(e.clientX - lpx, e.clientY - lpy) < 40) return;
    lastPtr = t;
    lpx = e.clientX;
    lpy = e.clientY;
    drop(e.clientX, e.clientY, 0.32);
  }, { passive: true });
  document.addEventListener("pointerdown", (e) => {
    if (still || e.target.closest("a, button, input, [role='tab'], .app-window, .pcard, .log, .palette, .fcol, .sheet")) return;
    drop(e.clientX, e.clientY, 1.1);
  }, { passive: true });

  /* ── People: lily pads on the water ───────────────────────────────── */

  const MODES = ["plan", "prep", "assess", "pray"];
  const STEP_AT = [0, 0.16, 0.32, 0.49, 0.66, 0.83];
  const MORPH = [0.08, 0.24];
  const DOM = { job: "#7C3B8B", church: "#2D78BD" };
  const PEOPLE = [
    { id: "me", kind: "me" },
    { id: "up", kind: "up", ini: "L", lbl: "Leadership team", parent: "me", h: "solid", plan: ["Where the company goes next", "Operating manual"], prep: ["Mon · 4d · ready", "good"], assess: [4, "Solid"], pray: ["carrying 1 of 4", "carrying"] },
    { id: "d", kind: "team", ini: "D", name: "Design team", lbl: "Design team", dom: DOM.job, parent: "me", h: "watch", plan: ["Make the hard thing obvious", "Next · design crit"], prep: ["~Thu · 0d · prep due", "warm"], assess: [3, "Watch"], pray: ["carrying 2 of 3", "fresh"] },
    { id: "w", kind: "team", ini: "W", name: "Welcome team", lbl: "Welcome team", dom: DOM.church, parent: "me", h: "thriving", plan: ["Every newcomer known by name", "Next · train two hosts"], prep: ["Sun · 3d · ready", "good"], assess: [5, "Thriving"], pray: ["carrying 2 of 2", "carrying"] },
    { id: "p", kind: "team", ini: "P", name: "Product team", lbl: "Product team", dom: DOM.job, parent: "me", h: "strained", plan: ["Ship without heroics", "Next · on-call rota"], prep: ["6w · drifting", "hot"], assess: [2, "Strained"], pray: ["gone quiet · 5w", "quiet"] },
    { id: "m", kind: "person", ini: "M", name: "Maya", parent: "d", rr: ["thriving", 0.86, true], h: "solid", lv: 4, fl: "fresh" },
    { id: "t", kind: "person", ini: "T", name: "Tavi", parent: "d", rr: ["strained", 0.96, false], h: "watch", lv: 3 },
    { id: "i", kind: "person", ini: "I", name: "Iris", parent: "w", rr: ["solid", 0.3, false], h: "thriving", lv: 5 },
    { id: "l", kind: "person", ini: "L", name: "Leo", parent: "w", rr: ["watch", 0.82, false], h: "solid", lv: 4, fl: "carrying" },
    { id: "o", kind: "person", ini: "O", name: "Owen", parent: "p", rr: ["solid", 0.4, false], h: "strained", lv: 2, fl: "quiet" },
    { id: "a", kind: "person", ini: "A", name: "Ana", parent: "p", rr: ["thriving", 0.64, true], h: "solid", lv: 4 },
    { id: "r", kind: "person", ini: "R", name: "Ravi", parent: "p", rr: ["thriving", 0.7, true], h: "thriving", lv: 5, fl: "fresh" },
  ];
  const LV = { thriving: 5, solid: 4, watch: 3, strained: 2 };
  const CIRCLE_ANGLE = { up: -90, w: 0, p: 90, d: 180, m: 166, t: 194, i: -13, l: 13, o: 74, a: 90, r: 106 };

  // A seeded wobble, so the hand-drawn shapes are the same on every visit.
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const padPath = (r, a) => {
    const g = 0.36;
    const p = (ang) => `${(Math.cos(ang) * r).toFixed(1)} ${(Math.sin(ang) * r).toFixed(1)}`;
    return `M0 0L${p(a + g / 2)}A${r} ${r} 0 1 1 ${p(a - g / 2)}Z`;
  };
  const stonePath = (r) => {
    const n = 8;
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      const rr = r * (0.9 + rnd() * 0.18);
      pts.push([Math.cos(a) * rr * 1.08, Math.sin(a) * rr * 0.94]);
    }
    let d = "";
    for (let i = 0; i < n; i++) {
      const p0 = pts[(i - 1 + n) % n];
      const p1 = pts[i];
      const p2 = pts[(i + 1) % n];
      const p3 = pts[(i + 2) % n];
      if (!i) d += `M${p1[0].toFixed(1)} ${p1[1].toFixed(1)}`;
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d += `C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
    }
    return d + "Z";
  };

  function buildChart(svg) {
    const defs = svgEl("defs", {}, svg);
    const grad = (id, stops, attrs = {}) => {
      const g = svgEl("radialGradient", { id, ...attrs }, defs);
      stops.forEach(([o, c, a = 1]) => svgEl("stop", { offset: o, "stop-color": c, "stop-opacity": a }, g));
      return g;
    };
    const lights = [
      grad("pad-fill", [[0, "#5aa88f"], [0.55, "#22604f"], [1, "#123c34"]], { cx: ".4", cy: ".35", fx: ".3", fy: ".25", r: ".75" }),
      grad("stone-fill", [[0, "#86a39e"], [0.5, "#3d605c"], [1, "#1b3533"]], { cx: ".42", cy: ".38", fx: ".3", fy: ".25", r: ".8" }),
      grad("you-fill", [[0, "#ffffff"], [0.7, "#eef3f1"], [1, "#cbd8d4"]], { fx: ".35", fy: ".3" }),
    ];
    grad("pad-shadow", [[0, "#000", 0.5], [0.6, "#000", 0.22], [1, "#000", 0]]);
    const rings = svgEl("g", {}, svg);
    const ringEls = [svgEl("circle", { class: "sc-ring sc-ring--near" }, rings), svgEl("circle", { class: "sc-ring" }, rings), svgEl("circle", { class: "sc-ring" }, rings)];
    const edges = svgEl("g", {}, svg);
    const nodesG = svgEl("g", {}, svg);
    const byId = {};
    const flame = (cls, x, y, s, parent) => {
      const g = svgEl("g", { transform: `translate(${x} ${y}) scale(${s})` }, parent);
      svgEl("use", { href: "#flame", class: `fl-${cls}` }, g);
    };
    const meter = (level, on, x, y, parent) => {
      const g = svgEl("g", { transform: `translate(${x} ${y})` }, parent);
      for (let i = 0; i < 5; i++) {
        const h = 5 + i * 2.6;
        svgEl("rect", { x: i * 4.6, y: 16 - h, width: 3, height: h, rx: 1, class: i < on ? `c-${level}` : "bar-off" }, g);
      }
    };
    for (const d of PEOPLE) {
      const g = svgEl("g", { class: `node node--${d.kind}` }, nodesG);
      const node = { d, g, x: 0, y: 0 };
      byId[d.id] = node;
      const r = d.kind === "me" ? 28 : d.kind === "person" ? 20 : 27;
      node.r = r;
      svgEl("ellipse", { class: "shadow", cx: 5, cy: 8, rx: r * 1.18, ry: r * 1.05 }, g);
      if (d.kind === "me") {
        svgEl("circle", { r, class: "pad" }, g);
        svgEl("text", { class: "ini", y: 1 }, g).textContent = "You";
        continue;
      }
      if (d.kind === "person") {
        const a = rnd() * TAU;
        svgEl("path", { d: padPath(r, a), class: "pad" }, g);
        const v = [a + 2.2, a + 3.14, a + 4.1].map((x) => `M0 0L${(Math.cos(x) * r * 0.8).toFixed(1)} ${(Math.sin(x) * r * 0.8).toFixed(1)}`).join("");
        svgEl("path", { d: v, class: "vein" }, g);
        svgEl("text", { class: "ini", y: 1 }, g).textContent = d.ini;
        const prep = svgEl("g", { class: "lay lay-prep" }, g);
        const C = TAU * 27;
        svgEl("circle", { r: 27, class: "rr-t" }, prep);
        svgEl("circle", { r: 27, class: `rr-a c-${d.rr[0]}`, fill: "none", "stroke-dasharray": `${(C * d.rr[1]).toFixed(1)} ${C.toFixed(1)}`, transform: "rotate(-90)" }, prep);
        if (d.rr[2]) svgEl("circle", { r: 5, cx: 19, cy: 19, class: "c-thriving" }, prep);
        const assess = svgEl("g", { class: "lay lay-assess" }, g);
        svgEl("circle", { r: 25, class: `halo c-${d.h}`, fill: "none" }, assess);
        meter(d.h, d.lv, 18, 12, assess);
        if (d.fl) flame(d.fl, 8, -42, 0.85, svgEl("g", { class: "lay lay-pray" }, g));
        continue;
      }
      svgEl("path", { d: stonePath(r), class: "pad" }, g);
      svgEl("text", { class: "ini", y: 1 }, g).textContent = d.ini;
      if (d.dom) svgEl("rect", { x: -21, y: -21, width: 8, height: 8, rx: 2, fill: d.dom }, g);
      const up = d.kind === "up";
      const lx = up ? 40 : 0;
      const ly = (y) => (up ? y - 50 : y);
      svgEl("text", { class: "lbl", x: lx, y: ly(50) }, g).textContent = d.lbl;
      const plan = svgEl("g", { class: "lay lay-plan" }, g);
      svgEl("text", { class: "sub sub--plan", x: lx, y: ly(70) }, plan).textContent = d.plan[0];
      svgEl("text", { class: "sub", x: lx, y: ly(88) }, plan).textContent = d.plan[1];
      const prep = svgEl("g", { class: "lay lay-prep" }, g);
      svgEl("text", { class: `sub sub--${d.prep[1]}`, x: lx, y: ly(70) }, prep).textContent = d.prep[0];
      const assess = svgEl("g", { class: "lay lay-assess" }, g);
      meter(d.h, d.assess[0], 30, -24, assess);
      svgEl("text", { class: "sub", x: lx, y: ly(70) }, assess).textContent = d.assess[1];
      const pray = svgEl("g", { class: "lay lay-pray" }, g);
      flame(d.pray[1], up ? -50 : 20, -54, 0.95, pray);
      svgEl("text", { class: "sub", x: lx, y: ly(70) }, pray).textContent = d.pray[0];
    }
    const edgeEls = PEOPLE.filter((d) => d.parent).map((d, i) => ({
      from: byId[d.parent],
      to: byId[d.id],
      seed: rnd() * TAU,
      bend: (rnd() - 0.5) * 10,
      el: svgEl("path", { class: `sc-edge${d.kind === "up" ? " sc-edge--up" : ""}` }, edges),
      i,
    }));
    return { svg, lights, rings: ringEls, ringsG: rings, edgesG: edges, edges: edgeEls, byId };
  }

  function chartLayouts(Wc, Hc) {
    const cx = Wc / 2;
    const cy = Hc / 2;
    const R = Math.min(Wc, Hc) / 2 - 46;
    const circles = { me: [cx, cy] };
    for (const id in CIRCLE_ANGLE) {
      const d = PEOPLE.find((p) => p.id === id);
      const r = d.kind === "person" ? R * 0.94 : R * 0.5;
      const a = (CIRCLE_ANGLE[id] * Math.PI) / 180;
      circles[id] = [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
    }
    const portrait = Wc / Hc < 0.95;
    const row = portrait ? [0.1, 0.27, 0.47, 0.83] : [0.11, 0.3, 0.5, 0.84];
    const cols = portrait ? [0.17, 0.5, 0.83] : [0.18, 0.5, 0.82];
    const gap = Math.min(70, Wc * (portrait ? 0.1 : 0.075));
    const tree = { up: [cx, Hc * row[0]], me: [cx, Hc * row[1]] };
    ["d", "w", "p"].forEach((id, i) => {
      tree[id] = [Wc * cols[i], Hc * row[2]];
      const kids = PEOPLE.filter((d) => d.parent === id);
      kids.forEach((k, j) => (tree[k.id] = [Wc * cols[i] + (j - (kids.length - 1) / 2) * gap, Hc * row[3]]));
    });
    return { circles, tree, ring: [R * 0.5, R * 0.94, R * 1.18], cx, cy };
  }

  const peopleVis = $("[data-modes]");
  const chartSvg = $("[data-chart]");
  const steps = $$("[data-step]");
  const rail = $$("[data-rail] li");
  const tabs = $$("[data-mode-tab]");
  const treePanel = $("#tree-panel");
  let chart = null;
  let layout = null;
  let peopleState = { step: -1, t: -1 };
  let manualMode = "plan";
  let settle = { t0: -10 };
  let morphT = 1;

  function sizeChart() {
    if (!chartSvg || !chart) return;
    const r = chartSvg.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const s = clamp(r.width / 760, 0.62, 1.1);
    const Wc = r.width / s;
    const Hc = r.height / s;
    chartSvg.setAttribute("viewBox", `0 0 ${Wc.toFixed(1)} ${Hc.toFixed(1)}`);
    layout = chartLayouts(Wc, Hc);
    chart.rings.forEach((c, i) => {
      c.setAttribute("cx", layout.cx);
      c.setAttribute("cy", layout.cy);
      c.setAttribute("r", layout.ring[i].toFixed(1));
    });
    peopleState.t = -1;
  }

  function drawEdges(force) {
    if (!chart || morphT < 0.5) return false;
    const age = (performance.now() - settle.t0) / 1000;
    const live = !still && age < 1.6;
    if (!live && !force && !settle.last) return false;
    settle.last = live;
    for (const ed of chart.edges) {
      const { from, to } = ed;
      const up = to.d.kind === "up";
      const a = up ? to : from;
      const b = up ? from : to;
      const x0 = a.x;
      const y0 = a.y + a.r + (a.d.kind === "team" ? 72 : 4);
      const x1 = b.x;
      const y1 = b.y - b.r - 4;
      const dy = y1 - y0;
      // Hand-drawn: a slight bend of its own, and a ripple that settles each time a new mode opens.
      const wob = ed.bend + (live ? Math.exp(-age * 3.2) * Math.sin(age * 13 + ed.seed) * 16 : 0);
      const c1x = x0 + (x1 - x0) * 0.08 + wob;
      const c2x = x1 - (x1 - x0) * 0.12 - wob * 0.6;
      ed.el.setAttribute("d", `M${x0.toFixed(1)} ${y0.toFixed(1)}C${c1x.toFixed(1)} ${(y0 + dy * 0.62).toFixed(1)} ${c2x.toFixed(1)} ${(y1 - dy * 0.55).toFixed(1)} ${x1.toFixed(1)} ${y1.toFixed(1)}`);
    }
    return live;
  }

  function placeChart(t) {
    if (!layout) return;
    const e = smooth(t);
    morphT = e;
    for (const id in chart.byId) {
      const n = chart.byId[id];
      const a = layout.circles[id];
      const b = layout.tree[id];
      const lift = Math.sin(e * Math.PI) * (n.d.kind === "person" ? 26 : 12);
      n.x = lerp(a[0], b[0], e);
      n.y = lerp(a[1], b[1], e) - lift;
      n.g.setAttribute("transform", `translate(${n.x.toFixed(1)} ${n.y.toFixed(1)})`);
    }
    chart.ringsG.style.opacity = (1 - e).toFixed(3);
    chart.edgesG.style.opacity = clamp((e - 0.55) / 0.45).toFixed(3);
    drawEdges(true);
  }

  let scanLevel = "strained";
  const scanNote = $("[data-scan-note]");
  const scanButtons = $$("[data-scan-level]");
  function paintScan() {
    if (!chart) return;
    const lit = [];
    for (const id in chart.byId) {
      const n = chart.byId[id];
      const on = !!scanLevel && n.d.h === scanLevel && n.d.kind !== "up";
      n.g.classList.toggle("is-lit", on || !scanLevel);
      if (on) lit.push(n.d.name);
    }
    if (scanNote) {
      const names = lit.length > 1 ? `${lit.slice(0, -1).join(", ")} and ${lit[lit.length - 1]}` : lit[0];
      scanNote.textContent = scanLevel ? `${scanLevel[0].toUpperCase() + scanLevel.slice(1)}: ${names} stay lit. Nothing is hidden.` : "No level picked: everything is lit.";
    }
  }
  scanButtons.forEach((b) =>
    b.addEventListener("click", () => {
      const on = b.getAttribute("aria-pressed") !== "true";
      scanButtons.forEach((o) => o.setAttribute("aria-pressed", String(o === b && on)));
      scanLevel = on ? b.dataset.scanLevel : "";
      paintScan();
    })
  );

  function setMode(mode) {
    if (peopleVis) peopleVis.dataset.mode = mode;
    if (chartSvg) chartSvg.dataset.mode = mode;
    const sel = MODES.includes(mode) ? mode : manualMode;
    tabs.forEach((tab) => {
      const on = tab.dataset.modeTab === sel;
      tab.setAttribute("aria-selected", String(on));
      tab.tabIndex = on ? 0 : -1;
      if (on && treePanel) treePanel.setAttribute("aria-labelledby", tab.id);
    });
    settle.t0 = performance.now();
  }

  function paintPeople(p) {
    if (!chart) return;
    let t;
    let step;
    if (still) {
      t = 1;
      step = 2 + MODES.indexOf(manualMode);
    } else {
      t = clamp((p - MORPH[0]) / (MORPH[1] - MORPH[0]));
      step = 0;
      STEP_AT.forEach((at, i) => p >= at && (step = i));
    }
    if (Math.abs(t - peopleState.t) > 0.0005) {
      peopleState.t = t;
      placeChart(t);
    }
    if (step !== peopleState.step) {
      peopleState.step = step;
      const mode = step === 0 ? "circles" : step === 1 ? "tree" : MODES[step - 2];
      if (step >= 2) manualMode = mode;
      setMode(mode);
      steps.forEach((s, i) => s.classList.toggle("is-on", i === step));
      rail.forEach((r, i) => r.classList.toggle("is-on", i === step));
    }
    return drawEdges();
  }

  let chartLight = "";
  function lightChart() {
    if (!chart) return;
    // The pads are lit from wherever the light on the water is.
    const fx = clamp(0.2 + (day.glow[0] / W) * 0.45, 0.15, 0.7).toFixed(2);
    if (fx === chartLight) return;
    chartLight = fx;
    chart.lights.forEach((g) => g.setAttribute("fx", fx));
  }

  // The chart is built just before it's needed, to keep the first load light.
  function ensureChart() {
    if (chart || !chartSvg) return;
    if (!warm) return void (wantChart = true);
    chart = buildChart(chartSvg);
    sizeChart();
    paintScan();
    peopleState = { step: -1, t: -1 };
    if ("ResizeObserver" in window) new ResizeObserver(() => { sizeChart(); dirty = true; kick(); }).observe(chartSvg);
    kick();
  }
  if (chartSvg && peopleVis) {
    if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver(([e]) => {
        if (!e.isIntersecting) return;
        io.disconnect();
        ensureChart();
      }, { rootMargin: "150% 0px" });
      io.observe(peopleVis);
    } else ensureChart();
    const choose = (mode, focusTab) => {
      if (focusTab) focusTab.focus({ preventScroll: true });
      ensureChart();
      manualMode = mode;
      if (still || !pins.people) {
        peopleState.step = -1;
        paintPeople(1);
        return;
      }
      const i = 2 + MODES.indexOf(mode);
      const travel = pins.people.h - H;
      window.scrollTo({ top: pins.people.top + (STEP_AT[i] + 0.06) * travel, behavior: "smooth" });
    };
    tabs.forEach((tab, i) => {
      tab.addEventListener("click", () => choose(tab.dataset.modeTab));
      tab.addEventListener("keydown", (e) => {
        let next = null;
        if (e.key === "ArrowRight") next = tabs[(i + 1) % tabs.length];
        else if (e.key === "ArrowLeft") next = tabs[(i - 1 + tabs.length) % tabs.length];
        else if (e.key === "Home") next = tabs[0];
        else if (e.key === "End") next = tabs[tabs.length - 1];
        else if (/^[1-4]$/.test(e.key)) next = tabs[Number(e.key) - 1];
        if (next) {
          e.preventDefault();
          choose(next.dataset.modeTab, next);
        }
      });
    });
    let inView = false;
    if ("IntersectionObserver" in window) new IntersectionObserver(([e]) => (inView = e.isIntersecting), { threshold: 0.5 }).observe(peopleVis);
    document.addEventListener("keydown", (e) => {
      if (!inView || e.metaKey || e.ctrlKey || e.altKey || !/^[1-4]$/.test(e.key)) return;
      const t = e.target;
      if (t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (peopleVis.contains(t)) return;
      choose(MODES[Number(e.key) - 1]);
    });
  }

  /* ── Readiness: one week of a weekly 1:1 ──────────────────────────── */

  const dial = $("[data-dial]");
  const DIAL_C = TAU * 124;
  const WINDOW_OPENS = 5;
  let dialState = "";
  let dialDay = -1;
  let dialP = -1;
  const checks = $$("[data-checks] li");
  const dialOut = dial && { arc: $("[data-dial-arc]", dial), hand: $("[data-dial-hand]", dial), cd: $("[data-dial-cd]", dial), state: $("[data-dial-state]", dial), why: $("[data-dial-why]", dial) };
  if (dial) {
    const win = $(".dial__window", dial);
    win.setAttribute("stroke-dasharray", `${((DIAL_C * (7 - WINDOW_OPENS)) / 7).toFixed(2)} ${DIAL_C.toFixed(2)}`);
    win.setAttribute("stroke-dashoffset", (-(DIAL_C * WINDOW_OPENS) / 7).toFixed(2));
    const ticks = $("[data-dial-ticks]", dial);
    ["Thu", "Fri", "Sat", "Sun", "Mon", "Tue", "Wed"].forEach((dname, k) => {
      const a = (k / 7) * TAU - Math.PI / 2;
      const c = Math.cos(a);
      const s = Math.sin(a);
      svgEl("line", { class: "dial__tick", x1: 160 + c * 102, y1: 160 + s * 102, x2: 160 + c * 108, y2: 160 + s * 108 }, ticks);
      svgEl("text", { class: "dial__day", x: (160 + c * 150).toFixed(1), y: (160 + s * 150).toFixed(1) }, ticks).textContent = dname;
    });
  }
  function paintDial(p) {
    if (!dial) return;
    if (still) p = 1;
    if (Math.abs(p - dialP) < 0.0004) return;
    dialP = p;
    const d = p * 7;
    dialOut.arc.setAttribute("stroke-dasharray", `${Math.max(0.1, p * DIAL_C).toFixed(1)} ${DIAL_C.toFixed(1)}`);
    dialOut.hand.setAttribute("transform", `rotate(${(p * 360).toFixed(2)} 160 160)`);
    const dd = p >= 0.985 ? 7 : Math.floor(d);
    if (dd !== dialDay) {
      dialDay = dd;
      dialOut.cd.textContent = dd >= 7 ? "Thu · today" : `~Thu · ${7 - dd}d`;
    }
    let done = 0;
    checks.forEach((li) => {
      const on = d >= Number(li.dataset.at);
      li.classList.toggle("is-done", on);
      if (on) done++;
    });
    const state = d < 0.8 ? "loose" : d < WINDOW_OPENS ? "rest" : done === checks.length ? "ready" : "prep";
    const key = state + done;
    if (key === dialState) return;
    dialState = key;
    dial.dataset.state = state;
    dialOut.state.textContent = { loose: "Loose end", rest: "Resting", prep: "Prep due", ready: "Ready" }[state];
    const left = checks.length - done;
    dialOut.why.textContent = {
      loose: "Last Thursday’s 1:1 was never written up.",
      rest: "Met this week. Nothing owed, and that’s good.",
      prep: `The prep window is open. ${left === 1 ? "One check" : `${left} checks`} to go.`,
      ready: "All four checks pass. Show up.",
    }[state];
  }

  /* ── Ideas → Plan → Run: the ideas travel ─────────────────────────── */

  const flow = $("[data-flow]");
  const typerOut = $("[data-typer-out]");
  const writeup = $("[data-writeup]");
  const tokens = $$("[data-token]");
  const CAPTURE = "Roadmap risks #work @tavi !";
  const WRITEUP = "Agreed to cut the export from v1. Tavi owns the risk list by Friday.";
  const ROUTE = [
    ["idea-0", "plan-1", "run-1"],
    ["idea-1", "plan-0", "run-0"],
    ["idea-2", "plan-2", null],
  ];
  let slots = {};
  let flowP = -1;
  const esc = (s) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
  const renderCapture = (s) =>
    esc(s)
      .replace(/(#[\w-]+)/g, '<span class="tok tok--tag">$1</span>')
      .replace(/(@[\w-]+)/g, '<span class="tok tok--at">$1</span>')
      .replace(/(\s)!$/, '$1<span class="tok tok--bang">!</span>');

  function measureLocal() {
    if (flow) {
      const base = flow.getBoundingClientRect();
      slots = {};
      $$("[data-slot]", flow).forEach((el) => {
        const r = el.getBoundingClientRect();
        slots[el.dataset.slot] = { x: r.left - base.left, y: r.top - base.top, w: r.width, h: r.height, el };
      });
      const f = $(".capture__field", flow).getBoundingClientRect();
      slots.field = { x: f.left - base.left + 10, y: f.top - base.top + 8, w: 120, h: f.height - 16 };
      tokens.forEach((t) => {
        t.style.transform = "none";
        t._w = t.offsetWidth;
        t._h = t.offsetHeight;
      });
      flowP = -1;
    }
    measureScrubs();
  }

  function tokenAt(tok, i, p) {
    const [ideaK, planK, runK] = ROUTE[i];
    const idea = slots[ideaK];
    const plan = slots[planK];
    const run = runK && slots[runK];
    if (!idea || !plan) return null;
    const tw = tok._w || 120;
    const th = tok._h || 34;
    const at = (s, scale = 1) => ({ x: s.x + 8, y: s.y + (s.h - th) / 2, sx: scale, sy: scale, o: 1 });
    // A chip never shrinks below 0.6 and is never half-transparent: it lands
    // on the week's cell at 0.6 and drops into it (the cell fills, the water
    // rings), and comes back out of the cell at 0.6, whole.
    const MIN = 0.6;
    const center = (s) => ({ x: s.x + s.w / 2 - (tw * MIN) / 2, y: s.y + s.h / 2 - (th * MIN) / 2, sx: MIN, sy: MIN, o: 1 });
    const A = at(idea);
    const B = center(plan);
    const fly = (a, b, k, lift) => {
      const e = smooth(k);
      return { x: lerp(a.x, b.x, e), y: lerp(a.y, b.y, e) - Math.sin(e * Math.PI) * lift, sx: lerp(a.sx, b.sx, e), sy: lerp(a.sy, b.sy, e), o: k >= 1 ? 0 : 1 };
    };
    let s;
    if (i === 0) {
      const F = { x: slots.field.x, y: slots.field.y, sx: 1, sy: 1, o: 0 };
      if (p < 0.28) s = F;
      else if (p < 0.36) s = fly({ ...F, o: 1 }, A, (p - 0.28) / 0.08, 10);
      else s = A;
      if (p < 0.29) s.o = 0;
    } else s = A;
    const go = 0.38 + i * 0.06;
    if (p >= go) s = fly(A, B, clamp((p - go) / 0.15), 46);
    if (run) {
      const back = 0.66 + (i === 1 ? 0 : 0.07);
      if (p >= back) {
        const R = at(run);
        R.x = run.x;
        R.y = run.y + (run.h - th) / 2;
        const k = clamp((p - back) / 0.14);
        const e = smooth(k);
        s = { x: lerp(B.x, R.x, e), y: lerp(B.y, R.y, e) - Math.sin(e * Math.PI) * 36, sx: lerp(MIN, 1, e), sy: lerp(MIN, 1, e), o: 1 };
      }
    }
    return s;
  }

  // Where each chip comes to rest: [progress it lands at, slot it lands in].
  const LANDS = ROUTE.map(([ideaK, planK, runK], i) => [
    ...(i === 0 ? [[0.36, ideaK]] : []),
    [0.38 + i * 0.06 + 0.15, planK],
    ...(runK ? [[0.66 + (i === 1 ? 0 : 0.07) + 0.14, runK]] : []),
  ]);
  const landedAt = ROUTE.map(() => 0);
  // Every landing, going forward, sends one ring into the water from where it lands.
  // (`__rings` is a tally a test can read; nothing on the page uses it.)
  function ringFrom(el, s = 0.9) {
    const r = el.getBoundingClientRect();
    if (r.bottom > 0 && r.top < H) drop(r.left + r.width / 2, r.top + r.height / 2, s);
    (flow.__rings || (flow.__rings = [])).push(el.dataset.slot);
  }
  function paintFlow(p) {
    if (!flow) return;
    if (still) p = 1;
    if (Math.abs(p - flowP) < 0.0005) return;
    const forward = p > flowP && flowP >= 0;
    flowP = p;
    LANDS.forEach((lands, i) => {
      let n = 0;
      while (n < lands.length && p >= lands[n][0]) n++;
      if (forward && n > landedAt[i] && slots[lands[n - 1][1]]) ringFrom(slots[lands[n - 1][1]].el);
      landedAt[i] = n;
    });
    const n = p < 0.28 ? Math.round((CAPTURE.length * p) / 0.26) : p < 0.36 ? CAPTURE.length : 0;
    typerOut.innerHTML = renderCapture(CAPTURE.slice(0, Math.min(CAPTURE.length, n)));
    const wn = Math.round(WRITEUP.length * clamp((p - 0.84) / 0.14));
    writeup.textContent = WRITEUP.slice(0, wn);
    tokens.forEach((tok, i) => {
      const s = tokenAt(tok, i, p);
      if (!s) return;
      tok.style.opacity = s.o.toFixed(3);
      tok.style.transform = `translate3d(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px, 0) scale(${s.sx.toFixed(3)}, ${s.sy.toFixed(3)})`;
      const planK = ROUTE[i][1];
      const landed = p >= 0.38 + i * 0.06 + 0.15;
      if (slots[planK]) slots[planK].el.classList.toggle("is-hit", landed);
    });
  }
  tokens.forEach((t) => (t.style.transformOrigin = "0 0"));

  /* ── Scroll-scrubbed pieces: profile, leading up, ⌘K ──────────────── */

  const pcard = $("[data-assemble]");
  const pieces = pcard ? $$("[data-piece]", pcard) : [];
  const upSec = $('[data-scrub="up"]');
  const upCards = $$("[data-up-card]");
  const upRows = $$("[data-up-row], [data-up-win]");
  const today = $('[data-scrub="today"]');
  const todayWin = today && $(".app-window", today);
  const paletteEl = $("[data-palette]");
  const scrubTops = {};
  function measureScrubs() {
    const m = (k, el) => el && (scrubTops[k] = { top: docTop(el), h: el.offsetHeight });
    m("pcard", pcard);
    m("up", upSec);
    m("today", today);
    m("palette", paletteEl);
  }
  // 0 as the element's top meets the bottom of the screen, 1 after `span` screens more.
  const enter = (k, y, span = 0.6, at = 0.95) => {
    const s = scrubTops[k];
    if (!s) return 1;
    return clamp((y + H * at - s.top) / (H * span));
  };
  const PIECE = pieces.map((_, i) => [((i * 61) % 11) - 5, 40 + ((i * 37) % 70), ((i * 53) % 13) - 6]);
  let pieceE = -1;
  function paintPieces(y) {
    if (!pieces.length) return;
    // Once a piece has landed it stays: the card assembles once.
    const e = still || pieceE >= 1 ? 1 : easeOut(enter("pcard", y, 0.75, 1));
    if (Math.abs(e - pieceE) < 0.001) return;
    pieceE = e;
    pieces.forEach((el, i) => {
      const k = clamp(e * 1.6 - i * 0.06);
      if (k >= 1) {
        el.style.transform = "";
        return;
      }
      const [dx, dy, rot] = PIECE[i];
      const q = 1 - smooth(k);
      el.style.transform = `translate3d(${(dx * 14 * q).toFixed(1)}px, ${(dy * q).toFixed(1)}px, 0) rotate(${(rot * q).toFixed(2)}deg)`;
    });
  }
  let upE = -1;
  function paintUp(y) {
    if (!upSec) return;
    const e = still || upE >= 1 ? 1 : enter("up", y, 0.9, 1);
    if (Math.abs(e - upE) < 0.001) return;
    upE = e;
    upCards.forEach((el, i) => {
      const k = smooth(clamp(e * 1.5 - i * 0.25));
      el.style.transform = k >= 1 ? "" : `translate3d(${((1 - k) * (i ? 70 : -40)).toFixed(1)}px, ${((1 - k) * 50).toFixed(1)}px, 0)`;
    });
    upRows.forEach((el, i) => {
      const k = smooth(clamp(e * 2.2 - 0.4 - i * 0.12));
      el.style.transform = k >= 1 ? "" : `translate3d(${((1 - k) * 36).toFixed(1)}px, 0, 0) rotate(${((1 - k) * 1.5).toFixed(2)}deg)`;
    });
  }
  let todayE = -1;
  function paintToday(y) {
    if (!todayWin) return;
    const e = still || todayE >= 1 ? 1 : easeOut(enter("today", y, 0.7, 1));
    if (Math.abs(e - todayE) < 0.001) return;
    todayE = e;
    todayWin.style.transform = e >= 1 ? "" : `perspective(1600px) rotateX(${((1 - e) * 16).toFixed(2)}deg) translate3d(0, ${((1 - e) * 60).toFixed(1)}px, 0) scale(${(0.94 + 0.06 * e).toFixed(3)})`;
  }

  // ⌘K: the query types itself as you scroll, and the results re-rank live,
  // with the app's own ranking: prefix > word-start > mid-word > initials,
  // then which field matched (a name > where it lives > the prose), then recency.
  const DOCS = [
    { kind: "Person", name: "Ravi", where: "Product team", text: "Engineer · 1:1 every other Tuesday", rec: 0.6 },
    { kind: "Person", name: "Rosa", where: "Design team", text: "Researcher · joined in August", rec: 0.3 },
    { kind: "Meeting", name: "Roadmap review", where: "Product team · monthly", text: "Next ~Nov 3 · two topics queued", rec: 0.8 },
    { kind: "Topic", name: "Roadmap risks", where: "Tavi · 1:1", text: "The export is the long pole; decide by Friday", rec: 0.9 },
    { kind: "Write-up", name: "Tavi · 1:1, Oct 15", where: "Design team", text: "…agreed to cut the export from the roadmap…", rec: 0.7 },
    { kind: "Note", name: "Owen", where: "Product team", text: "Wants to own the road to launch", rec: 0.5 },
    { kind: "Win", name: "Wins ledger", where: "Leadership team", text: "Shipped the Q3 roadmap a week early", rec: 0.4 },
  ];
  const QUERY = "roadmap";
  const palQ = $("[data-palette-q]");
  const palList = $("[data-palette-list]");
  const palFoot = $("[data-palette-foot]");
  let palN = -1;
  let palOrder = "";
  const quality = (text, q) => {
    const t = text.toLowerCase();
    if (t.startsWith(q)) return [4, 0];
    const m = t.search(new RegExp(`\\b${q}`));
    if (m >= 0) return [3, m];
    const k = t.indexOf(q);
    if (k >= 0) return [2, k];
    const ini = t.split(/\W+/).map((w) => w[0] || "").join("");
    if (ini.startsWith(q)) return [1, -1];
    return [0, -1];
  };
  const hl = (text, q, at) => (at < 0 || !q ? esc(text) : `${esc(text.slice(0, at))}<mark>${esc(text.slice(at, at + q.length))}</mark>${esc(text.slice(at + q.length))}`);
  function paintPalette(y) {
    if (!palList) return;
    if (!DOCS[0].li) {
      if (scrubTops.palette && y + H * 2.5 < scrubTops.palette.top && !still) return;
      DOCS.forEach((d) => {
        const li = document.createElement("li");
        palList.append(li);
        d.li = li;
      });
    }
    const e = still ? 1 : enter("palette", y, 0.6, 0.9);
    const n = Math.round(QUERY.length * e);
    if (n === palN) return;
    palN = n;
    const q = QUERY.slice(0, n);
    palQ.textContent = q;
    const scored = DOCS.map((d) => {
      if (!q) return { d, s: d.rec, f: -1, at: -1 };
      let best = { s: -1, f: -1, at: -1 };
      [["name", 3], ["where", 2], ["text", 1]].forEach(([f, wgt]) => {
        const [qq, at] = quality(d[f], q);
        if (!qq) return;
        const s = qq * 10 + wgt * 2 + d.rec;
        if (s > best.s) best = { s, f, at };
      });
      return { d, ...best };
    }).filter((x) => x.s >= 0);
    scored.sort((a, b) => b.s - a.s);
    const rowH = W <= 420 ? 62 : 76;
    // A re-rank touches the water: one ring from the row that's now on top.
    const order = scored.slice(0, 4).map((x) => x.d.name).join("|");
    if (palOrder && order !== palOrder && q) {
      const r = palList.getBoundingClientRect();
      if (r.bottom > 0 && r.top < H) drop(r.left + r.width * 0.3, r.top + rowH / 2, 0.85);
      (palList.__rings || (palList.__rings = [])).push(q);
    }
    palOrder = order;
    DOCS.forEach((d) => {
      const rank = scored.findIndex((x) => x.d === d);
      const li = d.li;
      const sc = scored[rank];
      if (rank < 0 || rank > 3) {
        li.style.opacity = "0";
        li.style.transform = `translate3d(0, ${(4 * rowH).toFixed(0)}px, 0)`;
        li.classList.remove("is-top");
        return;
      }
      li.style.opacity = "1";
      li.style.transform = `translate3d(0, ${rank * rowH}px, 0)`;
      li.classList.toggle("is-top", rank === 0);
      const f = sc.f;
      li.innerHTML = `<span class="kind">${d.kind}</span><b>${f === "name" ? hl(d.name, q, sc.at) : esc(d.name)}</b> · ${f === "where" ? hl(d.where, q, sc.at) : esc(d.where)}<span>${f === "text" ? hl(d.text, q, sc.at) : esc(d.text)}</span>`;
    });
    palFoot.textContent = q ? `${scored.length} found · ranked by match, then field, then recency` : "Nothing typed: the last things you opened";
  }

  /* ── Nightfall copy ───────────────────────────────────────────────── */

  const nightCopy = $("[data-night-copy]");
  let nightC = -1;
  // The headline never fades: its words rise into place at full strength as
  // the chapter arrives, and a dusk scrim behind it deepens while the sun is
  // up, so the light never washes it out. Once the stars are out the scrim
  // thins to let them through.
  function paintNight() {
    if (!nightCopy) return;
    const c = still ? 0.5 : clamp(0.42 + 0.5 * day.sun[3] * (1 - day.stars));
    if (Math.abs(c - nightC) < 0.002) return;
    nightC = c;
    nightCopy.style.setProperty("--scrim", c.toFixed(3));
  }

  // The sun meets the water: rings go out from where its light touches.
  let lastSunDrop = 0;
  function sunDrops(t) {
    if (still || day.tilt < 0.9 || day.sun[3] <= 0) return;
    const h = (day.hz - day.sun[1]) / day.sun[2];
    if (h > 1.4 || h < -1.05 || t - lastSunDrop < 1.6) return;
    lastSunDrop = t;
    drop(day.sun[0], day.hz + H * 0.09, 1.6);
  }

  /* ── Cards: a small tilt toward the pointer, flat again at rest ───── */

  if (window.matchMedia("(pointer: fine)").matches) {
    $$("[data-tilt]").forEach((card) => {
      let idle = 0;
      const rest = () => {
        card.style.transition = "transform .6s var(--ease)";
        card.style.transform = "";
      };
      card.addEventListener("pointermove", (e) => {
        if (still) return;
        const r = card.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - 0.5;
        const yy = (e.clientY - r.top) / r.height - 0.5;
        card.style.transition = "transform .25s var(--ease)";
        card.style.transform = `perspective(1000px) rotateX(${(yy * -4).toFixed(2)}deg) rotateY(${(x * 4).toFixed(2)}deg)`;
        clearTimeout(idle);
        idle = setTimeout(rest, 900);
      });
      card.addEventListener("pointerleave", () => {
        clearTimeout(idle);
        rest();
      });
    });
  }

  /* ── One loop for the page ────────────────────────────────────────── */

  let dirty = true;
  let raf = 0;
  let lastY = -1;
  let lastT = performance.now();
  let frames = 0;
  const heroWellEl = heroWell.wrap;

  function tick(ts) {
    raf = 0;
    syncMotion();
    const dt = Math.min(0.05, (ts - lastT) / 1000);
    adapt(ts - lastT);
    lastT = ts;
    frames++;
    const y = window.scrollY;
    const moved = y !== lastY || dirty;
    const t = now();
    if (moved) {
      lastY = y;
      dirty = false;
      computeDay(y);
      paintHeader();
      paintClock();
    }
    if (moved && warm) {
      paintToday(y);
      paintPieces(y);
      paintDial(pinProgress("ready", y));
      paintFlow(pinProgress("flow", y));
      paintUp(y);
      paintPalette(y);
      paintNight();
      lightChart();
    }
    if (moved) {
      if (heroWellEl && !still && y < H * 1.3) {
        const hp = clamp(y / H);
        heroWellEl.style.transform = `translate3d(0, ${(y * (1 - K)).toFixed(1)}px, 0)`;
        heroWellEl.style.opacity = (1 - clamp((hp - 0.35) / 0.55)).toFixed(3);
        if (heroCopy) heroCopy.style.transform = `translate3d(0, ${(y * -0.12).toFixed(1)}px, 0)`;
      }
    }
    const edgesLive = paintPeople(pinProgress("people", y));
    if (!still) {
      if (heroWell.ctx && heroWell.visible && y < H * 1.3) {
        stepHero(dt);
        drawHero();
      }
      sunDrops(t);
      paintSheen(t);
      // Water: every frame while something moves, every other frame at rest
      // (rings still spreading count as moving, except on a software renderer).
      const live = moved || (!water.soft && drops.some((d) => t - d.t0 < 4));
      if (live || frames % 2 === 0) renderWater(t);
      raf = requestAnimationFrame(tick);
    } else {
      if (heroWell.ctx && !heroWell.drawn) {
        heroWell.drawn = true;
        drawHero();
      }
      renderWater(2.0);
      if (edgesLive || (water.mode && !water.ready)) raf = requestAnimationFrame(tick);
    }
  }
  function kick() {
    if (!raf) raf = requestAnimationFrame(tick);
  }

  window.addEventListener("scroll", kick, { passive: true });
  window.addEventListener("resize", () => {
    measure();
    sizeHero();
    resizeWater();
    kick();
  });
  // A hidden tab gets no animation frames, so the water simply stops there and
  // picks up again when the tab comes back.
  window.addEventListener("pageshow", () => {
    lastT = performance.now();
    kick();
  });
  if ("ResizeObserver" in window) {
    let pending = 0;
    new ResizeObserver(() => {
      cancelAnimationFrame(pending);
      pending = requestAnimationFrame(() => {
        measure();
        kick();
      });
    }).observe(document.body);
  }

  // `matches` is live: a mid-visit switch to reduced motion (or back) is
  // honored on the next frame, and checked now and then while idle.
  function syncMotion() {
    if (motionQuery.matches === still) return;
    still = motionQuery.matches;
    root.classList.toggle("motion", !still);
    if (still) {
      drops.length = 0;
      [heroWellEl, heroCopy, nightCopy, todayWin].forEach((el) => el && (el.style.transform = ""));
      if (heroWellEl) heroWellEl.style.opacity = "";
      heroWell.splashed = true;
      heroWell.drawn = false;
    }
    peopleState = { step: -1, t: -1 };
    dialState = "";
    dialP = flowP = pieceE = upE = todayE = palN = nightC = -1;
    measure();
    sizeChart();
  }
  setInterval(() => {
    if (motionQuery.matches !== still) kick();
  }, 1500);

  // The hero is sized and drawn only once the first frame (and its layout) is out.
  requestAnimationFrame(() => setTimeout(() => {
    measure();
    sizeHero();
    kick();
  }, 0));

  /* ── Warm-up: the page is laid out one chapter per task ───────────── */
  // Below the hero every chapter starts as `content-visibility: hidden`, so the
  // first layout is the first screen alone. Once the stylesheet and the fonts
  // are in, each chapter is laid out in its own short task (none near 50ms on
  // a 4× slowed phone), and only then is the page measured.
  const idle = window.requestIdleCallback || ((f) => setTimeout(f, 50));
  const cold = $$("main > section:not(.hero), .foot");
  let loaded = document.readyState === "complete";
  function warmUp() {
    let i = 0;
    const next = () => {
      if (i < cold.length) {
        const el = cold[i++];
        el.classList.add("is-warm");
        void el.offsetHeight;
        return setTimeout(next, 0);
      }
      warm = true;
      measure();
      if (wantChart) setTimeout(ensureChart, 0);
      kick();
      if (loaded) setTimeout(begin, 120);
    };
    next();
  }
  const cssLink = $('link[href$="landing.css"]');
  const cssIn = new Promise((ok) => {
    if (!cssLink || cssLink.media === "all") return ok();
    cssLink.addEventListener("load", ok, { once: true });
    cssLink.addEventListener("error", ok, { once: true });
  });
  const later = (ms) => new Promise((ok) => setTimeout(ok, ms));
  // `fonts.ready` flushes layout when read, so it's read after the first frame.
  // On a slow connection nobody waits on it: past 1.5s, or at the first
  // scroll, the chapters are laid out anyway.
  let warming = false;
  const startWarm = () => {
    if (warming) return;
    warming = true;
    setTimeout(warmUp, 0);
  };
  window.addEventListener("scroll", startWarm, { once: true, passive: true });
  requestAnimationFrame(() => setTimeout(() => {
    const fontsIn = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
    Promise.race([Promise.all([cssIn, fontsIn]), later(1500)]).then(() => requestAnimationFrame(startWarm));
  }, 0));

  // The water starts after the page is measured and loaded, when it's idle:
  // the context in one task, the shader compiled in parallel in the next, and
  // polled each frame until it's linked.
  let begun = false;
  function begin() {
    if (begun || !warm) return;
    begun = true;
    idle(() => startWater(), { timeout: 1500 });
  }
  if (!loaded) window.addEventListener("load", () => {
    loaded = true;
    setTimeout(begin, 300);
  }, { once: true });
  clock0 = performance.now();
}, 0);
