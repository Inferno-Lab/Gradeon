import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:get/get.dart';
import 'package:gradeon/core/config/app_config.dart';
import 'package:gradeon/core/services/auth_service.dart';
import 'package:gradeon/core/services/session_bus.dart';
import 'package:gradeon/core/services/storage_service.dart';
import 'package:gradeon/core/services/theme_service.dart';
import 'package:gradeon/core/theme/app_colors.dart';
import 'package:gradeon/core/theme/app_theme.dart';
import 'package:gradeon/core/translations/app_translations.dart';
import 'package:gradeon/data/datasources/mock_json_datasource.dart';
import 'package:gradeon/data/models/user.dart';
import 'package:gradeon/data/repositories/academic_repository.dart';
import 'package:gradeon/data/repositories/auth_repository.dart';
import 'package:gradeon/data/repositories/campus_repository.dart';
import 'package:gradeon/data/repositories/directory_repository.dart';
import 'package:intl/date_symbol_data_local.dart';

Future<void> bootMock() async {
  await initializeDateFormatting();
  // The image cache asks for temp directories; there is no platform plugin in tests.
  TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(
    const MethodChannel('plugins.flutter.io/path_provider'),
    (_) async => Directory.systemTemp.path,
  );
  Get.reset();
  Get.testMode = true;
  AppConfig.useMockData = true;
  AppConfig.mockDelayMinMs = 0;
  AppConfig.mockDelayMaxMs = 0;
  AppConfig.simulateErrors.value = false;

  final storage = StorageService(memory: <String, dynamic>{});
  Get
    ..put<StorageService>(storage, permanent: true)
    ..put<ThemeService>(ThemeService(storage)..load(), permanent: true)
    ..put<AuthService>(AuthService(storage), permanent: true)
    ..put<SessionBus>(SessionBus(), permanent: true);

  final source = Get.put(MockJsonDataSource(), permanent: true);
  Get
    ..put<AuthRepository>(MockAuthRepository(source), permanent: true)
    ..put<DirectoryRepository>(MockDirectoryRepository(source), permanent: true)
    ..put<AttendanceRepository>(MockAttendanceRepository(source), permanent: true)
    ..put<TimetableRepository>(MockTimetableRepository(source), permanent: true)
    ..put<HomeworkRepository>(MockHomeworkRepository(source), permanent: true)
    ..put<ExamRepository>(MockExamRepository(source), permanent: true)
    ..put<FeeRepository>(MockFeeRepository(source), permanent: true)
    ..put<NoticeRepository>(MockNoticeRepository(source), permanent: true)
    ..put<EventRepository>(MockEventRepository(source), permanent: true)
    ..put<ChatRepository>(MockChatRepository(source), permanent: true)
    ..put<LibraryRepository>(MockLibraryRepository(source), permanent: true)
    ..put<TransportRepository>(MockTransportRepository(source), permanent: true)
    ..put<LeaveRepository>(MockLeaveRepository(source), permanent: true)
    ..put<GalleryRepository>(MockGalleryRepository(source), permanent: true)
    ..put<NotificationRepository>(
      MockNotificationRepository(source),
      permanent: true,
    );
}

Future<T?> real<T>(WidgetTester tester, Future<T> Function() body) {
  return tester.runAsync(body);
}

Future<AppUser> signIn(UserRole role) async {
  final user = await Get.find<AuthRepository>().loginAs(role);
  await Get.find<AuthService>().setSession(user);
  return user;
}

Widget testApp({Widget? home, List<GetPage<dynamic>> pages = const []}) {
  return GetMaterialApp(
    translations: AppTranslations(),
    locale: const Locale('en'),
    fallbackLocale: const Locale('en'),
    theme: AppTheme.build(AppColors.light),
    home: pages.isEmpty ? home : null,
    initialRoute: pages.isEmpty ? null : pages.first.name,
    getPages: pages,
  );
}

/// Loads the app's real fonts so text measures as on a phone.
Future<void> loadAppFonts() async {
  final fonts = {
    'AnekLatin': ['assets/fonts/AnekLatin.ttf'],
    'AnekDevanagari': ['assets/fonts/AnekDevanagari.ttf'],
    'IBMPlexMono': ['assets/fonts/IBMPlexMono-Regular.ttf', 'assets/fonts/IBMPlexMono-Medium.ttf'],
    'packages/phosphor_flutter/PhosphorRegular': ['packages/phosphor_flutter/lib/fonts/Phosphor.ttf'],
    'packages/phosphor_flutter/PhosphorBold': ['packages/phosphor_flutter/lib/fonts/Phosphor-Bold.ttf'],
    'packages/phosphor_flutter/PhosphorFill': ['packages/phosphor_flutter/lib/fonts/Phosphor-Fill.ttf'],
  };
  for (final e in fonts.entries) {
    final loader = FontLoader(e.key);
    for (final f in e.value) {
      loader.addFont(rootBundle.load(f));
    }
    await loader.load();
  }
}
