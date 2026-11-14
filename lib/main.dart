import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:tangent/app.dart';
import 'package:tangent/core/config/app_config.dart';
import 'package:tangent/core/services/auth_service.dart';
import 'package:tangent/core/services/connectivity_service.dart';
import 'package:tangent/core/services/error_reporter.dart';
import 'package:tangent/core/services/school_config.dart';
import 'package:tangent/core/services/school_profile_service.dart';
import 'package:tangent/core/services/session_bus.dart';
import 'package:tangent/core/services/storage_service.dart';
import 'package:tangent/core/services/theme_service.dart';
import 'package:tangent/core/theme/app_colors.dart';
import 'package:intl/date_symbol_data_local.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  AppConfig.assertReleaseUrl();
  ErrorReporter.install();
  await initializeDateFormatting();
  final storage = await StorageService().init();
  // The school's colours from the last start, so the first frame is already in them; the brand call below refreshes them.
  AppPalette.apply(storage.read<Map<String, dynamic>>(StorageKeys.palette));
  await SchoolProfileService.load(storage);
  Get.put(storage, permanent: true);
  final themes = ThemeService(storage)..load();
  Get.put(themes, permanent: true);
  final auth = AuthService(storage)..restore();
  Get.put(auth, permanent: true);
  await SchoolConfig.restore();
  Get.put(ConnectivityService(), permanent: true);
  Get.put(SessionBus(), permanent: true);
  runApp(const TangentApp());
}
