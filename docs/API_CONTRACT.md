# API contract

> **Status:** implemented. The school API serves these calls under the prefix `/v1/f` (for example `GET /v1/f/students/:id/fees`), scoped to the signed-in person, in the shapes below (`apps/api/src/school/family.controller.ts`, tests in `apps/api/test/family.test.ts`). The app's `ApiClient` adds the prefix, the `X-School` header and the token. Sign-in is the platform's own two steps, `POST /v1/auth/login` then `POST /v1/auth/verify`, not the `/auth/*` calls in the next section. Differences from the tables: leave requests, attendance marks and homework hand-ins are stored in the same tables the admin uses; gallery is empty; library lists loans only (reserve answers 409); transport has the route only; notifications are the messages the school sent to the person's phone (read and dismiss state is kept per person).

Each repository method maps to one REST call. `Remote*Repository` calls these paths through `RemoteDataSource` and `ApiClient` (`lib/core/network/api_client.dart`). A build without `SCHOOL` and `API_BASE_URL` keeps `AppConfig.useMockData` on and never touches the network; a build with them uses these calls.

JSON bodies and responses use the shapes in [MOCK_SCHEMA.md](MOCK_SCHEMA.md). Dates on the wire are ISO-8601. Enum fields use the JSON values listed there (`late`, not the Dart name `lateArrival`; `class`, not `klass`).

## Errors

Failures are a JSON object:

```json
{ "message": "errors.bad_login" }
```

The real server sends `{ "code", "message" }`, where `message` is a sentence for people (the client shows it as is) and `code` a machine word. HTTP status is 400 for validation, 401 for auth, 403 for a missing permission (or a module or feature the school's plan does not include), 404 for a missing id, 409 for a conflict, 423 for a locked account, 429 for too many requests (`retryAfter` in seconds, also the `retry-after` header) and 500 for anything else. `ApiClient` turns a non-2xx body into `AppException(message)` and a failed connection into `errors.network`.

## Auth

As built: `POST /v1/auth/login` `{ "identifier", "password", "client"? }` answers `{ "step": "otp", "challenge": { "challengeId", "maskedTo", "expiresInSeconds", "demoCode"? } }` (or the tokens when the school switched the code off). `client` is `web` or `mobile` (mobile if omitted). `POST /v1/auth/verify` `{ "challengeId", "code", "client"? }` answers `{ "accessToken", "expiresInSeconds", "user", "refreshToken"? }`.

Families have no password: `POST /v1/auth/code` `{ "identifier" }` (their phone) answers the same challenge, and `POST /v1/auth/verify` signs them in. One account is sent at most five codes (sign-in or reset, `POST /v1/auth/reset/start`) in fifteen minutes; the sixth answers 429. Staff signing in from the app (`client: "mobile"`) are refused with 403 when the school's `app.teachers` setting is off.

Before sign-in, `GET /v1/brand` (public) answers who the school is and its privacy notice: `{ "name", "shortName", "color", "logoText", "tagline", "language", "demoMode", "privacy": { "notice", "officerName", "officerEmail", "officerPhone" } }`. After sign-in, `GET /v1/config` is the school's resolved configuration: modules, features, `app` (`dock`, `home`, `quick`, already limited to modules the school has), `settings` (including `app.languages`, `privacy.consentRequired`, `privacy.photoConsent`) and `vocabulary`.

The phone app (`client: "mobile"`) gets `refreshToken` in the body, keeps both tokens in secure storage, and renews with `POST /v1/auth/refresh` `{ "refreshToken" }`. Each renewal returns a new refresh token; reusing an old one ends every session for that person and writes `auth.refresh_replayed`. Sessions last at most 30 days (14 idle).

The websites (`client: "web"`) keep the refresh token in an httpOnly cookie (`gd_rt_<slug>` locally, `__Secure-gd_rt_<slug>` in production, `Path=/v1/auth`, `SameSite=Strict`). The body has no refresh token. Refresh and logout send that cookie, an allowed `Origin`, and `x-csrf` matching the readable `gd_csrf` cookie. Web sessions last 7 days. `POST /v1/auth/logout-all` ends every session for that person.

Every later request sends `Authorization: Bearer <accessToken>` and `X-School: <slug>`. The access JWT is 15 minutes, bound to the school (`aud`), and carries `sid` and `ver` (`users.token_version`). A revoked session, a role change, deactivation, or logout-all is refused on the next request (cached about 30 seconds). The app then reads the person from `GET /v1/f/me`, which also carries `consentedAt` and `photoConsent`; a family consents once with `POST /v1/f/consent` `{ "photos"? }` (answers `{ "consentedAt", "photoConsent" }`; a second call changes nothing but the photo answer). The table below is the demo app's original shape; the mock still uses it.

## Pagination

Collection GETs accept `page` (default 1) and `pageSize` (default 50). The response is either the raw array the repositories parse today, or:

```json
{ "items": [], "page": 1, "pageSize": 50, "total": 0 }
```

Remote parsers currently expect the raw array (or a single object). When a backend starts paginating, unwrap `items` in that repository only.

## Auth repository

| Method | Call |
| --- | --- |
| `login` | `POST /auth/login` `{ "email", "password" }` → user |
| `loginWithOtp` | `POST /auth/otp` `{ "email", "otp" }` → user |
| `loginAs` | `POST /auth/demo` `{ "role" }` → user |

## Directory

| Method | Call |
| --- | --- |
| `student` | `GET /students/:id` → student |
| `studentsIn` | `GET /classes/:classId/students` → student[] |
| `schoolClass` | `GET /classes/:id` → class |
| `classesForTeacher` | `GET /teachers/:teacherId/classes` → class[] |
| `teacher` / `teacherOrNull` | `GET /teachers/:id` → teacher |
| `teachers` | `GET /teachers` → teacher[] |
| `school` | `GET /school` → school info |

## Academics

| Method | Call |
| --- | --- |
| `AttendanceRepository.forStudent` | `GET /students/:studentId/attendance` → attendance[] |
| `summary` | Derived on the client from `forStudent`. No extra route. |
| `todayForClass` | `GET /attendance/today?students=id,id` → `{ "stu_aarav": "present" }` |
| `markToday` | `POST /attendance` `{ "<studentId>": "present" }` |
| `TimetableRepository.forClass` | `GET /classes/:classId/timetable` → timetable[] |
| `HomeworkRepository.forClass` | `GET /classes/:classId/homework` → homework[] |
| `byId` | `GET /homework/:id` → homework |
| `submit` | `POST /homework/:id/submissions` `{ "studentId", "fileName" }` |
| `grade` | `POST /homework/:id/grades` `{ "studentId", "marks", "grade", "feedback" }` |
| `assign` | `POST /homework` → homework object |
| `ExamRepository.forClass` | `GET /classes/:classId/exams` → exam[] |
| `result` | `GET /results/:examId/:studentId` → result |
| `resultsFor` | `GET /students/:studentId/results` → result[] |
| `marksDraft` | `GET /classes/:classId/marks?subject=maths` → `{ "<studentId>": 91 }` |
| `saveMarks` | `POST /classes/:classId/marks` `{ "subject", "values" }` |

## Campus

| Method | Call |
| --- | --- |
| `FeeRepository.forStudent` | `GET /students/:studentId/fees` → fee account |
| `pay` | `POST /fees/:installmentId/pay` `{ "studentId", "method" }` |
| `NoticeRepository.all` | `GET /notices` → notice[] |
| `post` | `POST /notices` → notice object |
| `EventRepository.all` | `GET /events` → event[] |
| `rsvp` | `POST /events/:eventId/rsvp` `{ "userId", "status" }` |
| `ChatRepository.threadsFor` | `GET /users/:userId/threads` → thread[] |
| `messages` | `GET /threads/:threadId/messages` → message[] |
| `inbox` | `GET /users/:userId/threads` plus `GET /users/:userId/messages` → message[] |
| `send` | `POST /threads/:threadId/messages` `{ "senderId", "text" }` |
| `LibraryRepository.all` | `GET /library/books` → book[] |
| `reserve` | `POST /library/books/:bookId/reserve` `{ "studentId" }` |
| `TransportRepository.forStudent` | `GET /students/:studentId/transport` → transport |
| `LeaveRepository.forStudent` | `GET /students/:studentId/leave` → leave[] |
| `apply` | `POST /leave` → leave object |
| `GalleryRepository.all` | `GET /gallery` → album[] |
| `NotificationRepository.forUser` | `GET /users/:userId/notifications` → notification[] |
| `dismiss` | `POST /notifications/:id/dismiss` `{}` |
| `markAllRead` | `POST /users/:userId/notifications/read` `{}` |
| `AssistantRepository.ask` | `POST /users/:userId/assistant` `{ "prompt", "history": [{ "role", "text" }] }` → `{ "text", "suggestions"?, "route"? }` |

## Plug-ins (not built)

These stay behind their own interfaces so the demo does not pretend to talk to a vendor.

**Push.** `PushGateway.register(token)` and `PushGateway.revoke()`. The server stores the device token on `POST /devices`. Tapping a push opens the `route` already stored on a notification. The in-app list remains `NotificationRepository`.

**Payments.** `PaymentGateway.checkout({ installmentId, method, amount })` returns `{ status, reference }`. `FeeRepository.pay` calls it, then `POST /fees/:installmentId/pay` with that reference. UPI, card, and net banking in the sheet are labels only until a gateway is chosen.

**Live GPS.** `BusTracker.watch(busNo)` is a stream of `{ lat, lng, heading, etaMinutes }`. `TransportRepository.forStudent` stays the snapshot (route, stops, driver). The painted map would subscribe to the stream instead of the mock `progress` animation.
