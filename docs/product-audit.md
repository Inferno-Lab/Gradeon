# Gradeon product audit: inside every page

**Status: DRAFT for the owner's review (2026-11-10).** Companion to [`product-map.md`](product-map.md). The map says where each page belongs; this file goes inside every page and judges each element: **keep**, **fix** (what), **move** (where), **merge** (with what) or **remove**, with the reason. Read from the code, not yet looked at in a running browser or on a device.

Verdict words: `keep` · `fix` · `move` · `merge` · `remove` · `add` (missing and needed for the page to do its job) · `decide` (owner's call; every one is decided in §6). Sections: §0 patterns, §1 admin, §2 console, §3 app, §4 Integrations Hub and every outside credential, §5 half-builds the code admits, §6 decisions. The fix itself is in [`product-fix-plan.md`](product-fix-plan.md).

## 0. Patterns that repeat everywhere

These are fixed once, in the shared place, not page by page.

| # | Pattern | Where seen | Fix |
| --- | --- | --- | --- |
| P1 | **Controls that pretend**: a button or icon that looks like it does one thing and does another or nothing | Dashboard bell (scrolls), phone bell (opens search), Students sort icon (not clickable), Students row kebab (no menu), sidebar "Plan the rooms" (no rooms exist), dashboard "This term" and "This year" (same 24 days), timetable week arrows (the week never differs) | Each one either does the real thing or is removed. New test: no button without an action of its own. |
| P2 | **School data written in code** | Houses (Emerald, Ruby…), grades 1–12, fee types (4 places), enquiry sources, attendance statuses, pass mark 33%, "Term 1", homework marks 20, exam marks 100, working days Mon–Fri, `cls_8a` as the first class, "since 09:00", search hint "Aarav, 8 A" | Each becomes the school's own data (classes, houses, fee heads, working days) or a console setting with that value as the default. |
| P3 | **The same thing twice on one page** | Dashboard has three search entries; Students has two "Add student"; Fees by type on Dashboard and on Fees | One of each. The shell owns search; the page header owns the main action. |
| P4 | **A list of modules kept inside a page** | Dashboard `NEWS`, `TABS`, `WIDGETS`; dock groups in the shell; fallback `['people','timetable']` | Read from the one module definition (map §7). |
| P5 | **Staff choose what Gradeon should decide** | Message dialog asks SMS / WhatsApp / App | The channel comes from the console's routing for that message. |
| P6 | **A second way to do what has one home** | Students' own CSV-paste importer next to the import engine; collecting a fee only from a student's panel | One importer; an action lives on its module's page and is linked from elsewhere. |
| P7 | **A user's choices kept in the browser** | Dashboard widget choice in `localStorage` | Saved to the user's account (follows them to the phone). Menu collapse may stay in the browser. |
| P8 | **Developer or wrong-audience wording** | "Their invite is in the test inbox"; "Ask the school office for the roll-call permission" (roles are set by Gradeon); raw stage names in a footer | Copy pass: every line names what the school user can actually do. |
| P9 | **Columns and facts that ignore switched-off modules** | Students table "Last 10 days" and "Fees" columns, profile facts, dashboard subtitle and Messages button | Each element declares its module; hidden when the module is off. |
| P10 | **Create and delete only, no edit** | Staff (name, email, phone), homework, exam, enquiry, student | Every record a school creates can be corrected. |
| P11 | **The open thing has no address** | Student panel, homework sheet, exam sheet, console school tabs | Every panel and tab has a URL, so search, notifications and "Needs you" can link to it. |
| P12 | **Approve-only decisions** | "Needs you" rows on desktop and phone | Approve and decline with a reason, and a way to open the item first. |
| P13 | **A fleet-wide action inside one school's page** | Console school tabs that change every school | Fleet actions live on fleet pages; a school page changes that school only. |
| P14 | **One word naming several things** | "Migration" (schema, data import, moving in), "Modules" (three homes), "Events" (calendar and message events) | One word, one meaning (map §8). |
| P15 | **Raw keys, JSON and status words shown to people** | Console wave states, setting keys, JSON blobs | Plain words; keys only in a developer view. |
| P16 | **Server actions with no button, buttons with no server action** | Go live, Plans, retry paths; app share/save/attach | Every action has both ends or neither. |
| P17 | **One click for something fleet-wide or irreversible** | Year start, leave approve, fleet pushes | Confirm with what will happen, undo where possible, second person where money or every school is affected. |
| P18 | **The same hard-coded list copied** | Languages ×4 (incl. the app's `_locales`), `TARGET` ×3, action names ×3, boards, notice categories (writer and reader differ) | One list, from the module definition or the school's data. |
| P19 | **Configured outside the console** | Server variables for messaging mode, alerts, virus scanning, GitHub builds, Neon, backups; build-time privacy notice; Firebase files handed to a developer | A credential template in the Hub (§4) or a console setting; only the variables that start the server remain. |
| P20 | **Built on one side only** | Live bus (server ready, no driver screen), push (server ready, app missing), uploads (server ready, app sends names), student role (model exists, no screens) | Each finished end to end, or removed. |

## 1. Admin (school staff)

### 1.1 Shell: menu, dock, search (`app/useChrome.tsx`, `app/nav.ts`)

| Element | Now | Verdict |
| --- | --- | --- |
| Menu groups and items | From `nav.ts` DEFS, not the module definition | fix: generated from the module definition, grouped as map §3 |
| School header (logo, name, place, collapse) | Works | keep |
| Term card in the menu: term chip, "N days to go", progress bar | Shown to everyone, even with exams off | fix: only with the exams module; text from the school's calendar |
| Term card button "Plan the rooms" | Opens Exams; there is no room planning anywhere | remove (P1) until rooms exist |
| Me row: first role only | A person with two roles sees one | fix: show all, or "2 roles" |
| Me menu: Switch to light/dark, Sign out | No "My account" (name, password, sign-in devices) | add: My account |
| Search (Ctrl K, `/`) | Works; empty text names demo data "Aarav", "8 A" | fix the text (P2) |
| "G then a letter" shortcuts | Work, shown nowhere except some menus | keep; list them in one "Shortcuts" help item |
| Phone dock: Home, People, Money, More | Groups written in code; "People" opens Students, "Money" opens Fees | fix: from the module definition; a teacher's dock should lead to their own work (attendance, homework), not Money |
| Phone "More" sheet | Has Sign out, no light/dark switch | fix: same items as the me menu |

### 1.2 Dashboard, desktop (`dashboard/`)

| Element | Now | Verdict |
| --- | --- | --- |
| Subtitle "X of Y classes have marked attendance" | Always, even without attendance | fix (P9) |
| Header search box "Search anything Ctrl K" | Duplicates the shell's search | remove (P3) |
| "Find" button in the greeting tile | Third search entry | remove (P3) |
| Bell "Notifications" | Only scrolls to "Needs you" | remove; the Approvals tile is the entry (P1) |
| Range menu Today / This week / This term / This year | Term and year both mean 24 days | fix: real term and year from the calendar, or keep only Today and This week |
| "New" menu | Hard-coded list; "Collect a fee" is dead (`?pay=1` needs `open`); notice, attendance and exam only open the page | fix: from the module definition, each entry opens its real "new" dialog; hidden without permission |
| Greeting tile quick buttons | Messages shown without the chat module; calendar art is decoration | fix gating; keep art |
| "Present today" tile | Chip says "Students", arrow opens Students | fix: opens Attendance |
| Fees tile | Opens Fees | keep |
| Approvals tile | Sub-text fixed "Leave, concessions, notices"; arrow scrolls | fix: counts by real kind, opens the Approvals page |
| Chart tabs Attendance / Fees / Homework | Hard-coded; only attendance has the previous-period line; a dead `hover` handler | fix: from modules, same comparison on each; remove dead handler |
| "Needs you" list | Approve only; attendance reminder mixed in with approvals; done-state kept in the page | fix (P12): approvals and reminders separated, decline with reason, open the item |
| "Class rolls · today" | Works | keep (attendance module) |
| "Fees by type" | Same as Fees page "Collected by type" | remove from Dashboard or make it the link to Fees (P3) |
| "Today at school" | Events module | keep |
| "Add a widget / Choose widgets" | Hard-coded list, saved in the browser; top tiles and chart cannot be chosen | fix (P4, P7); defaults per role come from the console |
| Everything | Gated by module only | fix: also by the user's permission (a teacher should not see fee totals) |

### 1.3 Dashboard, phone (`phone/`)

| Element | Now | Verdict |
| --- | --- | --- |
| Bell "N things need you" | Opens search | fix: opens Approvals (P1) |
| Error title "Home" | Desktop says "Dashboard" | fix: one name ("Home", matching the dock) |
| "Needs you" with Undo | Approve only | fix (P12); keep Undo |
| Fees bars, tiles | Nothing opens anything | fix: each opens its page |

### 1.4 Students (`students/`)

| Element | Now | Verdict |
| --- | --- | --- |
| Header: Import, Export, Add student | Works | keep |
| "Add student" in the table caption | Duplicate | remove (P3) |
| Import dialog | Own CSV-paste importer; text says CSV, empty state says Excel | merge into the import engine (P6) |
| Views: All, My class, Fees overdue, New this year | "My class" reads a school setting `students.pinnedClass` | fix: "My class" is the signed-in teacher's own class; the setting goes |
| Filter pills: Class, House, Fees | Houses written in code | fix (P2): houses are school data; pill hidden if the school has none |
| "Add filter" pill | Only an attendance filter, with "Below 88%" fixed | fix: rename "Attendance"; threshold from the attendance goal |
| Summary strip: Present today "+N since 09:00", Fees overdue "₹x.00", Average attendance | 09:00 fixed; fake decimals | fix both; each hidden with its module |
| Table header "Student" with a sort icon | Not clickable | fix: real sorting, or no icon (P1) |
| Columns "Last 10 days", "Fees" | Stay when the modules are off | fix (P9) |
| Row kebab button | No menu | fix: real menu (Open, Message, Collect fee, Edit) or remove |
| Paging: 10 rows, Previous / Next | No page size, no count jump | fix: rows per page 10/25/50, "1–10 of 480" |
| Bulk bar: Message, Invite to app, Assign fee, Export, clear | Works | keep |
| Message dialog channel picker | Staff choose SMS / WhatsApp / App | remove picker (P5) |
| Assign fee dialog | Fee types written in code | fix (P2): the school's fee heads |
| Profile panel facts: attendance, latest exam, homework, library | Shown whatever the modules | fix (P9) |
| Guardian block | One guardian, fixed text "Primary · may collect from school" | fix: all guardians, real relation and pick-up right |
| Phone Reveal / Hide | Works (audited) | keep |
| Photo and documents, Activity | Works | keep |
| "Collect fee" | The only way to collect a fee | move the action to Fees; this becomes a link into it (P6) |
| Missing | Edit a student, change class, second guardian, mark as left, URL for the open panel | add (P10, P11) |
| Add student dialog | No gender, house or admission number | add the fields the school's records need; which are required is a console setting |

### 1.5 Staff (`staff/StaffPage.tsx`)

| Element | Now | Verdict |
| --- | --- | --- |
| Table: Person, Teaches, Role, Periods a week, Status; search | Only the first role shown; "Periods a week" shown without timetable | fix both |
| Add / edit dialog | Name, email and phone locked after creation; default role id `role_teacher` in code | fix (P10); default role from the role list |
| Toast "Their invite is in the test inbox" | Developer wording | fix (P8): "Invite sent to <email>" |
| Switch off / on | Works | keep |
| Missing | Resend invite, filter by role or status, export, import button (the import kind exists) | add |

### 1.6 Admissions (`admissions/AdmissionsPage.tsx`)

| Element | Now | Verdict |
| --- | --- | --- |
| Board: Enquiry, Applied, Test, Offer, Enrolled | One forward step per card, no way back | fix: move back one stage; stages a console setting (some schools have no test) |
| Declined card, Show / Hide | Works | keep |
| Footer "Stages: enquiry → applied → …" | Prints raw values | remove (P8) |
| Grade list 1–12 | Written in code | fix (P2): the school's classes |
| Source list | Written in code | fix (P2): console setting |
| Details dialog | Only the note can be edited | fix (P10) |
| Enrol dialog: class, date of birth | Works | keep |

### 1.7 Attendance (`attendance/AttendancePage.tsx`)

| Element | Now | Verdict |
| --- | --- | --- |
| Day | Only the latest school day, taken from the Dashboard's API | fix: a date control (back to the limit the console sets for corrections); own source for the day |
| Class picker | Starts on the first class | fix: starts on the teacher's own class |
| Statuses Present / Late / Absent | Written in code | fix (P2): the list is a console setting (leave, half day) |
| Chip Submitted / Not submitted yet, "Mark everyone present" | Works | keep |
| Count tile with Save / Discard | Placed above the roll by a CSS order trick | keep; fix the order in markup |
| Toast "Parents of absent children are told." | Said always | fix: say it only when the message really goes (routing on) |
| No-permission line "Ask the school office…" | Roles are set by Gradeon | fix (P8) |
| Missing | Month view per class, a student's history, who has not marked today, export | add: the page is a roll call only; it is not yet "Attendance" |

### 1.8 Timetable (`timetable/`)

| Element | Now | Verdict |
| --- | --- | --- |
| Class picker | Starts on `cls_8a` (a demo id) | fix (P2) |
| Days Mon–Fri | Written in code; the demo school teaches seven days in the app | fix: the school's working days |
| Chip "Term 1" | Written in code | fix: the current term |
| Week arrows and "W46" label | Dates change, the timetable never does | remove, or keep only once a week can differ (cover, holidays) (P1) |
| Views Week / Day / List | Work; first selected cell fixed at Wed period 3 | keep; select the current period |
| Subject colours | The matching code splits names on the letter "s" (`/s+/`), so Science, English, Maths never match | fix (bug) |
| Clash chip, "Fix" with suggestion, teacher chooser | Works | keep |
| Selected-period panel, load ring (limit falls back to 30), "Heaviest loads" | Limit written in code | fix: limit from the console setting |
| Publish | Works; error toasts are not marked as errors | fix tone |
| Missing | Place a free period, change subject or room, a teacher's own timetable, a room view, print | add |
| Dead code `void teaching; void t` | – | remove |

### 1.9 Homework (`homework/HomeworkPage.tsx`)

| Element | Now | Verdict |
| --- | --- | --- |
| Tiles: Handed in, On time, Homework set | Works | keep |
| List "All homework" | No column headings, no filter by subject, teacher or open/closed; a teacher sees every class | fix: headings, filters, "Mine" first for a teacher |
| Set homework dialog | "Marks out of" always asked, 20 in code; due date +2 days in code | fix: marks optional; defaults from console |
| Homework sheet | Tick and marks per student; a `feedback` value is carried but has no field; attached files and the files students upload from the app are not shown | fix: show files, add feedback or drop it |
| Remove homework | Works with confirm | keep |
| Missing | Edit title, text, due date (P10); URL for the sheet (P11) | add |

### 1.10 Exams (`exams/ExamsPage.tsx`)

| Element | Now | Verdict |
| --- | --- | --- |
| Sections Marking / Coming up / Published, class filter | Works | keep |
| New exam | One class per exam, so a school-wide mid-term is typed once per class; 100 marks and dates in code | fix: pick several classes; defaults from console |
| Marks grid, Enter moves down, "A" for absent | Works | keep |
| Marks stay editable after publishing | Changes reach families silently | decide: lock after publish, or "republish" with a note |
| Results tab: rank, total, %, grade | Pass mark 33% in the page | fix (P2): from the grading setting; rank shown only if the console allows it |
| Publish button | Uses a browser tooltip (`title=`) | fix: `data-tip` |
| Missing | Edit an exam, exam timetable for families, report card, URL for the sheet | add (report cards are in the features plan; the rest is repair) |

### 1.11 Fees (`fees/FeesPage.tsx`)

| Element | Now | Verdict |
| --- | --- | --- |
| Fees, Invoices, Online payments | Three menu pages for one job | merge: one Fees page with tabs Overview / Invoices / Receipts / Online / Refunds (map §3), each tab with a URL |
| Tiles: Collected in the month, Still to come in, Overdue | Current month only | fix: period control (month, term, year) |
| "Still to come in · not yet due or in part" | Unclear wording | fix copy: "Not yet due" |
| "Collected by type" | Works | keep (the one home of this chart) |
| "Overdue families" list | First 30 only, no paging, while the chip shows the full count | fix: paging; rows open the student |
| "Text everyone on this list" | Sends at once with no confirm, and only to the 30 shown; "Text" names a channel | fix: confirm with the count, all overdue families, wording "Remind" (P5) |
| "Collect" | Opens a dialog that lives in the Students code | move the dialog into Fees (P6) |
| Missing | Fee structure (what each class pays, when), concessions, late fee rule shown, export | add: today a fee can only be assigned from Students' bulk bar |

### 1.12 Invoices (`invoices/InvoicesPage.tsx`)

| Element | Now | Verdict |
| --- | --- | --- |
| Invoices / Receipts switch, search, status filter, paging | Works | keep (as tabs of Fees) |
| "Kind of fee" filter | Four fee types written in code | fix (P2) |
| Tiles Billed / Collected / Still to pay | Works, follow the filter | keep |
| Invoice row | Cannot be opened; "Collect" opens the student's whole dues, not this invoice | fix: row opens the invoice (lines, payments, waive, cancel with reason) |
| Receipt sheet "Print receipt" | Builds its own page with fixed colours; Online payments prints a PDF from the server | merge: one receipt (the server PDF) everywhere |
| Receipts list | No paging; a receipt cannot be cancelled | fix: paging; cancel with reason and a second person, per console rule |
| Missing | Create an invoice here, export | add |

### 1.13 Online payments (`fees/OnlinePaymentsPage.tsx`)

| Element | Now | Verdict |
| --- | --- | --- |
| Tabs Payments / Refunds / Reconciliation | Held in the page, no URL | fix (P11); become tabs of Fees |
| Payments table, Receipt, Refund | No search, filter or paging | fix |
| Refund dialog (amount, why, limit → second person) | Works | keep |
| Refunds: Decline / Approve | One click, no reason for a decline, no confirm for sending money | fix (P12) |
| Reconciliation: "Sorted out" | One click, no note of what was done | fix: note required |

### 1.14 Notices (`notices/NoticesPage.tsx`)

| Element | Now | Verdict |
| --- | --- | --- |
| List | Title, status, audience, text; no search or filter; attachments not shown | fix |
| A notice once saved | Cannot be opened, edited, sent (a draft stays a draft for ever) or removed; a waiting notice can only be approved from the Dashboard | fix (P10): open, edit draft, send, withdraw; approve from the notice and from Approvals |
| "Who it is for": Everyone / Parents / Staff / One class | Written in code; no several classes; students missing now that they are an app role | fix: audiences from roles and classes |
| Help line "wait for the principal's approval" | Names a role in code | fix: from the approval rule the console set |
| Notice text box | Hand-built, not the shared field | fix: shared `AreaField` |
| Missing | Who has read it, schedule for later | add read count; scheduling is `decide` |

### 1.15 Messages (`messages/MessagesPage.tsx`)

| Element | Now | Verdict |
| --- | --- | --- |
| Open / Unread / Closed, list, conversation, reply | Works | keep |
| "Take it", Close / Reopen | Cannot hand to someone else | fix: assign to a person |
| New message | One student's family; no class or group (that is a notice) | keep |
| Missing | Search, "Mine" filter, attachments, URL per conversation (P11) | add |

### 1.16 Events (`events/EventsPage.tsx`)

| Element | Now | Verdict |
| --- | --- | --- |
| Month calendar, dots, legend | Week starts Monday in code; times use the computer's time zone, not the school's | fix |
| Card "<Month> at a glance" (counts and "Next:") | Repeats the calendar and the list beside it; exists to fill the column | remove |
| "Coming up" list with "Earlier" | Works | keep |
| Kinds: Event, Holiday, Exams, Parent meeting | Holidays also live in the school calendar (Year); exam weeks also live in Exams | fix: holidays and exams appear here from their own homes, typed once |
| "Who is told": Everyone / Parents / Staff only | No class, unlike notices | fix: same audience picker as notices |
| Going / maybe / cannot counts | Numbers only | fix: open the list of who; no replies asked for a holiday |
| Note field | Editable-looking for someone who cannot save | fix |
| Start 10:00, end 12:00 | In code | keep as plain defaults |

### 1.17 Gallery (`gallery/GalleryPage.tsx`)

| Element | Now | Verdict |
| --- | --- | --- |
| Album cards, Shared / Draft chip | Works | keep |
| "Add a photo" | One file at a time | fix: many at once |
| Photo "Remove", "Delete album" | One click, no confirm; the album delete removes every photo | fix: confirm |
| Subtitle "Albums by class and event" | An album cannot be linked to an event in the dialog (`eventId` is only carried along) | fix: event picker, or drop the claim |
| Tagging and the consent warning | Works | keep |
| Empty state picture | The notice-board picture reused | fix: its own picture |

### 1.18 Library (`library/LibraryPage.tsx`)

| Element | Now | Verdict |
| --- | --- | --- |
| Tiles Titles / Out on loan / Overdue | Work | keep |
| Tabs Catalogue / On loan / Reservations | Held in the page, no URL | fix (P11) |
| Catalogue list | The whole catalogue in one list, no paging; search only on this tab | fix: paging; search on loans too |
| Category field | Free text, so "Fiction", "fiction" and "Story" become three categories | fix: pick from the categories in use, or add one |
| "Issue" | Students only; staff cannot borrow; loan length falls back to 14 days in code | fix the fallback (the rule comes from the console); staff borrowing is `decide` |
| "Remove from catalogue" | One click inside the edit dialog, no confirm, even with copies out | fix: confirm; refuse while a copy is out |
| "Take back" | Confirms and shows the fine | keep |
| Fine | Shown, then nothing: it cannot be collected or waived anywhere | fix: a fine becomes a line in Fees or is waived with a reason |
| Reservation "Cancel" | One click; the family is not told why | fix: confirm with a reason |
| Missing | Renew a loan, mark a book lost or damaged | add |

### 1.19 Transport (`transport/TransportPage.tsx`)

| Element | Now | Verdict |
| --- | --- | --- |
| Subtitle "…and where the bus is now" | There is no map; the position is two numbers in a tooltip on the "Live" chip | fix (P1): a map through the Hub's maps provider, or drop the claim |
| Tiles Routes / Riders / Buses live now | Work | keep |
| Tabs Routes / Who rides | No URL | fix (P11) |
| Route card: bus, driver, fee, riders, stops | Works | keep |
| "Route fee … a term" | A number on the route; the fee structure also has a "transport" fee type: two places for one fee | merge: the route fee is a fee structure line (P3) |
| Stop "Latitude / Longitude (optional)" | Staff type coordinates by hand | fix (P8): search a place or drop a pin; hidden while maps are off |
| Stop order | "Move up" only | fix: up and down |
| Remove stop, "Remove route" | One click, no confirm, even with riders on it | fix: confirm, say how many riders lose their stop |
| Driver's phone "shares the position from the app" | The app has no driver role | decide: how a driver shares the position |
| Who rides | One class at a time, classes taken from the riders list, no search; each change saves at once with no word | fix: search, "Saved" toast; the student's profile shows the same route |

### 1.20 Classes and calendar (`setup/SetupPage.tsx`)

| Element | Now | Verdict |
| --- | --- | --- |
| Name | Menu says "Classes and calendar", the code and the next menu item say "setup" / "School setup" | fix: names from the map §8 |
| Groups Calendar / Classes / Fees | No URL; fee structures live here while the Fees page has none | move fee structures to Fees; fix (P11) |
| Years (with a "current" Yes / No field) | Years are also made and started on Year-end: two ways to change the current year | merge: years live on one page; remove the "current" field (P3) |
| Holidays | Also typed as events of kind Holiday | merge (see 1.16) |
| Fee type and period kind lists | Written in code (`HEADS`, `PERIOD_KINDS`) | fix (P2) |
| Row dialog | Built from the import columns; "To rename it, remove it and add it again" | fix: a row can be renamed (rows are known by id, not name) |
| "Remove" | One click, no confirm: a class, a subject, a year | fix: confirm; refuse while something uses it |
| "Add to students' fees" | Hidden in the edit dialog of a fee; bills every matching student in one click, no preview | move to Fees as "Assign", with the count shown first |
| Class teacher | Chosen by e-mail: staff with no e-mail cannot be picked | fix |
| Locked section note "use Ask Gradeon on School setup" | Sends the reader to another page | fix: the ask button sits here |
| Dates | Own formatter, not the shared one | fix |

### 1.21 Year-end (`year/YearPage.tsx`)

| Element | Now | Verdict |
| --- | --- | --- |
| "Promote students" (header) | Runs even with no draft year: the target falls back to the current year | fix: needs a draft year; says so when there is none |
| Promote dialog: where each class goes, detained, leaving, dues note | Works | keep; add a last step that shows the counts before anything moves |
| Draft year "Start" | One click; archives last year; the tip "Promote students first" is advice, not a rule | fix: confirm; blocked until a promotion has run, or says what is skipped |
| Draft year "Remove", "Undo the latest", "Rejoin" | One click each | fix: confirm |
| "Students who left" + "Record a leaver" | Lives here; a leaver is a student | move: Students gets a "Left" filter and the action on the profile (P6); this page keeps years and promotion |
| Help "Classes come from … Migration" | Migration is the console's word | fix: "Moving in" (P8) |
| Records-kept note | Works | keep |

### 1.22 Reports (`reports/ReportsPage.tsx`)

| Element | Now | Verdict |
| --- | --- | --- |
| Place in the menu | Under Money, though it covers every area | move (map §3) |
| Report list by area | Works; the open report has no URL | fix (P11) |
| Filters | None: no dates, class or term on any report | fix: each report says which filters it takes |
| Subtitle "read, print or take to a meeting" | There is no print | fix (P1): print / PDF, or change the words |
| "Download CSV" | File is named after the report's id | fix: the report's title and the date |
| Table | No sorting; rows do not open the student or class; chip says "rows" | fix |

### 1.23 Moving in (`moving-in/MovingInPage.tsx`)

| Element | Now | Verdict |
| --- | --- | --- |
| The page | Five jobs: send files, see imports, invite families, invite staff, export everything | move: invites go to Students and Staff (new families join every year); export goes to School → Data; this page is import only and leaves the menu after go-live |
| "Send us your files" | One file at a time | fix: several |
| Sent list: With Gradeon / Imported / Set aside | No reason shown when a file is set aside | fix |
| "Blank sheet to fill in" | Lists every kind, also for modules the school does not have | fix (P9) |
| "What Gradeon imported" | Works | keep |
| Family letter | Built in the page with fixed colours and text: "Install the Gradeon app" (a school's app has its own name), a fixed list "attendance, homework, marks, fees and notices", "code by SMS", parents only | fix: one letter template from the console, printed by the server, per role (P2, P4, P5) |
| "Invite" / "Invite every family" | Toast says "by SMS"; a family that was invited but never signed in cannot be reminded | fix: add "Remind"; no channel in the words (P5) |
| Signed in bar, Consented | Work | keep (move with the invites) |
| Staff invite | All at once; staff with no e-mail are not mentioned | fix: say who was skipped and why |

### 1.24 School setup (`settings/SettingsPage.tsx`, `panels.tsx`, `settings.view.tsx`)

The whole page is read-only (`canWrite = false` in two places), which is the rule. But it is still drawn and worded as a settings editor, and the school's real daily work is buried in its last tabs.

| Element | Now | Verdict |
| --- | --- | --- |
| Eight tabs, held in the page | No URL; six show settings nobody here can change, two hold real work | fix: the page becomes "School" with what the school reads (identity, plan, what is switched on) and "Ask Gradeon"; work moves out (below) (P11) |
| Name, logo letters, About, brand swatch, switches, selects | Drawn as inputs and switches, all locked | fix (P1): shown as plain facts, not as dead controls |
| Panel subtitles "Switch whole areas on or off…", "Choose what the school's app shows…", "Choose which messages go out…" | Promise a choice the school does not have | fix (P1) |
| Message template text box, Privacy notice text box | Not locked: staff can type, nothing can be saved | fix (P1, a bug) |
| "Plan and usage": status "Active", "Next invoice, 1st of next month", "Renews yearly", "Billed yearly" | Written in the page, not read from the school's contract | fix (P1): from the console's billing record, or removed |
| "Manage billing" | Opens an e-mail to a fixed address | fix: "Ask Gradeon", like everything else |
| SMS credits | Shown here and again under Notifications | merge: one place (P3) |
| "Who approves fee waivers": Principal / office / anyone | Role names in code | fix (P2): from the school's roles |
| Roles and access | Read-only list of roles and what each allows | keep, read-only; lives with Staff ("who can do what") |
| App layout (with phone sketch), Notifications grid, Message templates | Read-only copies of console screens | remove from the admin; one line "Set up by Gradeon" with Ask. The console is their one home |
| Connected channels | Read-only state of each channel | keep (useful: "are texts really going out?") |
| Data requests (log, close, decline) | Real work inside Privacy → tab 7 | move: its own page under School (map §3); closing one needs a note, declining needs a reason |
| Audit log | Latest entries only: no search, filter, person, date range or paging | move: its own page under School; add those |
| "Ask Gradeon to change this" | The answers appear only inside the ask dialog, last five | fix: a "Your requests" list on the page; the same button wherever a locked thing is shown |
| Ask dialog text box | Hand-built | fix: shared `AreaField` |

### 1.25 Sign-in and edge pages (`login/`, `status/`, `app/SupportBanner.tsx`)

| Element | Now | Verdict |
| --- | --- | --- |
| Sign in: password, then code; reset; remembers the e-mail | Works; school's name, colour and logo | keep |
| "We couldn't find that school" / "The school isn't answering yet" | Works | keep |
| "Which school?" picker | Plain; uses the notice-board picture | keep; own picture |
| "Opens in a coming release" page (`/p/<name>`) | No menu item leads to it any more | remove |
| "Not in your plan" page | Titled from the dashboard scope; button goes to School setup | keep; the button opens Ask Gradeon directly |
| Not found | "Search" just goes to the dashboard | fix: open search |
| Support session bar (who, time left, End) | Works | keep |

## 2. Console (`apps/console`)

Three things are missing from the whole console, not from one page. They are listed first because the owner's goal ("everything from the console") depends on them.

| Missing | Proof | Verdict |
| --- | --- | --- |
| Suspend / bring back a school | `school.suspend` and `school.resume` exist as actions and are named in Approvals and Blueprints, but no button anywhere requests them | add: on the school's header menu |
| "Go live" for a school | The Migration tab shows a "Ready to go live" checklist and nothing to press | add: one button under the checklist, locked until the list is green |
| Plans (name, price, modules, limits) | `app.api.plans` is read in four places; nothing edits a plan. Plans are code | add: a Plans page (map §4). Until then prices cannot change without a deploy |
| App roles per school (student, parent, teacher) | Roles tab handles staff roles only | add: three switches on the school's Roles tab (owner's rule, map §2) |

### 2.1 Shell: menu, search, me-menu (`app/nav.ts`, `app/useChrome.tsx`)

| Element | Now | Verdict |
| --- | --- | --- |
| Menu groups Operate / Ship / Care | "Care" holds eight unrelated pages (Health, Approvals, Requests, Support, Test inbox, Billing, Compliance, Team) | fix: regroup as in map §4 (Schools, Platform, Work waiting, Business, Console) |
| Menu icons | `inbox` used for Requests and Test inbox; `sup` for Support and Compliance | fix: one icon per page |
| Keyboard shortcuts (G then a letter) | Letters are arbitrary (E = Modules, N = Integrations, L = Flags, and so on) and shown nowhere a person learns them | decide: keep only if listed in search; otherwise remove |
| Count badges | Onboarding, Approvals, Requests get counts; `builds` count is declared and never passed | remove the dead `builds` count |
| Sidebar card "N requests to approve / Nothing waiting" | Same number as the Approvals badge and the Fleet bell | remove (P3) |
| Search | Finds schools and pages only | fix: also people in the team, connections, open requests, a school's tab ("Greenfield roles") |
| Environment label | Guessed from the hostname ('Local', 'Test track') when not set | fix: comes from the server; a guess can say "Test" on production |
| Menu collapsed state | Browser storage | keep (per-device convenience, the one allowed use of P7) |
| Phone dock: Fleet, Onboard, Releases, More | Fixed in code; Onboard and Releases are rare jobs | fix: Fleet, Approvals, Health, More (what is opened from a phone) |
| Me-menu: theme, sign out | No way to change one's own password or authenticator | add: "My account" (password, authenticator) |
| `roleLabel` map | Hand-kept beside `CONSOLE_ROLES` | fix: label lives with the role definition |

### 2.2 Fleet (`pages/fleet`)

| Element | Now | Verdict |
| --- | --- | --- |
| Header search box | Second search beside the shell's search | remove (P3) |
| Bell button | aria-label "Approvals", opens a dialog titled "Alerts" (approvals + slow schools + incident) | fix: one name, "Alerts"; each line links to its page |
| "Onboard a school" | Works | keep |
| Release tile: state, version, wave ticks, Pause/Resume, Roll back, arrow | Works; roll back asks first | keep |
| Schools tile "Live now", arrow labelled "Open onboarding" | Arrow goes to `/onboarding/new`: it starts the wizard | fix: goes to the schools list |
| Health tile | Not clickable | fix: opens Health |
| "Requests per minute" chart | Subtitle always says "updated just now" | fix: real time of the last reading (P1) |
| Cells card, "Manage" | Each cell is a clickable `div`, no keyboard | fix: a link |
| Schools table (School, Cell, Version, Status, p95) | No search, filter, sort or paging; chip "newest first"; an "up" arrow drawn on the first three newer rows as decoration | fix: search, filter by status / cell / plan, sort, paging; remove the decoration. This is the list every other page should link to |
| Incident card: Dismiss, Open the school, Check again | Dismiss lives in page state and returns on reload; the school is found by matching its name | fix: dismiss is saved per person; incident carries the school id |
| "N schools start soon" tile | Not clickable | fix: opens Onboarding |

### 2.3 Onboarding list and wizard (`pages/onboarding`)

| Element | Now | Verdict |
| --- | --- | --- |
| "Being set up" rows with step bar | Works, opens the school | keep |
| "Saved drafts": Continue, Delete | Delete is one click, no undo; "Step N of 7" written as a number in the page | fix: confirm or undo; the count comes from the step list |
| "Went live recently" | Five rows | keep |
| Wizard step rail | Clickable when earlier steps are valid | keep |
| Step 1 Board select | CBSE, ICSE, State, IB, International, Other written in the page | fix: the same list the setting uses (P2) |
| Step 1 App language | en / hi / mr written in the page (also in Integrations templates) | fix: one language list |
| Step 1 Address name | Auto-made from the name, editable; taken names are only found at review | fix: check when the field is left |
| Step 2 Plan cards | Work; picking a plan resets the modules without saying so | fix: say "modules reset to the plan" |
| Step 2 Module buttons | Modules outside the plan are greyed; features inside a module cannot be chosen here | keep; features stay on the school's Plan tab |
| Step 2 "Students expected" | Plain `Field type=number` | fix: `NumberField`; warn when above the plan's limit |
| Step 2 `addOns`, `locks` | In the saved data, no control sets them | remove from the payload or build them (P1) |
| Step 3 name, logo letters, tagline, brand colour, phone preview | Works; no logo upload although the school page has one | add: logo upload here; the preview says "Pay fees" even if Fees is off (P9) |
| Step 4 "Where it runs" | Cell select with room shown | keep |
| Step 4 Address style, custom domain | "subdomain … needs DNS" with nothing that checks or sets DNS | decide: hide until domains are real, or show its true state (P1) |
| Step 5 First admin | Role fixed to principal; invitation by text / email / both | fix: channel follows what the school has connected (P5) |
| Step 6 Starting data: demo, empty, "empty then import" | "Demo school" can be launched into a real school | fix: demo only on test cells |
| Step 7 Review: problems, summary, "Launch will", capacity, Rehearse, Launch | Works; rehearsal result shows raw step states | keep; plain words for the states |
| Draft autosave | Silent | add: "Saved" tick, so nobody wonders |

### 2.4 School page: header and Overview (`pages/school/SchoolPage.tsx`, `school.view.tsx`)

| Element | Now | Verdict |
| --- | --- | --- |
| Ten tabs | Held in page state: no address per tab, back button leaves the school, a link cannot point at a tab (P11) | fix: each tab is a route, grouped as in map §4 |
| "Support session" button | Reason of 8+ letters, read-only, 30 minutes; countdown lost on reload; the token travels in the address after `#` | keep; the bar reads the session from the server |
| "Erase school" | Sits in the header beside everyday buttons | move: into a "Danger" block at the bottom of the school's Data tab |
| Suspend / bring back | Missing | add (see top of §2) |
| Provisioning steps and log, Retry / Skip | Stays forever after go-live under "How this school was set up" | fix: collapses to one line after go-live |
| Plan ticket: "Active", "Next invoice, 1st of next month" | Both invented in the page (P1) | fix: real status and the real next invoice from Billing, or leave out |
| "Open in billing" | Goes to the whole Billing page, not this school | fix: Billing filtered to the school |
| Usage: students, storage, texts | Texts shown again on the Integrations tab | keep here; remove there (P3) |
| "App stores" checklist | Items change todo → waiting → done when clicked, with nothing saying they are buttons | fix: a labelled control per item, with who changed it and when |
| Contact line | Shown, cannot be edited after the wizard | add: edit the school's contact, name, GSTIN, board |

### 2.5 School → Entitlements (`PlanEditor` in `pages/modules/ModulesPage.tsx`)

| Element | Now | Verdict |
| --- | --- | --- |
| Tab name "Entitlements" | Developer word (P8) | fix: "Plan and modules" |
| Plan select | Choosing a plan silently resets modules, features and limits | fix: say what will be reset before it happens |
| Limits (students, storage, texts) | Plain `Field` with `inputMode` | fix: `NumberField` |
| "Free until (trial)" | Works | keep |
| Module switch, From / Until dates, feature switches | Works | keep |
| "Send to the school" → review dialog | Works; taking away needs a second person | keep |
| Where the code lives | Inside the Modules page file | fix: its own file in `pages/school` |

### 2.6 School → Configuration (`pages/school/ConfigTab.tsx`, `app/ThemeEditor.tsx`)

| Element | Now | Verdict |
| --- | --- | --- |
| Group chooser | A `Select` "Section · count": 15+ groups hidden in a dropdown, no address | fix: a side list of groups, each with an address; a search box over every setting |
| Groups themselves | Mixed by module, by kind and by page (map §5) | fix: map §5 grouping; a module's settings sit with the module |
| Save / Discard + "Why" note per group | Edits in other groups stay unsaved and unseen | fix: show "3 groups have unsaved changes"; one save with one note |
| Chip "Needs a second person" | Works | keep |
| Chip "Saved only" (`notUsedYet`) | A setting that changes nothing is offered as if it did | fix: hidden behind "Show settings not in use yet", off by default |
| Logo picker | Saves at once, outside the version and note flow | fix: part of the same save |
| Module settings of a module that is off | Shown | fix: hidden with one line "Fees is off for this school" (P9) |
| App dock / Home cards / Quick buttons (ordered chips) | Works | keep |
| Notification rules: App / SMS / Email ticks per event | No WhatsApp column although the Hub has the channel | fix: columns come from the Hub's channels |
| Message wording per event | Called "Templates" (third use of the word) | fix: "Message wording" |
| Colours: Admin / App, light / dark / AMOLED, contrast warnings, preview | Good | keep |
| Colour preview | Sidebar says Dashboard / Students / Fees and "Pay" whatever the school has | keep (it is a sample), label it "Sample" |
| History with roll back | Two-step | keep |
| "Templates" card: save this setup, "Apply a template…" to many schools | A fleet-wide action inside one school's tab | move: applying to many schools goes to a Setup templates page; here only "Save as template" and "Start from template" |
| Preview "As this role sees it" | Admin menu drawn from the module list, which is not the menu the admin builds; colour shown as hex | fix: after the one module definition (map §7) both come from the same source; until then remove the Admin menu preview (it shows a menu the school does not get) |
| Help text "The school sees it, read-only, under School setup…" | True | keep |

### 2.7 School → Roles (`pages/school/RolesTab.tsx`)

| Element | Now | Verdict |
| --- | --- | --- |
| Role chips "name · people", "+ New role" | Works; a new role starts with `students.read` | keep; a new role starts from a chosen template |
| Permission ticks grouped by area, "careful" chip | Filtered by the school's modules | keep |
| Principal role locked | Works | keep |
| Delete role | Only when nobody holds it, two-step | keep |
| "Who has which role": a select per staff member | Saves the moment it changes, no confirm, no search | fix: search; changing a role asks once |
| App roles (student, parent, teacher) | Missing | add: three switches "Students / Parents / Teachers can sign in to the app" |
| Role templates | Written in code | fix: listed and editable in the console (P2) |

### 2.8 School → Migration (`pages/school/MigrationTab.tsx`)

| Element | Now | Verdict |
| --- | --- | --- |
| Tab name "Migration" | Third meaning of the word (database changes, this, admin "Moving in") | fix: "Import and go-live" |
| "Ready to go live" checklist, "Mark done" | No "Go live" button | add the button |
| Old-system dues compare | Works | keep |
| Import: kind select, blank template, choose a file, type rows, column mapping, editable preview, counts | Works; one engine | keep |
| Imports list, Undo | One click, no confirm, removes rows | fix: confirm with the row count |
| "Files from the school": Open, Set aside, Download | Works | keep |
| "Load a realistic test school" | Beside real import on a real school | fix: only on test cells |
| "Export everything" | Lives with import | move: the school's Data tab |
| `SOURCES` names (fedena, entab…) | Written in the page | fix: from the import engine (P2) |

### 2.9 School → Versions

| Element | Now | Verdict |
| --- | --- | --- |
| Running versions | Read-only | keep |
| "Database · Migrations": Rehearse, Run | Per school; the Migrations page shows the same from the other side | keep here; link the two |
| "Mobile app builds": "Build Android" | Same action as the Mobile builds page; no iPhone | keep one: the school's App tab shows its builds and the button; the global page becomes the list of all (P3) |

### 2.10 School → Health

| Element | Now | Verdict |
| --- | --- | --- |
| "Right now", "Check now" | Checks every school, not this one | fix: checks this school |
| "How it is checked" card | Help text drawn as a card | fix: one help line |
| Backups: list, "Back up now", "Restore…" | Under Health; refresh after backup is a fixed 1.5 s wait | move: the school's Data tab; refresh when the job ends |

### 2.11 School → Audit

| Element | Now | Verdict |
| --- | --- | --- |
| Latest entries | Raw action keys (`config.apply`), no filter, person, dates or paging; chip "N latest" | fix: plain names from the one action list; filter by person, action, date; paging; export |

### 2.12 School → Integrations and Records (`pages/school/IntegrationsTab.tsx`)

| Element | Now | Verdict |
| --- | --- | --- |
| Route per capability: "Its own" / "Gradeon default" | Works | keep |
| Link to the Integrations page | `href="#"` | fix: a real link |
| "Texts this month" | Duplicate of Overview usage | remove (P3) |
| Own connections | Works | keep |
| Recent failures | Shows full recipient numbers | fix: masked, shown in full on request |
| Records tab: "Students who left" past retention, "Request erasure" | Really data retention; overlaps Compliance; code lives in the integrations file | move: the school's Data tab with backups, export and erase |

### 2.13 Modules (`pages/modules/ModulesPage.tsx`)

| Element | Now | Verdict |
| --- | --- | --- |
| School × module matrix | Modules only, no features; no school search; grows sideways with every module | fix: search and filter; a module column opens its features |
| Bulk Give / Take away with "Until" | Works, reviewed, second person for taking away | keep |
| "Not built yet" card, "From the features master" | Developer wording (P8) | fix: "Planned"; text from the module definition |

### 2.14 Cells (`pages/cells`)

| Element | Now | Verdict |
| --- | --- | --- |
| Tiles: Cells, Schools placed, Space used | Works | keep |
| Cell card: bar, region, schools here, Manage, Move | Works | keep |
| Add a cell: name, runs on, region, most schools | "Runs on: This computer" is offered on a hosted console | fix: targets offered come from the server |
| Cloud-cell note "needs the address of its database server in the console's settings" | There are no such settings in the console; it is an environment variable | fix: say so, or add the field (P1) |
| Manage: region, most schools, accept new schools | Works | keep |
| Delete a cell | Missing (P10) | add: only when empty |
| Move school: Rehearse, Move | Works; second person | keep |

### 2.15 Releases and Migrations (`pages/releases`)

| Element | Now | Verdict |
| --- | --- | --- |
| Page subtitle | Three sentences of how deploys work | fix: one line; the rest in help |
| New release: version, what changed | Works | keep |
| Release card: waves, schools, Start, Pause / Resume, Roll back | "Roll back" only relabels schools; the dialog admits the code does not change | fix: name it "Mark as rolled back", or make it real (P1) |
| Wave status | Raw word (`pending`, `rolling`) | fix: plain words |
| Rollout rules (waves, window, halt thresholds) | On the Blueprints page | move: here, a "Rollout rules" card |
| Migrations page | Read-only list by change, chip shows `expand` / `backfill` / `contract`; cannot open the failing school | fix: plain words; failed school is a link; becomes a tab of Releases ("Database changes"), which ends the name clash |

### 2.16 Integrations (`pages/integrations`)

| Element | Now | Verdict |
| --- | --- | --- |
| Mode banner Sandbox / Live, Allow-list | Works | keep |
| Tiles, Connections cards (Test, Go live, Pause, Back to test, Change, Delete) | Works; Delete's confirm button is the primary style | fix: danger style |
| Tabs | Page state, no address (P11) | fix: routes |
| Routing: default + per-school override | The select sits in the card's chip slot | fix: in the card body |
| Templates (message → approved template) | Languages en / hi / mr written in the page | fix: the one language list; rename "Approved templates" |
| Activity: filters, Retry | Shows full recipient and message body to every console role | fix: masked unless the role may read messages |
| "For billing: per school and month" table | Billing data on an activity tab | move: Billing |
| Webhooks | Works | keep |
| Placeholders naming Greenfield | Demo school's name in a real form | fix: neutral examples |

### 2.17 Mobile builds (`pages/builds`)

| Element | Now | Verdict |
| --- | --- | --- |
| School select + "Build Android app" | No confirm, no iPhone, no version choice | keep the list; the button lives on the school (2.9) |
| Table: School, Phone, Version, Status, Install | No filter; no link to the school; a failed build shows a note only | fix: filter by school and status; school is a link; failed row links to the build log |
| "App bundle prefix" | On the Blueprints page | move: here, under "Build settings" |

### 2.18 Flags (`pages/flags`)

| Element | Now | Verdict |
| --- | --- | --- |
| "Everyone" switches | One click flips a flag for every school, no confirm, no second person | fix: confirm; follows the risky-change rules |
| "Only some schools" | Read-only: a school's flag cannot be set or cleared here, and nothing on the page creates one except Pause | fix: choose schools per flag on the flag's row |
| "Pause a feature" | Creates `kill.<module>` flags; the module list is the Modules page's subject; paused ones can only be lifted by finding the flag in "Everyone" | move: "Pause" is a button on the Modules page (per module, per school or all), with "Paused" shown there and lifted there |
| "New flag": key, what it does | Key is a developer string typed by hand; flags cannot be deleted (P10) | keep for the release manager; add delete |

### 2.19 Blueprints (`pages/blueprints`)

| Element | Now | Verdict |
| --- | --- | --- |
| Page "Blueprints and rules" | Three unrelated jobs | fix: split as below |
| Blueprints per target: step switches, "Parameters" as raw JSON, "Save as a new version" | Raw JSON (P8); saving also activates | move: Onboarding → "How a school is set up"; parameters as named fields; save and activate are two steps |
| "Rules for risky changes" | The action list is hand-kept and misses actions (erasing leavers, an integration going live) | move: Team → "Approval rules"; list comes from the one action list |
| "Freeze changes" switch | Stops every change in the fleet, saved with no confirm | fix: confirm with a reason; shown as a banner on every page while on |
| "How a release rolls out" | See 2.15 | move: Releases |
| Two Save buttons | Both save the same document | fix: one per card after the split |

### 2.20 Health (`pages/health`)

| Element | Now | Verdict |
| --- | --- | --- |
| "Check everything now" | Works | keep |
| Incident banner | Same incident as Fleet | keep |
| Tiles, schools table | "Had a problem" has no detail | fix: opens the school's Health tab |
| "Errors in the last 7 days" | Stack traces; fixed to 7 days; no way to mark one handled | keep for engineers; add "Handled" and a range |
| "Background jobs" | Raw status words; Retry | keep; plain words; filter by school and failed |
| "Restore drills", "Run a drill now" | Works | keep |

### 2.21 Approvals, Requests, Support, Test inbox

| Element | Now | Verdict |
| --- | --- | --- |
| Approvals → Waiting: Reject, Approve | Shows a one-line summary, not what will change; Reject needs no reason; `NAME` map is a second hand-kept copy of the action list (also in Blueprints) and misses actions | fix: show the change (before → after); reject with a reason; one action list |
| Approvals → Recent | Twelve rows, no who approved, no filter | fix: who decided and when; the full list is the audit log |
| Requests: Open / All, Answer (Mark done / Decline) | The operator must walk to the school, find the setting, change it, come back and answer | fix: "Open the setting" from the request; answering "done" offers the change it made |
| Requests answer box | Hand-built textarea | fix: shared `AreaField` (same as admin 1.24) |
| Support → Start a session | Same thing as the school header's "Support session" (P3) | keep one form: the school's button; this page is the log |
| Support → Sessions | Raw status word; no filter | keep; plain words; filter by school and person |
| Test inbox | Works; shown in the menu even when the platform is Live, where it is empty | fix: appears only in Sandbox mode; becomes a tab of Integrations → Activity |
| Requests vs Approvals vs Support | Three menu items for "things waiting for me" | fix: one "Inbox" group with counts (map §4) |

### 2.22 Billing (`pages/billing`)

| Element | Now | Verdict |
| --- | --- | --- |
| Month + "Create invoices" | Works; safe to run twice | keep |
| Tiles: Invoiced, Paid, Still to collect | Sum every month ever, labelled as if current | fix: for the chosen month, plus "all time" |
| Invoice rows: "Mark sent", "Mark paid" | One click, no undo, no date, no reference; nothing is actually sent; status "overdue" is never set by anything seen here | fix: paid asks date and reference, can be undone; "Send" really sends through the Hub or is renamed "Mark as sent" (P1) |
| Invoice lines | Only in a tooltip | fix: open the invoice; download it |
| Filters | None | add: school, month, status |
| Plans and prices | Missing | add (top of §2) |
| Usage for billing (texts per school) | On Integrations → Activity | move here |

### 2.23 Compliance (`pages/compliance`)

| Element | Now | Verdict |
| --- | --- | --- |
| "Log a breach", 72-hour clock, "Tell the school", Close | "Tell the school" is one click; the note sent is not shown first | fix: show the message, then send |
| "Add an agreement", "Mark signed" | A title and a tick: no file, no date signed, no signer | fix: attach the signed file, date and name, or it proves nothing |
| "Who else handles the data" | Help line says "these are the services behind this test deployment" (P8) | fix: the list comes from the Hub's live connections |
| Data requests and erasure across schools | Not here; they are on each school's Records tab | add: one list across schools, linking to the school |

### 2.24 Team (`pages/team`)

| Element | Now | Verdict |
| --- | --- | --- |
| People table, "Change" | Works | keep |
| Add a person: first password typed by the admin, "share it in person" | An admin knows a colleague's password | fix: an invitation link; the person sets their own |
| Change: roles, switch off, new password, reset authenticator | Works; cannot remove a person (P10) | keep; add remove for someone who never signed in |
| "What each role can do" | One line per role, hand-written; roles are fixed in code | decide: fixed console roles are fine for a small team; keep, but the lines come from the role definition |
| "Console colours" | A theme editor on the people page | move: Console → Appearance |

### 2.25 Sign-in and not-found

| Element | Now | Verdict |
| --- | --- | --- |
| Sign in: password, then code | Works; remembers the e-mail in the browser | keep |
| Forgotten password | To verify in the running console | decide after a look |
| Not found: "Search" | Goes home | fix: opens search (same as admin 1.25) |

## 3. App (`lib/`, Flutter: students, parents, teachers, drivers)

What the console drives today (`core/services/school_config.dart`, `/v1/config`): the family dock, Home cards, quick tiles, modules, features, languages, consent, photo consent, weekly off days and the word for "class". Nothing else. No role switches, no teacher dock, no category, house, grading, leave-reason or library lists. A failed load silently keeps the built-in defaults.

The question asked of every element below: *who is looking at it, what do they need to do here, where does the value come from (the school's data, a console setting, or code), does it work end to end on a real school with real providers, and what does it show when it is empty, off, offline or failing?*

### 3.0 Missing from the whole app

| Element | Now | Verdict |
| --- | --- | --- |
| Roles switched per school from the console | `UserRole` has student, parent, teacher; nothing turns one off; students cannot sign in (demo card offers parent and teacher only) | add: console switch per role (student, parent, teacher, driver); a switched-off role cannot sign in and is told why in plain words |
| Student branch | None: a student signing in would get the parent shell | add: own dock and Home from the console (homework to hand in, timetable, results if the school shows them to students, library, events, notices, chat if allowed); no fees, no leave applying, no consent prompt meant for parents |
| Driver role | Server takes the bus position "from the driver's phone"; no screen sends it (features-plan line 52) | add: driver signs in, sees today's trips, Start trip shares the position until End trip, marks each child boarded / dropped (transport attendance), one-tap "running late" and "breakdown" to the office and families on the route |
| Teacher dock and quick actions | Fixed in code (`home, classes, notices, chat, profile`; Attendance, Assign, Grade, Notice) | fix: from the console per role, like the family dock; filtered by modules |
| Module check on every link | Dock tabs, tiles, rows, notification taps and search results open screens of switched-off modules | fix: every entry point declares its module (P9); hidden when off |
| Forgot password | No link on sign-in | add: "Forgot password" with the code to the phone or e-mail (the server already has `auth.reset`) |
| Change password, phone, e-mail; signed-in devices | None | add under Profile → Account; phone and e-mail changes confirmed by a code |
| Real files everywhere | Homework scan counts pages, attach keeps a file name, chat attach is "soon", profile photo stays on the phone | fix: one upload path (storage connection through the Hub, the server's `files` service), progress, retry, size and type rules from the console |
| Real share, save and download | Receipt, results, homework, notices, gallery and timetable buttons only show toasts | fix: share sheet with the real file or link; save writes the file to the phone; calendar writes to the phone's calendar |
| Push notifications | Not in the app; notifications are only listed | add: Firebase in the app (files supplied through the console's mobile builds, §4), device registered after sign-in, every notification opens its screen |
| Live updates | Chat, notifications and the bus refresh only on reload; "typing" is always false | add: one server event stream per signed-in phone (new message, typing, read, notification, bus position); the typing line shows only when real |
| Exam timetable | No screen; Home's exam card opens Results | add: upcoming exams per child with subject, date, time, room, syllabus note |
| Teacher: class roster and student profile | A class card has no student list; a teacher cannot open a student | add: roster with photo, roll number, guardian contact (by permission), attendance and marks summary, "message guardian" |
| Teacher: own timetable | Only the Home ribbon | add: Timetable tab for teachers (week view, substitutions) |
| Edit and delete what you created | Homework and notices cannot be changed after posting; leave requests cannot be withdrawn | add (P10): edit within rules, delete with "tell families" note |
| Consent and data rights | Photo answer asked once; no withdraw, no data request | add under Settings → Privacy: change photo consent, withdraw consent, ask for a copy or deletion (goes to the admin's data requests) |
| Privacy notice and officer | Build-time values (`AppConfig.privacyNotice`, `privacyOfficer`); a change needs a new build | fix: from `/v1/config` |
| School data in code | Categories, houses, grading scale, leave reasons, terms, library limit, receipt number, ID prefix, address, languages | fix (P2): all from `/v1/config` or the school's data |
| Offline | School profile not cached (shortcut in `school_profile_service.dart`); error reports dropped offline | fix: cache config and profile; queue error reports |
| Failed config load | Silent defaults | fix: retry, then a plain banner "Could not reach the school; showing what was saved" |

### 3.1 Shell and dock (`shell/`)

| Element | Now | Verdict |
| --- | --- | --- |
| Family dock | From `SchoolConfig.dock`, filtered, Profile last | keep; add the module check |
| Teacher dock | Fixed in code | fix: from config (above) |
| Student and driver docks | None | add |
| Chat unread badge | Works | keep |
| Exit confirm sheet on back | Works | keep |
| `WelcomeOverlay` after first sign-in | One of three welcomes | merge (3.2) |
| Consent asked after config load | Parents only | fix: every role the school asks consent of (console setting per role) |

### 3.2 Splash, onboarding, sign-in, welcome (`auth/`)

| Element | Now | Verdict |
| --- | --- | --- |
| Splash mark | Animation only | keep |
| Onboarding, three pages before sign-in | Marketing pages to people whose school already chose the app; the parent page shown to teachers and the reverse; a decorative "Submit" button that does nothing | remove all three |
| Sign-in: phone or e-mail, password or code | Works | keep |
| "Code sent" | Toast names where it went | keep; check the wording in all three languages |
| OTP resend timer 30 s | In the view | fix: from the server's answer (the server decides how soon a resend is allowed) |
| Demo card | Parent and teacher only, shown on school builds? | fix: demo content only; never on a school build |
| Forgot password | Missing | add |
| Welcome overlay (three tips) | Same tips for every role, chat tip when chat is off; flag on the device, so shown again on every phone | merge with Home's `HomeWelcome` into one welcome per role, tips built from the modules that are on, "seen" stored on the account |

### 3.3 Home, family (`dashboard/`)

| Element | Now | Verdict |
| --- | --- | --- |
| Search entry | Button for non-parents; parents only by a hidden pull-down | fix: one visible search button for everyone; keep pull-down as a shortcut |
| Bell | Always shows a badge | fix: badge = unread count, none at zero |
| Profile capsule | Same as the Profile tab | remove (P3) |
| Children strip | Status stamp twice; tap opens Attendance without switching the child | fix: one stamp; tap switches the active child first |
| "Both children" label | Wrong for 1 or 3 children | fix: count-aware copy |
| Quiet-child match | By first name | fix: by student ID |
| Due section "See all" | Always opens Homework | fix: opens what the section lists |
| Exam stat card | Opens Results | fix: opens the exam timetable (3.0) |
| Event and notice colours | Category maps in code | fix: category colours from the school's category list |
| Cards, quick tiles | From config | keep; add module checks |
| Empty Home | `ViewStateView` without art | fix: empty art and copy for a new school |
| `BigNumber` in a view file with `fontSize:` | Breaks the design rule | fix: move to `core/widgets`, use a type role |

### 3.4 Academics (family)

| Element | Now | Verdict |
| --- | --- | --- |
| "Records" four rows | Fixed in code, ignore modules | fix: from modules |
| Class rank | Shown to every family | fix: console setting `results.showRank`, off by default |
| "Ask teacher" | Shows when chat is off | fix: hidden when off |
| Subject card | Not obviously tappable | fix: chevron and pressed state |

### 3.5 Attendance (family)

| Element | Now | Verdict |
| --- | --- | --- |
| Page title | None | add |
| Month grid | English Monday-first letters; weekly off from config | fix: weekday letters from the locale and the school's first day of week |
| Statuses | Four in code | fix: the school's statuses (console list) |
| "Explain" an absence | Opens leave apply even when Leave is off | fix: module check; when Leave is off, "Message the class teacher" |
| Day sheet "Ask for notes" | Opens the chat list | fix: opens the class teacher's thread |
| Unmarked day tap | Nothing | fix: "Not marked yet" line |

### 3.6 Timetable (family and teacher)

| Element | Now | Verdict |
| --- | --- | --- |
| "Add to calendar" | Toast only | fix: writes the week to the phone's calendar, or remove; decided: write it |
| Day picker in a bottom bar | Breaks AGENTS rule 12; shows weekly off days | move under the title; off days greyed with "No school" |
| Current week only | No next week, no substitutions | add: week switcher; substitutions and cancelled periods marked |
| Teacher's own timetable | Missing | add (3.0) |

### 3.7 Homework and scan (family and student)

| Element | Now | Verdict |
| --- | --- | --- |
| Detail bell, share, attachment | Toasts | fix: bell = reminder at a chosen time (local notification); share = real share; attachment opens the file |
| Classmates' submission count | Shown to families | fix: console setting, off by default |
| Resubmit or withdraw | Missing | add: until the teacher grades it |
| Grade colour | `startsWith('A')` | fix: from the school's grading scale |
| Scan | Counts pages; nothing uploaded | fix: pages become one PDF, uploaded; retake, reorder and delete a page; "Open settings" when the camera is refused |
| Who hands in | Parent | fix: student when students sign in; parent otherwise (console setting) |

### 3.8 Results (`exams_results/`)

| Element | Now | Verdict |
| --- | --- | --- |
| Download | Toast only | fix: the report card PDF from the server |
| Columns chart | Scaled from 60%: marks below 60 look the same | fix: from 0 |
| "Out of" | First subject's maximum for all | fix: per subject |
| Grade stamp | Always green | fix: tone from the grading scale |
| Rank | Shown to all | fix: `results.showRank` |
| Subjects | Top three changes only | add: every subject with marks, grade and the teacher's remark |
| Exam picker pill on art | `onPigment` with no result | fix contrast |

### 3.9 Fees, pay sheet, receipt (`fees/`)

| Element | Now | Verdict |
| --- | --- | --- |
| "Pay now" when online payment is not in the plan | Toast "not included in plan" (wrong audience) | fix: button hidden; "Pay at the school office" line with office hours |
| Payment methods list | In code | fix: from the payment connection (what the provider offers) |
| Unknown method | Labelled UPI | fix: the provider's word |
| Currency | INR fixed | keep (India only); format from the locale |
| Failure | No message in the sheet | fix: the provider's reason in plain words, "Try again" |
| "Remind me early" switch | Duplicates Settings; may not be backed | merge into Settings → Notifications, and backed by the server's reminder rule |
| Receipt number | Built in the app with `GIS/` | fix: the server's receipt number |
| School address | A translation key | fix: from the school profile |
| Title "Payment done" on old receipts | Wrong for an old receipt | fix: "Receipt" |
| Share and Save PDF | Toasts | fix: the server's receipt PDF (§4 PDF fix: Unicode names, logo) |

### 3.10 Notices (`notices/`)

| Element | Now | Verdict |
| --- | --- | --- |
| Category badges SPORT, FEES, HOL… | Code, untranslated | fix: the school's categories, translated names |
| Pinned slips | Three or more get cramped | fix: carousel |
| Share, attachment | Toasts | fix: real |
| Exam time `8:30–11:00` | In code | fix: from the exam timetable |
| Acknowledge ("I have read this") | Missing | add: when the notice asks for it; the admin sees who has not |
| Read state | Possibly on the phone only | fix: on the server (admin read counts need it) |

### 3.11 Chat (`chat/`)

| Element | Now | Verdict |
| --- | --- | --- |
| Avatar colour | Guessed from the subtitle | fix: from the person's role or subject |
| New-chat sheet | Repeats threads that already exist | fix: opens the existing thread |
| Phone button on every thread | Calls the office | fix: shown only where the console allows calls, with the office's hours |
| Quick replies | Same for every role | fix: per role |
| Attach "+" | "Soon" toast | fix: real attachments (photo, PDF) |
| Typing | Always false | fix: real (live updates) |
| Report, block, read receipts, delete own message | Missing | add: report and delete own message; read receipts; block is the office's job (admin) |
| Who may message whom | Not shown | fix: from the console's message rules, explained in the empty state |

### 3.12 Events (`events/`; renamed Calendar per map)

| Element | Now | Verdict |
| --- | --- | --- |
| Month sheet | A day with two events opens only the first | fix: day list |
| Category colours | `_pigment` map in code | fix: school categories |
| Time formats | Featured raw, rows formatted | fix: one format |
| RSVP | Asked for every event | fix: only when the event asks for it; parent picks which children and how many adults |
| "Gates open" time | Invented (start − 15 min) | remove; show the event's own times (start, end, gates if set) |
| "n going" | Shown to families | fix: console setting, off by default |
| Add to calendar | Google web template | fix: phone calendar |
| Venue | Lower-cased | fix: as written; with directions when a place is set |
| Share | Missing | add |

### 3.13 Leave (`leave/`)

| Element | Now | Verdict |
| --- | --- | --- |
| Days taken this term | Terms fixed in code (Jun–Nov, Dec–May) | fix: the school's terms |
| Reasons | Five in code | fix: the school's list |
| Attach | File name only | fix: real upload |
| Which child | Implied | fix: child picker when more than one |
| Half day | Missing | add |
| Withdraw or edit a pending request | Missing | add |
| Calendar weekday letters | English Monday-first | fix: locale |

### 3.14 Library (`library/`)

| Element | Now | Verdict |
| --- | --- | --- |
| Book fair chip | Found by a title starting with "library" | fix: an event category flag |
| Limit "n of 3" | `limit = 3` in code | fix: the school's rule |
| Renew | Only when more than five days are left | fix: renew until due unless someone reserved it; rule from the console |
| "Available now" | Lists unavailable books too | fix: two sections, or a filter |
| Scan ISBN | Toast | fix: barcode scan finds the book |
| Fines, history, my reservations, cancel | Missing | add |
| Staff borrowing | Not possible | add (teachers borrow too) |

### 3.15 Transport (`transport/`)

| Element | Now | Verdict |
| --- | --- | --- |
| Map | A painted fake, light colours in dark mode | fix: a real map from the maps connection (static or tiles), dark style in dark mode |
| "Live" pill with pulsing dot | Always shown | fix: only when a trip is running and the position is fresh; otherwise "Not running now" |
| Bus bubble, "Centre on bus" | Animation; the button bounces | fix: real position; button recentres |
| ETA | From data | keep; from the maps connection |
| Stop list, "your stop" | Last stop assumed | fix: the child's own stop |
| Driver call | Calls the driver while driving | fix: call the attendant or the office (console setting) |
| Trips | No morning/afternoon switch, no per-child bus | add both |
| "Bus not running today" | Missing | add from the trip state and holidays |
| Boarded / dropped | Missing | add: from the driver's marks (3.0) |

### 3.16 Gallery (`gallery/`)

| Element | Now | Verdict |
| --- | --- | --- |
| "Only <child>" toggle | Works | keep; hide when photo tagging is off |
| Academic year start | June in code | fix: school calendar |
| Share, Save | Toasts | fix: real (respecting the school's download setting) |
| Favourite | In memory only | remove |
| Report a photo | Confirm then nothing | fix: sends to the admin (takedown request) |
| Photo consent | Not reflected | fix: a child without photo consent is never shown to other families |
| Photo route | None (`Get.to`) | fix: route per photo (P11) |

### 3.17 Notifications (`notifications/`)

| Element | Now | Verdict |
| --- | --- | --- |
| Type map, ₹ glyph | In code | fix: from the message event list |
| Swipe dismiss | No undo; server-side? | fix: undo, and on the server |
| Tap | Opens any route string | fix: guarded (module off → "no longer available") and marks read |
| Times | 24-hour fixed | fix: locale |
| Link to notification settings | Missing | add |

### 3.18 Search (`search/search_view.dart`)

| Element | Now | Verdict |
| --- | --- | --- |
| Scopes all, homework, notices, people, events | Fixed list; shown when the module is off | fix: from modules; library books and fees receipts added when on |
| People | Teachers only; tap starts a chat even when chat is off; class label strips non-digits | fix: module check; teachers see students of their classes; class name as the school writes it |
| Recent searches | On the phone | keep (per-device convenience) |
| Today's ribbon behind the field | Decoration | keep |
| Event tile colour | `subject('science')` | fix: category colour |
| Dates | `DateFormat` without locale | fix |

### 3.19 Profile (`profile/`)

| Element | Now | Verdict |
| --- | --- | --- |
| House colours | Names in code | fix: the school's houses |
| ID "GIS-…" | Prefix in code | fix: the school's admission number |
| Academic year | June in code | fix: school calendar |
| Class | Digits stripped (breaks Nursery, KG) | fix: class name as written |
| Photo | Local file | fix: uploaded, office approves when the school asks for it |
| "Around school" tiles | Duplicate the dock | remove |
| Guardians | One shown | fix: all; "Ask office to correct" sends a correction request |

### 3.20 Settings, About, Help, Privacy

| Element | Now | Verdict |
| --- | --- | --- |
| Languages | `_locales` in code | fix: the school's languages |
| "Comfort" mixing Reduce motion with two reminders | Mixed group; reminders on the device | split: Display (motion, theme), Notifications (one switch per message event the school sends, saved on the account) |
| About "Privacy", "Terms" | Both open Help | fix: the school's notice; Gradeon's terms page |
| Help | Finds the office thread by the English word "office"; four FAQs in the translation file; mailto with an English subject | fix: the office thread by ID; FAQs from the console; contact options from the school profile |
| Developer screen (long-press version) | Hidden | keep on debug and demo builds only |
| Privacy sheet | See 3.0 | fix |

### 3.21 Teacher screens (`teacher_tools/`)

| Element | Now | Verdict |
| --- | --- | --- |
| Home bell | No badge (family bell always badged) | fix: unread count |
| Profile capsule | Duplicates the tab | remove |
| Quick actions | Fixed in code | fix: from config |
| "Needs you" | To grade, marks due, leave requests | keep; each row opens its item |
| Leave sheet Approve / Decline | One tap, no note, no confirm, closes after one | fix (P12): note for decline, undo for five seconds, stays open for the next |
| Class card | One subject per teacher (`?? 'maths'`), chips ignore modules, no roster | fix: subjects per class from the timetable; module checks; roster |
| Attendance for a teacher without a class | Not possible | add: period attendance when the school takes it per period (console setting), substitutes from the timetable |
| Mark attendance | Today only; house names in code; 'A', 'L' untranslated; no confirm; no holiday guard; approved leave not filled in | fix all: date picker within the school's edit window, houses from data, translated letters, holiday guard, approved leave pre-marked, re-submit edits the register |
| Assign homework | "Draft saved" pretends; attach keeps a name; due-day strip only; marks ±5 with no "ungraded" | fix: draft saved for real; real upload incl. PDF; date picker; ungraded option; subject from the class |
| Marks entry | Max 20 in code; no exam picker; 'Ab' untranslated | fix: pick the exam; max per subject from it; lock after publish (office reopens) |
| Post notice | Any teacher can post school-wide and pin; "students" audience; categories differ from the reader's | fix: audiences and pinning from the role's permissions; categories from the school list; attachments; schedule; edit and delete |
| Grading | "Oldest first" chip is not a control; the student's work is not shown; slider starts at 80%; scale in code; no redo or regrade | fix: real sort; the submitted file shown; mark starts empty; school scale; "return for redo"; change a saved grade |

## 4. Integrations Hub and every outside credential

The standard (the owner's words, 2026-11-10): like credentials in n8n, each outside service is a **template you fill in**: pick the service, see exactly which values it needs, where to find each one, paste them, press Test, see it work. Nothing needs a deploy, a server variable or a code change.

Questions asked of every outside service: *What does the operator type, and where do they find it? Can a wrong value be caught before saving? What address must they paste back into the provider, and can they copy it before saving? What proves it works? What happens when it fails, and who is told? Does anything still live in a server variable?*

### 4.1 What already meets the standard

| Element | Now | Verdict |
| --- | --- | --- |
| Provider forms built from `ProviderDef.fields` | MSG91, Gupshup, Twilio, Kaleyra, Meta, Gupshup WA, Interakt, SES, SMTP, Resend, FCM, Razorpay, Cashfree, S3, Google Maps, Mapbox, Custom HTTP, Webhook | keep: this is the template idea |
| Secrets sealed, shown as "set, ending 1234" | Works | keep |
| Test button with a sentence saying what it does | Works | keep |
| Routes per capability, school route wins, fallback | Works | keep |
| Test, live (second person), paused | Works | keep |
| Activity with retry; webhook events list | Works | keep |

### 4.2 Gaps against the standard

| Element | Now | Verdict |
| --- | --- | --- |
| "Where to find it" | One docs link per provider; per-field help on two fields; the real steps (DLT registration, Meta system user, Razorpay webhook events) live only in `docs/integrations.md` | add: `ProviderDef.steps` (numbered setup steps shown beside the form) and `help` on every field ("Razorpay → Settings → API keys → Key ID") |
| Catching a wrong value | Only "required" | add: `pattern` and an example per field (`rzp_test_` / `rzp_live_`, six-letter sender ID, region list, JSON parse for the service account); Test mode vs live keys checked against the connection's state |
| Webhook address | Shown only after saving, on another tab | fix: shown in the same dialog as soon as the provider is picked, with Copy and the exact events to tick |
| Templates (SMS, WhatsApp) | Mapped one by one; nothing says which messages are still unmapped | fix: list every message (system and school events) with mapped / missing; "Copy for DLT" turns `{student}` into `{#var#}`; Import from the provider where it has a list API (Meta, Gupshup); a live SMS or WhatsApp connection with a missing template cannot go live |
| Capabilities with no provider | `video`, `accounting`, `ai` "kept for later" | remove now; the module that needs one adds the capability and its provider in the same change |
| Messaging mode | `MESSAGING_MODE` server variable that must match on two servers | move: one console switch (Sandbox / Live) stored in the registry, second person to go live, a checklist of what is not live yet |
| Alerts to the team | `ALERT_WEBHOOK_URL` server variable | move: an "Alerts" capability routed to Slack, Discord, e-mail or Custom HTTP connections; the console shows which alerts go where |
| Virus scanning | `CLAMAV_HOST` server variable; without it uploads are checked by type only | move: a "File scanning" capability with a ClamAV provider (host, port; Test scans the EICAR test file); live mode refuses family uploads with no scanner |
| Mobile builds (GitHub) | `GITHUB_TOKEN`, `GITHUB_REPO`, `GITHUB_BRANCH`, `BUILD_CALLBACK_TOKEN` server variables | move: a "Build service" capability with a GitHub provider (repository, branch, token; Test lists the workflow) |
| App signing and stores | APK signed with the build's default key, put on a GitHub prerelease; no iPhone build; no Play or App Store publishing | add: "App stores" capability: Android upload keystore (file, alias, passwords), Google Play service account, Apple App Store Connect key (issuer, key ID, .p8), team ID; builds become signed AAB/IPA published to the chosen track |
| Firebase app files | The owner must hand `google-services.json` and `GoogleService-Info.plist` to a developer | move: file fields on the FCM connection; the build workflow fetches them; the app includes Firebase and registers the phone |
| Test school databases | `NEON_API_KEY`, `NEON_REGION`, `SHARED_PG_ADMIN_URL` server variables | move: a "Databases" capability (Neon: API key, region; Postgres server: admin address) used by Cells |
| Backups | `BACKUP_DATABASE_URL` server variable; backups stored in database rows "until object storage exists" | move: backups to the storage capability (a routed bucket); the separate database option goes |
| Custom domains | Console step says "needs DNS" and checks nothing | add: domain field, the exact DNS record to create, a Check button (looks up the record), certificate state from the host; a "Hosting" capability (Render API key, service ID) adds the domain at the host |
| Live bus position | No source (no driver screen) | add: the driver role in the app is the source (§3.0); a GPS-device provider (Custom HTTP poll: address, auth, where latitude and longitude are) for schools with trackers |
| School's own view | Admin's School setup shows channels read-only | keep |
| What stays a server variable | Database addresses, `SECRETS_KEY`, `JWT_SECRET`, ports, CORS, base addresses | keep: these start the server and seal everything else; documented in one table |

### 4.3 Other outside pieces checked

| Element | Now | Verdict |
| --- | --- | --- |
| PDFs (receipts, report cards) | `apps/api/src/school/pdf.ts`: Latin-1 only, so ₹ prints as "Rs." and a Hindi or Marathi name cannot print; one page; no logo | fix: Unicode fonts embedded (Noto Sans, Devanagari), the school's logo, multi-page |
| QR code on the family welcome letter | Left out ("would need a library") | add: QR that opens the app's store page or the school's sign-in link |
| Console authenticator code | Replayable inside its 90-second window | fix: remember the last step used |
| Phone calendar | Google Calendar web template | fix: the phone's own calendar |
| Cell move outside the shared test server | Only changes the record ("on aws-cell this becomes replicate, freeze, switch, verify") | fix: the real copy (dump, restore, freeze, switch, verify) for every cell kind the console offers; a kind that cannot move is not offered |

## 5. Half-builds the code itself admits

Every `shortcut:` and `ponytail:` comment, sorted. A **limit someone can see** is finished in the fix; a **scale ceiling** (works correctly, only slower or less tidy at a size no school has) stays, written down.

| Where | What it says | Verdict |
| --- | --- | --- |
| `MovingInPage.tsx:23` | No QR code on the welcome letter | finish (§4.3) |
| `files.service.ts:216` | Without `CLAMAV_HOST` uploads are checked by type only | finish (§4.2 File scanning) |
| `pdf.ts:3` | Latin-1, one page, no images | finish (§4.3) |
| `console-api/actions.ts:233` | A cell move only changes the record | finish (§4.3) |
| `console-api/auth.ts:91` | Authenticator code replayable | finish |
| `registry/schema.ts:363`, `backups.ts:25` | Backups in database rows | finish (§4.2 Backups) |
| `config-engine/modules.ts:26` | Module prices are "working prices" | finish: the Plans page sets prices (console §2) |
| `contracts/dates.ts:77` | Regular English plurals only | finish: the console's vocabulary takes singular and plural |
| `error_reporter.dart:49` | Reports dropped offline | finish: queued |
| `school_profile_service.dart:52` | No cached profile offline | finish |
| `calendar.dart:7` | Web calendar template | finish: phone calendar |
| `chat_controller.dart:113` | Typing always false | finish: live updates (§3.0) |
| `homework_controller.dart:79` | Scan pages counted, not uploaded | finish |
| `leave_controller.dart:24` | Terms fixed halves | finish |
| `teacher_controller.dart:283` | Homework draft in memory | finish |
| `payments.service.ts:119` | Shared payment connection searches every school for a refund | ceiling, stays |
| `import/engine.ts:187` | Only the newest import can be undone | ceiling, stays (stated in the import screen) |
| `jobs.ts:5` | A crashed job waits a full period | ceiling, stays |
| `hub.ts:106` | A console change reaches other servers within the cache time | ceiling, stays (shown in the console: "takes effect within 10 seconds") |
| `fcm.ts:30` | One request per phone | ceiling, stays |
| `campus_repository.dart:69` | Payment polled every 3 s for 5 minutes | ceiling, stays (the live stream replaces it once it exists, §3.0) |

## 6. Every open question, decided

The owner accepted every recommendation on 2026-11-10. Each `decide` above now reads as follows; none is "later".

| Where | Decision |
| --- | --- |
| Map D1–D9 | As recommended in the map (§9) |
| App roles | Student, parent, teacher and driver, each switched on or off per school in the console; principal uses the admin only. Student sign-in is built fully and is off until a school's switch is turned on |
| Rank, "n going", classmates' submissions | Console settings, off by default |
| Families calling the driver | No; call the attendant or the office |
| Who posts school-wide or pins | Permission in the role, set in the console |
| Teachers without a class taking attendance | Period attendance, when the school takes it per period; substitutes from the timetable |
| Onboarding pages | Removed; one welcome per role after sign-in |
| Library | Renew until due unless reserved; staff borrow |
| Marks after publish (admin 1.10, app 3.21) | Locked; the office reopens with a note families see |
| Live bus | Real: the driver's phone, or a GPS device through the Hub |
| Timetable day picker | Under the title |
| Notice scheduling (admin 1.14) | Built: schedule, edit, delete |
| Plan the rooms (admin 1.2) | Button removed; exam seating is a features-plan module |
| Driver sharing position (admin 1.19) | The driver role in the app |
| Console keyboard shortcuts (console 2.1) | Kept, listed in search and in a "Keyboard" sheet |
| Custom domain (console 2.3) | Built for real (§4.2) |
| Console roles (console 2.24) | Fixed roles stay; the description lines come from the role definition |
| Console forgotten password (console 2.25) | Added: code to the e-mail through the Hub |
| "Go live" button, Plans page (console 2.2) | Built |
| A capability or deploy target with nothing behind it (`aws-cell`, video, accounting, AI) | Offered only when a tested connection exists; capabilities with no module using them are removed |
