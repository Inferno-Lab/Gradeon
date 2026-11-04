import 'package:get/get.dart';
import 'package:gradeon/core/services/auth_service.dart';
import 'package:gradeon/core/utils/app_exception.dart';
import 'package:gradeon/core/utils/loadable.dart';
import 'package:gradeon/core/utils/status.dart';
import 'package:gradeon/core/widgets/toast.dart';
import 'package:gradeon/data/models/campus.dart';
import 'package:gradeon/data/models/student.dart';
import 'package:gradeon/data/repositories/campus_repository.dart';
import 'package:gradeon/data/repositories/directory_repository.dart';

class FeesController extends GetxController with Loadable {
  FeeAccount? account;
  Student? student;
  SchoolClass? schoolClass;

  int get total => account?.installments.fold<int>(0, (sum, i) => sum + i.amount) ?? 0;

  int get paid => account?.installments.where((i) => i.paid).fold<int>(0, (sum, i) => sum + i.amount) ?? 0;

  /// The installment to pay next: overdue first, then the soonest due.
  Installment? get next {
    final open = account?.installments.where((i) => !i.paid).toList() ?? [];
    open.sort((a, b) {
      final ao = moneyStatus(a) == MoneyStatus.overdue;
      final bo = moneyStatus(b) == MoneyStatus.overdue;
      if (ao != bo) return ao ? -1 : 1;
      return a.dueDate.compareTo(b.dueDate);
    });
    return open.firstOrNull;
  }

  @override
  Future<void> load() async {
    final id = Get.find<AuthService>().activeStudentId.value;
    if (id == null) {
      await run(() async {}, isEmpty: () => true);
      return;
    }
    await run(() async {
      final directory = Get.find<DirectoryRepository>();
      student = await directory.student(id);
      schoolClass = await directory.schoolClass(student!.classId);
      account = await Get.find<FeeRepository>().forStudent(id);
    }, isEmpty: () => account == null);
  }

  /// Pays [item]; returns the receipt the school stored, or null on failure.
  Future<Receipt?> pay(Installment item, String method) async {
    final id = Get.find<AuthService>().activeStudentId.value;
    if (id == null) return null;
    try {
      return await Get.find<FeeRepository>().pay(studentId: id, installmentId: item.id, method: method);
    } on AppException catch (error) {
      ToastHelper.show(error.message, kind: ToastKind.error);
      return null;
    }
  }
}
