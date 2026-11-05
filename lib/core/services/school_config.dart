import 'package:get/get.dart';
import 'package:gradeon/core/config/app_config.dart';
import 'package:gradeon/core/widgets/toast.dart';
import 'package:gradeon/data/datasources/remote_datasource.dart';

/// What Gradeon set up for this school in the console (`/v1/config`): the family tabs, the home sections and the modules.
/// Sample content and a failed call keep the defaults, so the app always opens.
abstract final class SchoolConfig {
  static final dock = <String>['home', 'academics', 'fees', 'chat'].obs;
  static final home = <String>['dayRibbon', 'dueStack', 'attendance', 'nextExam', 'notices', 'events'].obs;

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
    } on Object {
      // Keeps what it had: the next resume or the next "not in your plan" answer tries again.
    }
  }
}
