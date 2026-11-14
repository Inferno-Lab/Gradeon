import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:get/get.dart';
import 'package:tangent/core/routes/app_routes.dart';
import 'package:tangent/core/services/auth_service.dart';
import 'package:tangent/core/services/theme_service.dart';
import 'package:tangent/core/theme/app_theme.dart';
import 'package:tangent/data/datasources/mock_json_datasource.dart';
import 'package:tangent/data/models/user.dart';
import 'package:tangent/features/auth/controllers/login_controller.dart';
import 'package:tangent/features/auth/views/login_view.dart';
import 'package:tangent/features/dashboard/controllers/dashboard_controller.dart';
import 'package:tangent/features/dashboard/views/dashboard_view.dart';
import 'package:tangent/features/fees/controllers/fees_controller.dart';
import 'package:tangent/features/fees/views/fees_view.dart';
import 'package:tangent/features/settings/views/settings_view.dart';
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

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  HttpOverrides.global = _OfflineHttp();
  setUpAll(() => registerFallbackValue(Uri.parse('https://tangent.app')));

  setUp(() async {
    await bootMock();
    Get.testMode = false;
  });

  tearDown(Get.reset);

  testWidgets('a demo card lands on the shell', (tester) async {
    Get.put(LoginController());
    await tester.pumpWidget(
      testApp(
        home: const SizedBox.shrink(),
        pages: [
          GetPage<void>(name: AppRoutes.login, page: () => const LoginView()),
          GetPage<void>(
            name: AppRoutes.shell,
            page: () => const Scaffold(body: Text('Home shell')),
          ),
        ],
      ),
    );
    await tester.pump();
    await tester.runAsync(() => Get.find<MockJsonDataSource>().ensureLoaded());
    final parent = find.text('Parent');
    await tester.ensureVisible(parent);
    await tester.pump(const Duration(milliseconds: 300));
    await tester.tap(parent);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));
    expect(Get.find<AuthService>().user.value?.id, 'usr_priya');
    expect(find.text('Home shell'), findsOneWidget);
  });

  testWidgets('home shows the signed-in student', (tester) async {
    final user = (await real(tester, () => signIn(UserRole.parent)))!;
    await real(
      tester,
      () => Get.find<AuthService>().setSession(user.copyWith(avatarUrl: '')),
    );
    final home = Get.put(DashboardController());
    await real(tester, home.load);
    await tester.pumpWidget(testApp(home: const Scaffold(body: DashboardView())));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 600));
    expect(find.textContaining('Aarav'), findsWidgets);
  });

  testWidgets('fees screen lists an installment', (tester) async {
    await real(tester, () => signIn(UserRole.parent));
    final fees = Get.put(FeesController());
    await real(tester, fees.load);
    await tester.pumpWidget(testApp(home: const FeesView()));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    expect(find.text('Fees'), findsOneWidget);
    expect(find.textContaining('tuition'), findsWidgets);
  });

  testWidgets('settings theme chip switches to dark', (tester) async {
    await tester.pumpWidget(testApp(home: const SettingsView()));
    await tester.pump(const Duration(milliseconds: 300));
    await tester.tap(find.text('Blackboard'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
    expect(Get.find<ThemeService>().mode.value, AppThemeMode.dark);
  });
}
