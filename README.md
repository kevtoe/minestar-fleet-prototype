# CAT Sprite Prototype

OpenLayers/Vite prototype for CAT MineStar fleet rendering using a sprite-atlas approach.

## Repo layout

- `prototype/` — runnable app intended for deployment
- `research/` — research briefs and architectural notes
- root docs — briefs, diagrams, and working notes for the prototype effort

## Local development

The deployable application lives in `prototype/`.

```bash
cd prototype
npm install
npm run dev
```

## Production build

```bash
cd prototype
npm run build
```

## GitHub + Vercel

Recommended publishing flow for a personal repo:

1. Create a new GitHub repository under `kevtoe`
2. Push this workspace as the initial commit
3. In Vercel, import that GitHub repo
4. Set the Vercel **Root Directory** to `prototype`
5. Use the default Vite build settings:
   - Install Command: `npm install`
   - Build Command: `npm run build`
   - Output Directory: `dist`

For app-specific notes, see `prototype/README.md`.
