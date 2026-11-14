import 'package:get/get.dart';
import 'package:tangent/core/services/auth_service.dart';
import 'package:tangent/core/utils/formatters.dart';
import 'package:tangent/core/utils/loadable.dart';
import 'package:tangent/core/utils/schedule.dart';
import 'package:tangent/core/utils/status.dart';
import 'package:tangent/data/models/academics.dart';
import 'package:tangent/data/models/student.dart';
import 'package:tangent/data/repositories/academic_repository.dart';
import 'package:tangent/data/repositories/directory_repository.dart';
import 'package:tangent/core/utils/clock.dart';

class SubjectShelf {
  const SubjectShelf({
    required this.subject,
    this.mark,
    this.teacher,
    this.nextToday,
    this.nextDay,
    this.pending = const [],
  });

  final String subject;
  final SubjectMark? mark;
  final String? teacher;
  final PeriodSlot? nextToday;
  final String? nextDay;
  final List<Homework> pending;
}

class AcademicsController extends GetxController with Loadable {
  final selected = 0.obs;
  List<SubjectShelf> shelf = [];
  AttendanceSummary? summary;
  int streak = 0;
  List<Homework> due = [];
  PeriodSlot? now;
  PeriodSlot? next;
  ExamResult? latest;
  Exam? latestExam;
  ExamResult? previous;

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
        Get.find<ExamRepository>().forClass(student.classId),
        Get.find<ExamRepository>().resultsFor(id),
        Get.find<HomeworkRepository>().forClass(student.classId),
        Get.find<TimetableRepository>().forClass(student.classId),
        Get.find<AttendanceRepository>().forStudent(id),
        directory.teachers(),
      ]);
      final exams = results[0]! as List<Exam>;
      final marks = results[1]! as List<ExamResult>;
      final work = results[2]! as List<Homework>;
      final week = results[3]! as List<TimetableDay>;
      final days = results[4]! as List<AttendanceDay>;
      final teachers = {for (final t in results[5]! as List<Teacher>) t.id: t.name};

      final done = exams.where((e) => e.status == ExamStatus.completed).toList()
        ..sort((a, b) => b.endDate.compareTo(a.endDate));
      ExamResult? resultFor(Exam? e) => e == null ? null : marks.where((r) => r.examId == e.id).firstOrNull;
      latestExam = done.firstOrNull;
      latest = resultFor(latestExam);
      previous = resultFor(done.length > 1 ? done[1] : null);

      due = work.where((hw) {
        final mine = hw.forStudent(id);
        return (mine == null || mine.status.toDo) && Formatters.daysUntil(hw.dueOn) >= 0;
      }).toList()..sort((a, b) => a.dueOn.compareTo(b.dueOn));

      final today = Clock.now();
      final key = weekdayKey(today);
      final todayPeriods = week.where((d) => d.day == key).expand((d) => d.periods).toList();
      final minute = nowMinutes(today);
      now =
          todayPeriods.isEmpty ||
              minute < minutesOf(todayPeriods.first.start) ||
              minute > minutesOf(todayPeriods.last.end)
          ? null
          : periodAt(todayPeriods, minute);
      next = nextClassAfter(todayPeriods, now);

      final month = days.where((d) => d.date.year == today.year && d.date.month == today.month).toList();
      summary = AttendanceSummary.from(month);
      streak = attendanceStreak(days);

      final subjects =
          latestExam?.subjects ??
          week.expand((d) => d.periods).where((p) => p.kind == PeriodKind.klass).map((p) => p.subject).toSet().toList();
      const order = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
      shelf = [
        for (final s in subjects)
          () {
            String? teacherId;
            for (final d in week) {
              for (final p in d.periods) {
                if (p.subject == s && p.teacherId != null) teacherId ??= p.teacherId;
              }
            }
            final todayNext = todayPeriods.where((p) => p.subject == s && minutesOf(p.end) > minute).firstOrNull;
            String? nextDay;
            if (todayNext == null) {
              final start = order.indexOf(key);
              for (var k = 1; k <= 6 && nextDay == null; k++) {
                final dayKey = order[(start + k) % 6];
                if (week.any((d) => d.day == dayKey && d.periods.any((p) => p.subject == s))) nextDay = dayKey;
              }
            }
            return SubjectShelf(
              subject: s,
              mark: latest?.subjects.where((m) => m.subject == s).firstOrNull,
              teacher: teachers[teacherId],
              nextToday: todayNext,
              nextDay: nextDay,
              pending: due.where((hw) => hw.subject == s).toList(),
            );
          }(),
      ];
      if (selected.value >= shelf.length) selected.value = 0;
    }, isEmpty: () => shelf.isEmpty);
  }
}
