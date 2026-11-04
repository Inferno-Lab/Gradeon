import 'package:flutter/foundation.dart';
import 'package:get/get.dart';

/// Single place for the product name and the mock/remote switch.
class AppConfig {
  const AppConfig._();

  static const appName = 'Gradeon';

  /// Which school this build is for, and where its API lives. Override with
  /// `--dart-define=SCHOOL=<slug> --dart-define=API_BASE_URL=<address>`; the console's build workflow does.
  /// Defaults point at the hosted Greenfield test track. Pass empty values to run on mock JSON.
  static const schoolSlug = String.fromEnvironment('SCHOOL', defaultValue: 'greenfield');
  static const apiBase = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'https://gradeon.onrender.com',
  );
  static const live = schoolSlug != '' && apiBase != '';

  /// Release builds only talk to https. A clear error is better than leaking tokens over http.
  static void assertReleaseUrl() {
    if (!kReleaseMode || !live) return;
    final uri = Uri.tryParse(apiBase);
    if (uri == null || uri.scheme != 'https') {
      throw StateError('API_BASE_URL must use https in a release build.');
    }
  }

  /// The school's name and tagline. The demo values stand until `SchoolProfileService` has the school's own from the API.
  static String schoolName = 'Greenfield International School';
  static String schoolTagline = 'Curiosity first. Kindness always.';
  static const logoAsset = 'assets/images/logo.svg';
  static const version = '2.0.6';
  static const build = 216;

  /// A build with a school profile talks to that school's API; any other build runs on the demo content.
  static bool useMockData = !live;

  /// Mock calls answer almost at once, like a good connection.
  static int mockDelayMinMs = 30;
  static int mockDelayMaxMs = 90;

  /// Feature switches. Off until the screen and the backend for it exist, so unfinished work
  /// never reaches families. A school's build profile can turn them on with --dart-define.
  static const assistantEnabled = bool.fromEnvironment('ASSISTANT');

  /// Design system "Empty school": a brand-new school with people but no content,
  /// to check every empty state. `--dart-define=EMPTY_DATA=true` starts that way.
  static final emptyData = const bool.fromEnvironment('EMPTY_DATA').obs;

  /// Design system "Slow network": 0.4 to 0.9 s per call, to test loading states.
  static final slowNetwork = false.obs;

  /// Toggled from Settings so loading and error states can be demoed.
  static final simulateErrors = false.obs;

  /// The demo password: the demo content's own, or the demo school's when the app is built for one.
  static const demoPassword = live ? 'nest2026' : 'demo123';
  static const demoOtp = '123456';
}
