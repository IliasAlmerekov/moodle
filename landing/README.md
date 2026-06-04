# Moodle AI Assistant — Landing

A presentation-style, interactive landing page for the **Moodle AI Chatbot**
project. Built with **React + Vite**, animated with **Framer Motion**, ready to
deploy on **Vercel**.

## What's inside

- **Hero** with an animated, mocked Moodle course page + floating chat widget
  (stand-ins for real screenshots).
- **Before / After** toggle showing the shift AI brings to students & teachers.
- **Feature bento** grid (grounded answers, privacy, streaming, multilingual…).
- **Live demo** — a scripted chat that streams answers token-by-token, mirroring
  the real SSE pipeline.
- **How it works** — the four-step request flow (signed identity → fail-closed
  search → grounded prompt → streamed answer).
- **Animated metrics**, a **security/hardening** section, and a CTA.

The Moodle wordmark and brand colours (`#f27f22` orange, `#0f6cbf` blue) are
taken from the real project; all imagery is mocked with CSS.

## Develop

```bash
npm install
npm run dev      # http://localhost:5173
```

## Build

```bash
npm run build    # → dist/
npm run preview  # serve the production build locally
```

## Deploy to Vercel

Point Vercel at this `landing/` directory. Framework preset is auto-detected
(**Vite**); settings are also pinned in `vercel.json`:

- Build command: `npm run build`
- Output directory: `dist`

Or from the CLI:

```bash
npm i -g vercel
vercel        # preview
vercel --prod # production
```

## Customise

- **Content** lives in `src/data.js` (features, metrics, before/after, demo
  scripts).
- **Design tokens** (colours, fonts, radii, shadows) are CSS variables in
  `src/index.css`.
- **Sections** are composed in `src/App.jsx`; reusable pieces are in
  `src/components/`.
