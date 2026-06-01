# Deploying this app

This folder is a self-contained static web app (a PWA). Host its files over HTTPS
and it becomes installable on phones ("Add to Home Screen") and packageable for
app stores. Pick either host below — both are free and give HTTPS automatically.

The repo root **is** this folder, so the site serves from the root and all the
relative paths work as-is.

---

## Option 1 — Netlify (fastest, drag-and-drop)

1. Go to https://app.netlify.com → **Add new site → Deploy manually**.
2. Drag this entire folder onto the drop area.
3. You get a live `https://<random-name>.netlify.app` URL in seconds.
4. (Optional) **Site settings → Change site name** to pick a cleaner subdomain.

To update later: drag the folder again, or connect the GitHub repo (below) for
auto-deploys.

---

## Option 2 — GitHub Pages (free, versioned)

From inside this folder (a local git repo is already initialized):

    git remote add origin https://github.com/<you>/<repo>.git
    git branch -M main
    git push -u origin main

Then on GitHub: **Settings → Pages → Build and deployment**
- Source: **Deploy from a branch**
- Branch: **main**, folder: **/ (root)** → **Save**

After ~1 minute your app is live at:

    https://<you>.github.io/<repo>/

(The `.nojekyll` file is included so GitHub serves all files as-is.)

---

## After it's live

1. Open the URL on a phone → browser menu → **Add to Home Screen**. It installs
   with the app icon and runs fully offline.
2. To make store packages: go to **https://www.pwabuilder.com**, paste your live
   URL, and download the Android (and iOS) packages. Follow its prompts for the
   `assetlinks.json` it generates.

## Updating the app
After editing any file, bump the `CACHE` string in `sw.js` (e.g. `spec-guide-v6`
-> `v7`) so installed clients pick up the new version, then redeploy.
