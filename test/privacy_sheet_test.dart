import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:get/get.dart';
import 'package:gradeon/core/config/app_config.dart';
import 'package:gradeon/core/services/school_config.dart';
import 'package:gradeon/core/widgets/sheets.dart';
import 'package:gradeon/features/settings/views/privacy_sheet.dart';

import 'support/harness.dart';

/// The consent step must show "I agree" on a small phone however long the school's privacy notice is.
void main() {
  testWidgets('consent keeps I agree in view on a small phone', (tester) async {
    await bootMock();
    Get.testMode = false;
    tester.view.physicalSize = const Size(360 * 2.0, 640 * 2.0);
    tester.view.devicePixelRatio = 2;
    addTearDown(tester.view.resetPhysicalSize);
    AppConfig.privacyNotice = List.filled(40, 'The school keeps marks and attendance for five years.').join(' ');
    SchoolConfig.photoConsent = true;
    addTearDown(() {
      AppConfig.privacyNotice = '';
      SchoolConfig.photoConsent = false;
    });
    await tester.pumpWidget(testApp(home: const Scaffold(body: SizedBox.expand())));
    showSheet<void>(const PrivacySheet(consent: true)).ignore();
    for (var i = 0; i < 40; i++) {
      await tester.pump(const Duration(milliseconds: 50));
    }
    expect(tester.getRect(find.text('I agree')).bottom, lessThan(640));
    expect(find.text('The school may share photos of my child'), findsOneWidget);
  });
}
