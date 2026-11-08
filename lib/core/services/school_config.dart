import 'package:flutter/widgets.dart';
import 'package:get/get.dart';
import 'package:gradeon/core/config/app_config.dart';
import 'package:gradeon/core/services/theme_service.dart';
import 'package:gradeon/core/utils/schedule.dart';
import 'package:gradeon/core/widgets/toast.dart';
import 'package:gradeon/data/datasources/remote_datasource.dart';

/// What Gradeon set up for this school in the console (`/v1/config`): the family tabs, the home sections and the modules.
/// Sample content and a failed call keep the defaults, so the app always opens.
abstract final class SchoolConfig {
  static final dock = <String>['home', 'academics', 'fees', 'chat'].obs;
  static final home = <String>['dayRibbon', 'dueStack', 'attendance', 'nextExam', 'notices', 'events'].obs;
  static final quick = <String>['payFees', 'applyLeave', 'messageTeacher', 'timetable'].obs;

  /// The languages the app offers (console: The app → Languages offered).
  static final languages = <String>['en', 'hi', 'mr'].obs;

  /// Whether a family consents to the privacy notice before using the app, and is asked about photos too.
  static bool consentRequired = false;
  static bool photoConsent = false;

  /// What the school calls a class; empty means the app's own (translated) word.
  static String classWord = '';

  /// Empty means every module (sample content, or before the school's config arrives).
  static final modules = <String>[].obs;

  /// Features inside those modules (like fees.onlinePayment). Null until the school's config arrives: then everything shows.
  static final features = Rxn<List<String>>();

  static bool has(String module) => modules.isEmpty || modules.contains(module);

  /// Whether the school has a feature: a family cannot pay in the app, hand in homework or start a chat without its feature.
  static bool hasFeature(String key) => features.value?.contains(key) ?? true;

  /// For an action a plan can take away: true when the school has [key], otherwise says so and returns false.
  static bool allows(String key) {
    if (hasFeature(key)) return true;
    ToastHelper.show('plan.not_included');
    return false;
  }

  static Future<void> load() async {
    if (!AppConfig.live) return;
    try {
      final json = Map<String, dynamic>.from(await Get.find<RemoteDataSource>().get('/v1/config') as Map);
      final app = Map<String, dynamic>.from(json['app'] as Map);
      modules.assignAll(List<String>.from(json['modules'] as List));
      features.value = List<String>.from((json['features'] as List?) ?? const []);
      dock.assignAll(List<String>.from(app['dock'] as List));
      home.assignAll(List<String>.from(app['home'] as List));
      quick.assignAll(List<String>.from((app['quick'] as List?) ?? const []));
      final settings = Map<String, dynamic>.from((json['settings'] as Map?) ?? const {});
      final langs = List<String>.from((settings['app.languages'] as List?) ?? const ['en', 'hi', 'mr']);
      if (langs.isNotEmpty) languages.assignAll(langs);
      // A family whose language the school does not offer gets the school's default language (or the first one offered).
      final theme = Get.find<ThemeService>();
      if (!languages.contains(theme.locale.value.languageCode)) {
        final fallback = '${(json['school'] as Map?)?['language'] ?? ''}';
        await theme.setLocale(Locale(languages.contains(fallback) ? fallback : languages.first));
      }
      consentRequired = settings['privacy.consentRequired'] == true;
      photoConsent = settings['privacy.photoConsent'] == true;
      const days = {'mon': DateTime.monday, 'tue': DateTime.tuesday, 'wed': DateTime.wednesday, 'thu': DateTime.thursday, 'fri': DateTime.friday, 'sat': DateTime.saturday, 'sun': DateTime.sunday};
      weeklyOffDays
        ..clear()
        ..addAll(List<String>.from((settings['calendar.weeklyOff'] as List?) ?? const ['sun']).map((d) => days[d]).whereType<int>());
      final word = '${(json['vocabulary'] as Map?)?['class'] ?? ''}'.trim();
      classWord = word == 'Class' ? '' : word;
    } on Object {
      // Keeps what it had: the next resume or the next "not in your plan" answer tries again.
    }
  }
}
