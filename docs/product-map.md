# Tangent product map

**Status: decisions taken (2026-11-10) and carried out by the one-pass fix (PR #35).**

This page says where every thing in Tangent lives and why. It is the missing rulebook: `docs/DESIGN.md` says how a page looks, this says where a page, a tab, a setting or a button belongs. Once approved, every existing page is moved to match it in one pass, and every new module in `docs/features-plan.md` is placed by it before any code is written.

Lines marked **D1, D2…** were decisions for the owner; section 9 lists them, all taken as proposed.

## 1. The ten placement rules

Every choice below follows from these. When a new thing does not fit, the rule is changed here first, never worked around in code.

1. **One home.** Every thing (a page, a setting, a list, an action) lives in exactly one place. Other places link to it; they never show a second copy.
2. **One grouping idea per menu.** The admin menu is grouped by the job being done. The console menu is grouped by what is being worked on. No group is a place for leftovers.
3. **A menu item is a thing people work with** (Students, Fees, Library). Different views of the same thing are tabs on its page, not more menu items.
4. **Every tab has its own address**, so it can be linked, bookmarked and reached with Back.
5. **Tangent decides how a school works; the school does its work.** Settings, roles, modules, colours, wording and app layout are changed only in the console. The admin holds the school's own data and daily work.
6. **A setting lives with the thing it changes.** Settings are grouped by module. Only settings that belong to no module sit in a short fixed list of school-wide groups (section 5).
7. **The school sees a rule where it applies**, read-only, on the page it affects ("Attendance can be changed for 2 days. Set by Tangent."), not on a separate page of settings it cannot change.
8. **Shared services have one home and every module plugs into them:** approvals, reports, audit log, import, messages to families, search, dashboard cards. A module never builds its own.
9. **Nothing that is a school's data is written in code.** Fee types, roles, menu labels, class names, payment methods and message wording come from data the console or the school keeps.
10. **One name, one meaning.** A word used in a menu or heading names one thing across admin, console and app. One-time things (setting a school up) leave the menu when they are finished. A person's own preference is not a school setting.

## 2. Who uses what

| Person | Uses | Comes to do |
|---|---|---|
| Principal | Admin only (on a phone the admin fits the screen; the principal does not use the app) | See how the school is doing today, approve, read reports |
| Office staff | Admin | Students and admissions, notices, timetable, library, transport, the calendar |
| Accountant | Admin | Bill, collect, refund, chase dues, money reports |
| Teacher | App (admin if the school's teachers do not use the app) | Attendance, homework, marks, messages to families |
| Parent | App | Follow their child, pay, read, reply, apply for leave |
| Student | App | See their own timetable, homework, results and notices; hand in homework |
| Bus driver | App | Run the day's trips: share the bus's position, mark who boarded and got off, report delays |
| Tangent implementation | Console | Set a school up, import its data, configure it, take it live |
| Tangent support | Console | Answer schools' requests, look inside a school, fix |
| Tangent release and operations | Console | Ship code and apps, watch health, keep servers and third parties working |
| Tangent finance and compliance | Console | Bill schools, agreements, breaches, data requests |

The app has four roles: student, parent, teacher and bus driver (the driver is added so the live bus is real, not painted). The console switches each role on or off per school (owner, 2026-11-10); a role that is off cannot sign in to the app. Today only teachers have such a switch (`app.teachers`) and students cannot sign in against a real school at all.

## 3. The school admin

### 3.1 The menu

Grouped by the job being done (rule 2). A school only sees the items its modules and the person's permissions allow; today the menu checks modules only, which is a fault.

| Group | Item | Tabs on the page | Today |
|---|---|---|---|
| **Home** | Dashboard | | Under "Teach" |
| | Approvals | Waiting for me, Sent by me, Decided | No page: only cards on the dashboard |
| | Reports | By area: Attendance, Money, Learning, People | Under "Money" |
| **People** | Students | List; a student's page: Profile, Attendance, Fees, Results, Documents | Same |
| | Staff | List; a staff member's page: Profile, Role, Leave | Same; leave has no home |
| | Admissions | | Same |
| **Teach** | Attendance | Roll call, Leave requests | Leave requests sit on the dashboard |
| | Timetable | | Same |
| | Homework | | Same |
| | Exams | | Same |
| **Money** | Fees | Overview, Invoices, Receipts, Online payments, Fee structure | Three menu items (Fees, Invoices, Online payments); fee structure is under "Classes and calendar" |
| **Reach** | Notices | | Same |
| | Messages | | Same |
| | Events | | Same |
| | Gallery | | Under "Campus" |
| **Campus** | Library | Books, Loans, Waiting | Same |
| | Transport | Routes, Riders, Live bus | Same |
| **School** | Academic year | Years and terms, Holidays, Classes, Subjects, Bell times, Year-end | Two items: "Classes and calendar" and "Year-end" |
| | School profile | Identity, Plan and modules, The app, Roles, Messages, Privacy notice (all read-only, each with "Ask Tangent to change this") | "School setup", 8 tabs |
| | Privacy requests | | A panel inside School setup → Privacy |
| | Audit log | | A tab inside School setup |
| | Moving in | | Stays in the menu for ever |

What changes and why:

- **Home** is new. Dashboard, Approvals and Reports are for looking across the whole school; none of them is teaching or money.
- **Fees becomes one item with tabs** (rule 3). Fee structure moves to it from the academic setup page because it is money, and it is what invoices are made from.
- **Gallery moves to Reach**: it is something the school shares with families, like notices and events. Campus is for the school's physical services. **D1**
- **Academic year** takes Year-end as a tab: promoting and starting a year is done to the same list of years, terms and classes.
- **School setup is split** (rules 1 and 7). What Tangent has set becomes "School profile", read-only. The two pieces of real work hidden in it (privacy requests, audit log) become their own items. Each module's rules also show on that module's page.
- **Moving in** shows until the school is live, then leaves the menu (rule 10). Its "Everything, to take with you" export moves to School profile.
- **Approvals gets a page.** Fee waivers, refunds, notices and leave all wait in one queue (rule 8); the dashboard keeps a count that links to it.

### 3.2 Where future modules go

So that no new module is "thrown wherever there is room". Numbers are the module numbers in `docs/features-plan.md`. A module marked "tab" or "inside" gets no menu item of its own.

| Group | Modules |
|---|---|
| Home | 28 Analytics and MIS (inside Reports and Dashboard), 32 Government reporting (tab in Reports) |
| People | 1 Admissions, 2 Student profiles, 12 HR and recruitment (inside Staff), 24 Certificates and ID cards (an action on a student or staff member; templates in the console), 27 Alumni, 35 Documents (on the person's page) |
| Teach | 3 Attendance, 4 Curriculum and lesson plans, 5 Timetable, 6 Exams and report cards, 7 Homework and diary, 8 Study material and online classes, 9 Online tests (tab in Exams), 26 Sports, houses and activities |
| Care (new group, appears with its first module) **D2** | 18 Health, 19 Behaviour and safeguarding, 20 Special needs, 41 Careers guidance |
| Money | 10 Fees, 39 Scholarships and concessions (tab in Fees), 11 Accounting, 12 Payroll, 42 Fundraising |
| Reach | 21 Communication (Notices, Messages), 25 Events and trips, 36 Helpdesk and complaints, 37 Surveys, 40 Staff collaboration (inside Messages) |
| Campus | 13 Library, 14 Transport, 15 Hostel, 16 Inventory, 17 Canteen, 23 Visitors and gate, 38 Front office |
| School | 35 Form builder |
| Not in the admin menu | 22 The apps (section 6), 29 Multi-campus (its own sign-in above schools), 30 Settings and roles, 31 Integrations, 33 Security and backups (all console), 34 AI (features inside other modules, never a page of its own) |

## 4. The console

### 4.1 The menu

Grouped by what is being worked on (rule 2).

| Group | Item | Tabs on the page | Today |
|---|---|---|---|
| **Schools** | Fleet | | Operate |
| | Onboarding | | Operate |
| | Requests | | Care |
| | Support sessions | | Care, called "Support" |
| **Product** | Plans and modules | Schools, Plans, Not built yet | Operate, called "Modules" |
| | Blueprints | | Ship, mixed with rules for risky changes and release rollout |
| | Flags | Everyone, Some schools | Ship; "Pause a feature" overlaps Modules |
| **Platform** | Releases | Releases, Rollout rules, Database changes | Two items (Releases, Migrations); rollout rules sit in Blueprints |
| | Mobile builds | | Ship |
| | Integrations | Connections, Routing, Templates, Activity, Webhooks, Test inbox | Test inbox is a separate item under Care |
| | Cells | | Operate |
| | Health | | Care |
| **Business** | Billing | | Care |
| | Compliance | Agreements, Breaches, Sub-processors | Care |
| **Console** | Approvals | | Care |
| | Team | People, Roles | Care; also holds console colours |
| | Console settings | Colours, Rules for risky changes | Colours on Team; rules in Blueprints |

What changes and why:

- **"Care" is removed.** It held eight unrelated things.
- **Pausing a module** is done in one place, Plans and modules (rule 1). Flags keeps only switches for unfinished features. **D3**
- **Database changes** is the new name for the console's "Migrations" (rule 10), as a tab of Releases, since a release is what carries them.
- **Test inbox** becomes a tab of Integrations: it is where messages go when no connection is live.
- **Console settings** is new, for the two things that configure the console itself.
- **Approvals** sits under Console: it is the queue for the console team's own risky changes. **D4** (or under Schools)

### 4.2 A school's page

Ten tabs today, kept in memory with no address. Proposed: eight, each with its own address (`/schools/greenfield/configuration`).

| Tab | Holds | Today |
|---|---|---|
| Overview | Status, set-up steps, usage, go-live checklist | Overview |
| Plan and modules | Plan, limits, modules and features, dates. The only place a school's modules are chosen | Entitlements, plus the "Modules" settings group, plus the Modules page |
| Configuration | Every setting, grouped by module (section 5), history, templates, preview | Configuration |
| Roles | Roles and who has them | Roles |
| Data | Import, files from the school, export, students who left and erasure | "Migration" tab and "Records" tab |
| Messaging and integrations | What reaches this school's families, texts used, failures, the school's own connections | Integrations tab |
| Technical | Versions, database, app builds, health, backups | "Versions" and "Health" tabs |
| Audit | | Audit |

"Migration" stops being a tab name (rule 10): the school's tab is **Data**, the admin's is **Moving in**, the console's is **Database changes**.

## 5. Settings

One grouping rule (rule 6): a module's settings are under that module. School-wide groups are only these six. The 13 groups of today mix four different ideas.

| Group | Settings |
|---|---|
| **School identity** | name, short name, tagline, place, phone, email, address, default language, logo, logo letters, what the school calls a student and a class |
| **Look** | brand colour and all colours, together (today split across two groups) |
| **The app** | dock tabs, home cards, quick buttons, languages offered, teachers use the app |
| **Sign-in and security** | two-step sign-in, password length, session lengths |
| **Privacy** | notice, grievance officer, retention, photo consent, consent required |
| **Messaging** | which message goes where, quiet hours, wording of each message |
| *then one group per module the school has:* | |
| Academic year | weekly off days; the school may edit classes, calendar |
| Attendance | notify families, days it can be changed, attendance goal |
| Fees | receipts, payment methods, late fee, reminders, GST, refund approval, who approves waivers, daily target, the school may edit fee structures |
| Notices | need approval before going out |
| Timetable | the school may edit its timetable |
| Homework | on-time goal |
| Library | loan days, fine, renewals |
| Transport | bus-is-near minutes |
| Staff | the school may put staff into roles |
| Dashboard | classes on the roll-call card |

Settings that stop being settings:

| Setting | Why | Becomes |
|---|---|---|
| `modules.enabled` | Second home for modules | Removed; Plan and modules is the only place |
| `term.name`, `term.examsStart` | Typed by hand, but the school's calendar and exams already know them | Read from the calendar and the exam schedule |
| `students.pinnedClass` | A person's preference, not a school rule | Remembered per person |
| `fees.gstHeads` options, and the fee types written into four pages | A school's fee types are its data | A list of fee types per school; every page and this setting read it **D5** |
| `demo.mode` | Not something to set per school by hand | A property of the school in the registry |

Also data, not code (rule 9): **role templates** (principal, office, accountant, teacher) move from code to the blueprint a school is created from, so the console can change the starting roles. **D6**

## 6. The app (students, parents and teachers)

The app has no menu of its own to argue about. For each of the three roles the console chooses, under The app: whether the role may use the app at all, its bottom tabs, its home cards and its quick buttons; each choice belongs to a module. Today only families' layout is chosen this way, teachers' tabs are fixed in code (Home, Classes, Notices, Chat, Profile), and `app.teachers` is the only role switch. It becomes one setting, "Who uses the app", with the three roles. **D7**

## 7. What every module declares

One record per module, in one file. The menu, the routes, the permissions list, the settings groups, the app's choices, the import kinds, the messages and the tests' page lists are all produced from it. Today these are about ten separate lists kept by hand, and they disagree (the console's "Admin menu" preview shows a menu the school does not get).

| A module states | Example: Library |
|---|---|
| Key, name, one-line description, state (live, beta, planned) | `library`, "The catalogue, issue and return, fines and reservations", live |
| Features the console can give or take | Reserve and renew from the app |
| Home: admin group, page, tabs | Campus → Library → Books, Loans, Waiting |
| Permissions, and which a starting role gets | `library.read`, `library.write`; office gets both |
| Settings, with their group | loan days, fine per day, renewals → Library |
| App: tabs, home cards, quick buttons it offers | Library tab |
| Imports | Books |
| Messages it sends | Reserved book ready |
| Reports | Overdue books |
| Approvals it asks for | none |
| Dashboard cards | none |
| What it writes to the audit log | book added, issued, returned, fine waived |
| Demo data | books and loans on every weekday |

A line may say "none", but it may not be missing: a build check fails if a live module leaves a line out, if a page, permission, setting, message or import belongs to no module, or if two modules claim the same thing. That check is what keeps the next module from scattering.

## 8. Names that change

| Today | Becomes | Where |
|---|---|---|
| Migrations | Database changes | Console |
| Migration (school tab) | Data | Console, a school's page |
| Entitlements | Plan and modules | Console, a school's page |
| Modules (page) | Plans and modules | Console |
| Support | Support sessions | Console |
| Classes and calendar + Year-end | Academic year | Admin |
| School setup | School profile | Admin |
| Fees + Invoices + Online payments | Fees | Admin |

## 9. Decisions (all taken as proposed, owner 2026-11-10)

| | Question | Proposed |
|---|---|---|
| D1 | Gallery under Reach or Campus? | Reach |
| D2 | A new admin group "Care" for health, behaviour and special needs when those modules come? | Yes |
| D3 | Pausing a module: only in Plans and modules, removed from Flags? | Yes |
| D4 | Console Approvals under Console or under Schools? | Console |
| D5 | Fee types become a list each school has (set in the console or by the school behind a switch, like the timetable)? | Yes, edited with the fee structure, behind the same switch |
| D6 | Starting roles come from the blueprint instead of code? | Yes |
| D7 | Teachers' app tabs become console-configured like families'? | Yes |
| D8 | Group names: admin Home, People, Teach, Care, Money, Reach, Campus, School; console Schools, Product, Platform, Business, Console. | As listed |
| D9 | Anything on this map that is in the wrong place, missing, or should not exist at all. | |
