import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:get/get.dart';
import 'package:gradeon/core/services/auth_service.dart';
import 'package:gradeon/core/services/school_config.dart';
import 'package:gradeon/data/models/user.dart';
import 'package:gradeon/features/dashboard/controllers/dashboard_controller.dart';
import 'package:gradeon/features/dashboard/views/dashboard_view.dart';
import 'package:gradeon/features/settings/views/settings_view.dart';
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

/// What the console sets for a school (modules, Home cards, quick buttons, languages) is what a family sees.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  HttpOverrides.global = _OfflineHttp();
  setUpAll(() => registerFallbackValue(Uri.parse('https://gradeon.app')));

  setUp(() async {
    await bootMock();
    Get.testMode = false;
  });

  tearDown(() {
    SchoolConfig.modules.clear();
    SchoolConfig.home.assignAll(['dayRibbon', 'dueStack', 'attendance', 'nextExam', 'notices', 'events']);
    SchoolConfig.quick.assignAll(['payFees', 'applyLeave', 'messageTeacher', 'timetable']);
    SchoolConfig.languages.assignAll(['en', 'hi', 'mr']);
    Get.reset();
  });

  Future<void> home(WidgetTester tester) async {
    final user = (await real(tester, () => signIn(UserRole.parent)))!;
    await real(tester, () => Get.find<AuthService>().setSession(user.copyWith(avatarUrl: '')));
    final c = Get.put(DashboardController());
    await real(tester, c.load);
    await tester.pumpWidget(testApp(home: const Scaffold(body: DashboardView())));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 600));
  }

  testWidgets('home shows the quick buttons the school chose, in its order', (tester) async {
    SchoolConfig.quick.assignAll(['timetable', 'payFees']);
    await home(tester);
    expect(find.text('Timetable'), findsWidgets);
    expect(find.text('Pay fees'), findsOneWidget);
    expect(find.text('Apply for leave'), findsNothing);
    expect(tester.getTopLeft(find.text('Pay fees')).dx, greaterThan(tester.getTopLeft(find.text('Timetable').first).dx));
  });

  testWidgets('home leaves out a card the school took away, and the notices card follows the list', (tester) async {
    SchoolConfig.home.assignAll(['notices']);
    await home(tester);
    expect(find.text('LATEST NOTICES'), findsOneWidget);
    expect(find.textContaining('DUE ACROSS'), findsNothing);
  });

  testWidgets('with the default cards, what is due comes before the notices', (tester) async {
    await home(tester);
    expect(tester.getTopLeft(find.textContaining('DUE ACROSS')).dy, lessThan(tester.getTopLeft(find.text('LATEST NOTICES')).dy));
  });

  testWidgets('a module switched off takes its card and its button with it', (tester) async {
    SchoolConfig.modules.assignAll(['people', 'attendance', 'timetable']);
    SchoolConfig.quick.assignAll(['timetable']);
    await home(tester);
    expect(find.text('LATEST NOTICES'), findsNothing);
    expect(find.text('Pay fees'), findsNothing);
  });

  testWidgets('settings offers only the languages the school offers', (tester) async {
    SchoolConfig.languages.assignAll(['en', 'mr']);
    await tester.pumpWidget(testApp(home: const SettingsView()));
    await tester.pump(const Duration(milliseconds: 300));
    expect(find.text('मराठी'), findsOneWidget);
    expect(find.text('हिंदी'), findsNothing);
    SchoolConfig.languages.assignAll(['en']);
    await tester.pump(const Duration(milliseconds: 300));
    expect(find.text('मराठी'), findsNothing);
  });
}
