# Gradeon features plan

Every feature Gradeon has or will have, in one place: what is left from the work done so far, what readiness for real schools takes, and every module a school ERP covers, each with what it is for, its features, where Gradeon is today and when it is planned. It says **what**, not **how**: how each piece is built is decided when work on it starts.

This replaces the earlier production plan and platform design. What exists and how it is built is in `docs/HANDOFF.md`; the Integrations Hub is in `docs/integrations.md`.

**Status** (per module): **Built** (works for a real school), **Partly** (the part named works; the rest is listed), **Not built**.

**When:**

| Mark | Meaning |
|---|---|
| **Now** | Left over from the work done so far (section 1): finish before new modules |
| **Wave A** | Needed before a school can switch to Gradeon |
| **Wave B** | Grows the product's value; chosen by what pilot schools ask for |
| **Wave C** | Sets Gradeon apart (AI, hardware) once there is real data |
| **Later** | Worth having, after the waves |
| **Not planned** | Rare for Indian schools; revisit if the market changes |
| **Readiness** | Part of getting ready for real schools (section 2) |

A module counts as done when it works end to end for a real school: its screens in the admin and the app, its permissions, messages, import, reports, audit, settings in the console, empty, loading and error states, light and dark, phone to desktop, tests, and the owner's design review.

---

## 1. Left from the work done so far

### 1.1 Waiting on the owner (accounts, vendors, decisions)

| Item | What it unblocks |
|---|---|
| An SMS provider, with DLT registration of the company, the sender name and every message's wording | Families sign in with a code to their phone; until then every text goes to the console's Test inbox. Registration takes weeks: the critical path to a pilot |
| A WhatsApp business provider and approved templates | WhatsApp messages to families |
| An email sending domain with SPF and DKIM, and a provider (SES, SMTP or Resend) | Email that reaches the inbox |
| Razorpay or Cashfree accounts (test, then live), and per-school settlement where a school wants its own | Families paying fees online with real money |
| Firebase project files for Android and iPhone | Notifications pushed to phones (the server side is ready) |
| A storage bucket (S3-compatible) and a virus scanner host (ClamAV) | Files kept in real storage and scanned (the test track keeps them in the database) |
| A domain for app links (for example `gradeon.app`) | Web links, such as invites and the page after paying, that open the app |
| India hosting with point-in-time recovery, and a separate staging service | Production, and a place to rehearse moves and releases |
| The alert webhook (Slack or Discord) | Someone hears about errors, a school not answering, failed backups |
| An Apple account, a Mac build runner and the iPhone app's icon per school | iPhone builds per school (Android builds already take the school's name and logo) |
| Prices, plan packaging and which plan leaves out which feature | Billing and plans |
| The logo, fonts and brand art | The final look |
| Hindi and Marathi wording of every message | Messages in the family's language |
| Design review of pages without canvas boards (Integrations, Library, Transport, Gallery, Year-end, Online payments and earlier ones) | The owner signs off the look |
| One app for every school, or one app per school | The store listing and the school finder |
| Switching messaging to live mode | Real families get real messages |

### 1.2 Small pieces to finish (no owner input needed)

| Item | What it is |
|---|---|
| Receipts and report cards in the app | Families open and save their receipts and report cards as PDF from the app; the admin's Exams page opens a student's report card |
| Attachments in the app | Tapping a homework or notice attachment opens it |
| Attachments in chat | Staff and families send and open photos and PDFs in a conversation |
| Photos and documents in Migration | A school's student photos and documents brought in from a zip, matched by admission number |
| Image thumbnails | Small copies of photos for lists and the gallery, so pages load fast |
| Scheduled reports | A report emailed every week or month to the people who choose it |
| Large imports and exports in the background | A big import or a whole-school export runs without holding the page open, and says when it is done |
| Storage use counted nightly | Each school's storage measured once a day for the console and billing |
| Push from the app | The app registers the phone for notifications after sign-in, once the Firebase files exist |
| Finding a school by phone number | In a shared app, a family finds its school by phone number as well as by code (a privacy decision for the owner first) |

---

## 2. Readiness for real schools

| Item | What it is |
|---|---|
| **Pilot** | One friendly school moved in and watched daily for four weeks (messages delivered, payments reconciled, errors, support requests), then three more |
| **Load** | A 3,000-student school and fifty schools at once on staging: admin pages under a second, app screens under 300 ms from cache, every school's morning attendance at once without errors |
| **Security and law** | A penetration test; the DPDP Act end to end: consent, data-rights requests, the breach process, data kept in India, signed agreements per school; later, a security certification for large groups |
| **Stores** | Play Store and App Store listings with privacy labels and review notes with a demo school |
| **Support** | A help centre and help inside the admin and the app; runbooks (restore a school, rotate a secret, switch a provider that is down); an incident process; a status page; response times per plan |
| **Billing** | Plans, add-ons, SMS and storage use and invoices from the console, matching what each school has |

### The quality bar

- Every page and screen designed, reviewed by the owner, at phone, tablet and desktop widths, light and dark, in the school's own colours, with real empty, loading and error states.
- The design systems enforced by tests: a value off the system fails the build.
- Nothing pretends: no screen shows a feature that does not work for real; demo-only parts are hidden in production.
- Fast on cheap Android phones and slow networks, judged on release builds.
- Every important action audited; risky ones can be undone or need a second person.
- Hindi and Marathi across the app and the admin, then more Indian languages; plain wording everywhere.

---

## 3. Modules by wave

| Wave | Modules (number in section 4) |
|---|---|
| **Built** | SIS (2), Timetable (5), Library (13), Transport (14), Communication (21), Apps (22), Analytics (28), Administration (30), Integrations (31) |
| **Now** | Scheduled reports (28), providers for Communication (21) |
| **Wave A** | Admissions online forms and follow-up (1), staff attendance and leave (3), academics: syllabus and lesson plans (4), report cards and the NEP progress card (6), digital diary (7), fee structures (10), Tally export (11), visitor and gate pass (23), certificates and ID cards (24), trips and consent (25), house points and co-curricular (26), UDISE+, APAAR and RTE (32), form builder (35), front office (38), scholarships and RTE seats (39) |
| **Wave B** | LMS (8), online exams (9), payroll and HR (12), hostel (15), inventory (16), health (18), behaviour (19), alumni (27), report builder (28), multi-campus (29), helpdesk (36), surveys (37), SIS gaps (2) |
| **Wave C** | Biometric and RFID attendance (3), GPS devices on buses (14), canteen wallet (17), AI (34) |
| **Later** | Automatic timetable (5), full accounting (11), voice calls (21), single sign-on (30), open API (31), collaboration (40) |
| **Not planned** | Special education and IEPs (20), placement and careers (41), fundraising (42) |

---

## 4. Modules

### 1. Admissions, Enquiry CRM and Marketing / Lead Management

**Status:** Partly · **When:** Wave A

**What it is for:** Capture prospective families, run the application-to-enrolment funnel, and convert admitted applicants into student records without re-keying data.

**Gradeon today:** Admissions pipeline from enquiry to enrolled, with lead source, notes, entrance tests and one-step enrolment. Not yet: online application forms on the school’s website, the application fee online, follow-up reminders (CRM), seat and capacity management, marketing.

**Features:**

- **Enquiry/lead capture:** web forms embeddable on the school website and social channels, walk-in and phone enquiry logging, a centralized enquiry register, and lead source tracking.
- **Lead nurturing CRM:** one-click SMS, email and call follow-ups to prospects, enquiry capture with follow-up CRM, and automated follow-up sequences so open-house enquiries do not go cold.
- **Online application:** configurable or dynamic application forms, document upload and verification, and online application/registration fee payment through a gateway.
- **Selection workflow:** entrance tests, interviews and group discussions as admission stages; prioritybased application queues with accept/reject at any time; paperless application review with published decisions.
- **Seat and capacity management:** seat management and applicant tracking, and enrollment capacity planning for rolling admissions.
- **Pipeline analytics:** pipeline reports by grade, gender and financial-aid status, plus year-over-year analysis.
- **Visits and events:** campus tour and visit scheduling and admissions events.
- **Auto-onboarding:** accepted applicants automatically become student records, with family links and login credentials created.
- **Online (re-)enrollment:** enrollment contracts, deposits, enrollment intentions, household information updates and withdrawal/decline forms; online registration to replace paper enrolment packets.
- **Lottery/school choice:** US charter and district enrollment tools.

**Standard and advanced:** Online forms and enquiry registers are standard. Full education CRM with nurture automation, funnel analytics and contract-based re-enrollment is advanced.

### 2. Student Information System (SIS) and Profiles

**Status:** Built · **When:** Wave B (gaps)

**What it is for:** The single source of truth for each learner, from admission through alumni.

**Gradeon today:** Student records with guardians and families, search, filters, saved views, import and export, student photo and documents in storage. Not yet: custom fields, photo history, subject combinations and electives.

**Features:**

- **Complete student profile:** demographics, guardian/family details, sibling linkage, photo history, and custom/unlimited fields.
- **Academic structure:** courses and batches/sections, multiple academic batches and divisions, subject combinations and electives, and credits.
- **Academic history:** transcripts, test history, graduation progress tracking, honor roll and class rank, programmable GPA.
- **360° view:** one record that pulls in attendance, behaviour, health, assessment and communication history.
- **Alerts:** academic, behavioural, medical and SEN alerts generated from system-wide data. Alerts raised automatically or by hand.
- **Data updater:** parents and staff submit updates to personal and medical data, which go into an approval queue.
- **Bulk data operations:** Excel/CSV import/export, custom import, fees import.
- **Lifecycle tracking:** admission to transfer to alumni, and leave of absence and mid-year enrollment handling.
- **Specialized records:** locker management, drag-and-drop seating charts, and volunteer service hours.

### 3. Attendance (Student and Staff)

**Status:** Partly · **When:** Wave A (staff), Wave C (biometric)

**What it is for:** Record presence accurately, alert families quickly, and feed compliance, payroll and analytics.

**Gradeon today:** Student attendance on the web and in the teacher app (also offline), absence alerts, leave notes from parents. Not yet: staff attendance, biometric, RFID or face capture.

**Features:**

*Capture methods*

- Manual web or app registers, daily (AM/PM) and period/lesson-wise.
- Biometric fingerprint devices.
- RFID/UHF cards at gates and classrooms. Fast scanning at the gate (about 50 students a minute).
- Geo-tagged mobile attendance for staff.
- Transport attendance via bus RFID taps.
- Face recognition for students and staff, at classrooms and the school gate, alongside biometrics and RFID.
- Instant absence or arrival alerts to parents by SMS, push or WhatsApp. Sent within seconds of a gate scan.
- Absence explanations and leave requests submitted by parents.
- amazonaws
- Future/planned absences pre-set to speed up morning registers.
- Automated absence follow-up and escalation workflows.
- Attendance thresholds and persistent-absence dashboards across schools.
- Emergency evacuation reports and roll-call.
- Attendance pattern analysis and heatmaps.
- Staff attendance linked to leave and payroll.
- Medical exemptions and "off games" registers.
- Hall-pass automation.
- Statutory attendance codes kept up to date with regulation.

### 4. Academics: Curriculum, Lesson Planning and Syllabus Tracking

**Status:** Not built · **When:** Wave A

**What it is for:** Plan teaching, map curriculum and monitor syllabus coverage.

**Gradeon today:** Not yet: syllabus, lesson plans, coverage tracking.

**Features:**

- **EduNest – Not yet** Not in EduNest.
- Annual planners, weekly trackers and curriculum coverage views.
- Subject-wise syllabus management.
- Lesson plans created and approved on mobile.
- Unit/lesson planning with rich multimedia, reusable lesson blocks, outcomes mapped to units for curriculum mapping, and departmental scope-and-sequence.
- Shared school-wide resource bank with tags.
- Standards management and standards-based grading.
- NEP 2020 structures: 5+3+3+4 stage mapping, competency-based assessment, vocational education and "bagless day" tracking.
- Outcome-Based Education (CO-PO mapping, attainment tracking) and Choice-Based Credit System.
- Teacher post-lesson reflection notes.
- Co-curricular trackers.

### 5. Timetable, Substitution and Cover

**Status:** Built · **When:** Later (generation)

**What it is for:** Build conflict-free schedules and manage daily changes.

**Gradeon today:** Weekly timetable with clash help, cover for absent teachers, teacher load and publishing. Not yet: automatic generation.

**Features:**

- Automatic timetable generation that respects teacher load, room allocation and special periods.
- Conflict detection and resource optimisation.
- Substitution/cover management for absent teachers.
- Staff/room swap including non-contact duties.
- Mass scheduling and walk-in scheduling, plus course requests.
- Options/course selection processes.
- Personal timetables for students and teachers, a "where is this person" lookup, and calendar overlays with Google Calendar.
- Room and facility booking.
- Individualised timetables for special schools.
- 
- Two-way sync with dedicated timetabling tools.

### 6. Examinations, Gradebook and Report Cards

**Status:** Partly · **When:** Wave A

**What it is for:** Configure assessment schemes, capture marks and publish board-compliant reports.

**Gradeon today:** Exams, marks grid and teacher-app marks entry, totals and rank, published results, a report card as PDF. Not yet: report-card designer, board formats (CBSE, state boards), the NEP Holistic Progress Card, grading scales as settings.

**Features:**

*Exam administration*

- Exam schedule/date sheet, hall tickets/admit cards, seat allocation, and invigilation/Controller of Examinations workflows.
- External exam entries, arrangements, timetables and results.

*Gradebook*

- Teacher markbooks on web and mobile.
- Unlimited grade scales and weighting.
- Standards-based and traditional grading side by side.
- District-level gradebook setup.
- Score copying and paperless grade verification.

*Indian boards*

- CBSE-aligned exam management and CCE grading.
- 360-degree Holistic Progress Cards (HPC) under NEP 2020, with competency/rubric evaluation.
- CBSE/ICSE mandatory fields and SAR-format reports.
- Global grading standards: CWA, GPA and CCE.

*International curricula*

- IB support.
- Formative and summative marksheets and primary trackers adapted to DfE statutory assessment. service KS4 dashboards.
- Assessment framework "pushdown" across a trust.

*Report cards*

- Drag-and-drop report card designers and custom templates.
- Custom remarks banks.
- Interim and end-of-term reports.
- Multilingual report cards.
- Rubric-based grading with longitudinal tracking.
- Value-added scores from baseline tests such as CATS.
- Live national benchmarking.
- **Analytics:** Trend analytics and outlier detection, and cohort graphs.

### 7. Homework, Assignments and Digital Diary

**Status:** Partly · **When:** Wave A (diary)

**Gradeon today:** Homework with attachments, hand-in from the app with a photo kept in storage, grading with marks and feedback. Not yet: digital diary and classwork, opening attachments in the app.

**Features:**

- Assign homework with attachments and deadlines.
- Online submission and marking linked to the gradebook.
- Student homework widgets with completion tracking.
- Digital diary / daily classwork remarks to parents. Holiday homework and classwork feeds.
- Voice-recorded feedback.
- Peer/"crowd" assessment of shared work.
- Worksheets and notes distribution.

### 8. LMS, E-learning, Online Classes and Content

**Status:** Not built · **When:** Wave B

**Gradeon today:** Not yet.

**Features:**

- **EduNest – Not yet** Not in EduNest.
- Course management with video lectures and quizzes.
- Offline downloads in the app, course progress tracking, and Q&A threads with instructors and classmates.
- Rule-based auto-enrollment into courses.
- Live classes via integrated Zoom, Google Meet, MS Teams or BigBlueButton.
- Virtual classrooms.
- Built-in LMS plus LTI interoperability, and integration with Canvas and Schoology.
- Moodle integration.
- Bundled digital content and smart-class libraries with question banks and recordings.
- Interactive flat panels with AI lesson tools.
- elearningindustry
- Self-paced learning.

### 9. Online Exams, Assessment and Question Banks

**Status:** Not built · **When:** Wave B

**Gradeon today:** Not yet.

**Features:**

- **EduNest – Not yet** Not in EduNest.
- Online examination with MCQ and descriptive questions and auto-grading of objective items.
- Question banks and offline assessment tools.
- Quick formative assessments and standards progress monitoring.
- Revaluation requests and result-processing workflows.

### 10. Fee Management

**Status:** Partly · **When:** Wave A

**What it is for:** Model any fee structure, collect through every channel, and chase dues automatically.

**Gradeon today:** Invoices, payments and receipts (PDF, with GST lines), concessions with approval, reminders by due date, late fines, online payment through payment links, refunds with a second person, daily reconciliation. Not yet: fee heads and structures by class and category, concession and fine rules, bulk invoices per term, scholarships, receipts in the app as PDF.

**Features:**

*Structure and billing*

- Fee heads and fee structures by class, category or student.
- Recurring fee structures.
- Instalments with due dates.
- Transport-route-based fees and hostel mess fees.
- Instant/ad-hoc fees.
- Advance fees.
- Multiple tuition rates and incidental charges.
- Automated lunch billing.
- **Concessions:** sibling discounts, category concessions and scholarships, plus a dedicated fee concession module.
- **Fines:** late-fee rules and automatic fines.

*Collection channels*

- Card, UPI, net banking, bank challan and cash, all reconciled to one ledger.
- Payment gateways including PayPal, Authorize.net and Interswitch.
- Apple Pay.
- Integrated tuition payment processing.
- Convenience fees.

*Receipts and invoices*

- Automatic receipts to parents.
- GST-compliant invoices and receipts with HSN/SAC codes and separate ledgers for tuition, transport, hostel and miscellaneous fees.
- Malaysia e-invoicing via MyInvois.

*Dues and reminders*

- Dues tracking and automated reminders by SMS, WhatsApp and email.
- AI-timed reminders and a daily "dues collectable" report.
- Reminder module.
- Lists of families with outstanding balances.
- **Settlement:** multi-account settlement that routes different fee heads to different bank accounts, for trusts running several institutions.
- **Refunds:** refund processing.

*Other*

- "No Dues" clearance.
- Fees import.
- Parent self-service views of transaction history.
- Payment plans and financial aid applied to invoices.

### 11. Accounting and Finance

**Status:** Not built · **When:** Wave A (Tally export), Later (full accounting)

**Gradeon today:** Not yet.

**Features:**

- **EduNest – Not yet** Not in EduNest.
- General ledger/accounts.
- Vendor and purchase management.
- Expense requests, approvals and reimbursement.
- Budgets and budget-vs-actual visibility.
- Chart of accounts with ledger codes and cost centres.
- Statutory finance returns such as the UK Consistent Financial Reporting (CFR) codes.
- Salary apportionment reporting.
- Integration with external accounting software: Tally, QuickBooks, and Paybooks payroll.
- Audit-ready financial reports.

### 12. HR, Payroll, Recruitment and Appraisal

**Status:** Partly · **When:** Wave B

**Gradeon today:** Staff list with roles and subjects, invitations, staff leave approvals. Not yet: payroll, recruitment, appraisal.

**Features:**

- **Staff records:** centralized staff profiles with qualifications, experience, certifications and documents; employment dates through relieving date.

*Payroll*

- Salary structures and attendance-linked salary.
- Statutory deductions.
- Payslip generation and distribution.
- Payroll with biometric integration.
- Pay-scale pushdown across academy trusts.
- **Leave:** leave configuration, daily absence reports, and leave approvals from mobile.

*Recruitment*

- Advertise jobs, accept applications and convert applicants to staff accounts.
- Recruitment modules.
- Applicant tracking and onboarding.
- **Appraisal:** appraisal modules and performance management.
- **Professional development:** teacher Continuous Professional Development (CPD) hour tracking per NEP 2020.
- **UK specifics:** Single Central Record, Workforce Census, and the Bradford factor for absence.
- **Contracts:** contract details tracking.
- service

### 13. Library

**Status:** Built · **When:** Done in Phase 4

**Gradeon today:** Catalogue with copies, issue and return with due dates and fines, reservations with a message when ready, the family app’s shelf, catalogue import. Not yet: barcode scanning, digital library.

**Features:**

- Book master/catalogue and member cards.
- Issue/return and fines.
- OPAC-style search.
- Barcode integration (School Thinker smart ID).
- Library fines linked to fees.
- Cataloguing of non-book items such as laptops and cameras.
- Student reading records shared with teachers.
- Library updates from teacher mobile app.

### 14. Transport and Fleet

**Status:** Built · **When:** Wave C (GPS hardware)

**Gradeon today:** Routes, stops with times and places, vehicles and drivers, riders per stop, route fees, the live bus from the driver’s phone (the driver’s Trips tab in the app: start and end a trip, mark pick-ups and drop-offs, report a delay) or from a GPS device read by the tracking provider, with arrival times and a “bus is near” message. Not yet: fleet maintenance.

**Features:**

- Vehicle, route and stop creation.
- Route-level fee billing.
- Live GPS bus tracking with parent visibility and ETA.
- RFID boarding/alighting alerts.
- Exception alerts when a child does not board, the bus deviates from its route, makes an unscheduled halt or breaks down (eTechSchoolBus).
- Proximity alerts as the bus approaches a stop (My School Ride).
- Transport attendance.
- Optional bus CCTV/dashcam and panic button (My School Ride).
- Driver-phone-based tracking as an alternative to hardware devices.

### 15. Hostel / Boarding

**Status:** Not built · **When:** Wave B

**Gradeon today:** Not yet.

**Features:**

- **EduNest – Not yet** Not in EduNest.
- Hostel/dormitory and room allocation and room transfers.
- In/out timing logs with parent notifications.
- Meals/mess management and hostel mess fees.
- Boarding-house structures in pastoral records.
- Housing room occupancy and roommate preferences.

### 16. Inventory, Store, Purchase and Asset Management

**Status:** Not built · **When:** Wave B

**Gradeon today:** Not yet.

**Features:**

- **EduNest – Not yet** Not in EduNest.
- Asset tagging, stock-in/stock-out, vendor master and depreciation.
- Inventory module.
- Inventory and purchasing.
- Procurement and assets (Academia).
- School store for merchandise and uniforms.
- Textbook tracking.
- Asset reporting.

### 17. Canteen, Cafeteria and Cashless Wallet

**Status:** Not built · **When:** Wave C

**Gradeon today:** Not yet.

**Features:**

- **EduNest – Not yet** Not in EduNest.
- Cashless canteen with parent-loaded RFID/QR wallets, real-time spend alerts and a POS terminal for canteen staff.
- Online canteen ordering, order tracking and point-of-sale kiosks.
- Canteen ordering with payments.
- Cafeteria point-of-sale.
- Lunch billing/reporting.
- Meals and cashless payments.
- Daily spend limits and low-balance alerts (canteen-system category).
- kanishkasoftware
- Multi-application smart ID cards combining canteen, library and transport (School Thinker).

### 18. Health, Medical and Infirmary

**Status:** Not built · **When:** Wave B

**Gradeon today:** Not yet.

**Features:**

- **EduNest – Not yet** Not in EduNest.
- Medical records: allergies, immunizations, medications and insurance.
- Sick-bay/infirmary visit logs with treatments recorded and parents notified.
- Medical centre module.
- Individual care plans uploaded by the nurse.
- Medical care plans.
- Health alerts surfaced on profiles.
- Parent-updated medical data.
- Medicaid billing for special-education services.

### 19. Behaviour, Discipline, Wellbeing and Safeguarding

**Status:** Not built · **When:** Wave B

**Gradeon today:** Not yet.

**Features:**

- **EduNest – Not yet** Not in EduNest.
- Positive and negative behaviour records with school-defined descriptors and severities.
- Customizable reward/conduct types with unlimited categories and house points.
- Point awards.
- Detentions, internal exclusions, and temporary and permanent exclusions/suspensions.
- Behaviour workflows with approval chains.
- Instant notifications to tutors, house staff and parents.
- Wellbeing concern logging.
- Safeguarding and pastoral notes.
- Mental-health check-ins and personalised support plans.
- Configurable incident types such as cyberbullying, with automatic parent notification.
- Interventions tracking and effectiveness.
- Dashboards for behaviour, SEN and wellbeing.
- Discipline modules.

### 20. Special Education / IEP / Individual Needs

**Status:** Not built · **When:** Not planned

**Gradeon today:** Not yet. Rare in Indian schools; revisit for international or inclusive schools.

**Features:**

- **EduNest – Not yet** Not in EduNest.
- IEP and 504-plan management with compliance tracking.
- Special-ed IEPs inside the SIS. Special education with Medicaid billing. IEP tracking reports.
- Individual Needs designation and IEP archive for longitudinal progress, with differentiation hints surfaced in lesson planning.
- EHCP filing and personalised outcomes.
- Australian NCCD and individual learning plans.
- State special-education reporting.
- powerschool-docs
- APAAR-linked disability data in UDISE+ in India.

### 21. Communication

**Status:** Built · **When:** Now (providers), Later (voice)

**Gradeon today:** Notices, chat, the app’s notification inbox, rules per message, templates, quiet hours that hold messages, delivery records, SMS, WhatsApp, email and push through the Integrations Hub. Waiting on: real provider accounts (DLT for SMS) and Firebase files for push. Not yet: attachments in chat threads, voice calls and voice notes.

**Features:**

*Channels*

- SMS, email, push, in-app messaging, and WhatsApp.
- Voice calls.

*Tools*

- Circulars/notices and news.
- Message wall/daily bulletin.
- Targeted messaging to groups drawn from classes, activities or forms.
- Two-way secure parent-teacher messaging.
- Scheduled reports by email.
- Parental engagement reports.
- Multilingual communication.
- **Parent-teacher meetings:** online PTM/conference booking.

### 22. Parent, Student and Teacher Apps and Portals

**Status:** Built · **When:** Done in the one-pass repair

**Gradeon today:** Parent, teacher, student and bus-driver app (Android and iPhone), each role switched on per school from the console, live chat, notifications and bus, offline Home, deep links, a branded app per school, a phone-friendly admin. Not yet: push notifications on the phone (needs the owner's Firebase project).

**Features:**

*Parent app*

- Attendance, timetable, homework, marks and reports.
- Fee payment and receipts.
- Bus tracking.
- Circulars.
- Absence notes.
- Consent forms.
- Chat with teachers.
- Contact detail updates.

*Student app*

- Timetable, assignments, study material, results and online tests.
- Homework tracking, behaviour points and exam entries.

*Teacher app*

- Attendance, marks entry, lesson plans, online classes and library updates.
- Rewards on the go.
- Evacuation roll call.

*Management app/dashboard*

- Approvals: staff leave, visitor approvals.
- KPIs.
- **Branding:** white-labelled branded apps.
- **Portal analytics:** activity logging and usage statistics.

### 23. Visitor, Gate Pass and Campus Security

**Status:** Not built · **When:** Wave A

**Gradeon today:** Not yet.

**Features:**

- **EduNest – Not yet** Not in EduNest.
- Visitor logbook.
- Visitor approvals from mobile.
- Gate management.
- Parent pickup verification and student exit approvals.
- Authorised-pickup workflows.
- RFID gate in/out alerts.
- RFID floor tracking with live student positions overlaid on the campus blueprint, alerting in under 5 seconds.
- Visitor management.

### 24. Certificates and ID Cards

**Status:** Partly · **When:** Wave A

**Gradeon today:** Digital ID cards in the app. Not yet: certificates (transfer, bonafide, character, study) with number series, printed ID cards.

**Features:**

- Certificate generator/builder for transfer certificates (TC), bonafide, character and other certificates.
- ID card generator.
- Smart PVC ID cards with RFID, QR verification and barcodes (School Thinker).
- Transfer records and certificate history in the SIS.
- TCs and marksheets accessible via DigiLocker through APAAR linkage.

### 25. Events, Calendar, Activities, Trips and Consent

**Status:** Partly · **When:** Wave A (trips and consent)

**Gradeon today:** Events calendar with RSVP. Not yet: activities, trips, consent forms, trip fees.

**Features:**

- School/events calendar.
- Event registrations and RSVPs.
- Activity programmes with online sign-up, first-come or manual selection, and attendee registers.
- Clubs and trips with payments.
- Event consent plus payment in a single place for parents to act.
- amazonaws
- Excursion permissions.
- Trip planning with risk documentation and approval chains.
- Committees sign-up.
- Gallery.

### 26. Sports, Houses and Co-curricular Tracking

**Status:** Not built · **When:** Wave A (house points)

**Gradeon today:** Students carry a house, used as a filter. Not yet: house points, sports results, co-curricular tracking.

**Features:**

- **EduNest – Not yet** Students carry a house, used as a filter; no house points or co-curricular tracking.
- House points systems.
- Badges/awards.
- "Off Games" registers.
- Co-curricular trackers.
- Activities/extracurricular management.
- School achievements showcase.
- Dedicated sports-fixture or team management was rarely documented among the products reviewed. Most products handle sport through activities, houses and events.

### 27. Alumni

**Status:** Not built · **When:** Wave B

**Gradeon today:** Not yet.

**Features:**

- **EduNest – Not yet** Not in EduNest.
- Alumni registration linked to existing user accounts.
- Seamless student-to-alumni profile transition with ongoing communication. Alumni and development/fundraising.
- Alumni data within lifecycle records.

### 28. Analytics, Dashboards and MIS Reports

**Status:** Built · **When:** Now (scheduled reports), Wave B (report builder)

**Gradeon today:** Dashboard with charts against goals and ready-made reports as CSV. Not yet: scheduled reports, a custom report builder, BI feeds.

**Features:**

- Role-based dashboards.
- Management dashboards on receivables, occupancy, attendance health and exam outcomes.
- Live attendance, fee collection and performance by class.
- Report center and custom report builders.
- 
- Scheduled reports.
- Live feeds to Excel and BI tools; Power BI dashboards embedded in the MIS.
- Data-quality dashboards.
- At-risk/early-warning analytics.
- National benchmarking.
- Query builders with SQL and Excel export.
- Report libraries of 400+ reports (Academia).
- Excel/PDF export.

### 29. Multi-branch / Multi-campus / Group Management

**Status:** Not built · **When:** Wave B

**Gradeon today:** Gradeon’s own console runs every school, but a trust or group has no view of its schools. Not yet.

**Features:**

- **EduNest – Not yet** EduNest's own console runs every school (fleet view, pushing plan and module settings, read-only support sessions), but a school group or trust has no view of its schools.
- Single dashboard to manage and track all institutions.
- Multi-school group dashboards.
- Trust-wide reporting, central communications, school clusters, remote log-in to a school, and central configuration pushdown.
- MAT MIS and finance consolidation.
- School, district and diocese databases.
- Multi-account fee settlement for trusts.
- Multi-school administration.

### 30. Administration, Settings, Roles and Permissions

**Status:** Built · **When:** Later (single sign-on)

**Gradeon today:** Roles and permissions, staff accounts, modules on or off per school, profile, branding and colours, approval rules, light and dark, everything configured from the console. Not yet: single sign-on and passkeys, the admin in other languages.

**Features:**

- School years, terms, year groups, houses and school days configuration. User management.
- Role-based access control.
- Field-level permissions. service
- Per-role module enablement.
- Renaming terminology/labels.
- Themes.
- Plugin systems and page customisation.
- Multilingual UI: 100+ languages; Catalan, Japanese and Portuguese added.
- Google SSO.
- Data collection policies.
- 

### 31. Integrations and APIs

**Status:** Built · **When:** Later (open API)

**Gradeon today:** The Integrations Hub: connections, routes, templates, webhooks and delivery records for every outside service, payments through Razorpay or Cashfree, outgoing webhooks. Not yet: an open API for partners, live accounting and LMS sync.

**Features:**

- **EduNest – Not yet** EduNest's API serves only its own app and admin. No open API, accounting or LMS integrations; the payment gateway (Razorpay) is not connected.
- **Payments:** payment gateways.
- **Accounting:** Tally, QuickBooks, Paybooks; Tally.
- **Productivity:** Google Workspace; Microsoft.
- **Video:** Zoom, Google Meet, MS Teams, BigBlueButton.
- **Hardware:** biometric and RFID devices.
- **LMS:** Moodle; Canvas and Schoology.
- **Interoperability standards:** Ed-Fi, SIF and OneRoster; OneRoster; LTI.
- **APIs:** open REST APIs and API playgrounds, and REST APIs with webhooks.
- **Integration ecosystems:** 120+ integrations and an App Center; partner ecosystems.

### 32. Government and Statutory Compliance Reporting

**Status:** Not built · **When:** Wave A

**Gradeon today:** Not yet: UDISE+ export, APAAR IDs, RTE quota reporting.

**Features:**

- **EduNest – Not yet** Not in EduNest.
- **India:**
- UDISE+ data export.
- UDISE+ auto-sync, bulk APAAR ID creation and real-time validation. NEP 2020 HPC, competency assessment and CPD hours.
- CBSE SAR formats and affiliation document management for inspections.
- NAAC/NBA/NIRF/AQAR accreditation reports.
- GST invoicing.

*US*

- State reporting with pre-built reports and validation suites.
- Texas PEIMS.
- State reporting.
- FERPA compliance tooling.

*UK*

- School Census and Workforce Census wizards.
- Census audit across trusts.
- DfE attendance codes.
- CFR finance returns.
- **Australia:** NCCD; "jurisdictional reporting".

### 33. Data Security, Privacy, Audit and Backups

**Status:** Partly · **When:** Readiness

**Gradeon today:** Audit log, privacy notice and consent, data-rights requests, breach records, separate database per school, daily backups with restore drills, retention erasure with two people, files scanned for viruses when a scanner is set. Not yet: security certification, a penetration test.

**Features:**

- Encrypted data transmission, regular backups and audit trails of profile changes.
- Audit log.
- ISO 27001 and SOC 2 certification and a Security Operations Center.
- GDPR-aligned controls.
- FERPA/security auditing.
- Secure data deletion within 30 days of contract end.
- service
- Self-hosting option for full data control.

### 34. AI Features

**Status:** Not built · **When:** Wave C

**Gradeon today:** A switch for the assistant exists. Not yet.

**Features:**

- **EduNest – Not yet** An assistant is planned behind a switch but not built.
- **Operational insight:** AI surfaces overdue fees, attendance dips, admission bottlenecks and exam outliers, and times fee reminders.
- **Predictive analytics:** student-performance and attendance predictions; at-risk indicators; "AI-powered analytics" (Academia).
- **Natural-language assistants and reporting:** ask questions of the school’s data in plain words, and smart reports.
- 
- **Workflow automation:** automatic tasks that run when something happens.
- **Teaching AI:** EduAI for lesson plans and quizzes.
- **AI report-card comments:** mostly provided by standalone tools that draft comments for pasting into an SIS (Monsha bulk generation with SIS character limits; Report Card Wizard).
- **AI-driven admissions CRM:** enquiries scored and followed up automatically.

### 35. Document Management and Form Builder

**Status:** Partly · **When:** Wave A (form builder)

**Gradeon today:** Files in storage for students, homework, notices and the gallery. Not yet: a form builder, document workflows, e-signatures.

**Features:**

- **EduNest – Not yet** Not in EduNest.
- Doc Manager.
- Document attachments on records.
- Form Builder, integrated online form builder, and dynamic forms.
- Electronic permission/data-collection forms.
- School policies library.
- Affiliation document management.
- Integration with cloud repositories such as Google Drive and OneDrive.

### 36. Helpdesk, Complaints, Grievances and Requests

**Status:** Partly · **When:** Wave B

**Gradeon today:** Family messages land in the school’s inbox with open and closed views and an owner. Not yet: complaints and grievance tracking.

**Features:**

- Complaint tracking.
- Feedback and grievance systems in portals.
- Request management for parent and staff requests.
- Help Desk module.
- Service desk with automated feedback on closed queries.

### 37. Surveys, Polls and Feedback

**Status:** Not built · **When:** Wave B

**Gradeon today:** Not yet.

**Features:**

- **EduNest – Not yet** Not in EduNest.
- Polls.
- School surveys. service
- Feedback mechanisms.
- Student well-being assessments.

### 38. Front Office

**Status:** Partly · **When:** Wave A (with gate pass)

**Gradeon today:** Enquiry register in Admissions. Not yet: visitor log, gate pass, postal and call registers.

**Features:**

- Front office module.
- Enquiry registers.
- Visitor log.
- Gate pass.
- Postal/dispatch-style registers (common in Indian products; not individually verified here).

### 39. Scholarships, Concessions and Financial Aid

**Status:** Partly · **When:** Wave A

**Gradeon today:** Fee concessions and waivers with approval. Not yet: scholarships, financial aid, RTE free seats and their reimbursement claim.

**Features:**

- Scholarship management and fee concessions.
- Financial aid integrated with enrollment and billing.
- Scholarships in university fee modules.

### 40. Collaboration

**Status:** Partly · **When:** Later

**Gradeon today:** Photo gallery with albums, consent and tags (Phase 4). Not yet: tasks, discussions, blogs.

**Features:**

- Tasks, discussions, blogs, polls and galleries.
- Task module.
- Activity streams and feeds.

### 41. Placement, Careers and Higher-Education Guidance

**Status:** Not built · **When:** Not planned

**Gradeon today:** Not yet. Niche; worth a small careers page with alumni for senior secondary schools.

**Features:**

- **EduNest – Not yet** Not in EduNest.
- Placement module.
- Higher-education application support and collaborative reference writing.
- College and career readiness.
- Mastery Transcript integration.

### 42. Advancement / Fundraising

**Status:** Not built · **When:** Not planned

**Gradeon today:** Not yet. Donation receipts under section 80G would fit inside fees if a school needs them.

**Features:**

- **EduNest – Not yet** Not in EduNest.
- Development/fundraising tied to the same household record.
- Donations and fundraising.
