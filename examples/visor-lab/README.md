# Visor Lab authoring sources

`optics.html` compares one untouched captured frame with the same frame using the
current game visor and water code. The divider clips full-viewport layers; its
native range supports keyboard input and the visible divider supports dragging.
The eight `images/*--off.webp` originals are sufficient for this animated view.

From the game checkout run `node tools/shot/visor-lab-export.mjs /absolute/path/to/existing/site/dist` to
copy these authoring files and originals into an existing Site output directory.
The exporter refreshes runtime aliases `visor-options.js`, `visor-droplets.js`
and `visor-optics.css` from the actual game source; do not maintain copies here.
It retains the destination's full captured gallery images. No hosting identity or
credentials are required in source.

`index.html`, `app.js`, `style.css` and `shots.json` preserve the original static
112-shot comparison gallery. Its additional full-resolution and thumbnail images
are capture output and are not duplicated in this directory. Export into the
existing gallery directory to retain them; exporting to an empty directory alone
does not reconstruct those captured variants. Animated optics remains usable
with the eight originals after runtime aliases have been exported.

Scene images decode before either side changes. Older asynchronous loads cannot
overwrite a newer selection. Reduced-motion users start with stationary water;
the animation checkbox enables or freezes motion explicitly. Both sides use the
same aspect-preserving crop, including narrow portrait screens.
