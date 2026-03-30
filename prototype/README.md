# MineStar Fleet Prototype

## What this prototype demonstrates

This Vite/OpenLayers prototype now includes a **haul-truck atlas POC** based on the new Figma atlas logic:

- baked **right-facing** truck sprites
- **4 atlas columns** for dot/status variants
- **10 atlas rows** for loading, dumping, hidden, empty, and full states with selected/default variants
- material tinting derived from the exported mask atlas
- truck rotation using a **-90° heading offset** so east-facing artwork aligns with north-up map headings
- a **Truck Inspector** for per-truck override and follow mode
- adaptive zoom rendering with a simplified **overview truck icon** below zoom `4.2`

The current implementation uses the exported PNG atlas assets in `src/Grid.png` and `src/Grid_mask.png`, then composes the truck/material atlas at runtime for the POC.

## Run locally

```bash
npm install
npm run dev
```

Then open the local Vite URL shown in the terminal.

## Build

```bash
npm run build
```

## Publish as a GitHub repo

This folder is ready to be published as its own repository.

Recommended approach:

1. Treat `prototype/` as the repository root
2. Create a new empty GitHub repository under your personal account
3. Push this folder to that repo

Suggested repository naming:

- `minestar-fleet-prototype`
- `cat-sprite-prototype`
- `minestar-symbology-prototype`

Once pushed, you can connect that GitHub repo directly to Vercel.

### Quick publish steps

From inside `prototype/`:

```bash
git init -b main
git add .
git commit -m "Initial prototype import"
git remote add origin git@github.com:kevtoe/minestar-fleet-prototype.git
git push -u origin main
```

If you prefer HTTPS instead of SSH:

```bash
git remote add origin https://github.com/kevtoe/minestar-fleet-prototype.git
git push -u origin main
```

Update the repo name in the remote URL if you choose a different GitHub repository name.

## Vision review helper

There is a local Gemini screenshot-review helper for debugging visual issues like:

- stretched or squashed truck proportions
- shifted material masks
- missing material tinting
- poor rotation centring

1. Add your real Gemini key to the workspace root `.env`
2. Save a screenshot locally
3. Run:

```bash
npm run vision:review -- ../path/to/screenshot.png --output vision-output/review.md
```

The script will send the image to Gemini and save a markdown review.

## Key files

- `src/truck-atlas.js` — composed haul truck atlas built from exported PNG assets
- `src/styles.js` — regime styles, detailed truck sprites, and zoomed-out marker logic
- `src/data-transform.js` — truck row/material properties and atlas selection metadata
- `src/main.js` — layer wiring, zoom switching, selection logic, truck inspector, and follow mode
- `scripts/gemini-vision-review.mjs` — local Gemini screenshot analysis helper

## Repo notes

- `node_modules/`, `dist/`, `.env`, `.vercel/`, and `vision-output/` are ignored for publishing
- `package-lock.json` is kept so installs stay reproducible
- the project builds successfully with `npm run build`
