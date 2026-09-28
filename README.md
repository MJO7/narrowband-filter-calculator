# Narrowband filter calculator

A browser-based calculator for comparing modeled Hα, OIII, and SII transmission through Antlia Standard and Highspeed 3 nm filters. Optical presets include the CarbonStar 150 at f/4, with its 0.95× PRCC at f/3.8, and with the APM 1.5× coma-correcting Barlow at f/6; the EdgeHD 9.25 at native f/10 or with its dedicated 0.7× reducer at f/7; and all listed Samyang 135 mm f/2 aperture-ring settings. The repository also includes an astronomy FOV calculator.

Open `narrowband-filter-calculator.html` locally or use the [published calculator](https://mjo7.github.io/narrowband-filter-calculator/).

The pupil-integration engine has a regression check against a Touch-N-Stars/N.I.N.A. reference calculation. The Antlia comparison is **not** a measurement or a product certification: Antlia's numerical angle-dependent curves and effective coating index are unavailable, so the site labels its assumptions and sensitivity checks. Model percentages are relative to each filter's own peak unless explicitly noted.

Run `node --test tests/narrowband-filter-calculator.test.cjs` and `node scripts/build-site.mjs` to verify the calculator and build the static pages.
