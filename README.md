# Linked Connections website

Jekyll source for [linkedconnections.org](https://linkedconnections.org).

- `/specification/` lets readers choose a version.
- `/specification/2-0-alpha` publishes the draft Linked Connections v2 Arrow Connections specification.
- `/specification/1-0` keeps the original specification available at its existing URL.
- `/specification/schemas.json` is the machine-readable ordered schema reference.
- `/specification/2-0-alpha/context.jsonld` is the proposed JSON-LD context for the v2-alpha manifest, `/specification/2-0-alpha/vocabulary.ttl` the new vocabulary terms (aligned with Hydra, DCAT and DCterms); `/specification/examples/manifest.jsonld` is an illustrative manifest.

## Build locally

Use Ruby with Bundler, then run:

```sh
bundle install
bundle exec jekyll build
bundle exec jekyll serve
```

The build writes `_site/`. Open <http://localhost:4000/specification/> to preview the version chooser. Existing scripts and images are committed; a Bower installation is not needed.

The homepage demo uses the pinned npm package `@irail/planner` to read the iRail
CDN's LC 2.0-alpha timetable and calculate journeys in browser workers. Select
departure and destination pins; the original RDF/JSON-LD demo remains in the
“Original 1.0 demo” tab and loads only when selected. All demo times use the
published timetable's timezone. If the current time is outside its coverage, the
demo selects a covered departure and shows that date explicitly.
Profile connections streamed by the planner appear as thin orange
lines on the map; the selected journey uses a thicker line. The profile resets
with each new query.

To change the demo, use Node.js 22.12+ (Node 24 recommended):

```sh
npm ci
npm test
npm run build:demo
bundle exec jekyll build
```

Edit `demo/`, then commit the regenerated `js/demo/` assets and notices alongside
the source. The small page script loads the planner workers and timetable only
when the demo approaches the viewport. The generated bundles keep the production
site compatible with a plain Jekyll build; Node is only needed to rebuild them.

The v2-alpha document and `specification/schemas.json` must agree. Changes to field types, order or meaning need an explicit specification revision. The legacy 1.0 source is retained unchanged.

The site is built and deployed by Netlify with a plain Jekyll build; the GitHub
workflow checks the demo, verifies that its committed bundles are up to date, and
runs `bundle exec jekyll build`.

Validation (run locally, not in CI): `bundle exec jekyll build` and `ruby scripts/check-specification.rb _site` verify rendered routes, fragment links and ordered schemas.
