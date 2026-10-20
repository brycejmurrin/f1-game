# Design Lab site source

The authored HTML, CSS and JavaScript used by the
[Apex 26 Design Lab](https://apex26-design-lab.goofy-angel-9204.chatgpt.site).
These three files match Site source commit
`676631f645a3d6a3bc52ec91d97f9f1db2578c56` exactly. They are review-site
source, separate from the game's root HTML and deployment.

The gallery starts with the recorded color/finish studies. Its controls browse
palette, body, finish and light, with separate views for native screenshots,
latest CI captures, deploy geometry and the complete collection. Enlarged images
retain camera, material and source receipts. The static catalog in the HTML is
pinned to the deploy revision shown there; it is not a live inventory.

## Data and image dependencies

The page fetches `captures.json` beside `index.html`. Keep the Design Lab data
and its relative paths together:

- `captures.json`: the existing Design Lab `{source, items}` record, including
  per-image metadata and provenance.
- `assets/`: the images referenced by that record, reference boards and the
  locally hosted fonts under `assets/fonts/`.
- `collection/`: the portable collection built by `capture-gallery.mjs`, linked
  from the gallery footer.

Capture data and generated images remain in the Site source and ignored artifact
directories, following the repository's evidence-storage policy. They are not
duplicated in the game source. This directory alone is the presentation source,
not a self-contained image archive. Do not point it at a matrix manifest: a
matrix's `gallery.json` and the Design Lab's `captures.json` have different roles.

## Preview with the existing Site assets

From the game checkout, with the Design Lab source checkout available:

```sh
DESIGN_LAB_SOURCE=/workspace/sites/apex26-design-lab
mkdir -p artifacts/design-lab
cp -R "$DESIGN_LAB_SOURCE/dist/." artifacts/design-lab/
cp sites/design-lab/{index.html,app.js,styles.css} artifacts/design-lab/
python3 -m http.server 3456 --directory artifacts/design-lab
```

Open `http://localhost:3456/`. Serve through HTTP so the data fetch works;
opening the HTML through `file://` is insufficient. No framework, bundler,
package installation or credentials are required by the gallery itself.

For new native captures and portable export, use the existing
[capture workflow](../../docs/CAPTURE-REVIEW.md). Retain recorded revisions,
hashes and archive/current status when preparing a new Design Lab data record.

## Updating the hosted site

Edit these source files and carry the same files into the existing Site's
`dist/` directory. Use the Sites source/publish workflow for that project,
preserving its access settings. Committing this directory to a game PR does
not publish a Site or change the game's GitHub Pages entrypoint.
