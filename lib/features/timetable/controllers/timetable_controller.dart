import 'package:get/get.dart';
import 'package:gradeon/core/services/auth_service.dart';
import 'package:gradeon/core/utils/formatters.dart';
import 'package:gradeon/core/utils/loadable.dart';
import 'package:gradeon/core/utils/schedule.dart';
import 'package:gradeon/core/utils/status.dart';
import 'package:gradeon/data/models/academics.dart';
import 'package:gradeon/data/models/student.dart';
import 'package:gradeon/data/repositories/academic_repository.dart';
import 'package:gradeon/data/repositories/directory_repository.dart';
import 'package:gradeon/core/utils/clock.dart';

class TimetableController extends GetxController with Loadable {
  final dayIndex = (Clock.now().weekday - 1).clamp(0, 6).obs;
  List<TimetableDay> days = [];
  SchoolClass? schoolClass;
  final teachers = <String, String>{}.obs;

  /// Subjects with homework due by the next school day.
  Set<String> homeworkDue = {};

  static const keys = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

  TimetableDay? get selected {
    final key = keys[dayIndex.value];
    for (final day in days) {
      if (day.day == key) return day;
    }
    return null;
  }

  bool get isToday => weekdayKey(Clock.now()) == keys[dayIndex.value];

  /// The date of the selected weekday in the current week.
  DateTime dateOf(int index) {
    final now = Clock.now();
    final monday = DateTime(now.year, now.month, now.day - (now.weekday - 1));
    return monday.add(Duration(days: index));
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
      final student = await directory.student(id);
      final results = await Future.wait<Object?>([
        Get.find<TimetableRepository>().forClass(student.classId),
        directory.teachers(),
        directory.schoolClass(student.classId),
        Get.find<HomeworkRepository>().forClass(student.classId),
      ]);
      days = results[0]! as List<TimetableDay>;
      teachers
        ..clear()
        ..addAll({for (final teacher in results[1]! as List<Teacher>) teacher.id: teacher.name});
      schoolClass = results[2] as SchoolClass?;
      homeworkDue = {
        for (final hw in results[3]! as List<Homework>)
          if ((hw.forStudent(id)?.status ?? HomeworkStatus.pending) == HomeworkStatus.pending &&
              Formatters.daysUntil(hw.dueOn) >= 0 &&
              Formatters.daysUntil(hw.dueOn) <= 1)
            hw.subject,
      };
    }, isEmpty: () => days.isEmpty);
  }

  bool isNow(PeriodSlot period) {
    if (!isToday) return false;
    final current = nowMinutes();
    return current >= minutesOf(period.start) && current < minutesOf(period.end);
  }
}
