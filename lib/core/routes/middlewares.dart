import 'dart:async';

import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:tangent/core/routes/app_routes.dart';
import 'package:tangent/core/services/auth_service.dart';
import 'package:tangent/data/models/user.dart';

/// A screen asked for from outside the app (a link like tangent://open/fees, or a notification), opened once the app is ready.
class DeepLinks {
  const DeepLinks._();

  /// True once the splash has loaded the school and the session: before that a link waits.
  static bool booted = false;
  static String? pending;

  // Widget tests open screens directly, with no splash before them.
  static bool get ready => booted || Get.testMode;

  /// Opens the screen a link asked for, after the shell is up.
  static void openPending() {
    final route = pending;
    pending = null;
    if (route != null && route != AppRoutes.shell) unawaited(Get.toNamed<void>(route));
  }
}

class AuthMiddleware extends GetMiddleware {
  @override
  RouteSettings? redirect(String? route) {
    // Reaching the shell (through the splash, or directly in tests) means the app is up.
    if (route == AppRoutes.shell) DeepLinks.booted = true;
    // A cold start from a link lands here before the splash ran: remember where it wanted to go, start properly.
    if (!DeepLinks.ready) {
      DeepLinks.pending = route;
      return const RouteSettings(name: AppRoutes.splash);
    }
    if (!Get.find<AuthService>().isLoggedIn) {
      if (route != AppRoutes.shell) DeepLinks.pending = route;
      return const RouteSettings(name: AppRoutes.login);
    }
    return null;
  }
}

class RoleMiddleware extends GetMiddleware {
  RoleMiddleware(this.allowed);

  final List<UserRole> allowed;

  @override
  RouteSettings? redirect(String? route) {
    final role = Get.find<AuthService>().role;
    if (role == null || !allowed.contains(role)) {
      return const RouteSettings(name: AppRoutes.shell);
    }
    return null;
  }
}
