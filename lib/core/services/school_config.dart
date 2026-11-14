import 'dart:convert';

import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:get/get.dart';
import 'package:tangent/core/config/app_config.dart';
import 'package:tangent/core/services/storage_service.dart';
import 'package:tangent/core/services/theme_service.dart';
import 'package:tangent/core/utils/schedule.dart';
import 'package:tangent/core/widgets/toast.dart';
import 'package:tangent/data/datasources/remote_datasource.dart';

/// A notice or event category the school keeps (console: Notices / Events → categories), drawn in one of four tones.
class SchoolCategory {
  const SchoolCategory(this.key, this.name, this.tone);
  final String key;
  final String name;

  /// `v` violet, `g` green, `a` amber, `c` coral.
  final String tone;
}

/// A house the school has (console: People → Houses).
class SchoolHouse {
  const SchoolHouse(this.key, this.name, this.color);
  final String key;
  final String name;
  final Color color;
}

/// What Tangent set up for this school in the console (`/v1/config`): who may use the app, what each role sees, the modules,
/// and the school's own lists and rules. On sample content it reads `assets/mock/config.json`, which `tools/gen-app-config.mjs`
/// writes from the same module definitions and defaults the server uses. The last copy is kept on the phone, so the app opens
/// offline with the school's own setup; [stale] says when it could not be refreshed.
abstract final class SchoolConfig {
  static Map<String, dynamic> _json = const {};
  static Map<String, dynamic> _settings = const {};

  /// The role the app is laid out for (set by the shell from the signed-in person).
  static String role = 'parent';

  /// The bottom tabs, Home cards and quick buttons of [role], already limited to what the school has.
  static final dock = <String>[].obs;
  static final home = <String>[].obs;
  static final quick = <String>[].obs;

  /// Roles the school lets sign in to the app.
  static final roles = <String>[].obs;

  /// The languages the app offers (console: The app → Languages offered).
  static final languages = <String>['en', 'hi', 'mr'].obs;

  /// Empty only before anything has loaded; then the modules the school has.
  static final modules = <String>[].obs;

  /// Features inside those modules (like fees.onlinePayment).
  static final features = <String>[].obs;

  /// True when the school could not be reached and the app shows the setup it saved last time.
  static final stale = false.obs;

  static bool has(String module) => modules.contains(module);

  /// Whether the school has a feature: a family cannot pay in the app, hand in homework or start a chat without its feature.
  static bool hasFeature(String key) => features.contains(key);

  /// A guard for an action a screen should already have hidden: true when the school has [key], otherwise says so plainly.
  static bool allows(String key) {
    if (hasFeature(key)) return true;
    ToastHelper.show('common.not_at_school');
    return false;
  }

  /// Sets settings directly, for tests that need one rule without loading a whole config.
  @visibleForTesting
  static set debugSettings(Map<String, dynamic> settings) => _settings = settings;

  static T _s<T>(String key, T fallback) => _settings[key] is T ? _settings[key] as T : fallback;
  static List<Map<String, dynamic>> _list(String key) =>
      [for (final e in (_settings[key] as List?) ?? const []) Map<String, dynamic>.from(e as Map)];

  static String get schoolName => '${(_json['school'] as Map?)?['name'] ?? ''}';
  static String get schoolAddress => '${(_json['school'] as Map?)?['address'] ?? ''}';
  static String get schoolPhone => '${(_json['school'] as Map?)?['phone'] ?? ''}';
  static String get schoolEmail => '${(_json['school'] as Map?)?['email'] ?? ''}';

  /// What the school calls a class; empty means the app's own (translated) word.
  static String get classWord {
    final word = '${(_json['vocabulary'] as Map?)?['class'] ?? ''}'.trim();
    return word == 'Class' ? '' : word;
  }

  static String get privacyNotice => '${(_json['privacy'] as Map?)?['notice'] ?? ''}';
  static String get privacyOfficer => '${(_json['privacy'] as Map?)?['officerName'] ?? ''}';
  static String get privacyOfficerEmail => '${(_json['privacy'] as Map?)?['officerEmail'] ?? ''}';
  static String get privacyOfficerPhone => '${(_json['privacy'] as Map?)?['officerPhone'] ?? ''}';

  /// Whether people consent to the privacy notice before using the app, and are asked about photos too.
  static bool get consentRequired => _s('privacy.consentRequired', false);
  static bool get photoConsent => _s('privacy.photoConsent', false);

  static List<SchoolCategory> categories(String kind) => [
    for (final c in _list('$kind.categories')) SchoolCategory('${c['key']}', '${c['name']}', '${c['tone']}'),
  ];
  static SchoolCategory? category(String kind, String key) => categories(kind).firstWhereOrNull((c) => c.key == key);

  static List<SchoolHouse> get houses => [
    for (final h in _list('people.houses'))
      SchoolHouse('${h['key']}', '${h['name']}', Color(int.parse('FF${'${h['color']}'.substring(1)}', radix: 16))),
  ];
  static SchoolHouse? house(String? nameOrKey) {
    final k = (nameOrKey ?? '').trim().toLowerCase();
    return houses.firstWhereOrNull((h) => h.key == k || h.name.toLowerCase() == k);
  }

  /// The attendance marks the school uses (present and absent always).
  static List<String> get attendanceStatuses => List<String>.from(_s<List<dynamic>>('attendance.statuses', const ['present', 'absent', 'late', 'leave']));
  static List<String> get leaveReasons => List<String>.from(_s<List<dynamic>>('leave.reasons', const ['Other']));

  /// The first weekday of every week grid: [DateTime.monday] or [DateTime.sunday].
  static int get weekStarts => _s('calendar.weekStarts', 'mon') == 'sun' ? DateTime.sunday : DateTime.monday;

  /// Grades from the lowest percentage that earns each, highest first.
  static List<(String, double)> get gradingScale => [
    for (final g in _list('grading.scale')) ('${g['grade']}', (g['minPct'] as num).toDouble()),
  ]..sort((a, b) => b.$2.compareTo(a.$2));
  static String gradeFor(double pct) => gradingScale.firstWhereOrNull((g) => pct >= g.$2)?.$1 ?? '';
  static double get passPct => _s<num>('grading.passPct', 33).toDouble();

  static bool get showRank => _s('results.showRank', false);
  static bool get showClassProgress => _s('homework.showClassProgress', false);
  static bool get showGoing => _s('events.showGoing', false);

  /// Who hands homework in from the app: `parent`, `student` or `either`.
  static String get handedInBy => _s('homework.handedInBy', 'either');

  static int get libraryMaxLoans => _s<num>('library.maxLoans', 3).toInt();
  static int get libraryMaxRenewals => _s<num>('library.maxRenewals', 1).toInt();

  /// Who a family calls about the bus: `office`, `attendant` or `none`.
  static String get familyCalls => _s('transport.familyCalls', 'office');

  /// Lays the app out for [r] (a role key) from the loaded config.
  static void applyRole(String r) {
    role = r;
    final layout = Map<String, dynamic>.from(((_json['app'] as Map?)?['layout'] as Map?)?[r] as Map? ?? const {});
    dock.assignAll(List<String>.from((layout['dock'] as List?) ?? const ['home']));
    home.assignAll(List<String>.from((layout['home'] as List?) ?? const []));
    quick.assignAll(List<String>.from((layout['quick'] as List?) ?? const []));
  }

  static const _cacheKey = 'school.config';

  /// Before the first frame: the sample school's config, or the copy saved at the last start, so the app opens laid out.
  static Future<void> restore() async {
    if (!AppConfig.live) return load();
    final saved = await Get.find<StorageService>().readCache(_cacheKey);
    if (saved != null) await _apply(Map<String, dynamic>.from(jsonDecode(saved) as Map));
  }

  static Future<void> load() async {
    Map<String, dynamic>? json;
    if (AppConfig.live) {
      try {
        json = Map<String, dynamic>.from(await Get.find<RemoteDataSource>().get('/v1/config') as Map);
        await Get.find<StorageService>().writeCache(_cacheKey, jsonEncode(json));
        stale.value = false;
      } on Object {
        final saved = await Get.find<StorageService>().readCache(_cacheKey);
        if (saved != null) json = Map<String, dynamic>.from(jsonDecode(saved) as Map);
        stale.value = true;
      }
    } else {
      json = Map<String, dynamic>.from(jsonDecode(await rootBundle.loadString('assets/mock/config.json')) as Map);
    }
    if (json == null) return;
    await _apply(json);
  }

  static Future<void> _apply(Map<String, dynamic> json) async {
    _json = json;
    _settings = Map<String, dynamic>.from((json['settings'] as Map?) ?? const {});
    modules.assignAll(List<String>.from((json['modules'] as List?) ?? const []));
    features.assignAll(List<String>.from((json['features'] as List?) ?? const []));
    roles.assignAll(List<String>.from(((json['app'] as Map?)?['roles'] as List?) ?? const []));
    applyRole(role);
    final langs = List<String>.from((_settings['app.languages'] as List?) ?? const ['en', 'hi', 'mr']);
    if (langs.isNotEmpty) languages.assignAll(langs);
    // Someone whose language the school does not offer gets the school's default language (or the first one offered).
    final theme = Get.find<ThemeService>();
    if (!languages.contains(theme.locale.value.languageCode)) {
      final fallback = '${(json['school'] as Map?)?['language'] ?? ''}';
      await theme.setLocale(Locale(languages.contains(fallback) ? fallback : languages.first));
    }
    const days = {'mon': DateTime.monday, 'tue': DateTime.tuesday, 'wed': DateTime.wednesday, 'thu': DateTime.thursday, 'fri': DateTime.friday, 'sat': DateTime.saturday, 'sun': DateTime.sunday};
    weeklyOffDays
      ..clear()
      ..addAll(List<String>.from((_settings['calendar.weeklyOff'] as List?) ?? const ['sun']).map((d) => days[d]).whereType<int>());
  }
}
