import 'dart:async';

import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:get/get.dart';
import 'package:gradeon/core/routes/app_routes.dart';
import 'package:gradeon/core/routes/middlewares.dart';
import 'package:gradeon/core/services/auth_service.dart';
import 'package:gradeon/core/services/school_config.dart';
import 'package:gradeon/core/widgets/sheets.dart';
import 'package:gradeon/data/models/user.dart';
import 'package:gradeon/features/settings/views/privacy_sheet.dart';

class ShellController extends GetxController {
  final index = 0.obs;

  /// The tab keys in dock order, set by the shell: a school chooses its family tabs in the console.
  List<String> tabs = const ['home', 'academics', 'fees', 'chat', 'profile'];

  bool get isTeacher => Get.find<AuthService>().role == UserRole.teacher;

  AppLifecycleListener? _life;

  @override
  void onInit() {
    super.onInit();
    unawaited(SchoolConfig.load().then((_) => askConsentIfNeeded()));
    _life = AppLifecycleListener(onResume: () => unawaited(SchoolConfig.load()));
  }

  @override
  void onReady() {
    super.onReady();
    // A link or notification that started the app: its screen opens over Home.
    DeepLinks.openPending();
  }

  @override
  void onClose() {
    _life?.dispose();
    super.onClose();
  }

  void go(int value) => index.value = value;

  /// Brings the shell to the tab [key] from any screen; opens chat on its own when the school has no chat tab.
  static void showTab(String key) {
    Get.until((route) => route.settings.name == AppRoutes.shell);
    final shell = Get.find<ShellController>();
    final at = shell.tabs.indexOf(key);
    if (at >= 0) {
      shell.go(at);
    } else if (key == 'chat') {
      unawaited(Get.toNamed<void>(AppRoutes.chat));
    }
  }

  Future<void> onBack() async {
    if (index.value != 0) {
      index.value = 0;
      return;
    }
    final leave = await confirmSheet(
      title: 'shell.exit_title',
      body: 'shell.exit_body',
      confirm: 'shell.exit_confirm',
      danger: false,
    );
    if (leave) unawaited(SystemNavigator.pop());
  }
}
