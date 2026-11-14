import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:get/get.dart';
import 'package:gradeon/core/theme/app_colors.dart';
import 'package:gradeon/core/theme/tokens.dart';
import 'package:gradeon/core/utils/extensions.dart';
import 'package:gradeon/core/widgets/app_icons.dart';
import 'package:gradeon/core/widgets/empty_kit.dart';
import 'package:gradeon/core/widgets/page.dart';
import 'package:gradeon/core/widgets/states.dart';
import 'package:gradeon/core/widgets/ui.dart';
import 'package:gradeon/data/models/academics.dart';
import 'package:gradeon/data/models/student.dart';
import 'package:gradeon/features/teacher_tools/controllers/teacher_controller.dart';
import 'package:gradeon/features/teacher_tools/views/teacher_action_bar.dart';
import 'package:intl/intl.dart';
import 'package:gradeon/core/utils/clock.dart';

/// The avatar colours of the RollCall board: a spectrum colour per name, steady between visits.
const _avatar = ['blue', 'pink', 'amber', 'lime', 'teal', 'violet', 'cyan', 'orange'];

class MarkAttendanceView extends GetView<MarkAttendanceController> {
  const MarkAttendanceView({super.key});

  @override
  Widget build(BuildContext context) {
    final c = context.app;
    final mode = c.dark ? 'dark' : 'light';
    return Obx(() {
      controller.marks.length;
      final cls = controller.schoolClass;
      final n = controller.students.length;
      return PageFrame(
        leading: const BackGlass(close: true),
        actions: [if (n > 0) Chip2('teacher.all_present'.tr, onTap: controller.allPresent)],
        topPadding: MediaQuery.paddingOf(context).top + 60,
        onRefresh: controller.load,
        edgeBar: true,
        bottomBar: n == 0
            ? null
            : Semantics(
                liveRegion: true,
                child: TeacherActionBar(
                  text: Text('teacher.n_of_n'.trp({'n': '$n', 'total': '$n'})),
                  sub: 'teacher.marked'.tr,
                  action: 'teacher.save_roll',
                  loading: controller.saving.value,
                  onPressed: controller.saving.value ? null : () => unawaited(controller.submit()),
                ),
              ),
        children: [
          // As the RollCall board: the class and the count on the school's deep colour, the names on the sheet.
          Builder(
            builder: (context) => Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  cls == null ? 'teacher.attendance'.tr : 'teacher.class_n'.trp({'class': classLabel(cls)}),
                  style: context.type.h2,
                ),
                Text(DateFormat('EEEE d MMMM').format(Clock.now()), style: context.type.s),
                if (n > 0) ...[
                  const SizedBox(height: 16),
                  Row(
                    children: [
                      _Count('teacher.present_t', controller.present, c.bright),
                      const SizedBox(width: 24),
                      _Count('teacher.absent_t', controller.absent, AppPalette.of(mode, 'bad-d')),
                      const SizedBox(width: 24),
                      _Count('teacher.late_t', controller.late, AppPalette.of(mode, 'warn-d')),
                    ],
                  ),
                  const SizedBox(height: 12),
                  ClipRRect(
                    borderRadius: BorderRadius.circular(AppRadius.xs),
                    child: SizedBox(
                      height: 10,
                      child: Row(
                        children: [
                          for (final (v, colour) in [
                            (controller.present, c.bright),
                            (controller.absent, AppPalette.of(mode, 'bad-d')),
                            (controller.late, AppPalette.of(mode, 'warn-d')),
                          ])
                            if (v > 0) Expanded(flex: v, child: ColoredBox(color: colour)),
                        ],
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ),
          ViewStateView(
            state: controller.state.value,
            onRetry: controller.load,
            errorKey: controller.errorMessage.value,
            emptyArt: EmptyArt.rollCall,
            emptyTitle: 'teacher.no_students',
            emptyBody: 'teacher.no_students_body',
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text('teacher.attendance_hint'.tr, style: context.type.s),
                const SizedBox(height: 8),
                for (final (i, s) in controller.students.indexed)
                  _Kid(student: s, first: i == 0, mark: controller.marks[s.id], onTap: () => controller.cycle(s.id)),
              ],
            ),
          ),
        ],
      );
    });
  }
}

class _Count extends StatelessWidget {
  const _Count(this.label, this.n, this.colour);

  final String label;
  final int n;
  final Color colour;

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Text(label.tr, style: context.type.capB),
      Text('$n', style: context.type.h1.copyWith(color: colour)),
    ],
  );
}

class _Kid extends StatelessWidget {
  const _Kid({required this.student, required this.first, required this.mark, required this.onTap});

  final Student student;
  final bool first;
  final AttendanceStatus? mark;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.app;
    final (label, soft, ink, icon) = switch (mark) {
      AttendanceStatus.absent => ('teacher.absent_t', c.badSoft, c.badText, AppIcons.absent),
      AttendanceStatus.lateArrival => ('teacher.late_t', c.lateSoft, c.lateText, AppIcons.late),
      _ => ('teacher.present_t', c.okSoft, c.okText, AppIcons.present),
    };
    final av = c.spectrumFor(_avatar[student.name.hashCode.abs() % _avatar.length]);
    return Semantics(
      button: true,
      label: '${student.name}, ${label.tr}. ${'teacher.tap_to_change'.tr}',
      excludeSemantics: true,
      child: Pressable(
        onTap: onTap,
        child: Container(
          constraints: const BoxConstraints(minHeight: 56),
          padding: const EdgeInsets.symmetric(vertical: 8),
          decoration: BoxDecoration(border: first ? null : Border(top: BorderSide(color: c.line))),
          child: Row(
            children: [
              Container(
                width: 36,
                height: 36,
                alignment: Alignment.center,
                decoration: BoxDecoration(color: av.soft, shape: BoxShape.circle),
                child: Text(Avatar.initialsOf(student.name), style: context.type.capB.copyWith(color: av.ink)),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(student.name, maxLines: 1, overflow: TextOverflow.ellipsis, style: context.type.t),
                    Text('teacher.roll'.trp({'n': student.rollNo}), style: context.type.s),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              AnimatedContainer(
                duration: AppMotion.t2,
                curve: kEase,
                height: 40,
                constraints: const BoxConstraints(minWidth: 104),
                padding: const EdgeInsets.symmetric(horizontal: 12),
                decoration: BoxDecoration(color: soft, borderRadius: BorderRadius.circular(AppRadius.md)),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(icon, size: 16, color: ink),
                    const SizedBox(width: 6),
                    Text(label.tr, style: context.type.ts.copyWith(color: ink)),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ───────────────────────────── Assign homework ─────────────────────────────
