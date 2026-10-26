# Polarch — brand (Direction B · Fixed Point)

## Idea
Polarch is the fixed point a team steers by: a lowercase **p** that holds one solid star in its counter. Calm warm-neutral grounds and a single terracotta point make it feel like a steady, modern tool: warm, not loud.

## Mark rules
- The mark is the p with the point centred in its counter. The point is always **Star `#CC5533`**, on light or dark. Never recolour it to another hue.
- One colour: `mark-mono.svg` (the point takes the ink colour). Use it on photos, embossing and anywhere only one ink is available.
- **One star per lockup.** In `lockup-horizontal` the tile carries the point and the wordmark's p stays open. On its own, `wordmark.svg` carries the point in its p.
- Proportions (64 grid): stem 8, bowl r 18, ring 8, counter r 10, **point r 5.5** (diameter 11, 55 % of the counter). Tuned at 16, 32 and 1024 px (see `proofs/dot-tuning.png`).
- ≤ 48 px: use the **small master** (`mark-small.svg`). It is re-hinted for each size so every edge lands on a whole pixel (2 px stem and ring at 16 px, 2 px point, 2 px clear).

## Clear space & minimum size
- Clear space = **one point diameter** (the dot, ⌀) on all sides of the mark; for the wordmark and lockup, use the wordmark's x-height.
- Minimum size: mark 16 px (small master below 48 px). Wordmark 72 px wide / 18 px tall. Lockup 120 px wide.

## Palette
| Token | Light | Dark |
|---|---|---|
| bg | Daylight `#F7F6F4` | Night `#181615` |
| surface | White `#FFFFFF` | Night Surface `#221F1D` |
| text | Charcoal `#22201E`: 15.03:1 | Pale `#F1EFEC`: 15.71:1 |
| text-muted | Ash `#67615C`: 5.65:1 | Ash Dark `#A39D97`: 6.72:1 |
| primary (links, buttons) | Clay `#B04528`: 5.22:1 | Ember `#EC7C58`: 6.52:1 |
| primary-contrast | White on Clay: 5.63:1 | Night on Ember: 6.52:1 |
| accent (the star, non-text) | Star `#CC5533`: 3.96:1 | Star `#CC5533`: 4.22:1 |
| border / border-strong | `#E3E0DC` decorative / `#8E8882`: 3.24:1 | `#3A3633` decorative / `#77716B`: 3.74:1 |

Terracotta is the only hue. Clay and Ember are the Star darkened and lightened so it can carry text at AA. The Star itself is reserved for the point and other non-text accents (≥ 3:1 on both grounds). Every text pairing is ≥ 4.5:1; the full table is in `contrast.md`. App icon backgrounds: Daylight (default) or Night (option).

## Type
- **Manrope** (700 / 650) for display and headings, tracked −1 % to −2 %.
- **Wordmark** is drawn, not typeset. It takes Manrope 640's stem weight and o height, then uses circular bowls, a single-storey a and round terminals on r and c, all to match the p. Use the SVG.
- **DM Sans** (400 / 500 / 600) for UI and body text. I kept DM Sans rather than using Manrope everywhere because its open apertures, slightly narrower set and optical-size axis read better at 12–14 px, and it stays in the same geometric family. No serif display type.
- Scale (size/line-height): display 48/56, h1 32/40, h2 24/32, h3 20/28, body-lg 18/28, body 16/24, body-sm 14/20, label 14/20 600, caption 12/16. Defined in `tokens.css` / `tokens.json`.

## Don'ts
- Don't use a second accent hue, gradients or glows on the point. Don't make it a sparkle or a 4-point star.
- Don't put the Star on Clay or Ember, and don't set body text in Star.
- Don't repeat the point (tile + dotted wordmark p) in one lockup.
- Don't stretch, outline, rotate or re-space the wordmark. Don't retype it in live Manrope, because the a and r are drawn.
- Don't use cream/parchment grounds or ink-brown text; Polarch is warm-neutral and charcoal.
- Don't pre-round iOS icons. Don't scale the 1024 master down below 48 px; use the small master.
