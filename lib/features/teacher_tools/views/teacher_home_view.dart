import 'dart:async';

import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:gradeon/core/routes/app_routes.dart';
import 'package:gradeon/core/theme/app_colors.dart';
import 'package:gradeon/core/theme/app_typography.dart';
import 'package:gradeon/core/utils/extensions.dart';
import 'package:gradeon/core/utils/schedule.dart';
import 'package:gradeon/core/utils/view_state.dart';
import 'package:gradeon/core/widgets/empty_art.dart';
import 'package:gradeon/core/widgets/glass.dart';
import 'package:gradeon/core/widgets/page.dart';
import 'package:gradeon/core/widgets/sheets.dart';
import 'package:gradeon/core/widgets/states.dart';
import 'package:gradeon/core/widgets/ui.dart';
import 'package:gradeon/data/models/campus.dart';
import 'package:gradeon/data/models/student.dart';
import 'package:gradeon/features/dashboard/views/dashboard_view.dart' show greeting;
import 'package:gradeon/features/dashboard/widgets/day_ribbon.dart';
import 'package:gradeon/features/shell/shell_controller.dart';
import 'package:gradeon/features/teacher_tools/controllers/teacher_controller.dart';
import 'package:intl/intl.dart';
import 'package:phosphor_flutter/phosphor_flutter.dart';

String _attendanceRoute(String classId) => AppRoutes.teacherAttendance.replaceFirst(':classId', classId);
String _marksRoute(String classId) => AppRoutes.teacherMarks.replaceFirst(':classId', classId);

class TeacherHomeView extends GetView<TeacherHomeController> {
  const TeacherHomeView({super.key});

  @override
  Widget build(BuildContext context) {
    final inset = MediaQuery.paddingOf(context);
    return Obx(() {
      controller.state.value;
      final t = controller.teacher;
      final ready = controller.state.value == ViewState.success && t != null;
      final periods = controller.today.map((p) => p.slot).toList();
      final classOf = {for (final p in controller.today) p.slot.id: p.schoolClass};
      // With no periods there is no ribbon: a slim header and dark controls.
      final hasDay = ready && periods.isNotEmpty;
      final ribbonH = hasDay ? 156 + inset.top : inset.top + 64;
      final ink = hasDay ? AppColors.white : context.app.ink;
      return PageFrame(
        dockPage: true,
        padContent: false,
        topPadding: 0,
        topFade: !hasDay,
        onRefresh: controller.load,
        children: [
          SizedBox(
            height: ribbonH,
            child: Stack(
              children: [
                if (hasDay)
                  Positioned.fill(
                    child: DayRibbon(
                      periods: periods,
                      height: ribbonH,
                      pxPerMinute: 2.1,
                      showLabel: false,
                      draggable: false,
                      blockLabel: (p) {
                        final c = classOf[p.id];
                        return c == null ? subjectName(p.subject) : classLabel(c);
                      },
                      blockAccent: (p) => classOf[p.id]?.id != null && classOf[p.id]?.id == controller.own?.id,
                    ),
                  ),
                Positioned(
                  left: 16,
                  right: 16,
                  top: inset.top + 8,
                  child: Row(
                    children: [
                      if (t != null)
                        GlassPress(
                          onTap: () => ShellController.showTab('profile'),
                          child: Glass(
                            height: 44,
                            width: 160,
                            // Frosted, with ink text: over a ribbon the pill can sit on pale hatching as well as colour.
                            padding: const EdgeInsets.only(left: 6, right: 16),
                            child: Row(
                              children: [
                                Avatar(
                                  t.name,
                                  size: 34,
                                  background: AppColors.light.paper,
                                  foreground: AppColors.light.ink,
                                ),
                                const SizedBox(width: 8),
                                Expanded(
                                  child: Column(
                                    mainAxisAlignment: MainAxisAlignment.center,
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        t.name.split(' ').first,
                                        maxLines: 1,
                                        style: AppText.chip(color: context.app.ink, height: 1.05),
                                      ),
                                      Text(
                                        [
                                          subjectName(t.subject),
                                          if (controller.own != null) classLabel(controller.own!),
                                        ].join(' · '),
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                        style: AppText.tiny(color: context.app.ink3, height: 1.05),
                                      ),
                                    ],
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      const Spacer(),
                      GlassIconButton(
                        icon: PhosphorIconsRegular.bell,
                        label: 'menu.notifications'.tr,
                        color: ink,
                        onTap: () => Get.toNamed<void>(AppRoutes.notifications),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 20, 20, 0),
            child: ViewStateView(
              state: controller.state.value,
              onRetry: controller.load,
              errorKey: controller.errorMessage.value,
              child: t == null ? const SizedBox.shrink() : _Body(controller: controller, teacher: t),
            ),
          ),
        ],
      );
    });
  }
}


class _Body extends StatelessWidget {
  const _Body({required this.controller, required this.teacher});

  final TeacherHomeController controller;
  final Teacher teacher;

  @override
  Widget build(BuildContext context) {
    final c = context.app;
    final now = controller.current;
    final next = controller.next;
    final String line;
    if (now != null) {
      line = 'teacher.now_line'.trp({
        'class': classLabel(now.schoolClass!),
        'room': now.slot.room.isEmpty ? now.schoolClass!.room : now.slot.room,
        'until': clockOf(minutesOf(now.slot.end)),
      });
    } else if (next != null) {
      line = 'teacher.next_line'.trp({
        'class': classLabel(next.schoolClass!),
        'room': next.slot.room.isEmpty ? next.schoolClass!.room : next.slot.room,
        'at': clockOf(minutesOf(next.slot.start)),
      });
    } else {
      line = 'teacher.day_done'.tr;
    }
    final focus = now?.schoolClass ?? next?.schoolClass ?? controller.own ?? controller.classes.firstOrNull;
    final ownTaken = controller.own == null ? null : controller.taken(controller.own!.id);
    final tasks = <Widget>[
      if (controller.waitingTotal > 0)
        _Task(
          big: '${controller.waitingTotal}',
          title: 'teacher.to_grade'.tr,
          sub: _gradingLine(controller.grading.first),
          onTap: () => Get.toNamed<void>(AppRoutes.teacherGrade),
        ),
      for (final cls in controller.classes)
        if ((controller.students[cls.id]?.length ?? 0) > (controller.entered[cls.id] ?? 0) &&
            (controller.entered[cls.id] ?? 0) > 0)
          _Task(
            big: '${(controller.students[cls.id]?.length ?? 0) - (controller.entered[cls.id] ?? 0)}',
            title: 'teacher.marks_due'.tr,
            sub: 'teacher.marks_line'.trp({
              'class': classLabel(cls),
              'n': '${controller.entered[cls.id]}',
              'total': '${controller.students[cls.id]?.length ?? 0}',
            }),
            onTap: () => Get.toNamed<void>(_marksRoute(cls.id)),
          ),
      if (controller.leave.isNotEmpty)
        _Task(
          big: '${controller.leave.length}',
          title: controller.leave.length == 1 ? 'teacher.leave_one'.tr : 'teacher.leave_many'.tr,
          sub: '${controller.names[controller.leave.first.studentId] ?? ''} · ${_range(controller.leave.first)}',
          onTap: () => unawaited(showSheet<void>(_LeaveSheet(controller: controller))),
        ),
    ];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Rise(child: Overline(line)),
        const SizedBox(height: 8),
        Rise(index: 1, child: Text(greeting(teacher.name.split(' ').first), style: context.type.h1)),
        const SizedBox(height: 16),
        Rise(
          index: 2,
          child: Row(
            children: [
              for (final (i, a) in [
                (
                  PhosphorIconsBold.check,
                  'teacher.qa_attendance',
                  focus == null ? null : () => Get.toNamed<void>(_attendanceRoute((controller.own ?? focus).id)),
                ),
                (
                  PhosphorIconsRegular.fileText,
                  'teacher.qa_assign',
                  () => Get.toNamed<void>(AppRoutes.teacherAssign, arguments: {'classId': focus?.id}),
                ),
                (
                  PhosphorIconsRegular.pencilSimple,
                  'teacher.qa_grade',
                  () => Get.toNamed<void>(AppRoutes.teacherGrade),
                ),
                (PhosphorIconsRegular.megaphone, 'teacher.qa_notice', () => Get.toNamed<void>(AppRoutes.teacherNotice)),
              ].indexed) ...[
                if (i > 0) const SizedBox(width: 8),
                Expanded(
                  child: Semantics(
                    button: true,
                    label: a.$2.tr,
                    excludeSemantics: true,
                    child: Pressable(
                      onTap: a.$3,
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 16),
                        decoration: BoxDecoration(
                          color: c.paper,
                          borderRadius: BorderRadius.circular(18),
                          border: Border.all(color: c.line),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Icon(a.$1, size: 22, color: c.ink),
                            const SizedBox(height: 8),
                            // Icon and word, like the dock: siblings share one size, and a long word ends in an ellipsis rather than shrinking.
                            Text(a.$2.tr, maxLines: 1, overflow: TextOverflow.ellipsis, style: AppText.tiny(color: c.ink, height: 1.2)),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
              ],
            ],
          ),
        ),
        if (tasks.isNotEmpty) ...[
          Rise(index: 3, child: SectionLabel('teacher.needs_you'.trp({'n': '${tasks.length}'}))),
          Rise(
            index: 4,
            child: EduCard(
              child: Column(
                children: [
                  for (final (i, t) in tasks.indexed) ...[if (i > 0) const Hr(indent: 70), t],
                ],
              ),
            ),
          ),
        ] else ...[
          const SizedBox(height: 20),
          const Rise(
            index: 3,
            child: EmptyState(art: EmptyArt.attendance, title: 'teacher.all_clear', body: 'teacher.all_clear_body'),
          ),
        ],
        if (controller.own != null) ...[
          const SizedBox(height: 10),
          Rise(
            index: 5,
            child: Text(
              ownTaken == null
                  ? 'teacher.attendance_open'.trp({'class': classLabel(controller.own!)})
                  : 'teacher.attendance_taken'.trp({
                      'class': classLabel(controller.own!),
                      'n': '${ownTaken.$1}',
                      'total': '${ownTaken.$2}',
                    }),
              style: context.type.cap,
            ),
          ),
        ],
      ],
    );
  }

  static String _gradingLine(GradingItem g) {
    final oldest = g.waiting.first.submittedAt;
    final days = oldest == null ? 0 : DateUtils.dateOnly(DateTime.now()).difference(DateUtils.dateOnly(oldest)).inDays;
    return [
      g.homework.title,
      if (g.schoolClass != null) classLabel(g.schoolClass!),
      if (days > 0) 'teacher.oldest'.trn(days),
    ].join(' · ');
  }
}

String _range(LeaveRequest l) {
  final same = DateUtils.isSameDay(l.from, l.to);
  if (same) return DateFormat('d MMM').format(l.from);
  return l.from.month == l.to.month
      ? '${l.from.day}–${DateFormat('d MMM').format(l.to)}'
      : '${DateFormat('d MMM').format(l.from)} – ${DateFormat('d MMM').format(l.to)}';
}

class _Task extends StatelessWidget {
  const _Task({required this.big, required this.title, required this.sub, required this.onTap});

  final String big;
  final String title;
  final String sub;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Pressable(
    onTap: onTap,
    scale: .985,
    child: Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: Row(
        children: [
          SizedBox(
            width: 44,
            child: Text(big, maxLines: 1, style: context.type.h2),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: context.type.t),
                Text(sub, style: context.type.cap, maxLines: 2, overflow: TextOverflow.ellipsis),
              ],
            ),
          ),
          Icon(PhosphorIconsRegular.caretRight, size: 16, color: context.app.ink3),
        ],
      ),
    ),
  );
}

class _LeaveSheet extends StatelessWidget {
  const _LeaveSheet({required this.controller});

  final TeacherHomeController controller;

  @override
  Widget build(BuildContext context) => SheetBody(
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SizedBox(height: 16),
        Text('teacher.leave_title'.tr, style: context.type.h2),
        const SizedBox(height: 4),
        for (final l in controller.leave)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(controller.names[l.studentId] ?? '', style: context.type.t),
                Text('${l.reason} · ${_range(l)}', style: context.type.cap),
                if (l.note != null && l.note!.isNotEmpty) ...[
                  const SizedBox(height: 4),
                  Text('“${l.note}”', style: context.type.s),
                ],
                const SizedBox(height: 10),
                Row(
                  children: [
                    Expanded(
                      child: Btn(
                        'teacher.decline',
                        kind: BtnKind.quiet,
                        small: true,
                        expand: true,
                        onPressed: () {
                          Get.back<void>();
                          unawaited(controller.review(l, LeaveStatus.rejected, null));
                        },
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Btn(
                        'teacher.approve',
                        kind: BtnKind.ink,
                        small: true,
                        expand: true,
                        onPressed: () {
                          Get.back<void>();
                          unawaited(controller.review(l, LeaveStatus.approved, null));
                        },
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        const SizedBox(height: 12),
      ],
    ),
  );
}

class TeacherClassesView extends GetView<TeacherHomeController> {
  const TeacherClassesView({super.key});

  @override
  Widget build(BuildContext context) {
    return Obx(() {
      controller.state.value;
      final classes = [...controller.classes]
        ..sort((a, b) {
          if (a.id == controller.own?.id) return -1;
          if (b.id == controller.own?.id) return 1;
          return _firstPeriod(a).compareTo(_firstPeriod(b));
        });
      final total = controller.students.values.fold<int>(0, (s, l) => s + l.length);
      return PageFrame(
        dockPage: true,
        topPadding: MediaQuery.paddingOf(context).top + 14,
        onRefresh: controller.load,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: PageTitle(
                  'teacher.classes',
                  subtitle: controller.classes.isEmpty
                      ? null
                      : 'teacher.classes_sub'.trp({
                          'n': '${controller.classes.length}',
                          'students': '$total',
                          'day': DateFormat('EEEE').format(DateTime.now()),
                        }),
                ),
              ),
              GlassIconButton(
                icon: PhosphorIconsRegular.magnifyingGlass,
                label: 'teacher.search_students'.tr,
                onTap: () => Get.toNamed<void>(AppRoutes.search, arguments: {'scope': 'people'}),
              ),
            ],
          ),
          const SizedBox(height: 16),
          ViewStateView(
            state: controller.state.value,
            onRetry: controller.load,
            errorKey: controller.errorMessage.value,
            emptyArt: EmptyArt.books,
            emptyHint: 'teacher.no_classes_hint',
            emptyTitle: 'teacher.no_classes',
            emptyBody: 'teacher.no_classes_body',
            child: Column(
              children: [
                for (final (i, cls) in classes.indexed) ...[
                  if (i > 0) const SizedBox(height: 12),
                  Rise(
                    index: i,
                    child: _ClassCard(cls: cls, controller: controller),
                  ),
                ],
              ],
            ),
          ),
        ],
      );
    });
  }

  int _firstPeriod(SchoolClass c) {
    final p = controller.today.where((p) => p.schoolClass?.id == c.id).firstOrNull;
    return p == null ? 9999 : minutesOf(p.slot.start);
  }
}

class _ClassCard extends StatelessWidget {
  const _ClassCard({required this.cls, required this.controller});

  final SchoolClass cls;
  final TeacherHomeController controller;

  @override
  Widget build(BuildContext context) {
    final c = context.app;
    final mine = cls.id == controller.own?.id;
    final subject = controller.teacher?.subject ?? 'maths';
    final periods = controller.today.where((p) => p.schoolClass?.id == cls.id).toList();
    final now = nowMinutes();
    final live = periods.where((p) => minutesOf(p.slot.start) <= now && minutesOf(p.slot.end) > now).firstOrNull;
    final upcoming = periods.where((p) => minutesOf(p.slot.start) > now).firstOrNull;
    final done = periods.isNotEmpty && periods.every((p) => minutesOf(p.slot.end) <= now) ? periods.last : null;
    final room = periods.firstOrNull?.slot.room.isNotEmpty ?? false ? periods.first.slot.room : cls.room;
    final count = controller.students[cls.id]?.length ?? cls.studentIds.length;
    final String when;
    if (live != null) {
      when = 'teacher.now_until'.trp({'time': clockOf(minutesOf(live.slot.end))});
    } else if (upcoming != null) {
      when = mine
          ? 'teacher.subject_at'.trp({
              'subject': subjectName(subject),
              'time': clockOf(minutesOf(upcoming.slot.start)),
            })
          : clockOf(minutesOf(upcoming.slot.start));
    } else if (done != null) {
      when = 'teacher.done_at'.trp({'time': clockOf(minutesOf(done.slot.end))});
    } else {
      when = 'teacher.not_today'.tr;
    }
    final taken = controller.taken(cls.id);
    final pigment = AppColors.subject(subject);
    final (Color tile, Color tileOn) = mine
        ? (AppColors.mari, AppColors.mariInk)
        : live != null
        ? (pigment.fill, pigment.on)
        : (c.paper2, c.ink);
    final actions = [
      if (mine) ('teacher.attendance', () => Get.toNamed<void>(_attendanceRoute(cls.id))),
      ('teacher.marks', () => Get.toNamed<void>(_marksRoute(cls.id))),
      ('teacher.homework', () => Get.toNamed<void>(AppRoutes.teacherAssign, arguments: {'classId': cls.id})),
    ];
    return EduCard(
      ring: mine ? AppColors.mari : null,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                Container(
                  width: 64,
                  height: 64,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(color: tile, borderRadius: BorderRadius.circular(18)),
                  child: Text(
                    classLabel(cls).replaceAll(' ', ''),
                    style: AppText.h2(color: tileOn, height: 1),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      if (mine)
                        Row(
                          children: [
                            Flexible(
                              child: Text(
                                'teacher.class_n'.trp({'class': classLabel(cls)}),
                                style: context.type.t,
                              ),
                            ),
                            const SizedBox(width: 8),
                            Stamp('teacher.your_class'.tr, color: c.mariText, size: 9.5),
                          ],
                        )
                      else
                        Text(
                          '${'teacher.class_n'.trp({'class': classLabel(cls)})} · ${subjectName(subject)}',
                          style: context.type.t,
                        ),
                      const SizedBox(height: 2),
                      Text(
                        [
                          if (count > 0) 'teacher.n_students'.trn(count),
                          room,
                          when,
                        ].join(' · '),
                        style: context.type.cap,
                      ),
                      if (mine) ...[
                        const SizedBox(height: 2),
                        Text(
                          taken == null
                              ? 'teacher.attendance_not_taken'.tr
                              : 'teacher.attendance_done'.trp({'n': '${taken.$1}'}),
                          style: AppText.capB(color: taken == null ? (c.dark ? AppColors.blackboard.mariText : AppColors.late) : AppColors.ok),
                        ),
                      ],
                    ],
                  ),
                ),
                if (live != null) Padding(padding: const EdgeInsets.only(left: 8), child: PulseDot(AppColors.ok)),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(92, 0, 16, 16),
            child: Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [
                for (final a in actions)
                  Pressable(
                    onTap: a.$2,
                    child: Container(
                      height: 32,
                      padding: const EdgeInsets.symmetric(horizontal: 12),
                      decoration: BoxDecoration(color: c.paper2, borderRadius: BorderRadius.circular(14)),
                      child: Center(
                        widthFactor: 1,
                        child: Text(a.$1.tr, style: AppText.capB(color: c.ink2, height: 1)),
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

