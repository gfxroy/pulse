# Pulse Wellness — handoff for Grok / Cursor

Public app: **https://gfxroy.github.io/pulse/**  
Repo: **https://github.com/gfxroy/pulse**  
Brand: Pulse Wellness (wellness estimate, **not** a medical device)

Use this file when you open a terminal in the project root and continue building with Grok/Cursor (“Grok build”).

---

## 1. Get the code on your machine

```bash
git clone https://github.com/gfxroy/pulse.git
cd pulse
npm install
```

Or if you already have a copy that was dropped on this computer:

```bash
cd <path-to-pulse>
npm install
```

---

## 2. Run locally (sensors need HTTPS or localhost)

```bash
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`).  
Camera / mic / motion need a **secure context** (localhost or HTTPS).

Production build (same paths as GitHub Pages):

```bash
npm run build
npm run preview
```

`vite.config.ts` has `base: '/pulse/'` for Pages. Local `npm run dev` still works; for preview of the Pages build, open the `/pulse/` path if assets 404.

---

## 3. Deploy to GitHub Pages (after changes)

```bash
npm run build
# Publish dist/ to the gh-pages branch (root of that branch = site root)
rm -rf /tmp/pulse-pages && mkdir /tmp/pulse-pages && cp -a dist/. /tmp/pulse-pages/
cd /tmp/pulse-pages
git init && git checkout -b gh-pages
git add -A
git -c user.email="you@users.noreply.github.com" -c user.name="you" commit -m "Deploy Pulse Wellness"
git remote add origin https://github.com/gfxroy/pulse.git
git push -u origin gh-pages --force
```

Live site: https://gfxroy.github.io/pulse/

---

## 4. Architecture (where to edit)

| Area | Path |
|------|------|
| App shell / routing | `src/App.tsx` |
| Screens | `src/screens/` — Onboarding, Home, Measure, Composite, Results |
| Visual setup guides (SVG) | `src/guides/GuideArt.tsx`, `src/components/VisualGuide.tsx` |
| Live camera overlays | `src/components/CameraGuide.tsx` |
| DSP | `src/dsp/` — filters, autocorr, Welch, peaks, hrEstimate, quality |
| Methods | `src/methods/` — fingertipPpg, facialRppg, chestMotion, handheldAccel, micPcg |
| Fusion | `src/fusion/fuse.ts` |
| Capability probe | `src/capabilities/probe.ts` |
| Styles | `src/index.css` (cream / ink / blood-red editorial theme) |
| History | `src/storage/history.ts` |

### Five sensing methods
1. **Fingertip PPG** — rear camera; manual flashlight or alternate 2nd-phone light; red mean → bandpass → autocorr + Welch  
2. **Facial rPPG** — front camera; POS + CHROM  
3. **Chest accel + gyro** — cross-validated beats  
4. **Handheld accel** — weakest; longer windows / null if bad  
5. **Mic PCG** — S1–S1 via systole < diastole  

Fusion: confidence-weighted; hard down-weight if a method disagrees by >~15 BPM.

---

## 5. Product constraints (do not break)

- Wellness / non-medical disclaimer on onboarding **and** near readings  
- **Never** programmatic torch/flash — instructions or alternate-light visual only  
- iOS motion permission only on a **user tap** (HTTPS)  
- Feature-detect cameras / mic / motion; only show available methods  
- Prefer “no reading” over a wrong BPM when SNR is bad  

---

## 6. Known accuracy notes

- Fixed assumed 30 fps bug: HR uses **timestamped** sample rate  
- Autocorr + Welch with harmonic rejection  
- User still saw ~20 BPM low vs Google Fit before that fix — re-validate fingertip vs Fit after changes  
- Goal: best-in-class **browser** HRM; not clinical-grade  

---

## 7. What the owner wants next (priorities)

1. Guide art that is **clear and premium** (figurative, not abstract geometry); more **breathing room**, less clutter  
2. Visual (not text-only) guidance for every method, including alternate light for PPG  
3. Keep pushing **accuracy**  
4. Launch-ready polish for Twitter sharing of https://gfxroy.github.io/pulse/  

---

## 8. Suggested prompts for Grok build

Copy-paste starters:

- “Improve fingertip PPG accuracy vs Google Fit; keep timestamped Fs, autocorr+Welch; add better contact gating.”  
- “Redesign GuideArt SVG for [method] so a first-time user instantly understands the pose.”  
- “Add more whitespace and premium spacing on Home and VisualGuide; keep cream/ink/red theme, no AI-slop.”  
- “After UI/DSP changes, rebuild and force-push gh-pages as in HANDOFF.md §3.”  

---

## 9. Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Local Vite dev server |
| `npm run build` | `tsc -b && vite build` → `dist/` |
| `npm run preview` | Preview production build |
| `npm run lint` | oxlint |

Node: use a current LTS. Package manager: npm (lockfile committed).

---

## 10. Legal / voice

Speak as a calm wellness product. Never imply diagnostic or medical accuracy in UI or tweets.

---

*Generated for handoff — continue from repo `gfxroy/pulse` on branch `main`.*
