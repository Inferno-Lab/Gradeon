# Adding things

Keep each change small and complete. Run `tool/verify.sh` at the end, then look at the screen (headless shot; emulator for glass).

## A screen

1. **Controller** `lib/features/<feature>/controllers/<name>_controller.dart`: `class X extends GetxController with Loadable`; implement `load()` with `run(() async { … }, isEmpty: () => items.isEmpty)`. Derived values go in getters. Never build widgets here.
2. **View** `views/<name>_view.dart`: `GetView<X>` returning `Obx(() => PageFrame(children: [ViewStateView(state: …, emptyArt: …, emptyTitle: …, emptyBody: …, emptyHint: …, emptyActions: […], child: …)]))`. Read an observable inside the `Obx`.
3. **Route**: constant in `AppRoutes`, entry in `AppPages.pages` with a `Binding` (`Get.lazyPut(X.new)`). Tab screens bind in `ShellBinding`.
4. **Copy**: keys in `en_redesign.dart`; use `'x.y'.tr` or `'x.y'.trp({'name': v})`.
5. **Mock data** if needed (`assets/mock/*.json`, update `docs/MOCK_SCHEMA.md`).
6. **Tests**: add the route to `test/screens_smoke_test.dart` (it runs every role at phone, small and tablet sizes).

## A repository

1. In `data/repositories/<area>_repository.dart` add `abstract class XRepository`, `MockXRepository(MockJsonDataSource)` using `_ds.guard(() => …)` (adds the mock latency and the simulate-errors switch), and `RemoteXRepository(RemoteDataSource)` calling `_remote.get/post`.
2. Register **both** in `InitialBinding` (mock branch and remote branch).
3. Describe the HTTP shape in `docs/API_CONTRACT.md`. Writes in the mock must bump the session so open screens reload.
4. Test the mock adapter; `test/remote_binding_test.dart` covers the remote registrations.

## A model

`data/models/<name>.dart`, with a `fromJson` tolerant of missing optional fields. Dates arrive as ISO strings (mock relative dates are resolved before parsing).

## An AI feature (chatbot, summaries, smart replies)

The seam exists: `AssistantRepository.ask(userId, prompt, history) → AssistantReply(text, suggestions, route)` in `data/repositories/assistant_repository.dart`.

1. **UI and controllers depend on the interface only.** Build the screen against `MockAssistantRepository` first, and extend its canned answers so the design can be judged.
2. **The app never holds a model key.** The backend owns the provider, prompts, retrieval over school data and guardrails (children's data, no cross-school access). `RemoteAssistantRepository` calls `POST /users/:userId/assistant`.
3. **Another provider, or an on-device model,** is another class implementing `AssistantRepository`, chosen in `InitialBinding`. No screen changes.
4. **Gate it**: entry points check `AppConfig.assistantEnabled` (`--dart-define=ASSISTANT=true`). Unfinished AI never reaches families by default.
5. **Design for failure**: loading skeleton, an error state with retry, a first-open state with suggestion chips (`AssistantReply.suggestions`), and deep links (`route`) so answers lead into the app.
6. **Need more than a reply?** Streaming: add `Stream<String> askStream(...)` to the interface with a default that wraps `ask`, so existing adapters keep working. Actions: return a typed `route` (and extend `AssistantReply`); never run a write from model text without a confirm sheet.
7. Privacy: send ids and the prompt, not names or phone numbers; the backend resolves context.

## A feature flag

Add `static const fooEnabled = bool.fromEnvironment('FOO');` to `AppConfig`, check it where the entry point is shown, and document the define in `AGENTS.md`. Later the admin console can serve flags instead; call sites stay the same.

## Copy in another language

Add the key to the `_hi` / `_mr` maps in `app_translations.dart`; anything missing falls back to English.

## An admin or console page (platform)

The steps and the reasons are in `docs/HANDOFF.md` section 9.1; in short:

1. Contracts (`packages/contracts`), then a new SQL migration (`packages/db/migrations/school/`, never edit an applied one) and the schema, then the seed so the demo school has data on every weekday.
2. Service + controller in `apps/api/src/school/` with `@RequireModule` and `@Require`, audit entries for writes, tests in `apps/api/test/modules.test.ts` (or `api.test.ts` for the core areas, `family.test.ts` for the app's API). Rebuild the package (`pnpm --filter @gradeon/api build`) before the dev server sees it.
3. Method in `packages/api-client`, then the page: copy `apps/admin/src/pages/fees/FeesPage.tsx` (or a console page such as `apps/console/src/pages/flags/FlagsPage.tsx`), use `Page`, the shared blocks and `EmptyCard`; give it loading, empty, error and read-only states. Route in `router.tsx`, menu entry in `app/nav.ts`.
4. Look at it against `docs/DESIGN.md`, then add it to `tools/audit-ui.mjs` and a flow to `tools/e2e-flows.mjs`, and keep both green. Pages without a canvas board need the owner's design review.
