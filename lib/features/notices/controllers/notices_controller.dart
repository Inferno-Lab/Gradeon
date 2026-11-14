import 'dart:async';

import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:gradeon/core/services/auth_service.dart';
import 'package:gradeon/core/services/storage_service.dart';
import 'package:gradeon/core/utils/app_exception.dart';
import 'package:gradeon/core/utils/loadable.dart';
import 'package:gradeon/core/widgets/toast.dart';
import 'package:gradeon/core/utils/schedule.dart';
import 'package:gradeon/data/models/academics.dart';
import 'package:gradeon/data/models/campus.dart';
import 'package:gradeon/data/repositories/academic_repository.dart';
import 'package:gradeon/data/repositories/campus_repository.dart';
import 'package:gradeon/data/repositories/directory_repository.dart';
import 'package:gradeon/core/utils/clock.dart';

/// Filter tabs and the categories each one shows.
const noticeFilters = {
  'all': <String>{},
  'exams': {'exams'},
  'events': {'sports', 'events'},
  'holidays': {'holiday'},
  'fees': {'fees'},
};

/// Notices the user has opened, kept on the device.
class NoticeReads {
  static Set<String> get ids => {
    ...?Get.find<StorageService>().read<List<dynamic>>(StorageKeys.readNotices)?.cast<String>(),
  };

  static Future<void> mark(String id) async {
    final next = ids..add(id);
    await Get.find<StorageService>().write(StorageKeys.readNotices, next.toList());
  }
}

class NoticesController extends GetxController with Loadable {
  final filter = 'all'.obs;
  final read = <String>{}.obs;
  List<Notice> items = [];

  List<Notice> get _filtered {
    final cats = noticeFilters[filter.value] ?? const <String>{};
    final list = [...items]..sort((a, b) => b.date.compareTo(a.date));
    return cats.isEmpty ? list : list.where((n) => cats.contains(n.category)).toList();
  }

  /// Up to two pinned notices go on the board as slips.
  List<Notice> get pinned => _filtered.where((n) => n.pinned).take(2).toList();

  List<Notice> get _rest {
    final board = pinned.map((n) => n.id).toSet();
    return _filtered.where((n) => !board.contains(n.id)).toList();
  }

  DateTime get _weekAgo => DateUtils.dateOnly(Clock.now()).subtract(const Duration(days: 6));

  List<Notice> get thisWeek => _rest.where((n) => !n.date.isBefore(_weekAgo)).toList();

  List<Notice> get earlier => _rest.where((n) => n.date.isBefore(_weekAgo)).toList();

  bool unread(Notice n) => !read.contains(n.id) && !n.date.isBefore(_weekAgo);

  @override
  Future<void> load() => run(() async {
    items = await Get.find<NoticeRepository>().all();
    read
      ..clear()
      ..addAll(NoticeReads.ids);
  }, isEmpty: () => items.isEmpty);
}

class NoticeDetailController extends GetxController with Loadable {
  Notice? notice;

  /// The exam an exams notice is about: the next one for this child's class.
  Exam? exam;

  @override
  Future<void> load() => run(() async {
    final id = Get.parameters['id'];
    final items = await Get.find<NoticeRepository>().all();
    notice = items.where((n) => n.id == id).firstOrNull;
    exam = null;
    final studentId = Get.find<AuthService>().activeStudentId.value;
    if (notice?.category == 'exams' && studentId != null) {
      final student = await Get.find<DirectoryRepository>().student(studentId);
      final exams = await Get.find<ExamRepository>().forClass(student.classId);
      exam =
          (exams.where((e) => e.status == ExamStatus.upcoming).toList()
                ..sort((a, b) => a.startDate.compareTo(b.startDate)))
              .firstOrNull;
    }
    if (notice != null) {
      await NoticeReads.mark(notice!.id);
      unawaited(Get.find<NoticeRepository>().read(notice!.id).catchError((Object _) {}));
      if (Get.isRegistered<NoticesController>()) Get.find<NoticesController>().read.add(notice!.id);
    }
  }, isEmpty: () => notice == null);

  final acking = false.obs;

  /// "I have read this", for a notice that asks for it.
  Future<void> acknowledge() async {
    final n = notice;
    if (n == null || acking.value) return;
    acking.value = true;
    try {
      await Get.find<NoticeRepository>().acknowledge(n.id);
      await load();
      ToastHelper.show('notices.acked', kind: ToastKind.success);
    } on AppException catch (e) {
      ToastHelper.show(e.message, kind: ToastKind.error);
    } finally {
      acking.value = false;
    }
  }

  /// Exam sittings by day, from each paper's date as the school set it.
  List<(DateTime, List<String>)> get sittings {
    final e = exam;
    if (e == null) return const [];
    if (e.papers.isNotEmpty) {
      final byDay = <DateTime, List<String>>{};
      for (final p in [...e.papers]..sort((a, b) => a.date.compareTo(b.date))) {
        byDay.putIfAbsent(DateUtils.dateOnly(p.date), () => []).add(p.subject);
      }
      return [for (final d in byDay.entries) (d.key, d.value)];
    }
    if (e.subjects.isEmpty) return const [];
    final days = <DateTime>[];
    for (var d = DateUtils.dateOnly(e.startDate); !d.isAfter(e.endDate); d = DateTime(d.year, d.month, d.day + 1)) {
      if (!isWeeklyOff(d)) days.add(d);
    }
    if (days.isEmpty) return const [];
    final n = e.subjects.length;
    final used = n < days.length ? n : days.length;
    final doubles = (n - used).clamp(0, used);
    final out = <(DateTime, List<String>)>[];
    var s = 0;
    for (var i = 0; i < used && s < n; i++) {
      final take = i == used - 1 ? n - s : (i >= used - doubles ? 2 : 1);
      out.add((days[i], e.subjects.sublist(s, s + take)));
      s += take;
    }
    return out;
  }
}
