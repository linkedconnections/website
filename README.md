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

The v2-alpha document and `specification/schemas.json` must agree. Changes to field types, order or meaning need an explicit specification revision. The legacy 1.0 source is retained unchanged.

Validation: `bundle exec jekyll build` and `ruby scripts/check-specification.rb _site` verify rendered routes, fragment links and ordered schemas.
