# Critique: revision 3 against SOTD-REVIEW-R2

> "It must be beautiful enough to win an Awwwards Site of the Day: Awwwards SOTD-caliber, with cutting-edge motion and graphics, a distinctive concept, and polished scroll choreography, while staying performant and accessible."

Round 2 failed narrowly: a 7.6 average, with creativity at 7.6. The review gave three reasons:
- The water went quiet through the afternoon, exactly where the product story is told.
- Startup had long tasks of 348 ms and 221 ms.
- The Nightfall headline washed out over the sun, the eyebrow hour disagreed with the header clock, and hero nodes N and T touched the headline.

This revision fixes those four things in place. The file layout, the inline signed-in/OAuth redirect script, the four CTA hrefs and the reduced-transparency rule on the ⌘K palette are unchanged.

**How it was measured.** Everything here was measured locally: headless Chromium with SwiftShader (software WebGL), served gzipped with `/landing/` as the root, and a 4× CPU slowdown wherever a phone is implied. Round 2 numbers marked *(R2, local)* were re-measured the same way on a saved copy of the round-2 files, so each before/after pair comes from the same machine. Nothing was measured on a real GPU (see Skipped).

## 1. The water stays alive through the afternoon

**Cards at 86–90% opacity.** The paper surfaces are now `rgba(251,252,252,.88)`:
- Today's app window, the profile card, the Leading-up sheets, and the Ideas / Plan / Run columns (`.86`).
- The gilt sheet uses a gradient at .88–.90.

The water's light and every ring show faintly through what you read. Under `prefers-reduced-transparency: reduce` the cards go solid again. The existing rule that removes the ⌘K palette's backdrop blur is untouched.

**Stronger light between the cards.** The light-chapter palettes (morning, late morning, noon, afternoon, late) were reworked:
- Each chapter's water now sits a shade below its paper (for example, afternoon `#dfe5da` under a `#f0f2ec` page), so the caustics brighten toward white against it.
- Caustic strength rose from 0.85 to 1.0–1.1, ripple lighting from 0.5 to 0.9–0.95, and the sun's light pool from 0.14–0.2 to 0.24–0.34.
- The chapter background colours that the header samples didn't change.

**Product actions touch the water.**
- **Chip landings.** In Ideas → Plan → Run, every chip landing sends one ring from where it lands: into the idea list, onto the week's cell, and into Thursday's agenda.
- **⌘K re-ranks.** Every time the top four results change order, one ring goes out from the row now on top.
- **Measured:** a forward scroll through the pin gives 6 rings for 6 landings, at both 1440 and 390. A forward scroll through ⌘K gives 4 rings for the 4 re-ranks ("r", "ro", "roa", "roadm"). Scrolling back and crossing a landing again counts as a new landing.

**Measured in the water's own pixels.** Each frame was masked to exclude cards, text and the header, leaving only the water, at 1440:

| Frame | Pixels > ΔE 3 from the median, R2 (local) → now | Change over 0.5 s, R2 → now (mean \|Δ\|, 0–255) |
|---|---|---|
| Meetings, mid-pin | 0.3% → **10.0%** | 1.18 → 1.46 |
| Ideas → Plan → Run, 30% | 6.9% → **21.7%** | 1.20 → 1.44 |
| Ideas → Plan → Run, 60% | 6.8% → **29.8%** | 1.18 → **4.54** (rings) |
| Ideas → Plan → Run, 90% | 6.6% → **32.6%** | 1.19 → **4.28** |
| Profiles | 8.5% → **13.0%** | 1.17 → 1.64 |
| Leading up | 51.4% → 69.4% | 1.28 → **3.07** |
| ⌘K | 59.2% → 56.7% | 1.24 → **2.38** |

The weakest afternoon frame went from 0.3% to 10% visible water (review target ≥ 6%). About 1.2 of the "change" figure is the shader's dither, which is present in both builds.

**Cost.** On SwiftShader, every live ring costs every pixel. Two changes keep that in check:
- Rings retire at 4.5 s, when they are down to about a tenth of their strength (was 7 s).
- Inside the shader, a ring's maths is skipped more than 200 px from its band.

Scroll frame timing (QA's wheel method, headless SwiftShader):

| Width | Median | p95 | Frames over 34 ms |
|---|---|---|---|
| 390 | 16.7 ms | 16.7–16.8 ms | 0 |
| 1440, now | 16.7 ms | 16.8 ms in one run, 33.3 ms in another | 0 |
| 1440, R2 (local) | 16.7 ms | 16.8 ms | 0 |

The extra cost at 1440 is GPU time inside SwiftShader from Nightfall onward; the main thread's JS, layout and paint match round 2. It's real on a software renderer and has to be checked on a GPU.

## 2. Landing-side performance: no startup task over 50 ms

A trace showed the round-2 long tasks weren't shader compiles:
- The 290 ms task was **the first layout of the whole 16,000 px page**, forced inside `landing.js`'s own evaluation.
- The ~140 ms task was the same full layout again when `landing.css` swapped in.

What changed:
- **One chapter laid out per task.** Below the hero, chapters start as `content-visibility: auto`. The chapter right under the hero holds its content with `display: none`, because `auto` would lay it out with the first screen. Once the stylesheet and fonts are in (capped at 1.5 s, or at the first scroll, whichever is first), `landing.js` lays out one chapter per task, then measures the page once.
  - The worst chapter at 390 is ⌘K, at 44 ms under 4× CPU.
  - I tried `content-visibility: hidden` first and dropped it. Chrome reports a hidden element's first reveal as a full-viewport layout shift, which scored CLS 5.
- **No forced layout in the parser's task.** `landing.js` now only compiles there, and sets up in the next task. The things that forced a layout during evaluation are gone: `innerWidth`/`innerHeight` at module top, an early `document.fonts.ready` read, and sizing the hero canvas. The hero is sized and drawn after the first frame.
- **Shorter font stacks.** About 48 ms of the first layout was Linux FontConfig looking up fallbacks that aren't installed ("Iowan Old Style", "-apple-system", "Segoe UI", "Menlo"). The stacks are now the self-hosted face plus a generic family.
- **WebGL in three steps, none blocking.**
  1. Create the context.
  2. In the next task, request `KHR_parallel_shader_compile` *before* `compileShader`/`linkProgram`.
  3. Poll `COMPLETION_STATUS_KHR` once per frame without blocking.

  When the link finishes, one draw goes into an off-screen 1×1 RGB framebuffer, so a software renderer builds its routine off the main thread; the first visible frame comes about 180 ms later.
- **Cheaper hero canvas on phones.** On phones the hero canvas stops just below the well, which is about half the pixels to hand over each frame. Its glow is a gradient instead of a per-frame `shadowBlur`.

**Long-task observer.** `PerformanceObserver({type: 'longtask'})`, 390×844 at DPR 2, 4× CPU, 9 s after navigation:

| | Tasks over 50 ms |
|---|---|
| R2 (local) | 275–292, 126–146, 57–68, 52–57, 88–96 ms (four to five per load) |
| Now, 6 clean runs | first frame 0–52 ms (absent in 4 runs, 51–52 ms in 2), plus one 67–76 ms task when the water first appears |
| Now, runs on a loaded machine | the first frame reached 58–101 ms and the water reveal 94–112 ms |

**What's still over 50 ms, honestly:**
1. **The first frame (51–52 ms when present).** This is the browser laying out the hero and header, and about 30 ms of it is per-font Linux FontConfig IPC. No script runs in it.
2. **The first visible water frame (67–76 ms).** All of it is in `Commit`: the main thread waits for SwiftShader to read the WebGL canvas back for the software compositor. Neither an RGB prime nor a full-size prime moved it, so it's the compositor's first readback, which hardware compositing doesn't do.

Every task that runs page script is now under 50 ms. These two remain over it, and only a real-GPU trace can show whether the second exists at all on a phone.

**Lighthouse** (mobile, simulated slow 4G and 4× CPU, direct `/landing/`):

| | Perf | A11y | BP | SEO | LCP | TBT | CLS |
|---|---|---|---|---|---|---|---|
| Now, run 1 | **99** | 100 | 100 | 100 | 1.95 s | 95 ms | 0.015 |
| Now, run 2 | **99** | 100 | 100 | 100 | 1.95 s | 74 ms | 0.015 |
| Now, run 3 | **99** | 100 | 100 | 100 | 1.95 s | 77 ms | 0.015 |
| Desktop | 100 | 100 | 100 | 100 | 0.44 s | 0 ms | 0.028 |

- Lighthouse's own simulated long-task list went from 329 + 197 + 72 + 55 + 52 ms (R2) to 146 + 100 + 54 ms. That list multiplies observed tasks by 4; the 146 is the water-reveal GPU wait and the 100 is the first paint.
- CLS is unchanged from R2 (0.015 mobile, 0.045 at 1440 in a 4 s window); both are the hero's web-font swap.
- Weight: JS is 29.0 KB gzipped (was 24.8), CSS 11.0 KB, HTML 20.8 KB. No new requests.

## 3. Nightfall: legible in every frame, and one clock

**The headline never fades.**
- The opacity fade-in is gone. The headline's words rise into place at full strength (the same masked word-rise as the other headings) while the chapter scrolls in.
- A dusk scrim sits behind the copy. `landing.js` deepens it while the sun is up (to 0.92) and thins it to 0.42 once the stars are out, so they still show.
- The sun is capped: its centre never climbs above `headline bottom + 18 px + 1.9 radii`.
- To make room, the horizon moved from 62% to 66% of the screen, the sun's radius went from 7.5% to 6.2% of the short side, and the headline went from `clamp(34px, 5.4vw, 76px)` to `clamp(32px, 4.2vw, 60px)`. On a phone the moon rises no higher than 30 px under the headline.
- The em line is a lighter vesper (`#d9cffb`) and the eyebrow `#dcd6f0`.

**Measured.** In each of 21 pinned frames (p = 0, 0.05 … 1), I screenshotted the background with the copy's text hidden and the scrim kept. I then compared the 95th-percentile background luminance under every word box against that word's effective colour, ignoring the text shadow:

| Width | Worst contrast in any frame |
|---|---|
| 1440 | **6.28:1** |
| 390 | **5.62:1** |
| 768 | **10.26:1** |
| 1920 | **8.04:1** |

The same test on R2 at 1440 found the copy invisible until p 0.5, then **1.06 → 1.38 → 2.72:1** while it faded in over the sun (p 0.55–0.65); that's the reviewer's f029.

**One clock source.** The header pill and every eyebrow (`.eyebrow__t`) now read the same `clockAt(scrollY)`:
- Each eyebrow is a stop. The clock reaches a stop's hour as its eyebrow comes fully on screen, holds there until the previous eyebrow has gone under the header, then runs to the stop's end hour: the next stop's, or the chapter's `data-hour-end`.
- An eyebrow that has been passed but is still on screen shows up to the next stop's hour, so it reads what the header does.
- Nightfall's static "21:00" became a live 19:40 → 21:20.
- People's eyebrow is hidden on phones, so its stop is placed where that chapter takes the screen.

**Measured:** every visible eyebrow equalled the header clock in all sampled frames:

| Check | Frames | Mismatches |
|---|---|---|
| Quarter-viewport steps at 390, 768, 1024, 1440 and 1920 | 378 | **0** |
| Nightfall's 21 pinned frames at each of 4 widths | 84 | **0** |
| R2, Nightfall pin at 1440 | 21 | 21 ("21:00" against 19:57–20:47) |

Reduced motion shows 20:50 on both.

## 4. Collisions

**Hero keep-out zones.**
- Each line of hero copy is a zone padded by 24 px: the eyebrow, the h1 (including the *well.* lettering), the lede, the buttons, the note and the caption. Across, a zone spans only the inked extent, so a full-width row doesn't blank the well.
- A node or its glyph drifting toward a zone dips under the water: it shrinks and fades to nothing before reaching the zone, and resurfaces past it.
- The zones move with the copy's parallax.

**Test.** A scripted bounding-box test uses Playwright's fake clock to run one full orbit of the slowest ring (320 s, 1,000 samples), with every node's circle and glyph checked against the copy's inked rects at six widths:

| Width | Overlaps | Closest approach to the h1 | Nodes that surface |
|---|---|---|---|
| 390 | **0** | 24.5 px | all 10 |
| 768 | **0** | 41.5 px | all 10 |
| 1024 | **0** | 23.4 px | all 10 |
| 1280 | **0** | 23.5 px | all 10 |
| 1440 | **0** | 23.4 px | all 10 |
| 1920 | **0** | 23.9 px | all 10 |

Every node still surfaces somewhere on its orbit. The closest approach to any other copy zone is 23.2 px (the caption at 390), so nothing touches. At 1440, N and T now dip under the water as they pass "for" and "people".

**Chips fade in only once mostly grown.**
- A flying chip never shrinks below 0.6 and is never partly transparent. It lands on its week's cell at 0.6 and drops into it: the cell fills and the water rings.
- For the Run agenda, it comes back out of the cell whole, at 0.6, and grows to full size.
- Measured with axe colour-contrast at 41 points through the pin at 390: R2 (local) had **3** hits (p 0.525, 0.625, 0.675); now **0**.

**No text overlaps.**

| Check | Result |
|---|---|
| Text line boxes from Range rects, clipped by overflow ancestors, checked against text in other blocks and against the two lettering SVGs; widths 390, 768, 1024, 1440, 1920; every half viewport | **0 overlaps, 0 clipped** |
| Same test on R2 | 0 |
| "One quiet place." at 390 and 1440 once drawn | 20 px above the paragraph, not clipped |
| axe (WCAG 2.2 AA plus best practice), 10 scroll positions each, at 390 and 1440, with motion and reduced | **0** |
| Reduced motion | 0 running animations |
| Sideways scroll | none |
| Console errors | none. The only output is SwiftShader's "GPU stall due to ReadPixels" driver warning, which R2 logs too. |

Item 4's text test was already clean in R2, so the collisions it fixes are the hero nodes and the flying chips.

## Skipped, and why

- **Real-GPU traces** (punch item 5): there is no M-series laptop or Pixel-6a-class phone here. Every frame and GPU number above is SwiftShader. The two over-50 ms tasks that remain and the 1440 p95 both live in the GPU wait, so they are exactly what a real trace has to settle.
- **Real app clips** (item 6): there's no demo account, and I won't fake footage. The spec is unchanged: Run and ⌘K, 6–8 s each, under 600 KB, `muted playsinline` with a poster, started by IntersectionObserver, nothing autoplaying under reduced motion.
- **Serving `/landing/` at "/" for signed-out visitors** (the 264 KB SPA bundle the review measured on the root): that is a Vercel rewrite or middleware in the repo, outside `./build`, and `./repo` is not to be modified. `INTEGRATION.md` still says to serve `/landing/index.html` at `/`. Until that's done, the root URL will keep scoring below these direct-URL numbers.

## Honest re-score (SOTD-REVIEW-R2 rubric)

| Criterion | R2 jury | Now | Why |
|---|---|---|---|
| **Design** | 7.6 | **7.9** | The middle third finally sits on lit, moving water instead of white-on-cream. The hero breathes around its type, and the Nightfall sun now lives under the headline instead of through it. Still short of a clean 8: the scrim reads as a visible dark halo around the copy in the sun frames, and the afternoon water is still subtle next to the night chapters. |
| **Usability** | 7.8 | **8.2** | Direct-URL mobile Lighthouse is 99/100/100/100 with LCP 1.95 s, TBT 74–95 ms and CLS 0.015. No task running page script exceeds 50 ms. Still 0 axe violations, now including mid-flight chips. Held back by the root route, which isn't fixed from here, the two GPU-wait tasks, and a 1440 SwiftShader p95 that varies between 16.8 and 33.3 ms. |
| **Creativity** | 7.6 | **7.8** | The concept and the product finally touch: a chip dropping onto a week and a search re-ranking both ring the same water the day is drawn on. That's the link the review asked for. The choreography under it (FLIP chips, a re-ranking list) is still familiar, the lettering is still adapted from Newsreader, and there is still no real footage. |
| **Content** | 7.5 | **7.7** | One clock: the eyebrows and the header now agree everywhere, and Nightfall's hour moves with the sunset instead of contradicting it. The copy didn't change otherwise. |
| **Average** | **7.6** | **7.9** | |

**Verdict:** this clears the ~7.5 average more comfortably, and every one of the four punch items has a measurement attached. I'm scoring creativity at 7.8 rather than 8, so by the review's own bar this is still a borderline SOTD rather than a safe one. What would move it is outside this round:
- a commissioned hand-drawn *well.*;
- the two real captures;
- a real-GPU recording for the jury instead of SwiftShader stills.
