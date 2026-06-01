# Construction Specifier Study Guide — PWA

### ▶️ Live app: **https://dave5264.github.io/construction-specifier-study-guide/**

Open that link on your phone, then use your browser's **Add to Home Screen** to
install it. Works fully offline once loaded.

An installable, offline, text-only study app built on a question bank
(`questions.json`, 803 questions on construction specification practice). No backend,
no network needed after first load. A general study guide for the topic.

## Files
- `index.html` — app shell
- `styles.css` — mobile-first styling, light + dark mode
- `app.js` — study logic, progress (localStorage), difficulty levels, review/bookmarks
- `questions.json` — the cleaned question bank (copy of `../question_bank.json`)
- `manifest.webmanifest` — PWA metadata (name, icons, theme)
- `sw.js` — service worker (offline cache)
- `icon-192.png`, `icon-512.png` — app icons

## Run locally
A service worker won't run from `file://`, so serve over HTTP. From this folder:

    python -m http.server 8137

Then open http://localhost:8137 . On a phone, open the URL and use
"Add to Home Screen" to install it; it then works fully offline.

## Features
- **Two modes:** Practice (answers + explanation as you go) and Quiz (answers held until you submit, then a full review).
- **Full-length review:** a 200-question session drawn across topic areas in a weighted split, with an optional countdown timer and a 75% score goal.
- **Difficulty progression per topic:** every question is Core or Advanced (from the bank's `hard` flag). Answering correctly advances each topic through Foundation -> Proficient -> Advanced -> Mastered, shown as a badge + progress bar on the home screen.
- **Smart practice:** serves questions at your current level for the selected topic (Core until you're Proficient, then Advanced).
- Study by single topic or the full bank; choose 10 / 20 / 50 / all / full-length.
- Options shuffled each time (no position-memorizing).
- Progress, accuracy, and difficulty levels persist on the device.
- "Review missed" and "Bookmarked" for focused study.

## Changing the full-review parameters
Question count, time limit, score goal, and topic weighting live in one constant
at the top of `app.js`:

    const FULL = { questions: 200, minutes: 240, goal: 75, weights: {1:11,2:14,3:17,4:12,5:16,6:30} };

## Updating content
Re-copy the bank after any edit to the master file, then bump the `CACHE` version
string in `sw.js` (e.g. `spec-guide-v4` -> `v5`) so clients pick up the new version:

    cp ../question_bank.json questions.json

## Next step: native store app (optional)
To put this in an app store, wrap it with Capacitor — it packages these exact files
into native iOS/Android binaries (still fully offline):

    npm create @capacitor/app
    # copy this app/ folder into the Capacitor web dir, then:
    npx cap add ios
    npx cap add android
