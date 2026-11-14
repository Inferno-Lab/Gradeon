import 'package:get/get.dart';
import 'package:tangent/core/services/auth_service.dart';
import 'package:tangent/core/utils/extensions.dart';
import 'package:tangent/core/utils/loadable.dart';
import 'package:tangent/core/utils/status.dart';
import 'package:tangent/data/models/academics.dart';
import 'package:tangent/data/models/campus.dart';
import 'package:tangent/data/models/student.dart';
import 'package:tangent/data/repositories/academic_repository.dart';
import 'package:tangent/data/repositories/campus_repository.dart';
import 'package:tangent/data/repositories/directory_repository.dart';
import 'package:tangent/core/utils/clock.dart';

class AttendanceController extends GetxController with Loadable {
  List<AttendanceDay> days = [];
  List<TimetableDay> week = [];
  List<LeaveRequest> leaves = [];
  Student? student;
  String? classTeacher;
  final focused = Clock.now().obs;
  final picked = Rxn<DateTime>();

  List<AttendanceDay> get monthDays => days.where((day) {
    return day.date.year == focused.value.year && day.date.month == focused.value.month;
  }).toList()..sort((a, b) => a.date.compareTo(b.date));

  AttendanceSummary get summary => AttendanceSummary.from(monthDays);

  int get streak => attendanceStreak(days);

  bool get canGoForward {
    final now = Clock.now();
    return focused.value.year < now.year || (focused.value.year == now.year && focused.value.month < now.month);
  }

  void shiftMonth(int by) {
    final f = focused.value;
    focused.value = DateTime(f.year, f.month + by);
    picked.value = null;
  }

  AttendanceDay? on(DateTime date) {
    for (final day in days) {
      if (day.date.isSameDay(date)) return day;
    }
    return null;
  }

  /// A leave request that covers [date], if one was sent.
  LeaveRequest? leaveFor(DateTime date) {
    final d = date.dateOnly;
    for (final leave in leaves) {
      if (!d.isBefore(leave.from.dateOnly) && !d.isAfter(leave.to.dateOnly)) return leave;
    }
    return null;
  }

  List<PeriodSlot> classesOn(DateTime date) {
    final key = weekdayKey(date);
    return week
        .where((d) => d.day == key)
        .expand((d) => d.periods)
        .where((p) => p.kind == PeriodKind.klass)
        .toList();
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
      final results = await Future.wait<Object?>([
        Get.find<AttendanceRepository>().forStudent(id),
        Get.find<TimetableRepository>().forClass(student!.classId),
        Get.find<LeaveRepository>().forStudent(id),
        directory.schoolClass(student!.classId),
      ]);
      days = results[0]! as List<AttendanceDay>;
      week = results[1]! as List<TimetableDay>;
      leaves = results[2]! as List<LeaveRequest>;
      final cls = results[3]! as SchoolClass;
      classTeacher = (await directory.teacherOrNull(cls.classTeacherId))?.name;
    }, isEmpty: () => days.isEmpty);
  }
}
