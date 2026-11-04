// Renders screens to PNG for visual review. Not part of the normal suite:
//   flutter test test/tool/shoot_test.dart --dart-define=SHOOT_DIR=out --dart-define=SHOOT_ROLE=teacher
// Glass uses its blur fallback here (no GPU shader in tests).
import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:get/get.dart';
import 'package:gradeon/core/config/app_config.dart';
import 'package:gradeon/core/routes/app_pages.dart';
import 'package:gradeon/core/routes/app_routes.dart';
import 'package:gradeon/core/theme/app_colors.dart';
import 'package:gradeon/core/theme/app_theme.dart';
import 'package:gradeon/core/translations/app_translations.dart';
import 'package:gradeon/core/widgets/toast.dart';
import 'package:gradeon/data/datasources/mock_json_datasource.dart';
import 'package:gradeon/data/models/user.dart';
import 'package:gradeon/features/shell/shell_controller.dart';

import '../support/harness.dart';

const _enabled = String.fromEnvironment('SHOOT_DIR') != '';
const _dir = String.fromEnvironment('SHOOT_DIR', defaultValue: 'build/shots');
const _roleName = String.fromEnvironment('SHOOT_ROLE', defaultValue: 'parent');
const _empty = bool.fromEnvironment('EMPTY_DATA');
const _dark = bool.fromEnvironment('SHOOT_DARK');
const _width = int.fromEnvironment('SHOOT_W', defaultValue: 390);
const _height = int.fromEnvironment('SHOOT_H', defaultValue: 844);

const _family = [
  AppRoutes.attendance,
  AppRoutes.homework,
  '/homework/hw_linear',
  AppRoutes.timetable,
  AppRoutes.results,
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
  AppRoutes.events,
  AppRoutes.gallery,
  AppRoutes.settings,
];

final _key = GlobalKey();

Future<void> _save(WidgetTester tester, String name) async {
  await tester.runAsync(() async {
    final boundary = _key.currentContext!.findRenderObject()! as RenderRepaintBoundary;
    final image = await boundary.toImage(pixelRatio: 1.5);
    final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
    final file = File('$_dir/$name.png')..createSync(recursive: true);
    file.writeAsBytesSync(bytes!.buffer.asUint8List());
  });
}

Future<void> _settle(WidgetTester tester) async {
  for (var i = 0; i < 14; i++) {
    await tester.pump(const Duration(milliseconds: 120));
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(loadAppFonts);

  testWidgets('shoot $_roleName', skip: !_enabled, (tester) async {
    final guest = _roleName == 'guest';
    final role = guest ? UserRole.parent : UserRole.values.byName(_roleName);
    await bootMock();
    AppConfig.emptyData.value = _empty;
    Get.testMode = false;
    tester.view.physicalSize = Size(_width * 1.5, _height * 1.5);
    tester.view.devicePixelRatio = 1.5;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.runAsync(() => Get.find<MockJsonDataSource>().ensureLoaded());
    if (!guest) await real(tester, () => signIn(role));

    await tester.pumpWidget(
      RepaintBoundary(
        key: _key,
        child: GetMaterialApp(
          debugShowCheckedModeBanner: false,
          translations: AppTranslations(),
          locale: const Locale('en'),
          fallbackLocale: const Locale('en'),
          theme: AppTheme.build(_dark ? AppColors.blackboard : AppColors.light),
          initialRoute: guest ? AppRoutes.login : AppRoutes.shell,
          getPages: AppPages.pages,
          builder: (context, child) => ToastHost(child: child ?? const SizedBox.shrink()),
        ),
      ),
    );
    await _settle(tester);
    await _save(tester, '${_roleName}_tab0');
    if (guest) return;
    for (var tab = 1; tab < 5; tab++) {
      Get.find<ShellController>().go(tab);
      await _settle(tester);
      await _save(tester, '${_roleName}_tab$tab');
    }
    var i = 0;
    for (final route in role == UserRole.teacher ? _teacher : _family) {
      Get.toNamed<void>(route)?.ignore();
      await _settle(tester);
      await _save(tester, '${_roleName}_r${(i++).toString().padLeft(2, '0')}_${route.replaceAll(RegExp('[^a-z0-9]+'), '_')}');
      Get.back<void>();
      await _settle(tester);
    }
  });
}
