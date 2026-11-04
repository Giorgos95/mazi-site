# meetmazi.com redesign

Date: 2026-11-04. Owner: Giorgos. Status: draft for his approval. Every question from the review is answered.

The look and behaviour of the homepage are pinned down by a clickable mockup he chose:
[2026-11-04-site-redesign-mockup.html](2026-11-04-site-redesign-mockup.html) (open it from this folder; it loads the
site's own fonts and screenshots). It is throwaway code: copy what it does, not how it is written. Where this document
and the mockup disagree, this document wins.

Throughout, **"his choice"** means Giorgos decided it during the brainstorm; **"my call"** means the assistant decided it
and he has not yet confirmed it.

## Why

Giorgos looked at lovelee-app.com and wants meetmazi.com to feel like that: "prettier with things moving smooth
inviting". Today the site is correct, fast and plain (Lighthouse 99 performance, 100 for accessibility, best practices
and SEO). The redesign gives it personality through Mazí's own mascot, the í, and the letter family from the TikToks
(mazi-promo repo), while keeping everything that makes it findable by Google and AI assistants.

Success: a visitor smiles, plays with the page for a few seconds, understands what Mazí does, and taps a store badge;
search rankings and Lighthouse scores do not drop.

## Goals

- A warm, playful "sticker" look across the whole site: ink outlines, hard offset shadows, soft blobs, gentle motion.
- The í appears on most pages doing something related to that page.
- A day/night switch on every page.
- The homepage restructured as described below.

## Non-goals

- No change to what the pages say about the app beyond what is listed here (feature-section text stays as it is today).
- No new pages (comparison and pricing pages are separate, later work).
- No new social/OG image (can come later).
- No change to the app itself.

## Anti-goals (a failure even if it works)

- **Visitors typing text that the page shows back.** People can type bad words. Every interaction is tap-to-choose with
  fixed content (his rule).
- Content that only exists after JavaScript runs. AI crawlers do not run scripts.
- Any change to page addresses, or to the `/join` logic.
- Motion that feels busy. He rejected the moving marquee bar for that reason.
- Claims about the app that the app does not do.
- A slower or less accessible site.

## Constraints

- **Hosting:** Cloudflare Worker `mazi-site` serves the repo's files directly (`wrangler.jsonc`). There is no build
  step and no server code, and every push to `main` goes live. Work on a branch; merge only after Giorgos has seen it.
- **Addresses stay:** `/`, `/faq`, `/shopping-list`, `/chores`, `/meal-planner`, `/family-calendar`, `/privacy`,
  `/terms`, `/delete-account`, `/join`, `/tiktok`, and the 404 page. `_redirects` stays as it is. The app links
  `/privacy.html` and `/terms.html`, and every invite links `/join?code=XXXXXXXX`.
- **Content in the HTML:** headings, body text, FAQ answers and the JSON-LD stay in server-delivered HTML. Titles, meta
  descriptions, canonical links, Open Graph tags and JSON-LD stay as they are.
- **`/join` script:** keep it byte-for-byte. It shares logic with the app (`src/features/household/inviteLinkLogic.ts`
  in the FamilyApp repo at `../1. FamilyApp`). Restyle only the markup around it, and keep every element id and
  attribute the script uses.
- **No third-party scripts, fonts or frameworks.** Fonts are already self-hosted (Fredoka, Atkinson Hyperlegible).
- **Published files:** the Worker publishes everything in the repo except what `.assetsignore` lists. Add `docs` to
  `.assetsignore` (or this document and the mockup go public), and add `.superpowers/` to `.gitignore`.
- **Caching:** `_headers` lets browsers keep `/assets/*` for a day, then serve the old copy for up to a week while
  fetching the new one. New or changed CSS and JS must therefore get new file names (for example `site-2.css`), or
  returning visitors may see new HTML with old styles.
- **Sitemap:** update `lastmod` in `sitemap.xml` for pages whose content changes, and only those.

## The í and the letters

- **The í** is the mascot from `../mazi-promo/src/mascot/figure.ts` (and `I.tsx`): a white rounded body, a tilted
  accent on top, ink `#1F2D3A`, teal trainers `#12B3A6`, pink cheeks `#FF8FA3`. The mockup's script contains a faithful
  SVG port with these poses: idle, wave, joy, cheeky, surprised, sleepy, phone, strain, sad, push, stir and awake. The
  promo also has faces the mockup did not port, such as dizzy; port them from the promo the same way if needed.
- **The letters** are Fredoka glyphs drawn white with an ink outline, given eyes, cheeks, a smile, legs and trainers in
  the person's colour (from `../mazi-promo/src/tasks/letters.ts`). The trainers and eyes are placed from the glyph's
  measured box after the font loads.
- **Member colours** (from `../mazi-promo/src/members.ts`): George `#3B5BDB`, Maria `#E64980`, Sofia `#E8590C`.
- **Everywhere:**
  - The eyes follow the mouse pointer (my call: kept, he did not object).
  - The í blinks.
  - Clicking or tapping the í gives a short reaction: a hop, a pose and a speech bubble with fixed text.
  - All of these drawings are decorative: hidden from screen readers and never carrying information the text doesn't.

## Day and night (his choice)

- A sun/moon switch in the header of every page turns the whole page between day and night colours.
- At night the hero í turns sleepy ("is it bedtime already?") and stars appear. Back to day, it says "good morning! ☀️".
  The hero phone crossfades to the dark Today screenshot.
- Colours: use the mockup's palette (`#s` and `#s.night` custom properties).
  - Day: background `#FFF7EC`, text `#1F2D3A`, accent `#0D8478`.
  - Night: background `#141E33`, text `#F3EEDF`, accent `#3FD3C3`.
  - Update the `theme-color` meta tags to match.
- **Contrast (my call):** some of the mockup's day colours fail WCAG AA. Keep the look and fix the text instead of
  darkening the brand teal:
  - Ink text on the `#12B3A6` teal buttons and the panel header, instead of white.
  - Darken the small accent text (eyebrows, "More about…" links) until it reaches 4.5:1 on its background, including
    the yellow band.
  - Darken the grey of the crossed-out "group chat" to at least 3:1.
  - Ink text, or a darker pink, on the unread badge.

  The night colours pass as they are.
- **My call:**
  - First visit follows the visitor's system setting.
  - A page that opens in night colours still shows the hero í waving. The sleepy pose and "is it bedtime already?"
    appear only when the visitor flips the switch, so dark-mode phones are not greeted by a sleeping mascot.
  - Using the switch remembers the choice in `localStorage` and applies on every page.
  - The choice is applied by a tiny inline script in `<head>` before first paint, so there is no flash of the wrong
    theme.
  - Without JavaScript the page follows the system setting and the switch is hidden.
- This replaces today's "At home in light and dark" section, which is removed (his choice).

## The homepage, top to bottom

The mockup is the reference for layout, motion and copy, except where noted.

1. **Header (sticky).** Brand, nav, the day/night switch, and a "Get the app" button that jumps to the closing section.
   - Nav links: Shopping, Tasks, Meals, Calendar, FAQ.
   - **My call:** the nav links go to the pages `/shopping-list`, `/chores`, `/meal-planner`, `/family-calendar` and
     `/faq`, not to homepage sections. That works the same on every page and helps those pages get crawled.
2. **Hero, "option A"** (his choice).
   - Copy:
     - A chip, "🏠 for the whole household".
     - The heading "Keeps the household running without the ~~group chat~~.", with "group chat" crossed out in pink.
     - Lead text, the store badges, and "Free for 30 days. One subscription covers the whole household."
   - Beside the copy: the teal blob, three floating emoji stickers and the real Today screenshot in a phone frame.
   - Three notification cards pop in turn over the phone.
   - The waving í stands beside the phone. Clicking it cycles its reactions, and hovering the store badges makes it
     cheer.
   - **My call:** keep today's lead sentence word for word ("One shared space for what to buy, who is doing what…").
     The mockup's shortened version was not a decision.
   - **My call:** the notification cards must show notifications Mazí really sends. The FAQ lists them: a morning
     digest of the day's tasks, a task's reminder, an event reminder an hour before, and someone assigning you a task or
     adding an event. The mockup's "Maria added feta" and "George took out the recycling" are not notifications the app
     sends. Replace them, for example with "George gave you a task: take out the recycling", "Sofia added an event:
     dentist, Fri 16:00", and "3 tasks due today".
3. **"The problem"** (his choice, from the "playground" direction).
   - The animation is as in the mockup. The words are new (his choice, 2026-11-04), because the mockup's "sorted in one
     tap" and "Hand it to the í" made it sound as if Mazí reads and sorts a group chat, which it cannot:
     - Eyebrow: "💬 The problem".
     - Heading: "Your family group chat was never a to-do list."
     - Text under it: "Nine messages, three jobs nobody claimed, one football match at the wrong time. In Mazí, each one
       has its place. Press the button to see."
     - Button: "Show me in Mazí →". After the sort it reads "↺ Back to the chat".
   - The section sits on a yellow band. A family group chat fills up message by message, with typing dots and an unread
     badge.
   - A sad í in the middle says "help…". Pressing the button sends each message flying into a Mazí panel with Shopping,
     Tasks and Calendar sections. The í cheers and there is confetti.
   - "↺ Back to the chat" resets it.
   - The í's speech bubbles must not suggest that it does the sorting for you either. "leave it to me" and "sorted! 🎉"
     become, for example, "watch this" and "that's better 😌".
   - Rows in the panel can be ticked.
   - **Sofia is an adult.** She has her own account and colour, and accounts are for adults (FAQ, terms, and
     `mazi-promo/TIKTOK-PLAN.md`). Reword any line that makes her sound like a child. For example, "dentist friday,
     who's taking her?" becomes an appointment she mentions herself. Children may appear only as calendar events, never
     as members.
   - **My call:** the nine messages, the panel rows and their sections are written in the HTML, and JavaScript only
     animates them. Without JavaScript, or with reduced motion, the section shows the sorted result. The button then
     either jumps straight between the chat and the sorted state (reduced motion) or is hidden (no JavaScript).
4. **Four feature sections.** Today's text stays word for word, including the "More about…" links to the four pages.
   - Each section has its real screenshot on a tinted blob and the í doing that job:
     - Shopping: pushing a trolley.
     - Tasks: straining under a teetering tower of chores.
     - Kitchen: stirring a steaming pot.
     - Calendar: wide awake with thought bubbles (⚽ 🦷 🎂).
   - The sections alternate sides and rise in as they scroll into view.
5. **"Everyone knows what's theirs."** A fixed family, nothing to type.
   - Three letter characters stand on a floor: **M, G and S for Maria, George and Sofia**. He chose to keep their
     initials here rather than the TikTok letters.
   - Tabs (Everyone, Maria, George, Sofia), or tapping a letter, show that person's week. The other items fade, and the
     letter hops and says a fixed line.
   - The week list is in the HTML.
   - The builder checks the section's claim ("each person has a colour, so a glance tells you whose job…") against the
     FamilyApp code and adjusts the wording if it overstates.
6. **"Built for a household, not a social network."** Today's text and its "No ads. No feeds. No tracking." list, in the
   new look.
7. **"Bring the household together."** The closing section.
   - Above the heading, a row of characters spells **Mazí**: the letters M, a and z in the TikTok colours (M blue
     George, a pink Maria, z orange Sofia) and the í last, as tall as the M with its accent included (his choice).
   - They hop in turn when the section comes into view or a store badge is hovered.
   - Below them: today's text and the store badges.
8. **Footer.** Today's footer content: page links, legal links, support email, the four social icons with `rel="me"`,
   copyright, and the Google Play trademark line. It gets the new look.

Removed from today's homepage: the self-ticking list card in the hero (replaced by the option A stage) and "At home in
light and dark". Also never added: the moving marquee bar under the hero, which he rejected.

**My call:** the store links use the official Google Play and App Store badge images already in `assets/`, as now. The
mockup's home-made dark buttons break the stores' badge rules.

## The other pages (agreed with him)

- **Feature pages** (`/shopping-list`, `/chores`, `/meal-planner`, `/family-calendar`) get the full new look.
  - The header and switch come first.
  - The page hero has the same stage as that feature's homepage section: screenshot, blob, and the í doing the job
    with its prop.
  - The article text, questions and "The rest of Mazí" links follow in the new type and colours.
  - A closing section has the store badges.
  - All existing text and JSON-LD stay.
- **FAQ:** the full new look. The í appears in the hero in a curious or thinking pose; the builder picks it from the
  existing poses or ports one. All answers stay visible in the HTML (my call: no collapsed accordions), matching the
  FAQPage JSON-LD.
- **Privacy, terms, delete account:** plain, calm, easy-to-read text with the new header, colours and footer. No
  animated í.
- **`/join` and `/tiktok`:** the new look on the outside; `/join`'s script and logic untouched. A small waving í may
  greet the visitor (builder's choice).
- **404:** a confused í (the promo's dizzy face or similar) and links back to the homepage and the feature pages.

## Phone, motion and accessibility (my calls)

- **Phones:**
  - Every page works from 360px wide without sideways scrolling.
  - Sections stack. The hero copy comes first, then the stage.
  - "The problem" stacks the chat, the í with its button, then the panel.
  - The header keeps the brand, switch and "Get the app" and drops the nav links. The mockup's header overflows at
    390px, which needs fixing.
  - Tapping replaces hovering for the í's reactions.
- **Reduced motion** (`prefers-reduced-motion: reduce`):
  - No bobbing, flying, popping, confetti or rise-in.
  - Content appears in its final state.
  - The í still changes pose on tap, without the hop.
- **Without JavaScript:** every section is fully visible and readable. Rise-in hiding only applies once the script has
  marked the page as scripted.
- **No layout shift:** space for the í, the letters and the phone is reserved in CSS, so nothing jumps when they draw.
- **Keyboard:** every interactive thing is a real `<button>` with a visible focus style. The switch uses `aria-pressed`.
- **Screen readers:** speech bubbles are decorative (`aria-hidden`).

## Done means

- Every address above answers as before, and `/join?code=…` behaves as before on Android, iOS and desktop.
- Lighthouse (mobile) on the homepage, one feature page, the FAQ and `/join`: performance 95 or more, and accessibility,
  best practices and SEO 100.
- Every page checked in day and night, at desktop and 360px phone widths, with reduced motion, and with JavaScript off,
  with no console errors.
- The JSON-LD still validates in Google's Rich Results Test (the FAQ page and the homepage).
- Giorgos has clicked through the branch locally (`wrangler dev`) and said yes before it is merged to `main`.

## Left to the builder

- How the CSS and JS are organised: shared files under `assets/` with new names, per-page inline bits, and so on.
- Whether the í is drawn by script or written as inline SVG, as long as the no-layout-shift and no-JS rules hold.
- Exact timings, easings and sizes, within the mockup's feel.
- Poses for the FAQ, `/join`, `/tiktok` and the 404, and any extra fixed speech-bubble lines (no free text).
- Fine-tuning day and night colours so text keeps WCAG AA contrast, within the rules above.
