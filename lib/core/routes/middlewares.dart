import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:gradeon/core/routes/app_routes.dart';
import 'package:gradeon/core/services/auth_service.dart';
import 'package:gradeon/data/models/user.dart';

class AuthMiddleware extends GetMiddleware {
  @override
  RouteSettings? redirect(String? route) {
    if (!Get.find<AuthService>().isLoggedIn) {
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
