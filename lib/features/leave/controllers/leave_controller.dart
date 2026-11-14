import 'dart:async';

import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:gradeon/core/widgets/sheets.dart';
import 'package:gradeon/core/services/auth_service.dart';
import 'package:gradeon/core/utils/app_exception.dart';
import 'package:gradeon/core/utils/extensions.dart';
import 'package:gradeon/core/utils/haptics.dart';
import 'package:gradeon/core/utils/loadable.dart';
import 'package:gradeon/core/utils/schedule.dart';
import 'package:gradeon/core/widgets/toast.dart';
import 'package:gradeon/data/models/academics.dart';
import 'package:gradeon/data/models/campus.dart';
import 'package:gradeon/data/repositories/academic_repository.dart';
import 'package:gradeon/data/repositories/campus_repository.dart';
import 'package:gradeon/data/repositories/directory_repository.dart';
import 'package:image_picker/image_picker.dart';
import 'package:gradeon/core/utils/clock.dart';

DateTime dayOnly(DateTime d) => DateUtils.dateOnly(d);

/// Days a leave covers, counting both ends.
int leaveSpan(LeaveRequest r) => dayOnly(r.to).difference(dayOnly(r.from)).inDays + 1;

/// shortcut: terms are fixed halves (Jun–Nov, Dec–May); read them from the school calendar once it exists.
DateTime termStart(DateTime now) {
  if (now.month >= 6 && now.month <= 11) return DateTime(now.year, 6);
  return now.month == 12 ? DateTime(now.year, 12) : DateTime(now.year - 1, 12);
}

class LeaveController extends GetxController with Loadable {
  List<LeaveRequest> items = [];
  String? childName;
  String? teacherName;

  /// Most recent absence no leave request covers.
  DateTime? unexplained;

  int get waiting => items.where((i) => i.status == LeaveStatus.pending).length;

  Future<void> withdraw(LeaveRequest item) async {
    final ok = await confirmSheet(title: 'leave.withdraw_title', body: 'leave.withdraw_body', confirm: 'leave.withdraw');
    if (!ok) return;
    try {
      await Get.find<LeaveRepository>().withdraw(item.id);
      await load();
      ToastHelper.show('leave.withdrawn_done', kind: ToastKind.success);
    } on AppException catch (e) {
      ToastHelper.show(e.message, kind: ToastKind.error);
    }
  }

  int get takenThisTerm {
    final start = termStart(Clock.now());
    return items
        .where((i) => i.status == LeaveStatus.approved && !i.from.isBefore(start))
        .fold(0, (sum, i) => sum + leaveSpan(i));
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
      final cls = await directory.schoolClass(student.classId);
      childName = student.name.split(' ').first;
      teacherName = (await directory.teacherOrNull(cls.classTeacherId))?.name;
      items = await Get.find<LeaveRepository>().forStudent(id);
      items.sort((a, b) => b.appliedOn.compareTo(a.appliedOn));
      final days = await Get.find<AttendanceRepository>().forStudent(id);
      final absences =
          days
              .where((d) => d.status == AttendanceStatus.absent)
              .map((d) => dayOnly(d.date))
              .where((d) => !items.any((r) => !d.isBefore(dayOnly(r.from)) && !d.isAfter(dayOnly(r.to))))
              .toList()
            ..sort((a, b) => b.compareTo(a));
      unexplained = absences.firstOrNull;
    }, isEmpty: () => false);
  }
}

class LeaveApplyController extends GetxController {

  /// 0: upcoming leave, 1: explaining a past absence.
  final mode = 0.obs;
  final start = Rxn<DateTime>();
  final end = Rxn<DateTime>();

  /// Which end of the range the next tap sets: 0 start, 1 end.
  final picking = 0.obs;
  final month = DateTime(Clock.now().year, Clock.now().month).obs;
  final reason = RxnString();
  final attachment = RxnString();
  final sending = false.obs;
  final note = TextEditingController();

  final holidays = <DateTime>{}.obs;
  String? teacherName;

  DateTime get today => dayOnly(Clock.now());

  @override
  void onInit() {
    super.onInit();
    final args = Get.arguments;
    if (args is Map && args['past'] is DateTime) {
      final d = dayOnly(args['past'] as DateTime);
      mode.value = 1;
      start.value = d;
      end.value = d;
      month.value = DateTime(d.year, d.month);
    }
    unawaited(_load());
  }

  @override
  void onClose() {
    note.dispose();
    super.onClose();
  }

  Future<void> _load() async {
    final id = Get.find<AuthService>().activeStudentId.value;
    if (id == null) return;
    try {
      final directory = Get.find<DirectoryRepository>();
      final student = await directory.student(id);
      final cls = await directory.schoolClass(student.classId);
      teacherName = (await directory.teacherOrNull(cls.classTeacherId))?.name;
      final days = await Get.find<AttendanceRepository>().forStudent(id);
      holidays.addAll(days.where((d) => d.status == AttendanceStatus.holiday).map((d) => dayOnly(d.date)));
    } on AppException {
      // Without the calendar only Sundays are blocked; the class teacher still reviews.
    }
  }

  void setMode(int value) {
    if (mode.value == value) return;
    mode.value = value;
    start.value = null;
    end.value = null;
    picking.value = 0;
    month.value = DateTime(today.year, today.month);
  }

  bool disabled(DateTime d) {
    if (isWeeklyOff(d) || holidays.contains(d)) return true;
    return mode.value == 1 ? d.isAfter(today) : d.isBefore(today);
  }

  /// Months the calendar may show: two back for absences, three ahead for leave.
  bool canShift(int delta) {
    final now = DateTime(today.year, today.month);
    final target = DateTime(month.value.year, month.value.month + delta);
    final diff = (target.year - now.year) * 12 + target.month - now.month;
    return mode.value == 1 ? diff <= 0 && diff >= -2 : diff >= 0 && diff <= 3;
  }

  void shift(int delta) {
    if (canShift(delta)) month.value = DateTime(month.value.year, month.value.month + delta);
  }

  void pick(DateTime d) {
    if (disabled(d)) return;
    Haptics.selection();
    final s = start.value;
    if (picking.value == 0 || s == null || d.isBefore(s)) {
      // The end can never come before the start: an earlier tap starts over.
      start.value = d;
      end.value = d;
      picking.value = 1;
    } else {
      end.value = d;
      picking.value = 0;
    }
  }

  int get schoolDays {
    final s = start.value;
    final e = end.value;
    if (s == null || e == null) return 0;
    var n = 0;
    for (var d = s; !d.isAfter(e); d = DateTime(d.year, d.month, d.day + 1)) {
      if (!isWeeklyOff(d) && !holidays.contains(d)) n++;
    }
    return n;
  }

  Future<void> attach() async {
    try {
      final file = await ImagePicker().pickImage(source: ImageSource.gallery, imageQuality: 70);
      if (file != null) attachment.value = file.name;
    } on Exception {
      ToastHelper.show('leave.attach_failed', kind: ToastKind.error);
    }
  }

  Future<void> send() async {
    final id = Get.find<AuthService>().activeStudentId.value;
    final s = start.value;
    final e = end.value;
    if (id == null || s == null || e == null) {
      ToastHelper.show('leave.pick_dates', kind: ToastKind.error);
      return;
    }
    if (reason.value == null) {
      ToastHelper.show('leave.pick_reason', kind: ToastKind.error);
      return;
    }
    sending.value = true;
    try {
      final text = note.text.trim();
      await Get.find<LeaveRepository>().apply(
        LeaveRequest(
          id: 'lv_${Clock.now().microsecondsSinceEpoch}',
          studentId: id,
          from: s,
          to: e,
          // The school's own words (console: Attendance → leave reasons); the server checks it is one of them.
          reason: reason.value!,
          note: [if (text.isNotEmpty) text, if (attachment.value != null) 'leave.note_attached'.tr].join(' '),
          status: LeaveStatus.pending,
          appliedOn: Clock.now(),
        ),
      );
      Get.back<void>();
      ToastHelper.show(
        teacherName == null ? 'leave.sent' : 'leave.sent_named'.trp({'name': teacherName!}),
        kind: ToastKind.success,
      );
    } on AppException catch (error) {
      ToastHelper.show(error.message, kind: ToastKind.error);
    } finally {
      sending.value = false;
    }
  }
}
