# Deployment

FieldCraft is a static site. To host it, serve the repository root over HTTPS. Voice input needs a secure context: HTTPS, or `localhost`.

## Vercel (recommended)

### Option A: dashboard

1. Sign in at vercel.com with GitHub.
2. Go to **Add New → Project**, then import `bilalahmadsheikh/Cricket`.
3. Use these settings:
   - **Framework preset:** Other
   - **Build command:** leave empty
   - **Output directory:** `.`
   - **Production branch:** `main`
4. Click **Deploy**. Every push to `main` redeploys automatically, and pull requests get preview URLs.

`vercel.json` turns on clean URLs, stops `sw.js` from being cached, and sets `Permissions-Policy: microphone=(self)` so the mic works.

### Option B: CLI

```bash
npm i -g vercel
vercel login
vercel --prod
```

### Option C: CI or token-based

```bash
VERCEL_TOKEN=... npx vercel deploy --prod --yes --token "$VERCEL_TOKEN"
```

## Other hosts

- **GitHub Pages:** Settings → Pages → Deploy from branch → `main` / root.
- **Netlify:** drag and drop the folder, or connect the repo. Leave the publish directory as `.` and the build command empty.
- **Any web server** (nginx, S3 + CloudFront, Firebase Hosting) can serve the files as they are.

## Local

```bash
node serve.js 8080      # or: npm start
```

## After deploying, check

- [ ] The page loads and the field is drawn.
- [ ] Typing `bouncer trap` in the command bar loads the trap.
- [ ] Clicking the mic shows the browser's microphone prompt (Chrome, Edge or Safari).
- [ ] Saying "move long on to mid on" moves a fielder, and the app replies out loud.
- [ ] **Analytics → Rank fields** finishes and shows a table.
