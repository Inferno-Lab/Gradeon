import 'package:get/get.dart';
import 'package:gradeon/core/config/app_config.dart';
import 'package:gradeon/data/datasources/remote_datasource.dart';

/// What Gradeon set up for this school in the console (`/v1/config`): the family tabs, the home sections and the modules.
/// Sample content and a failed call keep the defaults, so the app always opens.
abstract final class SchoolConfig {
  static final dock = <String>['home', 'academics', 'fees', 'chat'].obs;
  static final home = <String>['dayRibbon', 'dueStack', 'attendance', 'nextExam', 'notices', 'events'].obs;

  /// Empty means every module (sample content, or before the school's config arrives).
  static final modules = <String>[].obs;

  static bool has(String module) => modules.isEmpty || modules.contains(module);

  static Future<void> load() async {
    if (!AppConfig.live) return;
    try {
      final json = Map<String, dynamic>.from(await Get.find<RemoteDataSource>().get('/v1/config') as Map);
      final app = Map<String, dynamic>.from(json['app'] as Map);
      modules.assignAll(List<String>.from(json['modules'] as List));
      dock.assignAll(List<String>.from(app['dock'] as List));
      home.assignAll(List<String>.from(app['home'] as List));
    } on Object {
      // shortcut: keeps the defaults until the next start; refresh on resume when schools change their setup often.
    }
  }
}
