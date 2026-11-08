# Marble pricing — UI component

**[Live demo](https://domvybe.com/components/marble-pricing/)** · [Step-by-step tutorial](https://domvybe.com/library/marble-pricing/) · [Download the ZIP](https://github.com/UlviShabanbayli/domvybe-marble-pricing/releases/latest/download/marble-pricing-source.zip)

Pricing cards cut from polished black marble: choose a plan and its gold veins light up from where you pressed, a light rakes across the stone, and the prices roll like an odometer.

Open `index.html` through any local static server (for example `python3 -m http.server`) and try it with a mouse,
a finger or the keyboard. Plain HTML, CSS and JavaScript; no build step, no libraries.

- `index.html` — the pricing page: the skip link, the nav, the eyebrow, the headline, the Monthly and Yearly radios with the sliding thumb, the stage (the spill, the canvas, the plan radiogroup, the phone arrows and dots), the announcer, the status line, the footer line, the caption, the plan template (tag, name, price, features, the trial button and its error line), and a pre-paint script (old keys, ?nofx)
- `css` — marble.css: the desktop frame on the 1600 x 1000 grid scaled by --u, the slabs drawn in card units, the billing switch, the button states, the frosted CSS slabs without WebGL, the phone and short-landscape layout with the swipeable row, reduced motion
- `js` — app.js (the plans and prices, billing, the odometer roll, the plan radiogroup and its keys, the slab springs, the phone swipe, the trial button, the stored choice, the scheduler that idles and sleeps), stone.js (the marble baked once per layout and the one shader that lights it: polish, raking light, gold veins, ignition and flare), gl.js (the WebGL helper)

Plinth and its prices are made up (Studio, Practice and Atelier at $19, $49 and $99 a month billed yearly, $24, $61 and
$124 monthly), and the page sends nothing: the trial button simulates a request, so put your own in `js/app.js`, where
the plans are data. Everything is made in code: the marble (the smoky clouds, the white calcite veins, the gold vein) is
baked once per layout by a WebGL shader, and one more draw lights all three slabs (the polish, the raking light, the
bevel, the gold that ignites from your press, the success flare); every word, price and button is HTML; no AI pictures.
The plans are a real radio group with arrow keys, and on a phone the slabs are a swipeable row with arrows and dots.
Only `dv82.v1.plan` and `dv82.v1.billing` are kept in `localStorage`. The light runs while something moves, idles at
30 fps, then sleeps. Without WebGL (or with `?nofx`, or when the context is lost) the slabs are frosted CSS.
`?current=studio|practice|atelier` marks the current plan, `?fail` shows a failed request and `?fast` a quick one. The
page reads Google Fonts (Cinzel, Cormorant Garamond, Inter).

It respects `prefers-reduced-motion`. Made by Ulvi (Code with Ulvi) · domvybe.com

## Licence

MIT — see [LICENSE](LICENSE). Use it in your own projects, commercial ones included.
