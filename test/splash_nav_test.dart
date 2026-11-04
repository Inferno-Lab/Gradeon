import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:get/get.dart';
import 'package:gradeon/app.dart';
import 'package:gradeon/core/routes/app_routes.dart';
import 'package:gradeon/features/auth/controllers/splash_controller.dart';
import 'package:gradeon/features/auth/views/onboarding_view.dart';

import 'support/harness.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('splash advances to onboarding', (tester) async {
    await bootMock();
    Get.testMode = false;
    await tester.pumpWidget(const GradeonApp());
    await tester.pump();
    // Plain chalk until the window size settles, then the mark.
    await tester.pump(const Duration(milliseconds: 200));
    expect(find.text('Gradeon'), findsOneWidget);
    await tester.pump(const Duration(milliseconds: 2400));
    await tester.pump(const Duration(milliseconds: 800));
    expect(Get.currentRoute, AppRoutes.onboarding);
    expect(find.text('Know where to be before the bell.'), findsOneWidget);
  });

  testWidgets('onboarding next and skip reach login', (tester) async {
    await bootMock();
    Get.testMode = false;
    await tester.pumpWidget(
      testApp(
        pages: [
          GetPage(
            name: AppRoutes.onboarding,
            page: () => const OnboardingView(),
            binding: BindingsBuilder<void>(() {
              Get.put(OnboardingController());
            }),
          ),
          GetPage(
            name: AppRoutes.login,
            page: () => const Scaffold(body: Text('Login ready')),
          ),
        ],
      ),
    );
    await tester.pump();
    expect(find.text('Know where to be before the bell.'), findsOneWidget);
    await tester.tap(find.text('Next'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 700));
    expect(find.text('Every child, at one glance.'), findsOneWidget);

    await tester.tap(find.text('Skip'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    expect(Get.currentRoute, AppRoutes.login);
    expect(find.text('Login ready'), findsOneWidget);
  });

  testWidgets('onboarding fits a small phone', (tester) async {
    await bootMock();
    tester.view.physicalSize = const Size(320, 640);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(
      testApp(
        pages: [
          GetPage(
            name: AppRoutes.onboarding,
            page: () => const OnboardingView(),
            binding: BindingsBuilder<void>(() {
              Get.put(OnboardingController());
            }),
          ),
        ],
      ),
    );
    await tester.pump();
    expect(tester.takeException(), isNull);
    expect(find.text('Know where to be before the bell.'), findsOneWidget);
    expect(find.text('Skip'), findsOneWidget);
    expect(find.text('Next'), findsOneWidget);
  });
}
