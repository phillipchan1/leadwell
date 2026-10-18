/* LeadWell landing — vanilla, no dependencies.
 *
 * The page is one day at the well. The mark (ripples in a well, a gilt drop at
 * the center) is drawn live on a canvas in the hero and again at night; the
 * People and Meetings chapters are pinned sequences the scroll drives; the
 * page keeps its own clock from first light to night.
 *
 * Everything here is an enhancement. With no script the page is complete and
 * every section is plain flow. Under prefers-reduced-motion nothing pins and
 * nothing drifts: each piece shows its finished state, and the controls still
 * work. Only transforms and opacity move on HTML; SVG and canvas geometry
 * moves inside two contained charts. */
(() => {
  "use strict";

  const root = document.documentElement;
  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  let still = motionQuery.matches;
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));
  const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (t) => t * t * (3 - 2 * t);
  const SVG = "http://www.w3.org/2000/svg";
  const TAU = Math.PI * 2;

  const svgEl = (tag, attrs = {}, parent) => {
    const el = document.createElementNS(SVG, tag);
    for (const k in attrs) el.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(el);
    return el;
  };

  /* ── Split headings into words that rise out of a mask ────────────── */

  function split(el) {
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
  $$("[data-split]").forEach(split);

  /* ── Reveal on scroll ─────────────────────────────────────────────── */

  const heroTitle = $(".hero__title");
  const revealables = $$("[data-reveal], [data-split]").filter((el) => el !== heroTitle);
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.classList.add("is-in");
          io.unobserve(e.target);
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.06 }
    );
    revealables.forEach((el) => io.observe(el));
  } else {
    revealables.forEach((el) => el.classList.add("is-in"));
  }
  // The hero doesn't wait for a scroll; two frames so the words have a start to leave from.
  requestAnimationFrame(() => requestAnimationFrame(() => heroTitle && heroTitle.classList.add("is-in")));

  /* ── The well: a live drawing of the mark ─────────────────────────── */

  const FLAME = typeof Path2D === "function" ? new Path2D("M12 3.2c2.7 3.2 4.8 5.8 4.8 9a4.8 4.8 0 0 1-9.6 0c0-3.2 2.1-5.8 4.8-9z") : null;
  const PALETTES = {
    leather: { line: "172,195,193", gilt: "225,179,77", disc: "#1a4f51", discFar: "#0f3e40", ink: "#eef3f1", inkFar: "#acc3c1", vesper: "#c3b3f6", vesperFill: "#8d74e0" },
    night: { line: "185,176,217", gilt: "225,179,77", disc: "#2a2350", discFar: "#1d1838", ink: "#ece8f7", inkFar: "#b9b0d9", vesper: "#c3b3f6", vesperFill: "#8d74e0" },
  };
  const LEVEL = { thriving: "#6fcf97", solid: "#8fc1b7", watch: "#e9b54c", strained: "#f08a5b" };

  class Well {
    constructor(canvas, opts) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.opts = opts;
      this.pal = PALETTES[opts.palette];
      this.ripples = [];
      this.t = opts.intro ? 0 : 3;
      this.nextAmbient = opts.intro ? 2.6 : 0.4;
      this.splashed = !opts.intro;
      this.raf = 0;
      this.visible = false;
      this.nodes = opts.nodes.map((n) => ({ ...n, a: (n.a * Math.PI) / 180, dx: 0, dy: 0 }));
      this.frame = this.frame.bind(this);
      this.resize();
      if ("ResizeObserver" in window) {
        new ResizeObserver(() => {
          this.resize();
          if (!this.raf) this.draw();
        }).observe(canvas);
      }
      if ("IntersectionObserver" in window) {
        new IntersectionObserver(([e]) => {
          this.visible = e.isIntersecting;
          if (this.visible) {
            if (opts.dropOnEnter && !this.entered && !still) {
              this.entered = true;
              this.drop(this.cx, this.cy, 1.3, true);
            }
            this.start();
          } else this.stop();
        }).observe(canvas);
      } else {
        this.visible = true;
        this.start();
      }
    }

    resize() {
      const r = this.canvas.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      this.w = r.width;
      this.h = r.height;
      this.canvas.width = Math.round(r.width * dpr);
      this.canvas.height = Math.round(r.height * dpr);
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const c = this.opts.center(this.w, this.h);
      this.cx = c.x;
      this.cy = c.y;
      this.R = c.R;
      this.scale = clamp(c.R / 300, 0.72, 1.25);
      const g = this.ctx.createRadialGradient(this.cx, this.cy, 0, this.cx, this.cy, this.R * 1.1);
      g.addColorStop(0, `rgba(${this.pal.gilt},.2)`);
      g.addColorStop(0.5, `rgba(${this.pal.gilt},.035)`);
      g.addColorStop(1, `rgba(${this.pal.gilt},0)`);
      this.glow = g;
    }

    start() {
      if (still) {
        this.draw();
        return;
      }
      if (this.raf) return;
      this.last = performance.now();
      this.raf = requestAnimationFrame(this.frame);
    }

    stop() {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    }

    setStill() {
      this.stop();
      this.t = 3;
      this.splashed = true;
      this.ripples.length = 0;
      this.nodes.forEach((n) => (n.dx = n.dy = 0));
      this.draw();
    }

    drop(x, y, strength, gilt) {
      this.ripples.push({ x, y, t0: this.t, s: strength, gilt });
      if (this.ripples.length > 28) this.ripples.shift();
    }

    frame(now) {
      if (motionQuery.matches !== still) {
        this.raf = 0;
        request();
        return;
      }
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.t += dt;
      this.step(dt);
      this.draw();
      this.raf = requestAnimationFrame(this.frame);
    }

    step(dt) {
      const t = this.t;
      if (!this.splashed && t >= 0.9) {
        this.splashed = true;
        this.drop(this.cx, this.cy, 1.5, true);
        this.queued = [1.08, 1.32];
      }
      if (this.queued && this.queued.length && t >= this.queued[0]) {
        this.queued.shift();
        this.drop(this.cx, this.cy, 0.9, true);
      }
      if (t >= this.nextAmbient) {
        this.nextAmbient = t + (this.opts.ambient || 2.8);
        this.drop(this.cx, this.cy, 0.55, this.opts.palette === "night");
      }
      const speed = this.R * 0.36;
      this.ripples = this.ripples.filter((r) => (t - r.t0) * speed < this.R * 2.6);
      for (const n of this.nodes) {
        n.a += n.w * dt;
        const rr = this.R * n.ring;
        const x = this.cx + Math.cos(n.a) * rr;
        const y = this.cy + Math.sin(n.a) * rr;
        let tx = 0;
        let ty = 0;
        for (const r of this.ripples) {
          const age = t - r.t0;
          const k = 1 - clamp((age * speed) / (this.R * 2.6));
          const dx = x - r.x;
          const dy = y - r.y;
          const d = Math.hypot(dx, dy) || 1;
          const delta = d - age * speed;
          if (Math.abs(delta) > 40) continue;
          const push = Math.cos((delta / 40) * (Math.PI / 2)) * 9 * r.s * k;
          tx += (dx / d) * push;
          ty += (dy / d) * push;
        }
        n.dx += (tx - n.dx) * Math.min(1, dt * 9);
        n.dy += (ty - n.dy) * Math.min(1, dt * 9);
      }
    }

    draw() {
      const { ctx, w, h, cx, cy, R, pal, t } = this;
      if (!w) return;
      ctx.clearRect(0, 0, w, h);
      const show = (delay, dur = 0.8) => smooth(clamp((t - delay) / dur));

      // Depth: a warm glow where the drop lands.
      ctx.globalAlpha = show(0.9, 1.2);
      ctx.fillStyle = this.glow;
      ctx.fillRect(0, 0, w, h);

      // The three rings of the mark, turning very slowly.
      const ringA = show(1.0, 1.2);
      ctx.lineCap = "round";
      ctx.save();
      ctx.translate(cx, cy);
      ctx.globalAlpha = ringA;
      ctx.strokeStyle = `rgba(${pal.line},.42)`;
      ctx.lineWidth = 2.2 * this.scale;
      ctx.rotate(-0.35 + t * 0.02);
      ctx.beginPath();
      ctx.arc(0, 0, R * 0.36, 0, TAU * 0.76);
      ctx.stroke();
      ctx.rotate(-t * 0.02);
      ctx.lineWidth = 1.1;
      ctx.strokeStyle = `rgba(${pal.line},.2)`;
      ctx.beginPath();
      ctx.arc(0, 0, R * 0.62, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([2, 7]);
      ctx.strokeStyle = `rgba(${pal.line},.18)`;
      ctx.beginPath();
      ctx.arc(0, 0, R * 0.9, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      // Ripples, each from wherever its drop fell.
      const speed = R * 0.36;
      const ripples = still ? this.stillRipples() : this.ripples;
      for (const r of ripples) {
        const age = r.age != null ? r.age : t - r.t0;
        const rad = age * speed;
        if (rad <= 0) continue;
        const k = 1 - clamp(rad / (R * 2.6));
        const a = r.s * k * k * 0.55;
        if (a < 0.01) continue;
        ctx.globalAlpha = 1;
        ctx.strokeStyle = r.gilt ? `rgba(${pal.gilt},${a.toFixed(3)})` : `rgba(${pal.line},${(a * 0.8).toFixed(3)})`;
        ctx.lineWidth = 0.8 + 1.6 * k * r.s;
        ctx.beginPath();
        ctx.arc(r.x, r.y, rad, 0, TAU);
        ctx.stroke();
        if (rad > 18) {
          ctx.strokeStyle = r.gilt ? `rgba(${pal.gilt},${(a * 0.4).toFixed(3)})` : `rgba(${pal.line},${(a * 0.3).toFixed(3)})`;
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          ctx.arc(r.x, r.y, rad * 0.86, 0, TAU);
          ctx.stroke();
        }
      }

      // The people, in rings around you.
      const sc = this.scale;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      this.nodes.forEach((n, i) => {
        const appear = show(1.15 + n.ring * 0.45 + i * 0.04, 0.9);
        if (appear <= 0) return;
        const rr = R * n.ring;
        const x = cx + Math.cos(n.a) * rr + n.dx;
        const y = cy + Math.sin(n.a) * rr + n.dy;
        const far = n.ring > 0.8;
        const rad = (far ? 12 : n.ring > 0.5 ? 17 : 20) * sc * (0.6 + 0.4 * appear);
        ctx.globalAlpha = appear;
        ctx.fillStyle = far ? pal.discFar : pal.disc;
        ctx.strokeStyle = `rgba(${pal.line},${far ? 0.3 : 0.6})`;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(x, y, rad, 0, TAU);
        ctx.fill();
        ctx.stroke();
        if (n.ini) {
          ctx.fillStyle = far ? pal.inkFar : pal.ink;
          ctx.font = `600 ${Math.round((far ? 10.5 : 14) * sc)}px "Instrument Sans", system-ui, sans-serif`;
          ctx.fillText(n.ini, x, y + 0.5);
        }
        if (n.g) this.glyph(n.g, x + rad * 0.55, y - rad * 1.55, sc, n.v);
      });

      // You, at the center: the ring and the gilt drop.
      if (this.opts.center !== null && this.opts.showCenter !== false) {
        const landed = show(0.9, 0.5);
        ctx.globalAlpha = landed;
        ctx.strokeStyle = `rgba(${pal.line},.95)`;
        ctx.lineWidth = 3 * sc;
        ctx.beginPath();
        ctx.arc(cx, cy, R * 0.15 * (0.7 + 0.3 * landed), 0, TAU);
        ctx.stroke();
        ctx.fillStyle = `rgb(${pal.gilt})`;
        ctx.shadowColor = `rgba(${pal.gilt},.7)`;
        ctx.shadowBlur = 22;
        ctx.beginPath();
        ctx.arc(cx, cy, R * 0.062 * landed, 0, TAU);
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      // The drop, falling.
      if (!still && this.opts.intro && t < 0.9) {
        const k = t / 0.9;
        const y = lerp(-40, cy, k * k);
        ctx.globalAlpha = 1;
        const tail = ctx.createLinearGradient(cx, y - 90 * k, cx, y);
        tail.addColorStop(0, `rgba(${pal.gilt},0)`);
        tail.addColorStop(1, `rgba(${pal.gilt},.6)`);
        ctx.strokeStyle = tail;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cx, y - 90 * k);
        ctx.lineTo(cx, y);
        ctx.stroke();
        ctx.fillStyle = `rgb(${pal.gilt})`;
        ctx.beginPath();
        ctx.arc(cx, y, R * 0.04, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    stillRipples() {
      return [0.3, 0.62, 0.98, 1.4].map((f, i) => ({ x: this.cx, y: this.cy, age: (this.R * f) / (this.R * 0.36), s: 0.8 - i * 0.1, gilt: i === 0 }));
    }

    glyph(kind, x, y, sc, v) {
      const { ctx, pal } = this;
      const s = 0.85 * sc;
      if (kind.startsWith("flame") && FLAME) {
        ctx.save();
        ctx.translate(x - 12 * s, y - 12 * s);
        ctx.scale(s, s);
        ctx.lineWidth = 1.9;
        if (kind === "flame") {
          ctx.fillStyle = pal.vesperFill;
          ctx.fill(FLAME);
        } else if (kind === "flame-answered") {
          ctx.fillStyle = `rgb(${pal.gilt})`;
          ctx.fill(FLAME);
        } else {
          ctx.strokeStyle = pal.vesper;
          if (kind === "flame-quiet") ctx.setLineDash([2.5, 2.5]);
          ctx.stroke(FLAME);
          ctx.setLineDash([]);
        }
        ctx.restore();
      } else if (kind === "meter") {
        const [level, on] = v;
        ctx.fillStyle = "rgba(4,25,27,.85)";
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(x - 13 * s, y - 9 * s, 27 * s, 18 * s, 4 * s);
        else ctx.rect(x - 13 * s, y - 9 * s, 27 * s, 18 * s);
        ctx.fill();
        for (let i = 0; i < 5; i++) {
          const bh = (4 + i * 2) * s;
          ctx.fillStyle = i < on ? LEVEL[level] : "rgba(172,195,193,.28)";
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
        ctx.fillStyle = LEVEL.thriving;
        ctx.beginPath();
        ctx.arc(x, y, 2.6 * s, 0, TAU);
        ctx.fill();
      }
    }
  }

  const wells = [];
  const heroCanvas = $('[data-well="hero"]');
  if (heroCanvas && heroCanvas.getContext) {
    wells.push(
      new Well(heroCanvas, {
        palette: "leather",
        intro: !still,
        center: (w, h) =>
          w > 900
            ? { x: w * 0.7, y: h * 0.52, R: Math.min(h * 0.44, w * 0.3) }
            : { x: w * 0.56, y: h * 0.27, R: Math.min(w * 0.52, h * 0.25) },
        nodes: [
          { ring: 0.36, a: -90, w: 0.05, ini: "N", g: "flame-carrying" },
          { ring: 0.36, a: 30, w: 0.05, ini: "O" },
          { ring: 0.36, a: 150, w: 0.05, ini: "L", g: "flame-answered" },
          { ring: 0.62, a: -150, w: -0.034, ini: "T", g: "meter", v: ["watch", 3] },
          { ring: 0.62, a: -20, w: -0.034, ini: "G", g: "flame" },
          { ring: 0.62, a: 90, w: -0.034, ini: "S", g: "ring", v: 0.72 },
          { ring: 0.9, a: -95, w: 0.021, ini: "M" },
          { ring: 0.9, a: 140, w: 0.021, ini: "E" },
          { ring: 0.9, a: 35, w: 0.021, ini: "J" },
          { ring: 0.9, a: 200, w: 0.021, ini: "R" },
        ],
      })
    );
  }
  const ctaCanvas = $('[data-well="cta"]');
  if (ctaCanvas && ctaCanvas.getContext) {
    wells.push(
      new Well(ctaCanvas, {
        palette: "night",
        intro: false,
        dropOnEnter: true,
        showCenter: false,
        ambient: 3.4,
        center: (w, h) => ({ x: w / 2, y: h / 2, R: Math.min(w * 0.62, h * 0.5) }),
        nodes: [
          { ring: 0.9, a: -60, w: 0.014, ini: "G", g: "flame" },
          { ring: 0.9, a: 15, w: 0.014, ini: "S", g: "flame-carrying" },
          { ring: 0.9, a: 120, w: 0.014, ini: "O", g: "flame-quiet" },
          { ring: 0.9, a: 200, w: 0.014, ini: "L", g: "flame-answered" },
          { ring: 1.12, a: 250, w: -0.012, ini: "N", g: "flame" },
          { ring: 1.12, a: 70, w: -0.012, ini: "I", g: "flame-carrying" },
        ],
      })
    );
  }

  // Touch the water: a tap drops gold; a moving mouse leaves faint rings.
  const bindWater = (section, well) => {
    if (!section || !well) return;
    let lastAt = 0;
    let lx = -1e3;
    let ly = -1e3;
    const local = (e) => {
      const r = well.canvas.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top];
    };
    section.addEventListener("pointermove", (e) => {
      if (still || e.pointerType !== "mouse") return;
      const now = performance.now();
      const [x, y] = local(e);
      if (now - lastAt < 150 || Math.hypot(x - lx, y - ly) < 36) return;
      lastAt = now;
      lx = x;
      ly = y;
      well.drop(x, y, 0.32, false);
    });
    section.addEventListener("pointerdown", (e) => {
      if (still || e.target.closest("a, button")) return;
      const [x, y] = local(e);
      well.drop(x, y, 1.1, true);
    });
  };
  bindWater($(".hero"), wells[0]);
  bindWater($(".cta"), wells[1]);

  /* ── People: circles → tree → four modes ──────────────────────────── */

  const MODES = ["plan", "prep", "assess", "pray"];
  const STEP_AT = [0, 0.17, 0.34, 0.5, 0.66, 0.82];
  const MORPH = [0.09, 0.26];

  const PEOPLE = [
    { id: "me", kind: "me" },
    { id: "up", kind: "up", ini: "E", lbl: "Elders", parent: "me", plan: ["I report up", "Operating manual"], prep: ["Mon · 4d · ready", "good"], assess: ["solid", 4, "Solid"], pray: ["carrying 2 of 5", "carrying"] },
    { id: "w", kind: "team", ini: "W", lbl: "Worship team", dom: "#2D78BD", parent: "me", plan: ["Lead the room in worship", "Next · new vocalists"], prep: ["~Thu · 3d · prep due", "warm"], assess: ["watch", 3, "Watch"], pray: ["carrying 3 of 8", "fresh"] },
    { id: "s", kind: "team", ini: "S", lbl: "Student ministry", dom: "#2D78BD", parent: "me", plan: ["Every student known", "Next · spring retreat"], prep: ["Sun · 5d · ready", "good"], assess: ["thriving", 5, "Thriving"], pray: ["carrying 2 of 6", "carrying"] },
    { id: "p", kind: "team", ini: "P", lbl: "Product team", dom: "#7C3B8B", parent: "me", plan: ["Ship without heroics", "Next · on-call rota"], prep: ["6w · drifting", "hot"], assess: ["strained", 2, "Strained"], pray: ["gone quiet · 5w", "quiet"], lit: true },
    { id: "n", kind: "person", ini: "N", parent: "w", rr: ["thriving", 0.86, true], h: ["solid", 4], fl: "fresh" },
    { id: "t", kind: "person", ini: "T", parent: "w", rr: ["strained", 0.96, false], h: ["watch", 3] },
    { id: "g", kind: "person", ini: "G", parent: "w", rr: ["thriving", 0.72, true], h: ["solid", 4], fl: "fresh" },
    { id: "l", kind: "person", ini: "L", parent: "s", rr: ["solid", 0.3, false], h: ["thriving", 5] },
    { id: "i", kind: "person", ini: "I", parent: "s", rr: ["watch", 0.82, false], h: ["solid", 4], fl: "carrying" },
    { id: "o", kind: "person", ini: "O", parent: "p", rr: ["solid", 0.4, false], h: ["strained", 2], fl: "quiet", lit: true },
    { id: "a", kind: "person", ini: "A", parent: "p", rr: ["thriving", 0.64, true], h: ["solid", 4] },
  ];
  const CIRCLE_ANGLE = { up: -90, s: 0, p: 90, w: 180, n: 162, t: 180, g: 198, l: -13, i: 13, o: 78, a: 102 };

  function buildChart(svg) {
    const rings = svgEl("g", {}, svg);
    const ringEls = [
      svgEl("circle", { class: "sc-ring sc-ring--near", "stroke-dasharray": "1 0" }, rings),
      svgEl("circle", { class: "sc-ring" }, rings),
      svgEl("circle", { class: "sc-ring sc-ring--far" }, rings),
    ];
    const edges = svgEl("g", {}, svg);
    const nodesG = svgEl("g", {}, svg);
    const byId = {};
    const flame = (cls, x, y, s, parent) => {
      const g = svgEl("g", { transform: `translate(${x} ${y}) scale(${s})` }, parent);
      svgEl("use", { href: "#flame", class: `fl-${cls}` }, g);
      return g;
    };
    const meter = (level, on, x, y, parent) => {
      const g = svgEl("g", { transform: `translate(${x} ${y})` }, parent);
      for (let i = 0; i < 5; i++) {
        const h = 5 + i * 2.6;
        svgEl("rect", { x: i * 4.6, y: 16 - h, width: 3, height: h, rx: 1, class: i < on ? `c-${level}` : "bar-off" }, g);
      }
      return g;
    };
    for (const d of PEOPLE) {
      const g = svgEl("g", { class: `node node--${d.kind}${d.lit ? " is-lit" : ""}` }, nodesG);
      const node = { d, g, x: 0, y: 0 };
      byId[d.id] = node;
      if (d.kind === "me") {
        svgEl("circle", { r: 27, class: "disc" }, g);
        svgEl("text", { class: "ini", y: 1 }, g).textContent = "You";
        continue;
      }
      if (d.kind === "person") {
        svgEl("circle", { r: 19, class: "disc" }, g);
        svgEl("text", { class: "ini", y: 1 }, g).textContent = d.ini;
        const prep = svgEl("g", { class: "lay lay-prep" }, g);
        const C = TAU * 26;
        svgEl("circle", { r: 26, class: "rr-t" }, prep);
        svgEl("circle", { r: 26, class: `rr-a c-${d.rr[0]}`, fill: "none", "stroke-dasharray": `${(C * d.rr[1]).toFixed(1)} ${C.toFixed(1)}`, transform: "rotate(-90)" }, prep);
        if (d.rr[2]) svgEl("circle", { r: 5, cx: 18, cy: 18, class: "c-thriving" }, prep);
        const assess = svgEl("g", { class: "lay lay-assess" }, g);
        svgEl("circle", { r: 24, class: `halo c-${d.h[0]}`, fill: "none" }, assess);
        meter(d.h[0], d.h[1], 18, 12, assess);
        if (d.fl) flame(d.fl, 8, -40, 0.85, svgEl("g", { class: "lay lay-pray" }, g));
        continue;
      }
      // Teams, and the group above you.
      svgEl("rect", { x: -24, y: -24, width: 48, height: 48, rx: 13, class: "disc" }, g);
      svgEl("text", { class: "ini", y: 1 }, g).textContent = d.ini;
      if (d.dom) svgEl("rect", { x: -20, y: -20, width: 8, height: 8, rx: 2, fill: d.dom }, g);
      const up = d.kind === "up";
      // The group above you labels to its right, so the line down to you stays clear.
      const lx = up ? 36 : 0;
      const ly = (y) => (up ? y - 50 : y);
      svgEl("text", { class: "lbl", x: lx, y: ly(46) }, g).textContent = d.lbl;
      const plan = svgEl("g", { class: "lay lay-plan" }, g);
      const p1 = svgEl("text", { class: "sub", x: lx, y: ly(66) }, plan);
      p1.textContent = d.plan[0];
      p1.setAttribute("style", "font-family: var(--serif); font-style: italic; font-size: 14px; fill: var(--leather-fg)");
      svgEl("text", { class: "sub", x: lx, y: ly(84) }, plan).textContent = d.plan[1];
      const prep = svgEl("g", { class: "lay lay-prep" }, g);
      svgEl("text", { class: `sub sub--${d.prep[1]}`, x: lx, y: ly(66) }, prep).textContent = d.prep[0];
      const assess = svgEl("g", { class: "lay lay-assess" }, g);
      meter(d.assess[0], d.assess[1], 28, -22, assess);
      svgEl("text", { class: "sub", x: lx, y: ly(66) }, assess).textContent = d.assess[2];
      const pray = svgEl("g", { class: "lay lay-pray" }, g);
      flame(d.pray[1], up ? -48 : 18, -50, 0.95, pray);
      svgEl("text", { class: "sub", x: lx, y: ly(66) }, pray).textContent = d.pray[0];
    }
    const edgeEls = PEOPLE.filter((d) => d.parent).map((d) => ({
      from: byId[d.parent],
      to: byId[d.id],
      el: svgEl("path", { class: `sc-edge${d.kind === "up" ? " sc-edge--up" : ""}` }, edges),
    }));
    return { svg, rings: ringEls, ringsG: rings, edgesG: edges, edges: edgeEls, byId };
  }

  function chartLayouts(W, H) {
    const cx = W / 2;
    const cy = H / 2;
    const R = Math.min(W, H) / 2 - 46;
    const circles = { me: [cx, cy] };
    for (const id in CIRCLE_ANGLE) {
      const d = PEOPLE.find((p) => p.id === id);
      const r = d.kind === "person" ? R * 0.94 : R * 0.48;
      const a = (CIRCLE_ANGLE[id] * Math.PI) / 180;
      circles[id] = [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
    }
    const portrait = W / H < 0.95;
    const row = portrait ? [0.1, 0.27, 0.47, 0.83] : [0.11, 0.3, 0.5, 0.84];
    const cols = portrait ? [0.17, 0.5, 0.83] : [0.18, 0.5, 0.82];
    const gap = Math.min(76, W * (portrait ? 0.105 : 0.085));
    const tree = { up: [cx, H * row[0]], me: [cx, H * row[1]] };
    ["w", "s", "p"].forEach((id, i) => {
      tree[id] = [W * cols[i], H * row[2]];
      const kids = PEOPLE.filter((d) => d.parent === id);
      kids.forEach((k, j) => (tree[k.id] = [W * cols[i] + (j - (kids.length - 1) / 2) * gap, H * row[3]]));
    });
    return { circles, tree, ring: [R * 0.48, R * 0.94, R * 1.2], cx, cy };
  }

  const peopleVis = $("[data-modes]");
  const chartSvg = $("[data-chart]");
  const peoplePin = $('[data-pin="people"]');
  const steps = $$("[data-step]");
  const rail = $$("[data-rail] li");
  const tabs = $$("[data-mode-tab]");
  const treePanel = $("#tree-panel");
  let chart = null;
  let layout = null;
  let peopleState = { view: "", mode: "", step: -1, t: -1 };
  let manualMode = "plan";

  function sizeChart() {
    if (!chartSvg) return;
    const r = chartSvg.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const s = clamp(r.width / 760, 0.7, 1.1);
    const W = r.width / s;
    const H = r.height / s;
    chartSvg.setAttribute("viewBox", `0 0 ${W.toFixed(1)} ${H.toFixed(1)}`);
    layout = chartLayouts(W, H);
    chart.rings.forEach((c, i) => {
      c.setAttribute("cx", layout.cx);
      c.setAttribute("cy", layout.cy);
      c.setAttribute("r", layout.ring[i].toFixed(1));
    });
    peopleState.t = -1;
  }

  function placeChart(t) {
    if (!layout) return;
    const e = smooth(t);
    for (const id in chart.byId) {
      const n = chart.byId[id];
      const a = layout.circles[id];
      const b = layout.tree[id];
      // People travel on a slight arc rather than a straight line.
      const lift = Math.sin(e * Math.PI) * (n.d.kind === "person" ? 26 : 12);
      n.x = lerp(a[0], b[0], e);
      n.y = lerp(a[1], b[1], e) - lift;
      n.g.setAttribute("transform", `translate(${n.x.toFixed(1)} ${n.y.toFixed(1)})`);
    }
    chart.ringsG.style.opacity = (1 - e).toFixed(3);
    chart.edgesG.style.opacity = clamp((e - 0.55) / 0.45).toFixed(3);
    if (e > 0.5) {
      for (const ed of chart.edges) {
        const { from, to } = ed;
        const up = to.d.kind === "up";
        const y0 = up ? to.y + 26 : from.y + (from.d.kind === "me" ? 28 : 94);
        const y1 = up ? from.y - 28 : to.y - (to.d.kind === "person" ? 20 : 26);
        const x0 = up ? to.x : from.x;
        const x1 = up ? from.x : to.x;
        const mid = to.d.kind === "person" ? (y0 + y1) / 2 : (y0 + y1) / 2;
        ed.el.setAttribute("d", `M${x0.toFixed(1)} ${y0.toFixed(1)}V${mid.toFixed(1)}H${x1.toFixed(1)}V${y1.toFixed(1)}`);
      }
    }
  }

  function setMode(mode) {
    // mode is one of circles, tree, or one of the four.
    if (peopleVis) peopleVis.dataset.mode = mode;
    if (chartSvg) chartSvg.dataset.mode = mode;
    const sel = MODES.includes(mode) ? mode : manualMode;
    tabs.forEach((tab) => {
      const on = tab.dataset.modeTab === sel;
      tab.setAttribute("aria-selected", String(on));
      tab.tabIndex = on ? 0 : -1;
      if (on && treePanel) treePanel.setAttribute("aria-labelledby", tab.id);
    });
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
  }

  if (chartSvg && peopleVis) {
    chart = buildChart(chartSvg);
    sizeChart();
    if ("ResizeObserver" in window) new ResizeObserver(() => { sizeChart(); request(); }).observe(chartSvg);

    const choose = (mode, focusTab) => {
      if (focusTab) focusTab.focus({ preventScroll: true });
      if (still || !peoplePin) {
        manualMode = mode;
        peopleState.step = -1;
        paintPeople(0);
        return;
      }
      // Scroll is the source of truth while the sequence is pinned: go to where this mode lives.
      const i = 2 + MODES.indexOf(mode);
      const r = peoplePin.getBoundingClientRect();
      const travel = peoplePin.offsetHeight - window.innerHeight;
      const target = window.scrollY + r.top + (STEP_AT[i] + 0.06) * travel;
      manualMode = mode;
      window.scrollTo({ top: target, behavior: "smooth" });
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

    // The app's own keys: 1–4 pick a mode while the chart is on screen.
    let inView = false;
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(([e]) => (inView = e.isIntersecting), { threshold: 0.5 }).observe(peopleVis);
    }
    document.addEventListener("keydown", (e) => {
      if (!inView || e.metaKey || e.ctrlKey || e.altKey || !/^[1-4]$/.test(e.key)) return;
      const t = e.target;
      if (t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (peopleVis.contains(t)) return; // the tablist handles its own
      choose(MODES[Number(e.key) - 1]);
    });
  }

  /* ── Readiness: one week of a weekly 1:1 ──────────────────────────── */

  const dial = $("[data-dial]");
  const readyPin = $('[data-pin="ready"]');
  const DIAL_C = TAU * 124;
  const WINDOW_OPENS = 5; // max(2 days, 25% of 7) before the meeting
  let dialState = "";
  let dialDay = -1;
  const checks = $$("[data-checks] li");
  const dialOut = dial && {
    arc: $("[data-dial-arc]", dial),
    hand: $("[data-dial-hand]", dial),
    cd: $("[data-dial-cd]", dial),
    state: $("[data-dial-state]", dial),
    why: $("[data-dial-why]", dial),
  };
  if (dial) {
    const win = $(".dial__window", dial);
    win.setAttribute("stroke-dasharray", `${((DIAL_C * (7 - WINDOW_OPENS)) / 7).toFixed(2)} ${DIAL_C.toFixed(2)}`);
    win.setAttribute("stroke-dashoffset", (-(DIAL_C * WINDOW_OPENS) / 7).toFixed(2));
    const ticks = $("[data-dial-ticks]", dial);
    ["Thu", "Fri", "Sat", "Sun", "Mon", "Tue", "Wed"].forEach((day, k) => {
      const a = (k / 7) * TAU - Math.PI / 2;
      const c = Math.cos(a);
      const s = Math.sin(a);
      svgEl("line", { class: "dial__tick", x1: 160 + c * 102, y1: 160 + s * 102, x2: 160 + c * 108, y2: 160 + s * 108 }, ticks);
      svgEl("text", { class: "dial__day", x: (160 + c * 150).toFixed(1), y: (160 + s * 150).toFixed(1) }, ticks).textContent = day;
    });
  }

  function paintDial(p) {
    if (!dial) return;
    if (still) p = 1;
    const d = p * 7;
    dialOut.arc.setAttribute("stroke-dasharray", `${Math.max(0.1, p * DIAL_C).toFixed(1)} ${DIAL_C.toFixed(1)}`);
    dialOut.hand.setAttribute("transform", `rotate(${(p * 360).toFixed(2)} 160 160)`);
    const day = p >= 0.985 ? 7 : Math.floor(d);
    if (day !== dialDay) {
      dialDay = day;
      dialOut.cd.textContent = day >= 7 ? "Thu · today" : `~Thu · ${7 - day}d`;
    }
    let done = 0;
    checks.forEach((li) => {
      const on = d >= Number(li.dataset.at);
      li.classList.toggle("is-done", on);
      if (on) done++;
    });
    const state = d < 0.8 ? "loose" : d < WINDOW_OPENS ? "rest" : done === checks.length ? "ready" : "prep";
    const key = state + done;
    if (key !== dialState) {
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
  }

  /* ── Nightfall ────────────────────────────────────────────────────── */

  const nightPin = $('[data-pin="night"]');
  const nightSky = $("[data-night-sky]");
  const nightSun = $("[data-night-sun]");
  const nightCopy = $("[data-night-copy]");
  const nightHorizon = $("[data-night-horizon]");
  const nightGlint = $("[data-night-glint]");

  function paintNight(p) {
    if (!nightSky) return;
    if (still) {
      nightSky.style.opacity = "";
      nightSky.style.removeProperty("--dusk");
      nightCopy.style.opacity = "";
      nightCopy.style.transform = "";
      return;
    }
    nightSky.style.opacity = clamp(p / 0.4).toFixed(3);
    nightSky.style.setProperty("--dusk", (1 - clamp((p - 0.3) / 0.4)).toFixed(3));
    // The sun sets behind the water line; its glint on the water thins as it goes.
    const set = clamp(p / 0.62);
    nightSun.style.transform = `translate3d(0, ${(set * window.innerHeight * 0.5).toFixed(1)}px, 0)`;
    nightGlint.style.opacity = (0.9 * (1 - set)).toFixed(3);
    nightGlint.style.transform = `scaleY(${(1 - set * 0.7).toFixed(3)})`;
    nightHorizon.style.opacity = Math.min(clamp(p / 0.2), 1 - clamp((p - 0.6) / 0.25)).toFixed(3);
    const c = clamp((p - 0.5) / 0.22);
    nightCopy.style.opacity = c.toFixed(3);
    nightCopy.style.transform = `translate3d(0, ${((1 - c) * 36).toFixed(1)}px, 0)`;
  }

  /* ── The page's clock ─────────────────────────────────────────────── */

  const clock = $("[data-clock]");
  const clockTime = $("[data-clock-time]");
  const hourSections = $$("[data-hour]");
  const toMin = (s) => {
    const [h, m] = s.split(":").map(Number);
    return h * 60 + m;
  };
  let chapters = [];
  let lastMinute = -1;
  function measureChapters() {
    const y = window.scrollY;
    chapters = hourSections.map((el, i) => {
      const r = el.getBoundingClientRect();
      const h0 = toMin(el.dataset.hour);
      const next = hourSections[i + 1];
      const h1 = "hold" in el.dataset ? h0 : el.dataset.hourEnd ? toMin(el.dataset.hourEnd) : next ? toMin(next.dataset.hour) : h0 + 30;
      return { top: r.top + y, height: r.height, h0, h1 };
    });
  }
  function paintClock(y) {
    if (!clock || !chapters.length) return;
    const probe = y + window.innerHeight * 0.35;
    let c = chapters[0];
    for (const ch of chapters) if (probe >= ch.top) c = ch;
    const m = Math.round(lerp(c.h0, c.h1, clamp((probe - c.top) / c.height)));
    if (m === lastMinute) return;
    lastMinute = m;
    clockTime.textContent = `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
    clock.classList.toggle("is-night", m >= 19 * 60 + 50);
  }

  /* ── Scroll-driven work, batched into one frame ───────────────────── */

  const top = $("[data-top]");
  const hero = $(".hero");
  const heroWell = $("[data-hero-well]");
  const heroCopy = $("[data-hero-copy]");
  const floaters = $$("[data-depth-y]");
  const pinProgress = (pin) => {
    if (!pin) return 0;
    const r = pin.getBoundingClientRect();
    const travel = r.height - window.innerHeight;
    return travel > 0 ? clamp(-r.top / travel) : 1;
  };

  let ticking = false;
  function paint() {
    ticking = false;
    syncMotion();
    const y = window.scrollY;
    const vh = window.innerHeight;
    if (top && hero) top.classList.toggle("is-solid", y > hero.offsetHeight - 90);
    paintClock(y);
    paintPeople(pinProgress(peoplePin));
    paintDial(pinProgress(readyPin));
    paintNight(pinProgress(nightPin));
    if (still) return;

    if (hero && y < hero.offsetHeight * 1.2) {
      // Looking down into the well, then the surface tips away as you leave.
      const p = clamp(y / hero.offsetHeight);
      if (heroWell) heroWell.style.transform = `perspective(1100px) rotateX(${(p * 42).toFixed(2)}deg) scale(${(1 + p * 0.14).toFixed(3)})`;
      if (heroCopy) {
        heroCopy.style.transform = `translate3d(0, ${(p * -90).toFixed(1)}px, 0)`;
        heroCopy.style.opacity = (1 - clamp((p - 0.25) / 0.6)).toFixed(3);
      }
    }
    for (const el of floaters) {
      const r = el.getBoundingClientRect();
      if (r.bottom < -200 || r.top > vh + 200) continue;
      const offset = r.top + r.height / 2 - vh / 2;
      el.style.transform = `translate3d(0, ${(offset * Number(el.dataset.depthY)).toFixed(1)}px, 0)`;
    }
  }
  function request() {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(paint);
    }
  }
  window.addEventListener("scroll", request, { passive: true });
  window.addEventListener("resize", () => {
    measureChapters();
    request();
  });
  window.addEventListener("load", () => {
    measureChapters();
    request();
  });
  if ("ResizeObserver" in window) new ResizeObserver(() => measureChapters()).observe(document.body);
  measureChapters();
  paint();

  // `matches` is live: a mid-visit switch to reduced motion (or back) is
  // honored on the next frame that paints, from a scroll or a canvas.
  function syncMotion() {
    if (motionQuery.matches === still) return;
    still = motionQuery.matches;
    root.classList.toggle("motion", !still);
    if (still) {
      [heroWell, heroCopy, nightSun, ...floaters].forEach((el) => el && (el.style.transform = ""));
      if (heroCopy) heroCopy.style.opacity = "";
      wells.forEach((w) => w.setStill());
    } else {
      wells.forEach((w) => w.visible && w.start());
    }
    peopleState = { view: "", mode: "", step: -1, t: -1 };
    dialState = "";
    sizeChart();
    measureChapters();
    request();
  }

  /* ── Profile card: a small tilt toward the pointer ────────────────── */

  const tilt = $("[data-tilt]");
  if (tilt && window.matchMedia("(pointer: fine)").matches) {
    tilt.addEventListener("pointermove", (e) => {
      if (still || !tilt.classList.contains("is-in")) return;
      const r = tilt.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const yy = (e.clientY - r.top) / r.height - 0.5;
      tilt.style.transition = "transform .25s var(--ease)";
      tilt.style.transform = `perspective(900px) rotateX(${(yy * -6).toFixed(2)}deg) rotateY(${(x * 8).toFixed(2)}deg)`;
    });
    tilt.addEventListener("pointerleave", () => (tilt.style.transform = ""));
  }

  /* ── Health: the scan dims, it never hides ────────────────────────── */

  const scan = $("[data-scan]");
  if (scan) {
    const field = $("[data-scan-field]", scan);
    const note = $("[data-scan-note]", scan);
    const buttons = $$("[data-scan-level]", scan);
    const label = { thriving: "Thriving", solid: "Solid", watch: "Watch", strained: "Strained" };
    const say = (level) => {
      if (!level) return "No level picked: everything is lit.";
      const nameOf = (li) => Array.from(li.childNodes).filter((n) => n.nodeType === 3).map((n) => n.textContent).join("").trim();
      const lit = $$(`li[data-h="${level}"]`, field).map(nameOf);
      const names = lit.length > 1 ? `${lit.slice(0, -1).join(", ")} and ${lit[lit.length - 1]}` : lit[0];
      return `${label[level]}: ${names} stay lit. Everything else dims, but nothing is hidden.`;
    };
    buttons.forEach((b) =>
      b.addEventListener("click", () => {
        const level = b.dataset.scanLevel;
        const on = b.getAttribute("aria-pressed") !== "true";
        buttons.forEach((o) => o.setAttribute("aria-pressed", String(o === b && on)));
        if (on) field.dataset.active = level;
        else delete field.dataset.active;
        note.textContent = say(on ? level : null);
      })
    );
  }

  /* ── Capture: the #tag @meeting ! grammar, typed out ──────────────── */

  const typer = $("[data-typer]");
  if (typer) {
    const out = $("[data-typer-out]", typer);
    const TEXT = "Rota for Advent #training @staff-meeting !";
    const esc = (s) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
    const render = (s) =>
      esc(s)
        .replace(/(#[\w-]+)/g, '<span class="tok tok--tag">$1</span>')
        .replace(/(@[\w-]+)/g, '<span class="tok tok--at">$1</span>')
        .replace(/(\s)!$/, '$1<span class="tok tok--bang">!</span>');

    const type = () => {
      if (still) {
        out.innerHTML = render(TEXT);
        return;
      }
      let n = 0;
      const step = () => {
        if (still) {
          out.innerHTML = render(TEXT);
          return;
        }
        n += 1;
        out.innerHTML = render(TEXT.slice(0, n));
        if (n < TEXT.length) setTimeout(step, TEXT[n - 1] === " " ? 110 : 45 + Math.random() * 50);
        else setTimeout(() => ((n = 0), setTimeout(step, 600)), 3800);
      };
      step();
    };

    if (still || !("IntersectionObserver" in window)) {
      out.innerHTML = render(TEXT);
    } else {
      const io = new IntersectionObserver(([e]) => {
        if (e.isIntersecting) {
          io.disconnect();
          type();
        }
      }, { threshold: 0.5 });
      io.observe(typer);
    }
  }
})();
