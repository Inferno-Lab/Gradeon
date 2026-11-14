import 'dart:async';

import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:tangent/core/services/auth_service.dart';
import 'package:tangent/core/services/school_config.dart';
import 'package:tangent/core/utils/app_exception.dart';
import 'package:tangent/core/utils/haptics.dart';
import 'package:tangent/core/utils/loadable.dart';
import 'package:tangent/core/utils/schedule.dart';
import 'package:tangent/core/utils/status.dart';
import 'package:tangent/core/widgets/toast.dart';
import 'package:tangent/data/models/academics.dart';
import 'package:tangent/data/models/campus.dart';
import 'package:tangent/data/models/student.dart';
import 'package:tangent/data/repositories/academic_repository.dart';
import 'package:tangent/data/repositories/campus_repository.dart';
import 'package:tangent/data/repositories/directory_repository.dart';
import 'package:tangent/core/utils/clock.dart';

/// "8 A" from a class.
String classLabel(SchoolClass c) => '${c.name.replaceAll(RegExp('[^0-9]'), '')} ${c.section}';

/// A teacher's period today, with the class it is in.
class TeacherPeriod {
  const TeacherPeriod(this.slot, this.schoolClass);

  final PeriodSlot slot;
  final SchoolClass? schoolClass;
}

/// A homework with work waiting to be graded.
class GradingItem {
  const GradingItem(this.homework, this.schoolClass, this.waiting);

  final Homework homework;
  final SchoolClass? schoolClass;
  final List<HomeworkSubmission> waiting;

  int get graded => homework.submissions.where((s) => s.status == HomeworkStatus.graded).length;
  int get submitted => homework.submissions.where((s) => s.status != HomeworkStatus.pending).length;
}

/// Everything a teacher's day needs, loaded once and shared by Home and Classes.
class TeacherHomeController extends GetxController with Loadable {
  Teacher? teacher;
  List<SchoolClass> classes = [];

  /// The class they are class teacher of, if any.
  SchoolClass? own;
  List<TeacherPeriod> today = [];
  final students = <String, List<Student>>{};
  final attendance = <String, Map<String, AttendanceStatus>>{};
  List<GradingItem> grading = [];
  List<LeaveRequest> leave = [];
  final names = <String, String>{};

  /// Marks typed so far for the teacher's subject, per class.
  final entered = <String, int>{};

  @override
  Future<void> load() async {
    final teacherId = Get.find<AuthService>().user.value?.teacherId;
    if (teacherId == null) {
      await run(() async {}, isEmpty: () => true);
      return;
    }
    await run(() async {
      final directory = Get.find<DirectoryRepository>();
      teacher = await directory.teacher(teacherId);
      classes = await directory.classesForTeacher(teacherId);
      own = classes.where((c) => c.classTeacherId == teacherId).firstOrNull;
      final key = weekdayKey(Clock.now());
      final periods = <TeacherPeriod>[];
      grading = [];
      leave = [];
      for (final c in classes) {
        final days = await Get.find<TimetableRepository>().forClass(c.id);
        final day = days.where((d) => d.day == key).firstOrNull;
        for (final p in day?.periods ?? const <PeriodSlot>[]) {
          if (p.teacherId == teacherId) periods.add(TeacherPeriod(p, c));
        }
        final roster = await directory.studentsIn(c.id);
        students[c.id] = roster;
        for (final s in roster) {
          names[s.id] = s.name;
        }
        attendance[c.id] = await Get.find<AttendanceRepository>().todayForClass(roster.map((s) => s.id).toList());
        final work = await Get.find<HomeworkRepository>().forClass(c.id);
        for (final h in work.where((h) => h.teacherId == teacherId)) {
          final waiting = h.submissions.where((s) => s.status == HomeworkStatus.submitted).toList()
            ..sort((a, b) => (a.submittedAt ?? h.dueOn).compareTo(b.submittedAt ?? h.dueOn));
          if (waiting.isNotEmpty) grading.add(GradingItem(h, c, waiting));
        }
        entered[c.id] = (await Get.find<ExamRepository>().marksDraft(c.id, teacher!.subject)).length;
        if (c.id == own?.id) {
          for (final s in roster) {
            leave.addAll(
              (await Get.find<LeaveRepository>().forStudent(s.id)).where((l) => l.status == LeaveStatus.pending),
            );
          }
        }
      }
      today = _withFree(periods..sort((a, b) => minutesOf(a.slot.start).compareTo(minutesOf(b.slot.start))));
      grading.sort(
        (a, b) => (a.waiting.first.submittedAt ?? a.homework.dueOn).compareTo(
          b.waiting.first.submittedAt ?? b.homework.dueOn,
        ),
      );
      leave.sort((a, b) => a.from.compareTo(b.from));
    }, isEmpty: () => teacher == null);
  }

  /// Fills gaps between a teacher's periods with free blocks.
  static List<TeacherPeriod> _withFree(List<TeacherPeriod> periods) {
    final out = <TeacherPeriod>[];
    for (final p in periods) {
      if (out.isNotEmpty) {
        final gapStart = out.last.slot.end;
        if (minutesOf(p.slot.start) - minutesOf(gapStart) >= 10) {
          out.add(
            TeacherPeriod(
              PeriodSlot(
                id: 'free_${p.slot.id}',
                subject: 'free',
                start: gapStart,
                end: p.slot.start,
                room: '',
                kind: PeriodKind.breakTime,
              ),
              null,
            ),
          );
        }
      }
      out.add(p);
    }
    return out;
  }

  TeacherPeriod? get current {
    final now = nowMinutes();
    return today
        .where((p) => p.schoolClass != null && minutesOf(p.slot.start) <= now && minutesOf(p.slot.end) > now)
        .firstOrNull;
  }

  TeacherPeriod? get next {
    final now = nowMinutes();
    return today.where((p) => p.schoolClass != null && minutesOf(p.slot.start) > now).firstOrNull;
  }

  int get waitingTotal => grading.fold(0, (sum, g) => sum + g.waiting.length);

  /// Present (incl. late) / marked, for a class today; null when not taken.
  (int, int)? taken(String classId) {
    final marks = attendance[classId];
    if (marks == null || marks.isEmpty) return null;
    final present = marks.values
        .where((m) => m == AttendanceStatus.present || m == AttendanceStatus.lateArrival)
        .length;
    return (present, students[classId]?.length ?? marks.length);
  }

  Future<void> review(LeaveRequest request, LeaveStatus status, String? note) async {
    try {
      await Get.find<LeaveRepository>().review(
        id: request.id,
        status: status,
        reviewer: teacher?.name ?? '',
        note: note == null || note.trim().isEmpty ? null : note.trim(),
      );
      ToastHelper.show(
        status == LeaveStatus.approved ? 'teacher.leave_approved' : 'teacher.leave_declined',
        kind: ToastKind.success,
      );
    } on AppException catch (error) {
      ToastHelper.show(error.message, kind: ToastKind.error);
    }
  }
}

class MarkAttendanceController extends GetxController with Loadable {
  MarkAttendanceController({this.classId});

  /// Class to mark; defaults to the route's :classId.
  final String? classId;

  @override
  bool get watchRevision => false;

  SchoolClass? schoolClass;
  List<Student> students = [];

  /// Only the exceptions; everyone else is present.
  final marks = <String, AttendanceStatus>{}.obs;
  final saving = false.obs;

  @override
  Future<void> load() async {
    final id = classId ?? Get.parameters['classId'];
    if (id == null) {
      await run(() async {}, isEmpty: () => true);
      return;
    }
    await run(() async {
      final directory = Get.find<DirectoryRepository>();
      schoolClass = await directory.schoolClass(id);
      students = await directory.studentsIn(id)
        ..sort((a, b) => a.rollNo.compareTo(b.rollNo));
      final existing = await Get.find<AttendanceRepository>().todayForClass(students.map((s) => s.id).toList());
      marks
        ..clear()
        ..addAll({
          for (final e in existing.entries)
            if (e.value == AttendanceStatus.absent || e.value == AttendanceStatus.lateArrival) e.key: e.value,
        });
    }, isEmpty: () => students.isEmpty);
  }

  /// Present → absent → late → present.
  void cycle(String id) {
    Haptics.selection();
    marks[id] = switch (marks[id]) {
      null => AttendanceStatus.absent,
      AttendanceStatus.absent => AttendanceStatus.lateArrival,
      _ => AttendanceStatus.present,
    };
    if (marks[id] == AttendanceStatus.present) marks.remove(id);
  }

  void allPresent() {
    Haptics.medium();
    marks.clear();
  }

  int get absent => marks.values.where((m) => m == AttendanceStatus.absent).length;
  int get late => marks.values.where((m) => m == AttendanceStatus.lateArrival).length;
  int get present => students.length - absent - late;

  Future<void> submit() async {
    if (!SchoolConfig.allows('attendance.teacherApp')) return;
    if (saving.value) return;
    saving.value = true;
    try {
      await Get.find<AttendanceRepository>().markToday({
        for (final s in students) s.id: marks[s.id] ?? AttendanceStatus.present,
      });
      Get.back<void>();
      ToastHelper.show('teacher.attendance_saved', kind: ToastKind.success);
    } on AppException catch (error) {
      ToastHelper.show(error.message, kind: ToastKind.error);
    } finally {
      saving.value = false;
    }
  }
}

class AssignHomeworkController extends GetxController {
  final title = TextEditingController();
  final body = TextEditingController();
  final classId = RxnString();
  final due = Rxn<DateTime>();
  final marks = 20.obs;
  final saving = false.obs;
  final draftSaved = false.obs;
  final attachments = <String>[].obs;

  List<SchoolClass> classes = [];
  String subject = 'maths';

  /// Homework already due per day for the chosen class, by subject.
  final dueByDay = <DateTime, List<String>>{}.obs;
  final roster = 0.obs;

  Timer? _draftTimer;

  @override
  void onInit() {
    super.onInit();
    void touched() {
      draftSaved.value = false;
      _draftTimer?.cancel();
      // shortcut: the draft lives in this controller only; persist it once drafts sync with the server.
      _draftTimer = Timer(const Duration(milliseconds: 700), () => draftSaved.value = title.text.isNotEmpty);
    }

    title.addListener(touched);
    body.addListener(touched);
    unawaited(_load());
  }

  Future<void> _load() async {
    final teacherId = Get.find<AuthService>().user.value?.teacherId;
    if (teacherId == null) return;
    try {
      final directory = Get.find<DirectoryRepository>();
      subject = (await directory.teacher(teacherId)).subject;
      classes = await directory.classesForTeacher(teacherId);
      final args = Get.arguments;
      final preferred = args is Map ? args['classId'] as String? : null;
      await pickClass(preferred ?? classes.firstOrNull?.id);
    } on AppException catch (error) {
      ToastHelper.show(error.message, kind: ToastKind.error);
    }
  }

  /// The next five school days, starting tomorrow.
  List<DateTime> get days {
    final out = <DateTime>[];
    var d = DateUtils.dateOnly(Clock.now());
    while (out.length < 5) {
      d = DateTime(d.year, d.month, d.day + 1);
      if (!isWeeklyOff(d)) out.add(d);
    }
    return out;
  }

  Future<void> pickClass(String? id) async {
    classId.value = id;
    if (id == null) return;
    due.value ??= days[1 < days.length ? 1 : 0];
    try {
      final work = await Get.find<HomeworkRepository>().forClass(id);
      final map = <DateTime, List<String>>{};
      for (final h in work) {
        map.putIfAbsent(DateUtils.dateOnly(h.dueOn), () => []).add(h.subject);
      }
      dueByDay.assignAll(map);
      roster.value = (await Get.find<DirectoryRepository>().studentsIn(id)).length;
    } on AppException {
      dueByDay.clear();
    }
  }

  void step(int delta) {
    Haptics.selection();
    marks.value = (marks.value + delta).clamp(5, 100);
  }

  Future<void> submit() async {
    if (saving.value) return;
    final teacherId = Get.find<AuthService>().user.value?.teacherId;
    final id = classId.value;
    final date = due.value;
    if (title.text.trim().isEmpty) {
      ToastHelper.show('teacher.need_title', kind: ToastKind.error);
      return;
    }
    if (teacherId == null || id == null || date == null) return;
    saving.value = true;
    try {
      final students = await Get.find<DirectoryRepository>().studentsIn(id);
      await Get.find<HomeworkRepository>().assign(
        Homework(
          id: 'hw_${Clock.now().microsecondsSinceEpoch}',
          classId: id,
          subject: subject,
          title: title.text.trim(),
          description: body.text.trim(),
          assignedOn: Clock.now(),
          dueOn: DateTime(date.year, date.month, date.day, 20),
          teacherId: teacherId,
          maxMarks: marks.value,
          attachments: attachments.toList(),
          submissions: [
            for (final s in students) HomeworkSubmission(studentId: s.id, status: HomeworkStatus.pending),
          ],
        ),
      );
      Get.back<void>();
      ToastHelper.show('teacher.homework_sent', kind: ToastKind.success);
    } on AppException catch (error) {
      ToastHelper.show(error.message, kind: ToastKind.error);
    } finally {
      saving.value = false;
    }
  }

  @override
  void onClose() {
    _draftTimer?.cancel();
    title.dispose();
    body.dispose();
    super.onClose();
  }
}

class GradingController extends GetxController with Loadable {
  List<GradingItem> items = [];
  final names = <String, String>{};

  int get total => items.fold(0, (sum, g) => sum + g.waiting.length);

  @override
  Future<void> load() async {
    final teacherId = Get.find<AuthService>().user.value?.teacherId;
    if (teacherId == null) {
      await run(() async {}, isEmpty: () => true);
      return;
    }
    await run(() async {
      final directory = Get.find<DirectoryRepository>();
      final classes = await directory.classesForTeacher(teacherId);
      items = [];
      for (final c in classes) {
        for (final s in await directory.studentsIn(c.id)) {
          names[s.id] = s.name;
        }
        final work = await Get.find<HomeworkRepository>().forClass(c.id);
        for (final h in work.where((h) => h.teacherId == teacherId)) {
          final waiting = h.submissions.where((s) => s.status == HomeworkStatus.submitted).toList()
            ..sort((a, b) => (a.submittedAt ?? h.dueOn).compareTo(b.submittedAt ?? h.dueOn));
          if (waiting.isNotEmpty) items.add(GradingItem(h, c, waiting));
        }
      }
      items.sort(
        (a, b) => (a.waiting.first.submittedAt ?? a.homework.dueOn).compareTo(
          b.waiting.first.submittedAt ?? b.homework.dueOn,
        ),
      );
    }, isEmpty: () => items.isEmpty);
  }

  /// Every waiting submission across homework, oldest first.
  List<(GradingItem, HomeworkSubmission)> get queue => [
    for (final g in items)
      for (final s in g.waiting) (g, s),
  ];

  static String gradeFor(int marks, int max) {
    final r = max == 0 ? 0 : marks / max;
    return r >= .9
        ? 'A+'
        : r >= .8
        ? 'A'
        : r >= .7
        ? 'B+'
        : r >= .6
        ? 'B'
        : r >= .5
        ? 'C'
        : 'D';
  }

  Future<bool> grade({
    required Homework homework,
    required String studentId,
    required int marks,
    required String feedback,
  }) async {
    if (!SchoolConfig.allows('homework.grading')) return false;
    try {
      await Get.find<HomeworkRepository>().grade(
        homeworkId: homework.id,
        studentId: studentId,
        marks: marks,
        grade: gradeFor(marks, homework.maxMarks),
        feedback: feedback,
      );
      return true;
    } on AppException catch (error) {
      ToastHelper.show(error.message, kind: ToastKind.error);
      return false;
    }
  }
}

/// Marks entry: one class, one subject at a time; saves as you type.
class MarksEntryController extends GetxController with Loadable {
  MarksEntryController({this.classId});

  /// Class to enter; defaults to the route's :classId.
  final String? classId;

  /// Marks for an absent student.
  static const absentMark = -1;
  static const maxMarks = 20;

  @override
  bool get watchRevision => false;

  SchoolClass? schoolClass;
  List<Student> students = [];
  List<String> subjects = [];
  final subject = 'maths'.obs;
  final values = <String, int>{}.obs;
  final active = RxnString();
  final saving = false.obs;
  Timer? _save;

  String? get _classId => classId ?? Get.parameters['classId'];

  @override
  Future<void> load() async {
    final id = _classId;
    if (id == null) {
      await run(() async {}, isEmpty: () => true);
      return;
    }
    await run(() async {
      final directory = Get.find<DirectoryRepository>();
      schoolClass = await directory.schoolClass(id);
      students = await directory.studentsIn(id)
        ..sort((a, b) => a.rollNo.compareTo(b.rollNo));
      final exams = await Get.find<ExamRepository>().forClass(id);
      final set = <String>{for (final e in exams) ...e.subjects};
      subjects = set.isEmpty ? const ['maths', 'science', 'english', 'hindi', 'social'] : set.toList();
      final teacherId = Get.find<AuthService>().user.value?.teacherId;
      if (teacherId != null) {
        final mine = (await directory.teacher(teacherId)).subject;
        if (subjects.contains(mine)) subject.value = mine;
      }
      if (!subjects.contains(subject.value)) subject.value = subjects.first;
      await _draft();
    }, isEmpty: () => students.isEmpty);
  }

  Future<void> _draft() async {
    final id = _classId;
    if (id == null) return;
    final draft = await Get.find<ExamRepository>().marksDraft(id, subject.value);
    values
      ..clear()
      ..addAll(draft);
    active.value = students.where((s) => !values.containsKey(s.id)).firstOrNull?.id;
  }

  Future<void> pickSubject(String id) async {
    if (subject.value == id) return;
    await save();
    subject.value = id;
    try {
      await _draft();
    } on AppException catch (error) {
      ToastHelper.show(error.message, kind: ToastKind.error);
    }
  }

  void put(String studentId, int? value) {
    if (value == null) {
      values.remove(studentId);
    } else {
      values[studentId] = value;
    }
    _save?.cancel();
    _save = Timer(const Duration(milliseconds: 600), () => unawaited(save()));
  }

  Future<void> save() async {
    _save?.cancel();
    final id = _classId;
    if (id == null) return;
    saving.value = true;
    try {
      await Get.find<ExamRepository>().saveMarks(classId: id, subject: subject.value, values: Map.of(values));
    } on AppException catch (error) {
      ToastHelper.show(error.message, kind: ToastKind.error);
    } finally {
      saving.value = false;
    }
  }

  /// The next student without marks after the active one, wrapping round.
  Student? get nextEmpty {
    final i = students.indexWhere((s) => s.id == active.value);
    for (var k = 1; k <= students.length; k++) {
      final s = students[(i + k) % students.length];
      if (!values.containsKey(s.id)) return s;
    }
    return null;
  }

  Iterable<int> get _scored => values.values.where((v) => v >= 0);

  double? get average => _scored.isEmpty ? null : _scored.reduce((a, b) => a + b) / _scored.length;

  int? get highest => _scored.isEmpty ? null : _scored.reduce((a, b) => a > b ? a : b);

  int get missing => students.where((s) => !values.containsKey(s.id)).length;

  @override
  void onClose() {
    if (_save?.isActive ?? false) unawaited(save());
    super.onClose();
  }
}

class PostNoticeController extends GetxController {
  static const audiences = ['parents', 'students', 'school'];
  static const categories = ['academic', 'exams', 'events', 'holiday', 'fees'];

  final title = TextEditingController();
  final body = TextEditingController();
  final audience = 'parents'.obs;
  final category = 'academic'.obs;
  final pinned = false.obs;
  final saving = false.obs;
  final preview = ''.obs;

  SchoolClass? own;
  int families = 0;
  int students = 0;
  int school = 0;

  @override
  void onInit() {
    super.onInit();
    void touched() => preview.value = '${title.text}\n${body.text}';
    title.addListener(touched);
    body.addListener(touched);
    unawaited(_load());
  }

  Future<void> _load() async {
    final teacherId = Get.find<AuthService>().user.value?.teacherId;
    if (teacherId == null) return;
    try {
      final directory = Get.find<DirectoryRepository>();
      final classes = await directory.classesForTeacher(teacherId);
      own = classes.where((c) => c.classTeacherId == teacherId).firstOrNull ?? classes.firstOrNull;
      if (own != null) students = (await directory.studentsIn(own!.id)).length;
      families = students;
      school = 0;
      for (final c in classes) {
        school += (await directory.studentsIn(c.id)).length;
      }
      preview.refresh();
    } on AppException {
      // Counts are a nicety; posting still works without them.
    }
  }

  int get reach => switch (audience.value) {
    'parents' => families,
    'students' => students,
    _ => school,
  };

  Future<void> submit() async {
    if (!SchoolConfig.allows('notices.teacherPosts')) return;
    if (saving.value) return;
    if (title.text.trim().isEmpty) {
      ToastHelper.show('teacher.need_title', kind: ToastKind.error);
      return;
    }
    saving.value = true;
    try {
      final cls = own == null ? '' : classLabel(own!);
      await Get.find<NoticeRepository>().post(
        Notice(
          id: 'nt_${Clock.now().microsecondsSinceEpoch}',
          title: title.text.trim(),
          body: body.text.trim(),
          category: category.value,
          audience: audience.value == 'school' ? 'all' : '${audience.value}:$cls',
          pinned: pinned.value,
          date: Clock.now(),
          author: Get.find<AuthService>().user.value?.name ?? '',
          attachments: const [],
        ),
        classId: audience.value == 'school' ? null : own?.id,
      );
      Get.back<void>();
      ToastHelper.show('teacher.notice_sent', kind: ToastKind.success);
    } on AppException catch (error) {
      ToastHelper.show(error.message, kind: ToastKind.error);
    } finally {
      saving.value = false;
    }
  }

  @override
  void onClose() {
    title.dispose();
    body.dispose();
    super.onClose();
  }
}
