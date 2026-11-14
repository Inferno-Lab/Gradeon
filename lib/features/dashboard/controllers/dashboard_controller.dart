import 'package:get/get.dart';
import 'package:gradeon/core/services/auth_service.dart';
import 'package:gradeon/core/utils/extensions.dart';
import 'package:gradeon/core/utils/formatters.dart';
import 'package:gradeon/core/utils/loadable.dart';
import 'package:gradeon/core/utils/schedule.dart';
import 'package:gradeon/core/utils/status.dart';
import 'package:gradeon/data/models/academics.dart';
import 'package:gradeon/data/models/campus.dart';
import 'package:gradeon/data/models/student.dart';
import 'package:gradeon/data/models/user.dart';
import 'package:gradeon/data/repositories/academic_repository.dart';
import 'package:gradeon/data/repositories/campus_repository.dart';
import 'package:gradeon/data/repositories/directory_repository.dart';
import 'package:gradeon/core/utils/clock.dart';

enum DueKind { fee, homework, event }

/// One line of the merged "Due" stack: fees, homework and replies together.
class DueItem {
  const DueItem({
    required this.kind,
    required this.when,
    this.installment,
    this.homework,
    this.event,
    this.childName,
    this.studentId,
  });

  final DueKind kind;
  final DateTime when;
  final Installment? installment;
  final Homework? homework;
  final SchoolEvent? event;
  final String? studentId;
  final String? childName;

  bool get overdue => kind == DueKind.fee && moneyStatus(installment!) == MoneyStatus.overdue;
}

/// A child's day at a glance, for the parent strip.
class ChildToday {
  const ChildToday({required this.student, required this.schoolClass, this.status, this.period});

  final Student student;
  final SchoolClass schoolClass;
  final AttendanceStatus? status;
  final PeriodSlot? period;
}

class HomeSnapshot {
  HomeSnapshot({
    required this.student,
    required this.schoolClass,
    required this.summary,
    required this.monthDays,
    required this.today,
    required this.teacherNames,
    required this.due,
    required this.nextExam,
    required this.notices,
    required this.children,
    required this.dueTotal,
  });

  final Student student;
  final SchoolClass schoolClass;
  final AttendanceSummary summary;
  final List<AttendanceDay> monthDays;
  final TimetableDay? today;
  final Map<String, String> teacherNames;
  final List<DueItem> due;
  final Exam? nextExam;
  final List<Notice> notices;
  final List<ChildToday> children;

  /// Fees due across every child of a parent (0 for students).
  final int dueTotal;

  List<PeriodSlot> get periods => today?.periods ?? const [];

  /// A new school: no timetable, nothing due, no notices, no exam. Home then
  /// welcomes the family and suggests first steps instead of empty sections.
  bool get isNew => periods.isEmpty && due.isEmpty && notices.isEmpty && nextExam == null;
}

class DashboardController extends GetxController with Loadable {
  HomeSnapshot? snapshot;

  @override
  Future<void> load() async {
    final auth = Get.find<AuthService>();
    final studentId = auth.activeStudentId.value;
    if (studentId == null) {
      await run(() async {}, isEmpty: () => true);
      return;
    }
    await run(() async {
      final directory = Get.find<DirectoryRepository>();
      final user = auth.user.value;
      final now = Clock.now();
      final student = await directory.student(studentId);
      final results = await Future.wait<Object?>([
        directory.schoolClass(student.classId),
        Get.find<AttendanceRepository>().forStudent(studentId),
        Get.find<TimetableRepository>().forClass(student.classId),
        directory.teachers(),
        Get.find<NoticeRepository>().all(),
        Get.find<EventRepository>().all(),
        Get.find<ExamRepository>().forClass(student.classId),
      ]);
      final schoolClass = results[0]! as SchoolClass;
      final attendance = results[1]! as List<AttendanceDay>;
      final days = results[2]! as List<TimetableDay>;
      final teachers = results[3]! as List<Teacher>;
      final notices = results[4]! as List<Notice>;
      final events = results[5]! as List<SchoolEvent>;
      final exams = results[6]! as List<Exam>;

      final monthDays = attendance.where((d) => d.date.year == now.year && d.date.month == now.month).toList()
        ..sort((a, b) => a.date.compareTo(b.date));

      TimetableDay? today;
      final key = weekdayKey(now);
      for (final day in days) {
        if (day.day == key) today = day;
      }

      final upcoming = exams.where((e) => e.status == ExamStatus.upcoming).toList()
        ..sort((a, b) => a.startDate.compareTo(b.startDate));

      final childIds = user?.role == UserRole.parent ? user!.childIds : [studentId];
      final due = <DueItem>[];
      final children = <ChildToday>[];
      var dueTotal = 0;
      for (final id in childIds) {
        final child = id == studentId ? student : await directory.student(id);
        final childClass = id == studentId ? schoolClass : await directory.schoolClass(child.classId);
        final name = user?.role == UserRole.parent ? child.name.split(' ').first : null;
        final fees = await Get.find<FeeRepository>().forStudent(id);
        for (final item in fees?.installments ?? const <Installment>[]) {
          final tone = moneyStatus(item);
          if (tone == MoneyStatus.due || tone == MoneyStatus.overdue) {
            due.add(DueItem(kind: DueKind.fee, when: item.dueDate, installment: item, childName: name, studentId: id));
            dueTotal += item.amount;
          }
        }
        final work = await Get.find<HomeworkRepository>().forClass(child.classId);
        for (final hw in work) {
          final mine = hw.forStudent(id);
          final pending = mine == null || mine.status.toDo;
          final days = Formatters.daysUntil(hw.dueOn);
          if (pending && days >= 0 && days <= 7) {
            due.add(DueItem(kind: DueKind.homework, when: hw.dueOn, homework: hw, childName: name));
          }
        }
        if (user?.role == UserRole.parent) {
          final childDays = id == studentId ? attendance : await Get.find<AttendanceRepository>().forStudent(id);
          AttendanceStatus? status;
          for (final d in childDays) {
            if (d.date.isSameDay(now)) status = d.status;
          }
          final table = id == studentId ? days : await Get.find<TimetableRepository>().forClass(child.classId);
          PeriodSlot? period;
          for (final day in table) {
            if (day.day == key) period = periodAt(day.periods, nowMinutes(now));
          }
          children.add(ChildToday(student: child, schoolClass: childClass, status: status, period: period));
        }
      }

      final userId = user?.id;
      for (final event in events) {
        final days = Formatters.daysUntil(event.date);
        final replied = event.rsvps.any((r) => r.userId == userId);
        if (!replied && days >= 0 && days <= 14) {
          due.add(DueItem(kind: DueKind.event, when: event.date, event: event));
        }
      }
      // Overdue fees first, then whatever is soonest.
      due.sort((a, b) {
        if (a.overdue != b.overdue) return a.overdue ? -1 : 1;
        return a.when.compareTo(b.when);
      });

      final sortedNotices = [...notices]
        ..sort((a, b) {
          if (a.pinned != b.pinned) return a.pinned ? -1 : 1;
          return b.date.compareTo(a.date);
        });

      snapshot = HomeSnapshot(
        student: student,
        schoolClass: schoolClass,
        summary: AttendanceSummary.from(monthDays),
        monthDays: monthDays,
        today: today,
        teacherNames: {for (final t in teachers) t.id: t.name},
        due: due,
        nextExam: upcoming.firstOrNull,
        notices: sortedNotices.take(5).toList(),
        children: children,
        dueTotal: dueTotal,
      );
    }, isEmpty: () => snapshot == null);
  }
}
