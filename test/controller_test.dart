import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:get/get.dart';
import 'package:gradeon/core/routes/app_routes.dart';
import 'package:gradeon/core/services/auth_service.dart';
import 'package:gradeon/core/utils/view_state.dart';
import 'package:gradeon/data/models/academics.dart';
import 'package:gradeon/data/models/user.dart';
import 'package:gradeon/data/repositories/academic_repository.dart';
import 'package:gradeon/data/repositories/auth_repository.dart';
import 'package:gradeon/data/repositories/campus_repository.dart';
import 'package:gradeon/features/auth/controllers/login_controller.dart';
import 'package:gradeon/features/dashboard/controllers/dashboard_controller.dart';
import 'package:gradeon/features/fees/controllers/fees_controller.dart';
import 'package:gradeon/features/homework/controllers/homework_controller.dart';
import 'package:gradeon/features/teacher_tools/controllers/teacher_controller.dart';

import 'support/harness.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() async {
    await bootMock();
  });

  tearDown(Get.reset);

  testWidgets('login controller opens a parent session', (tester) async {
    await tester.pumpWidget(
      testApp(
        pages: [
          GetPage<void>(name: AppRoutes.login, page: () => const SizedBox.shrink()),
          GetPage<void>(
            name: AppRoutes.shell,
            page: () => const Scaffold(body: Text('shell')),
          ),
        ],
      ),
    );
    final login = Get.put(LoginController());
    await real(tester, () => login.demo(UserRole.parent));
    expect(Get.find<AuthService>().user.value?.id, 'usr_priya');
  });

  testWidgets('dashboard loads a fee that is due for Aarav', (tester) async {
    await tester.pumpWidget(testApp(home: const SizedBox.shrink()));
    await real(tester, () => signIn(UserRole.parent));
    final home = Get.put(DashboardController());
    await real(tester, home.load);
    expect(home.state.value, ViewState.success);
    expect(home.snapshot?.student.name, 'Aarav Sharma');
    expect(home.snapshot?.due, isNotNull);
  });

  testWidgets('homework submit and fee payment update the session', (tester) async {
    await tester.pumpWidget(testApp(home: const SizedBox.shrink()));
    await real(tester, () => signIn(UserRole.parent));
    final homework = Get.put(HomeworkController());
    await real(tester, homework.load);
    final pending = homework.visible;
    expect(pending, isNotEmpty);
    await real(
      tester,
      () => Get.find<HomeworkRepository>().submit(
        homeworkId: pending.first.id,
        studentId: 'stu_aarav',
        fileName: 'Homework_scan.jpg',
      ),
    );
    await real(tester, homework.load);
    expect(
      homework.items
          .firstWhere((item) => item.id == pending.first.id)
          .forStudent('stu_aarav')
          ?.status,
      HomeworkStatus.submitted,
    );

    final fees = Get.put(FeesController());
    await real(tester, fees.load);
    final open = fees.account!.installments.firstWhere((item) => !item.paid);
    await real(
      tester,
      () => Get.find<FeeRepository>().pay(
        studentId: 'stu_aarav',
        installmentId: open.id,
        method: 'upi',
      ),
    );
    await real(tester, fees.load);
    expect(
      fees.account!.installments.firstWhere((item) => item.id == open.id).paid,
      isTrue,
    );
  });

  testWidgets('teacher attendance cycle and marks entry persist', (tester) async {
    await tester.pumpWidget(testApp(home: const SizedBox.shrink()));
    await real(tester, () => signIn(UserRole.teacher));
    final attendance = Get.put(MarkAttendanceController(classId: 'cls_8a'));
    await real(tester, attendance.load);
    expect(attendance.students, isNotEmpty);
    final studentId = attendance.students.first.id;
    attendance
      ..cycle(studentId)
      ..allPresent();
    // Only exceptions are kept; "all present" clears them.
    expect(attendance.marks[studentId], isNull);
    expect(attendance.present, attendance.students.length);
    await real(tester, attendance.submit);

    final marks = Get.put(MarksEntryController(classId: 'cls_8a'));
    await real(tester, marks.load);
    marks.values[studentId] = 91;
    await real<void>(tester, marks.save);
    final draft = await real(
      tester,
      () => Get.find<ExamRepository>().marksDraft('cls_8a', 'maths'),
    );
    expect(draft?[studentId], 91);
  });

  test('demo login roles map to the showcase accounts', () async {
    final auth = Get.find<AuthRepository>();
    expect((await auth.loginAs(UserRole.parent)).id, 'usr_priya');
    expect((await auth.loginAs(UserRole.teacher)).id, 'usr_kavita');
  });
}
