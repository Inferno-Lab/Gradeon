import 'dart:async';

import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:gradeon/core/routes/app_routes.dart';
import 'package:gradeon/core/services/auth_service.dart';
import 'package:gradeon/core/services/storage_service.dart';

class SplashController extends GetxController {
  @override
  void onReady() {
    super.onReady();
    // Entrance is ~1.8s after the window settles; give it room to finish.
    Future<void>.delayed(const Duration(milliseconds: 2400), _go);
  }

  void _go() {
    final seen =
        Get.find<StorageService>().read<bool>(StorageKeys.onboardingSeen) ??
        false;
    if (!seen) {
      unawaited(Get.offAllNamed<void>(AppRoutes.onboarding));
      return;
    }
    if (Get.find<AuthService>().isLoggedIn) {
      unawaited(Get.offAllNamed<void>(AppRoutes.shell));
      return;
    }
    unawaited(Get.offAllNamed<void>(AppRoutes.login));
  }
}

class OnboardingController extends GetxController {
  final page = 0.obs;
  final controller = PageController();

  Future<void> next() async {
    if (page.value < 2) {
      await goTo(page.value + 1);
      return;
    }
    await finish();
  }

  Future<void> previous() async {
    if (page.value == 0) return;
    await goTo(page.value - 1);
  }

  Future<void> goTo(int index) => controller.animateToPage(
    index,
    duration: const Duration(milliseconds: 520),
    curve: Curves.easeInOutCubic,
  );

  Future<void> finish() async {
    await Get.find<StorageService>().write(StorageKeys.onboardingSeen, true);
    unawaited(Get.offAllNamed<void>(AppRoutes.login));
  }

  @override
  void onClose() {
    controller.dispose();
    super.onClose();
  }
}
