# Observer time and horizon layer

The FOV calculator uses Aladin Lite's astronomical survey photographs. The new
layer models the observer's orientation relative to that fixed celestial sphere.
It does not turn the photographs into a dynamic solar-system or daylight renderer.

## Controls

Open **Date, time and horizon** in the sidebar. Date, time (one-minute precision),
weekday, timezone, and a **Now** button describe a single frozen simulation time.
Now samples the device clock and rounds down to the displayed minute. There is no
background time advance. The timezone is the device timezone, even when manually
entering a distant observing location. Its UTC offset is shown for the chosen date.

The browser location button supplies the observer coordinates; manual latitude
and longitude are also supported. South and west are negative. No location is
assumed before one is supplied. Location and time are not stored across reloads.

By default, an explicit time change preserves the center's altitude and azimuth,
moving the celestial pointing through Aladin's existing `gotoRaDec` method. Turn
off **Keep altitude / azimuth when time changes** to keep the same celestial field
centered, as with a tracking telescope; the ground then moves relative to it.
Neither mode changes the view's rotation, projection, survey, zoom, or instrument
angles. Panning continues through Aladin's original interaction handlers.

The horizon and cardinal anchors may be outside a narrow camera-sized field.
They appear only where their actual celestial positions enter the view. A field
entirely below the horizon is entirely covered by ground. FOV rectangles remain
visible over it as instrument guides. The ground visibility checkbox restores
the unobstructed survey view.

Invalid dates and skipped daylight-saving times leave the last valid simulation
time in force with an explicit message. Repeated times expose an occurrence picker
with both UTC offsets. The supported date range is 1900–2100.

## Coordinates and rendering

- Astronomy Engine 2.1.19 is vendored locally with its MIT license. Its
  `Rotation_HOR_EQJ` converts the north/west/zenith basis to J2000 equatorial
  coordinates, including precession, nutation and sidereal rotation.
- Aladin treats J2000 and ICRS equivalently for display. New `pix2world` calls
  explicitly request ICRS; `world2pix` uses its documented default of ICRS,
  including when the viewer's displayed grid is changed to Galactic coordinates.
  The current hosted Aladin build has a string-frame argument error in
  `world2pix`; relying on its default avoids that issue.
- For each visible screen direction, its dot product with the observer's zenith
  is `sin(altitude)`. The negative half-space is opaque ground. Adaptive screen
  subdivision refines the boundary to at most one CSS pixel, independent of FOV.
- Cardinal anchors are at azimuths 0°, 90°, 180°, 270° and altitude 0°. They use
  the same projection as the sky. Text is offset a few pixels toward the zenith;
  a small dot marks each exact horizon anchor. Projection round trips reject
  invisible/back-side points.
- A pointer-transparent canvas above the sky and constellation layers, and below
  the FOV guides, supplies the foreground. Projection/view events schedule one
  redraw per animation frame. A low-frequency fallback observes changed views.

This is a **geometric astronomical horizon**, not a landscape model. Atmospheric
refraction, terrain, and elevation-dependent horizon dip are excluded. Astronomy
Engine approximates UT1 by UTC; this is suitable for the library's roughly
arcminute precision, not observatory-grade astrometry. Proper motion of stars,
solar-system ephemeris imagery, atmospheric extinction and daylight are not added
to the existing survey rendering.

## Verification

`node --test tests/sky-horizon.test.cjs` checks cardinal altitude and direction,
zenith/nadir, both hemispheres and poles, dates from 1900–2100, agreement with
Astronomy Engine's separate scalar horizon API, time-zone conversion, leap dates,
DST gaps/folds, and ground clipping for multiple horizon orientations.

`tests/horizon-browser.cjs` uses Playwright and a temporary local HTTP server to
exercise the actual Aladin viewer. Set `PLAYWRIGHT_MODULE` if Playwright is not
installed locally. It checks time/weekday controls, horizontal pointing and target
tracking, unchanged main/mosaic FOV graphics and zoom, preserved rotation, ground
opacity against per-pixel altitude, and wide/narrow/rotated views.

The existing `angularDeg`, `rect`, `cross`, `getLiveFov`, `getMosaicSpec`, `update`,
`fitAll`, `fitMain`, `fitMosaic`, `fitComparison`, and `getComparisonConfigs`
functions were verified unchanged against the pre-edit file.

## Sources

- [Astronomy Engine JavaScript API and coordinate conventions](https://github.com/cosinekitty/astronomy/blob/master/source/js/README.md)
- [Pinned Astronomy Engine browser distribution](https://cdn.jsdelivr.net/npm/astronomy-engine@2.1.19/astronomy.browser.min.js)
- [Aladin coordinate transforms, pointing and view events](https://cds-astro.github.io/aladin-lite/Aladin.html)
- [Aladin coordinate-frame and event definitions](https://cds-astro.github.io/aladin-lite/global.html)
