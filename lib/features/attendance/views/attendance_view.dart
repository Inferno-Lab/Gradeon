import 'dart:async';

import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:gradeon/core/routes/app_routes.dart';
import 'package:gradeon/core/theme/app_colors.dart';
import 'package:gradeon/core/theme/app_typography.dart';
import 'package:gradeon/core/theme/tokens.dart';
import 'package:gradeon/core/utils/extensions.dart';
import 'package:gradeon/core/utils/schedule.dart';
import 'package:gradeon/core/widgets/empty_art.dart';
import 'package:gradeon/core/widgets/glass.dart';
import 'package:gradeon/core/widgets/page.dart';
import 'package:gradeon/core/widgets/sheets.dart';
import 'package:gradeon/core/widgets/states.dart';
import 'package:gradeon/core/widgets/ui.dart';
import 'package:gradeon/data/models/academics.dart';
import 'package:gradeon/features/attendance/controllers/attendance_controller.dart';
import 'package:gradeon/features/dashboard/views/dashboard_view.dart';
import 'package:intl/intl.dart';
import 'package:phosphor_flutter/phosphor_flutter.dart';

class AttendanceView extends GetView<AttendanceController> {
  const AttendanceView({super.key});

  @override
  Widget build(BuildContext context) {
    return Obx(() {
      final month = controller.focused.value;
      controller.picked.value;
      return PageFrame(
        leading: const BackGlass(),
        actions: [
          Glass(
            height: 44,
            width: 200,
            padding: const EdgeInsets.symmetric(horizontal: 4),
            child: Row(
              children: [
                _MonthArrow(
                  icon: PhosphorIconsBold.caretLeft,
                  label: 'attendance.prev_month',
                  onTap: () => controller.shiftMonth(-1),
                ),
                Expanded(
                  child: Text(
                    DateFormat('MMMM y').format(month),
                    textAlign: TextAlign.center,
                    style: anek(15.5, 680, height: 1, color: context.app.ink),
                  ),
                ),
                _MonthArrow(
                  icon: PhosphorIconsBold.caretRight,
                  label: 'attendance.next_month',
                  onTap: controller.canGoForward ? () => controller.shiftMonth(1) : null,
                ),
              ],
            ),
          ),
        ],
        onRefresh: controller.load,
        children: [
          ViewStateView(
            state: controller.state.value,
            onRetry: controller.load,
            errorKey: controller.errorMessage.value,
            emptyTitle: 'attendance.empty',
            emptyBody: 'attendance.empty_body',
            emptyArt: EmptyArt.attendance,
            emptyHint: 'attendance.empty_hint',
            child: _Body(controller: controller),
          ),
        ],
      );
    });
  }
}

class _MonthArrow extends StatelessWidget {
  const _MonthArrow({required this.icon, required this.label, required this.onTap});

  final IconData icon;
  final String label;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) => Semantics(
    button: true,
    label: label.tr,
    enabled: onTap != null,
    child: GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: onTap,
      child: SizedBox(
        width: 40,
        height: 44,
        child: Icon(icon, size: 16, color: context.app.ink.withValues(alpha: onTap == null ? .35 : 1)),
      ),
    ),
  );
}

class _Body extends StatelessWidget {
  const _Body({required this.controller});

  final AttendanceController controller;

  @override
  Widget build(BuildContext context) {
    final c = context.app;
    final s = controller.summary;
    final now = DateTime.now();
    final thisMonth = controller.focused.value.month == now.month && controller.focused.value.year == now.year;
    final marked = controller.monthDays;
    final problems =
        marked.where((d) => d.status == AttendanceStatus.absent || d.status == AttendanceStatus.lateArrival).toList()
          ..sort((a, b) => b.date.compareTo(a.date));
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Rise(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Expanded(
                child: BigNumber(value: '${s.percent.round()}', unit: '%', size: 68),
              ),
              if (thisMonth && controller.streak > 0)
                Padding(
                  padding: const EdgeInsets.only(bottom: 6),
                  child: Chip2(
                    'academics.streak'.trp({'n': '${controller.streak}'}),
                    icon: PhosphorIconsRegular.flame,
                    background: c.mariSoft,
                    foreground: c.mariText,
                  ),
                ),
            ],
          ),
        ),
        const SizedBox(height: 10),
        Rise(
          index: 1,
          child: Text(
            'attendance.summary_line'.trp({
                  'p': '${s.present}',
                  'a': '${s.absent}',
                  'l': '${s.lateCount}',
                  'h': '${s.holiday}',
                }) +
                (thisMonth ? ' ${'attendance.so_far'.tr}' : ''),
            style: context.type.s,
          ),
        ),
        const SizedBox(height: 18),
        Rise(index: 2, child: _Calendar(controller: controller)),
        const SizedBox(height: 14),
        Rise(
          index: 3,
          child: Wrap(
            spacing: 14,
            runSpacing: 8,
            children: [
              _Legend(
                tile: const _Tile(status: AttendanceStatus.present, small: true),
                label: 'attendance.present'.tr,
              ),
              _Legend(
                tile: const _Tile(status: AttendanceStatus.absent, small: true),
                label: 'attendance.absent'.tr,
              ),
              _Legend(
                tile: const _Tile(status: AttendanceStatus.lateArrival, small: true),
                label: 'attendance.late'.tr,
              ),
              _Legend(
                tile: const _Tile(status: AttendanceStatus.holiday, small: true),
                label: 'attendance.holiday'.tr,
              ),
            ],
          ),
        ),
        const SizedBox(height: 18),
        if (problems.isEmpty)
          EduCard(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                const Icon(PhosphorIconsRegular.checkCircle, color: AppColors.ok),
                const SizedBox(width: 12),
                Expanded(child: Text('attendance.none'.tr, style: context.type.t)),
              ],
            ),
          ),
        for (var i = 0; i < problems.length; i++)
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: Rise(
              index: 4 + i,
              child: _ProblemCard(day: problems[i], controller: controller),
            ),
          ),
      ],
    );
  }
}

class _Legend extends StatelessWidget {
  const _Legend({required this.tile, required this.label});

  final Widget tile;
  final String label;

  @override
  Widget build(BuildContext context) => Row(
    mainAxisSize: MainAxisSize.min,
    children: [
      tile,
      const SizedBox(width: 6),
      Text(label, style: context.type.cap),
    ],
  );
}

/// Status tile: tint for present, solid for absent, notch for late, hatch for holidays.
class _Tile extends StatelessWidget {
  const _Tile({required this.status, this.small = false, this.day, this.future = false, this.today = false});

  final AttendanceStatus? status;
  final bool small;
  final int? day;
  final bool future;
  final bool today;

  @override
  Widget build(BuildContext context) {
    final c = context.app;
    final size = small ? 12.0 : null;
    final radius = BorderRadius.circular(small ? 4 : 12);
    final label = day == null
        ? null
        : Text(
            '$day',
            style: anek(
              15,
              future ? 520 : 640,
              height: 1,
              tabular: true,
              color: switch (status) {
                AttendanceStatus.present => AppColors.ok,
                AttendanceStatus.absent => AppColors.white,
                AttendanceStatus.lateArrival => c.lateText,
                _ => c.ink3,
              },
            ),
          );
    final todayRing = today ? Border.all(color: c.ink, width: 2) : null;
    switch (status) {
      case AttendanceStatus.holiday:
        return SizedBox(
          width: size,
          height: size ?? 44,
          child: Hatch(
            radius: radius,
            child: DecoratedBox(
              decoration: BoxDecoration(
                borderRadius: radius,
                border: small ? Border.all(color: c.line2) : todayRing,
              ),
              child: Center(child: label),
            ),
          ),
        );
      case AttendanceStatus.lateArrival:
        return Container(
          width: size,
          height: size ?? 44,
          decoration: BoxDecoration(
            borderRadius: radius,
            border: todayRing,
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [AppColors.late, AppColors.late, c.lateSoft, c.lateSoft],
              stops: small ? const [0, .35, .35, 1] : const [0, .26, .26, 1],
            ),
          ),
          alignment: Alignment.center,
          child: label,
        );
      case null:
        return Container(
          width: size,
          height: size ?? 44,
          decoration: BoxDecoration(
            borderRadius: radius,
            border: todayRing ?? Border.all(color: c.line),
          ),
          alignment: Alignment.center,
          child: label,
        );
      case AttendanceStatus.present || AttendanceStatus.absent:
        final absent = status == AttendanceStatus.absent;
        return Container(
          width: size,
          height: size ?? 44,
          decoration: BoxDecoration(
            color: absent ? AppColors.bad : c.okSoft,
            borderRadius: radius,
            border: todayRing ?? (small && !absent ? Border.all(color: AppColors.ok, width: 1.5) : null),
          ),
          alignment: Alignment.center,
          child: label,
        );
    }
  }
}

class _Calendar extends StatelessWidget {
  const _Calendar({required this.controller});

  final AttendanceController controller;

  @override
  Widget build(BuildContext context) {
    final month = controller.focused.value;
    final first = DateTime(month.year, month.month);
    final daysIn = DateTime(month.year, month.month + 1, 0).day;
    final lead = first.weekday - 1;
    final today = DateTime.now().dateOnly;
    final cells = lead + daysIn;
    final rows = (cells / 7).ceil();
    final picked = controller.picked.value;
    const weekdays = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
    return LayoutBuilder(
      builder: (context, box) {
        const gap = 6.0;
        final cell = (box.maxWidth - gap * 6) / 7;
        final pickedIndex = picked == null ? null : lead + picked.day - 1;
        return Column(
          children: [
            Row(
              children: [
                for (var i = 0; i < 7; i++)
                  SizedBox(
                    width: cell + (i < 6 ? gap : 0),
                    child: Padding(
                      padding: EdgeInsets.only(right: i < 6 ? gap : 0),
                      child: Text(
                        weekdays[i],
                        textAlign: TextAlign.center,
                        style: anek(11, 700, em: .08, color: context.app.ink3),
                      ),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 6),
            SizedBox(
              height: rows * 44 + (rows - 1) * gap,
              child: Stack(
                clipBehavior: Clip.none,
                children: [
                  for (var i = 0; i < cells; i++)
                    if (i >= lead)
                      Positioned(
                        left: (i % 7) * (cell + gap),
                        top: (i ~/ 7) * (44 + gap),
                        width: cell,
                        height: 44,
                        child: _DayCell(
                          date: DateTime(month.year, month.month, i - lead + 1),
                          today: today,
                          controller: controller,
                        ),
                      ),
                  if (pickedIndex != null)
                    AnimatedPositioned(
                      duration: context.reduceMotion ? Duration.zero : AppDurations.medium,
                      curve: kSpring,
                      left: (pickedIndex % 7) * (cell + gap) + cell / 2 - 28,
                      top: (pickedIndex ~/ 7) * (44 + gap) - 6,
                      width: 56,
                      height: 56,
                      child: IgnorePointer(
                        child: DecoratedBox(
                          decoration: BoxDecoration(
                            borderRadius: BorderRadius.circular(18),
                            border: Border.all(color: context.app.ink, width: 2),
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ],
        );
      },
    );
  }
}

class _DayCell extends StatelessWidget {
  const _DayCell({required this.date, required this.today, required this.controller});

  final DateTime date;
  final DateTime today;
  final AttendanceController controller;

  @override
  Widget build(BuildContext context) {
    final record = controller.on(date);
    final future = date.isAfter(today);
    final off = isWeeklyOff(date);
    final status = record?.status ?? (off ? AttendanceStatus.holiday : null);
    final label =
        '${DateFormat('d MMMM').format(date)}, ${switch (status) {
          AttendanceStatus.present => 'attendance.present'.tr,
          AttendanceStatus.absent => 'attendance.absent'.tr,
          AttendanceStatus.lateArrival => 'attendance.late'.tr,
          AttendanceStatus.holiday => 'attendance.holiday'.tr,
          null => future ? 'attendance.upcoming'.tr : 'attendance.not_marked'.tr,
        }}';
    return Semantics(
      button: true,
      label: label,
      child: GestureDetector(
        onTap: () {
          controller.picked.value = date;
          if (record != null && record.status != AttendanceStatus.holiday) unawaited(_openDay(record));
        },
        child: Opacity(
          opacity: future && off ? .6 : 1,
          child: _Tile(
            status: future && !off ? null : status,
            day: date.day,
            future: future,
            today: date.isSameDay(today),
          ),
        ),
      ),
    );
  }

  Future<void> _openDay(AttendanceDay record) =>
      showSheet<void>(AttendanceDaySheet(day: record, controller: controller));
}

class _ProblemCard extends StatelessWidget {
  const _ProblemCard({required this.day, required this.controller});

  final AttendanceDay day;
  final AttendanceController controller;

  @override
  Widget build(BuildContext context) {
    final absent = day.status == AttendanceStatus.absent;
    final leave = controller.leaveFor(day.date);
    final weekday = DateFormat('EEEE').format(day.date);
    return EduCard(
      padding: const EdgeInsets.all(14),
      onTap: () => showSheet<void>(AttendanceDaySheet(day: day, controller: controller)),
      child: Row(
        children: [
          SizedBox(
            width: 44,
            child: _Tile(status: day.status, day: day.date.day),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  (absent ? 'attendance.absent_on' : 'attendance.late_on').trp({'day': weekday}),
                  style: context.type.t,
                ),
                const SizedBox(height: 2),
                Text(
                  absent
                      ? (leave == null
                            ? 'attendance.no_reason'.tr
                            : 'attendance.leave_sent'.trp({'reason': leave.reason}))
                      : 'attendance.late_note'.tr,
                  style: context.type.cap,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
          if (absent && leave == null)
            Btn('attendance.explain', kind: BtnKind.quiet, small: true, onPressed: () => _explain(day.date)),
        ],
      ),
    );
  }
}

void _explain(DateTime date) {
  unawaited(Get.toNamed<void>(AppRoutes.leaveApply, arguments: {'past': date}));
}

/// Sheet for one marked day: what happened, classes missed, what to do next.
class AttendanceDaySheet extends StatelessWidget {
  const AttendanceDaySheet({required this.day, required this.controller, super.key});

  final AttendanceDay day;
  final AttendanceController controller;

  @override
  Widget build(BuildContext context) {
    final c = context.app;
    final absent = day.status == AttendanceStatus.absent;
    final leave = controller.leaveFor(day.date);
    final missed = absent ? controller.classesOn(day.date) : const <PeriodSlot>[];
    final name = controller.student?.name.split(' ').first ?? '';
    return SheetBody(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SizedBox(height: 18),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Overline(DateFormat('EEEE · d MMMM').format(day.date)),
                    const SizedBox(height: 8),
                    Text(
                      (absent ? 'attendance.absent_all_day' : 'attendance.late_arrival').tr,
                      style: context.type.h2,
                    ),
                  ],
                ),
              ),
              if (absent)
                Stamp(
                  leave == null ? 'attendance.no_reason_stamp'.tr : 'leave.status_${leave.status.name}'.tr,
                  color: leave == null ? c.badText : AppColors.ok,
                ),
            ],
          ),
          const SizedBox(height: 12),
          Text(
            (absent ? 'attendance.absent_body' : 'attendance.late_body').trp({
              'teacher': controller.classTeacher ?? 'attendance.class_teacher'.tr,
              'name': name,
            }),
            style: context.type.s,
          ),
          if (missed.isNotEmpty) ...[
            SectionLabel('attendance.classes_missed'.trp({'n': '${missed.length}'}), top: 20),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
              decoration: BoxDecoration(color: c.paper2, borderRadius: BorderRadius.circular(AppRadius.card)),
              child: Column(
                children: [
                  for (final p in missed.take(3))
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 9),
                      child: Row(
                        children: [
                          Cover(subject: p.subject),
                          const SizedBox(width: 12),
                          Expanded(child: Text(subjectName(p.subject), style: context.type.t)),
                          Text(clockOf(minutesOf(p.start)), style: context.type.mono),
                        ],
                      ),
                    ),
                  if (missed.length > 3)
                    Align(
                      alignment: Alignment.centerLeft,
                      child: Padding(
                        padding: const EdgeInsets.fromLTRB(0, 4, 0, 10),
                        child: Text(
                          '+ ${missed.skip(3).map((p) => subjectName(p.subject)).join(', ')}',
                          style: context.type.cap,
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ],
          const SizedBox(height: 24),
          if (absent)
            Row(
              children: [
                Expanded(
                  child: Btn(
                    'attendance.ask_notes',
                    kind: BtnKind.quiet,
                    expand: true,
                    onPressed: () {
                      Get.back<void>();
                      unawaited(Get.toNamed<void>(AppRoutes.chat));
                    },
                  ),
                ),
                if (leave == null) ...[
                  const SizedBox(width: 10),
                  Expanded(
                    flex: 13,
                    child: Btn(
                      'attendance.explain_absence',
                      expand: true,
                      onPressed: () {
                        Get.back<void>();
                        _explain(day.date);
                      },
                    ),
                  ),
                ],
              ],
            ),
          const SizedBox(height: 12),
        ],
      ),
    );
  }
}
