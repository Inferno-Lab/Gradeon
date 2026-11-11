# Empty states

Approved by the owner on 10 November 2026, together with Gradeon Hue ([README](README.md)). Not built yet: they are implemented with Hue, after the work in progress on `main` lands.

The source of truth is the boards: `src/EmptyFrame.html` (the kit), `src/EmptyAdmin1-5.html`, `src/EmptyConsole1-4.html` and `src/EmptyApp1-4.html`, with `empty.css` for the kit's CSS. They are on the canvas pages **Empty states · admin / console / app**. Build with `node build.mjs`; check the final frames with `node qa.mjs @e EmptyAdmin1` (it renders with reduced motion on) and the motion with `node anim.mjs EmptyAdmin3 760 800 640 460`.

## The rules

1. **No shared layout.** Each page has its own composition, drawn from what the page does (its grid, its receipt, its shelf, its route). The owner rejected one shared two-column frame: "every empty state has the same structure and the same layout".
2. What *is* shared is the kit: the words block, the scene parts and the motion beats.
3. **Words:** a heading that says what the page is for (never "Nothing here yet"); one or two sentences on why it is empty and what will appear; one main button that fixes it; a second link only when truly needed; never a dead end. Where a school cannot fix it itself, the button asks Gradeon (schools configure nothing).
4. **Scene:** one story of up to six beats in a 10 s loop (enter at 0.6, 1.8, 3.0, 4.2, 5.4, 6.6 s; hold to 9.2 s; fade; loop), built only from the product's own parts (cards, rows, tags, bars, tiles). No images, illustrations or icons inside the scene. `aria-hidden`, nothing clickable.
5. **Examples** are made up, neutral and international (Maya Torres, Leo Martin, Ada Novak, Sam Okafor, Ms Ortiz; Northfield School, Harbor Academy, Cedar Hill School). Amounts have no currency symbol in the design; the real page uses the school's currency. A caption says they are examples.
6. **Tokens only**, so light, dark and every school colour work.
7. **Narrow** (below about 640 px): every web composition falls back to one column. On the phone each page has its own arrangement (see the app boards).
8. **Reduced motion:** the last frame, still (replaced parts hidden, counters at their final value).
9. **Page icons** in labels and buttons come from `icon-map.mjs` (`[[es:@fees|…]]`), so the empty state, the menu and the app tabs show the same icon.
10. **Only when truly empty.** Loading and error states stay as they are. A filter or search with no results is not an empty page (Search has its own no-match state).

## How to build it

- **Web (admin and console):** one module in `packages/web-ui` (for example `src/empty/`) with the words block, the scene parts and the beats (port `empty.css`: keyframes, `.sc` parts, the `.lay` one-column fallback), plus one small scene component per page next to that page. Time the motion with the beat tokens, not literal durations, and respect `prefers-reduced-motion`. Add the new class names to `rules.test.ts` expectations.
- **App (Flutter):** an `EmptyKit` in `lib/core/widgets/` (words block, scene parts, a 10 s `AnimationController` exposing the six beats, `MediaQuery.disableAnimations` showing the last frame) and one scene widget per screen. It replaces today's `ViewStateView(emptyArt: …)` and `EmptyArt` illustrations where the data is really empty; loading and error branches stay. Copy goes through translation keys (`en` first).
- Wire each one only on the empty branch of the page's data (no rows from the API, not a failed or loading request).

## Inventory

### School admin (`apps/admin/src/pages/…`)

| Page | Composition | Heading | Button · link |
| --- | --- | --- | --- |
| dashboard | Ghost of the dashboard fills in behind a floating card | Your school's day, on one screen | Set up your school · Invite teachers |
| attendance | Deep panel; a wall of class tiles lights up as rolls come in | Who is in school, class by class | Take a roll · Send teachers the app |
| timetable | The week grid is the panel; the words take three cells of it | The week, for every class | Build the timetable · Import from a spreadsheet |
| homework | Centred words over a three-card line: set, handed in, checked | Homework set, handed in, checked | Post homework |
| exams | A report card writes itself; words to the right | Marks in, report cards out | Add an exam · Copy last year's exams |
| students | Spreadsheet rows flow into student records across the width; words below, split | Every student, with their family | Import students · Add one student |
| staff | An org chart grows from the principal; words to the left | Your teachers and office team | Add staff · Import from a spreadsheet |
| admissions | A board; the words are its first column, families move along it | Enquiries, from first call to first day | Share the admission form · Add an enquiry |
| fees | A statement: header row, one huge figure, the fee lines, a full-width bar | What every family owes, and what has come in | Set up fees · Import dues |
| invoices | A till receipt prints and gets a PAID stamp | Invoices and receipts, numbered and kept | Create invoices |
| fees (online payments) | A live ticker of payments across the top; settled figure beside the words | Payments families make online | Ask Gradeon to turn it on |
| reports | The bar chart is the whole panel; the words sit in its corner | Numbers you can hand to the board | Start with attendance · Set up fees |
| notices | The words are the draft notice; delivery squares fill beside it | Tell every family at once | Write a notice |
| messages | The words arrive as the first chat bubbles; a reply bar holds the button | Conversations with families, in one inbox | Write to a parent |
| events | A tilted event ticket fills with people | The school calendar, with who is coming | Add an event |
| gallery | A photo mosaic; the words are its biggest tile | Photos from school, shared with families | Make an album |
| year (classes and calendar) | Words and class chips above; the year runs as a ribbon of months below | Your classes, terms and holidays | Set up the year · Copy from last year |
| moving-in | Deep words column; file columns find their match with connecting lines | Bring your old records across | Upload a spreadsheet · Get the template |
| library | A shelf of book spines across the top; one goes out on loan | Books, and who has them | Add books · Import the register |
| transport | A bus route runs around the words | Routes, stops and who rides | Add a route |

### Gradeon console (`apps/console/src/pages/…`)

| Page | Composition | Heading | Button · link |
| --- | --- | --- | --- |
| fleet | Centred words; school cards slide in below | Every school you run, and how it is doing | Add a school |
| onboarding | A five-step path on the left; words on the right | Schools on their way to going live | Start onboarding |
| cells | A rack filling with schools; a big "places used" count | Where each school's data lives | Add a cell |
| releases | Rollout rings ripple out from the version | Versions, and where each one is | Publish a release |
| releases (migrations) | A version ladder: databases climb from 041 to 043 | Database changes, school by school | Open releases |
| builds | A build line a phone travels along: build, sign, review, live | Each school's own app, built and shipped | Build an app |
| flags | A switchboard of twelve schools switching on | Try a change on a few schools first | Add a flag |
| blueprints | A dashed stencil stamps out school cards | A starting setup for every new school | Make a blueprint · Save one from an existing school |
| integrations | A hub with a wire to each provider | Texts, payments, storage and maps, in one place | Connect a provider |
| health | Deep monitor: uptime figure and a heartbeat strip | Every check on every school | Add a school |
| approvals | Good-empty: a green clear desk; a request is stamped and filed | Nothing is waiting for your approval | See past approvals |
| requests | A wall of sticky notes; the words are the first note | Everything schools have asked for | Log a request |
| support | Two-pane inbox; the words sit where the thread will be | Help for schools, in one inbox | Set up the support address |
| billing | A year of monthly bills, paid one by one | What each school pays Gradeon | Set up billing |
| compliance | Deep ledger that writes itself | Consent, data requests and who saw what | Review the consent wording |
| team | Empty seats fill with invited colleagues | The people who run Gradeon | Invite someone |

### Parent and teacher app (`lib/features/…`)

| Screen | Composition | Heading | Button |
| --- | --- | --- | --- |
| dashboard (parent home) | Words in the school-coloured header; faded preview cards; button at the bottom | Maya's school day, every day | Turn on notifications |
| notices | A fanned deck of notices; centred words below | Notices from Northfield | Turn on notice alerts |
| fees | Big 0.00 in the header; words; a receipt prints | Maya's fees and receipts | Turn on fee reminders |
| homework | A homework card with photo slots; words below | Maya's homework, and when it is due | Turn on homework reminders |
| chat | Example thread; the words as a centred note; composer holds the button | Talk to Maya's teachers | Message the class teacher |
| timetable | A day timeline; the words are its first card | Maya's lessons, day by day | Back to Home |
| attendance | The month in the header; words in the sheet | Maya's days in school | Turn on attendance alerts |
| exams_results | A grade ring with subject chips | Maya's marks and report cards | Turn on result alerts |
| events | Words first, then a ticket with I'm coming / Can't make it | What's on at school | Turn on event alerts |
| gallery | Photo grid; the words fill the first tile | Photos from Maya's class | Turn on photo alerts |
| transport | A vertical route beside the words | Maya's bus, stop and times | Message the office |
| library | A shelf above the words; one book on loan | Books Maya has borrowed | Turn on return reminders |
| leave | Words first, then a request that sends itself | Tell school when Maya will be away | Ask for leave |
| notifications | Good-empty: alerts slide away to a big 0 | You're all caught up | Choose your alerts |
| search (no match) | Search field in the header; "Did you mean" and results | Nothing matches “…” | Clear the search |
| teacher_home | Words and the day's periods in the header | Your classes and your day | Message the office |
| mark_attendance | A roll of names you tap; words in a deep card at the bottom | The roll for {class} | Message the office |
| assign_homework | A draft that writes itself, with a hand-in count | Homework you set | Set homework |
| grading | Good-empty: a pile of work flies off to "0 left" | Nothing left to check | Set homework |
| marks_entry | Words in the header; a marks sheet typing in | Marks for each exam | See exam dates |

The exact body copy, examples and beats for each are in the board sources.
