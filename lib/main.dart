import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:gradeon/app.dart';
import 'package:gradeon/core/config/app_config.dart';
import 'package:gradeon/core/services/auth_service.dart';
import 'package:gradeon/core/services/connectivity_service.dart';
import 'package:gradeon/core/services/school_profile_service.dart';
import 'package:gradeon/core/services/session_bus.dart';
import 'package:gradeon/core/services/storage_service.dart';
import 'package:gradeon/core/services/theme_service.dart';
import 'package:intl/date_symbol_data_local.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  AppConfig.assertReleaseUrl();
  await initializeDateFormatting();
  await SchoolProfileService.load();
  final storage = await StorageService().init();
  Get.put(storage, permanent: true);
  final themes = ThemeService(storage)..load();
  Get.put(themes, permanent: true);
  final auth = AuthService(storage)..restore();
  Get.put(auth, permanent: true);
  Get.put(ConnectivityService(), permanent: true);
  Get.put(SessionBus(), permanent: true);
  runApp(const GradeonApp());
}
