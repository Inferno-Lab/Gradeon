import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:get/get.dart';
import 'package:gradeon/core/routes/app_pages.dart';
import 'package:gradeon/core/routes/app_routes.dart';
import 'package:gradeon/core/theme/app_colors.dart';
import 'package:gradeon/core/theme/app_theme.dart';
import 'package:gradeon/core/translations/app_translations.dart';
import 'package:gradeon/core/widgets/toast.dart';
import 'package:gradeon/data/datasources/mock_json_datasource.dart';
import 'package:gradeon/data/models/campus.dart';
import 'package:gradeon/data/models/user.dart';
import 'package:gradeon/features/shell/shell_controller.dart';
import 'package:mocktail/mocktail.dart';

import 'support/harness.dart';

class _OfflineHttp extends HttpOverrides {
  @override
  HttpClient createHttpClient(SecurityContext? context) {
    final client = _MockClient();
    when(() => client.openUrl(any(), any())).thenThrow(const SocketException('offline'));
    return client;
  }
}

class _MockClient extends Mock implements HttpClient {}

/// Every route a role can reach, opened in turn on phone, small phone and
/// tablet sizes. Any exception, overflow or bad Obx fails the test.
const _family = [
  AppRoutes.attendance,
  AppRoutes.homework,
  '/homework/hw_linear',
  AppRoutes.timetable,
  AppRoutes.results,
  AppRoutes.fees,
  AppRoutes.notices,
  '/notices/nt_mid',
  AppRoutes.events,
  '/events/ev_science',
  '/chat/th_kavita_aarav',
  AppRoutes.library,
  AppRoutes.transport,
  AppRoutes.gallery,
  AppRoutes.leave,
  AppRoutes.leaveApply,
  AppRoutes.notifications,
  AppRoutes.search,
  AppRoutes.settings,
  AppRoutes.about,
  AppRoutes.help,
  AppRoutes.designSystem,
];

const _teacher = [
  '/teacher/attendance/cls_8a',
  AppRoutes.teacherAssign,
  AppRoutes.teacherGrade,
  '/teacher/marks/cls_8a',
  AppRoutes.teacherNotice,
  AppRoutes.notifications,
  AppRoutes.search,
];

const _sizes = {'phone': Size(390, 844), 'small': Size(320, 640), 'tablet': Size(1024, 1366)};

Future<void> _settle(WidgetTester tester) async {
  for (var i = 0; i < 12; i++) {
    await tester.pump(const Duration(milliseconds: 120));
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  HttpOverrides.global = _OfflineHttp();
  setUpAll(() async {
    registerFallbackValue(Uri.parse('https://gradeon.app'));
    await loadAppFonts();
  });

  for (final role in [UserRole.parent, UserRole.teacher]) {
    for (final size in _sizes.entries) {
      testWidgets('${role.name} screens render on ${size.key}', (tester) async {
        await bootMock();
        Get.testMode = false;
        tester.view.physicalSize = size.value * 3;
        tester.view.devicePixelRatio = 3;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        await tester.runAsync(() => Get.find<MockJsonDataSource>().ensureLoaded());
        await real(tester, () => signIn(role));

        await tester.pumpWidget(
          GetMaterialApp(
            translations: AppTranslations(),
            locale: const Locale('en'),
            fallbackLocale: const Locale('en'),
            theme: AppTheme.build(AppColors.light),
            initialRoute: AppRoutes.shell,
            getPages: AppPages.pages,
            builder: (context, child) => ToastHost(child: child ?? const SizedBox.shrink()),
          ),
        );
        final errors = <String>[];
        final original = FlutterError.onError;
        FlutterError.onError = (d) {
          errors.add(d.toString());
          original?.call(d);
        };
        addTearDown(() => FlutterError.onError = original);
        void check(String where) {
          final e = tester.takeException();
          if (e != null) throw TestFailure('$where: ${errors.isEmpty ? e : errors.join(' | ')}');
        }

        await _settle(tester);
        check('shell');

        for (var tab = 0; tab < 5; tab++) {
          Get.find<ShellController>().go(tab);
          await _settle(tester);
          check('tab $tab');
        }

        for (final route in role == UserRole.teacher ? _teacher : _family) {
          Get.toNamed<void>(route)?.ignore();
          await _settle(tester);
          check(route);
          Get.back<void>();
          await _settle(tester);
        }

        if (role != UserRole.teacher) {
          final receipt = Receipt(
            id: 'rcpt_1',
            installmentId: 'inst_1',
            title: 'Term 1 tuition',
            amount: 28500,
            paidOn: DateTime(2026, 8, 18, 10, 2),
            method: 'upi',
            reference: 'UPI28461937',
          );
          Get.toNamed<void>(AppRoutes.receipt, arguments: {'receipt': receipt, 'student': 'Aarav Sharma'})?.ignore();
          await _settle(tester);
          check('receipt');
        }
      });
    }
  }
}
