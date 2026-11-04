# haydensdrawio

A trimmed, offline-only build of the [draw.io](https://github.com/jgraph/drawio) diagram editor, published at **https://haydenharms.github.io/haydensdrawio/**.

- Opens on a blank diagram and saves to your device. No cloud storage or integrations.
- The Freehand window (X) adds an **Eraser** mode (E) that erases the freehand drawings it touches.

## How it's built

`src/main/webapp` is the editor. On every push to `main`, `.github/workflows/pages.yml` runs `ant app` in `etc/build`. That rebuilds `js/app.min.js` from the sources in `js/`, and the workflow then publishes `src/main/webapp` to GitHub Pages. Edit the sources and let the build regenerate the `.min.js` files.

To try changes locally, serve `src/main/webapp` (for example `python -m http.server`) and open `index.html?dev=1`. That loads the unminified sources.

Startup defaults (offline, device storage, no splash) live in `src/main/webapp/js/PreConfig.js`. URL parameters still override them.

## License

Apache License 2.0, see [LICENSE](LICENSE). draw.io is developed by draw.io Ltd and draw.io AG. The icon sets, stencil libraries and diagram templates may not be used in or distributed with Atlassian products or the Atlassian marketplace without permission; see the upstream README for the full terms. draw.io is a registered trademark of draw.io Ltd, and this fork is not affiliated with or endorsed by draw.io.
