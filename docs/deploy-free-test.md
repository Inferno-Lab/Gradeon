# Deploy the free test track

One free web service on Render runs everything: the school API, the console API, the school admin (at `/`) and the console (at `/console/`). A free Neon database holds the school list and each school's own database. Nothing here costs money. When Render's free service is idle for 15 minutes it sleeps; the next visit takes about a minute to wake it. That is fine for testing.

You make two accounts (Neon and Render). Everything else is in this repository.

## 1. Neon: the database

1. Go to **neon.tech** and sign up (GitHub or Google works).
2. Create a project called `tangent`. Region: **Singapore** (closest to India). Postgres version: the newest offered.
3. On the project page press **Connect**. Under *Connection string*:
   - switch **Connection pooling** to **off** (the console needs the *direct* connection),
   - copy the string. It starts with `postgresql://` and ends with `?sslmode=require`.
4. Keep that string private. You paste it in step 3 below.

Free limits: 0.5 GB storage per project. The demo school with 1,498 students uses well under that.

## 2. GitHub: the code

The repository already exists at `Inferno-Lab/Tangent`. Render builds from `main` (the owner's service tracks it), so a change goes live only once it is on `main`.

## 3. Render: the service

1. Go to **render.com** and sign up with GitHub. Allow it to read `Tangent`.
2. **New +** → **Blueprint** → pick `Tangent` → branch `main` → **Connect**.
3. Render reads `render.yaml` and shows one service, `tangent`. It asks for three values:
   - `REGISTRY_DATABASE_URL`: paste the Neon string.
   - `DEMO_CODE`: six digits you choose, for example `482915`. The console asks for it after your password.
4. Press **Apply**. The first build takes 6 to 10 minutes.
5. When the service says **Live**, open `https://<your-service>.onrender.com`.

If `tangent` is already taken as a name, Render proposes another one. That is fine: nothing else depends on the name.

## 4. Sign in

| Where | Address | Sign in with |
| --- | --- | --- |
| Console | `https://<service>.onrender.com/console/` | `kaushal@tangent.app`, the password from Render → your service → **Environment** → `BOOTSTRAP_PASSWORD`, then your `DEMO_CODE` |
| Demo school admin | `https://<service>.onrender.com/s/greenfield` | `neha.menon@greenfield.edu.in`, password `nest2026`, then press *Type the demo code* |
| Phone app (a build for `greenfield`) | the app | parent `priya.sharma@example.com`, teacher `kavita.iyer@greenfield.edu.in`; password `nest2026`, code `424242` |

The demo school Greenfield is created by the first start (a minute or two; watch it appear on the console's Fleet page). Anyone with the address can open the demo school, so keep real data out of this environment.

Texts and emails are caught in the console under **Test inbox**; nothing is sent to real phones. New schools created from **Onboarding** get their invite and sign-in codes there.

Optional: to hear about trouble (a new kind of error, a school not answering, a failed backup or restore drill), add an Alerts connection in the console under **Integrations** (Slack, Discord or e-mail: the template asks for the webhook address or the inbox). Backups run daily and a restore drill weekly; both show on the console's **Health** page.

Messages, files and payments: the test track starts in test mode (the switch at the top of **Integrations**), so texts and emails land in the console's **Test inbox**, files are kept in the database and payments open a test checkout. To try a real provider, add it in the console under **Integrations**, route it, and put your own number on the allow-list; nothing else changes. For real families turn the switch to live (a second person approves; the console lists what is not live yet). A File scanning connection (ClamAV) scans uploads. See `docs/integrations.md`.

## 5. Optional: app builds

The console's **Build the app** (a school's page → App) starts the GitHub Actions workflow (`.github/workflows/mobile-build.yml`). Each build gets a one-time code to fetch its signing kit from the console and to report back, so no signing secret sits in GitHub. Everything is a connection under the console's **Integrations**; each template says where to find every value:

1. **App builds → GitHub**: the repository (`Inferno-Lab/Tangent`), the branch (`main`) and a fine-grained token with **Actions: read and write** on it. Test lists the workflow.
2. **Phone notifications → Firebase**: the service account and the app files (`google-services.json`, `GoogleService-Info.plist`). Test checks the files belong to the project.
3. **App stores → Google Play** (the upload key store, its passwords and a service account with release rights; the track) and/or **App Store Connect** (team ID, issuer ID, key ID and the `.p8` key).

Android builds go to the chosen Google Play track; iPhone builds go to TestFlight. The link appears on the school's page when the workflow reports back.

### What the app does against the test track

A build made with `SCHOOL` and `API_BASE_URL` (the workflow passes both) signs in with the school's real accounts (teachers: password, then the code; families: a code to their phone; the demo school hands out `424242`) and reads every screen from the family API (`/v1/f/*`). It follows what the console set for the school: tabs, Home cards and quick buttons, languages, the privacy notice and consent. What a teacher marks in the app shows up in the admin. The workflow leaves the sample content out of the package. Payments open the provider's checkout (the test checkout on the test track), and files, the library, transport with the live bus and the gallery work from the school's data. Not yet: push notifications (the app needs the owner's Firebase project files; see `docs/integrations.md`).

## Updating

Pushing to `main` redeploys automatically. Database changes are applied by the server at start, to the registry and to every school (four at a time) before it takes requests; **Releases** then signs schools off wave by wave, and **Migrations** shows what ran where.

## Using real infrastructure later

The same steps run on AWS: a cell in the console gets the `aws-cell` target, and the blueprints under **Blueprints** describe what is created for each school.
