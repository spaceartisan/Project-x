# STARWARD — Last Beacon

A complete, original, playable browser arcade roguelite. Defend the beacon through **8 waves**. Auto-target nearby enemies, dash through danger, use EMP to clear crowds, collect energy to choose in-run upgrades, and use post-run salvage on permanent hangar upgrades. Includes bosses, particles, synthesized sound, touch controls, pause, high scores and offline caching.

## Play

Open `index.html` from a local web server (or deploy to Pages). On desktop use **WASD / arrows** to move, **Space** to dash, **Q** for EMP and **P / Escape** to pause. Your ship fires automatically. On touch, press and drag anywhere in the arena for a floating movement stick. Release to stop; Dash/EMP on the right support a second finger. Ship acceleration, braking and camera follow are smoothed. All saves stay in your browser via localStorage.

For a local preview: `python -m http.server 8000` and visit `http://localhost:8000/`.

## Deployment

- **GitHub Pages:** Settings → Pages → Deploy from a branch → `main` and `/ (root)` → Save. The static app is immediately eligible for branch publishing.
- **GitLab Pages:** Mirror/import this repository into GitLab; `.gitlab-ci.yml` copies files to the `public/` artifact on the default branch. No npm, build or secret needed.

No external scripts, fonts, or analytics. Web Audio is generated locally and can be muted. Game works offline after first successful load through the registered service worker. The service worker requires HTTPS or localhost.