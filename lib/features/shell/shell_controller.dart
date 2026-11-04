import 'dart:async';

import 'package:flutter/services.dart';
import 'package:get/get.dart';
import 'package:gradeon/core/routes/app_routes.dart';
import 'package:gradeon/core/services/auth_service.dart';
import 'package:gradeon/core/widgets/sheets.dart';
import 'package:gradeon/data/models/user.dart';

class ShellController extends GetxController {
  final index = 0.obs;

  bool get isTeacher => Get.find<AuthService>().role == UserRole.teacher;

  /// Tab positions shared by both navs (family and teacher).
  static const chatTab = 3;
  static const profileTab = 4;

  void go(int value) => index.value = value;

  /// Brings the shell to [tab] from any screen, e.g. an empty state's button.
  static void showTab(int tab) {
    Get.until((route) => route.settings.name == AppRoutes.shell);
    Get.find<ShellController>().go(tab);
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
