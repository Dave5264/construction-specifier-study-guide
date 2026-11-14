# Construction Specifier Study Guide — PWA

### ▶️ Live app: **https://dave5264.github.io/construction-specifier-study-guide/**

Open that link on your phone, then use your browser's **Add to Home Screen** to
install it. Works fully offline once loaded.

An installable, offline, text-only study app built on a question bank
(`questions.json`, 2,653 questions on construction specification practice). No backend,
no network needed after first load. A general study guide for the topic.

## Files
- `index.html` — app shell
- `styles.css` — mobile-first styling, light + dark mode
- `app.js` — study logic, progress (localStorage), repeats after misses, fill-in grading, difficulty levels
- `questions.json` — the question bank
- `manifest.webmanifest` — PWA metadata (name, icons, theme)
- `sw.js` — service worker (offline cache)
- `icon-192.png`, `icon-512.png` — app icons
- `tests/grader_test.js` — checks for the fill-in grading (`node tests/grader_test.js`)

## Run locally
A service worker won't run from `file://`, so serve over HTTP. From this folder:

    python -m http.server 8137

Then open http://localhost:8137 . On a phone, open the URL and use
"Add to Home Screen" to install it; it then works fully offline.

## Features
- **Six options per question**, shuffled every time. Some questions are "Choose two"; some have
  combination options ("Both A and D") that always come after the single statements.
- **Fill in the blank** (checkbox on the home screen): 389 questions can be typed instead of picked. Typed
  answers ignore capitals, punctuation, a/an/the, "&" vs "and", possessives, plurals and number words, allow one
  typo in a long word, and accept acronyms both ways ("ASI" or "Architect's Supplemental Instructions").
  Each question also lists the other wordings it accepts. With the box unchecked, the same questions are
  six-option multiple choice.
- **An explanation for every question**, shown when you answer (and in the review after a quiz): why the right
  answer is right and why the tempting wrong ones are wrong.
- **Repeats after a miss:** a missed question comes back after about 5 more questions, and once you get it
  right it comes back twice more, after 25 and then 50 other questions. Every miss adds 3 repeats; every right
  answer pays one off (the first right answer after the miss counts). Repeats that are due are served first, in
  any session that covers their topic; "Review missed" drills everything missed or still owing repeats.
- **Progress by topic:** each topic's bar shows questions mastered (last answer right, no repeats owed) in green
  and questions in progress (missed, or repeats still owed) in amber, out of all its questions. The badge is
  the topic's difficulty level (Foundation → Proficient → Advanced → Expert) from your accuracy on Core,
  Medium and Advanced questions.
- **Two modes:** Practice (answers + explanation as you go) and Quiz (answers held until you submit, then a full review).
- **Full-length review:** a 200-question session drawn across topic areas in a weighted split, with an optional
  countdown timer and a 75% score goal.
- **Smart practice:** serves questions at your current level for the selected topic (Core until you're
  Proficient, then Medium, then Advanced).
- Study by single topic or the full bank; choose 10 / 20 / 50 / all / full-length. "Bookmarked" for focused study.
- Progress, accuracy, repeats and difficulty levels persist on the device.

## Changing the full-review parameters
Question count, time limit, score goal, and topic weighting live in one constant
at the top of `app.js`:

    const FULL = { questions: 200, minutes: 240, goal: 75, weights: {1:11,2:14,3:17,4:12,5:16,6:30} };

The repeat rules are the constants just below it (`REPEAT_PER_MISS`, `REPEAT_GAPS`, `MISSED_GAP`, `MISSED_MINUTES`).

## Question format
Multiple choice: `options` A-F, `correct` is one letter or two/three sorted letters for a "Choose two/three"
question; a combination option names others with placeholders (`"Both {A} and {D}"`).
Fill-in (`"type": "fill"`): a `____` per blank, `answers` = one list of accepted wordings per blank (the first is
shown), and `mc` = the six-option version used when fill-in mode is off. `source` is the topic shown under the
explanation.

## Updating content
After editing `questions.json`, run `node tests/grader_test.js`, then bump the `CACHE` version string in `sw.js`
(e.g. `spec-guide-v16` -> `v17`) so installed apps pick up the new version.

## Next step: native store app (optional)
To put this in an app store, wrap it with Capacitor — it packages these exact files
into native iOS/Android binaries (still fully offline):

    npm create @capacitor/app
    # copy this app/ folder into the Capacitor web dir, then:
    npx cap add ios
    npx cap add android
