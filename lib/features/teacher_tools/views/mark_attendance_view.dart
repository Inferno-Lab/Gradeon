import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:get/get.dart';
import 'package:gradeon/core/theme/app_colors.dart';
import 'package:gradeon/core/theme/app_typography.dart';
import 'package:gradeon/core/theme/tokens.dart';
import 'package:gradeon/core/utils/extensions.dart';
import 'package:gradeon/core/widgets/empty_art.dart';
import 'package:gradeon/core/widgets/glass.dart';
import 'package:gradeon/core/widgets/page.dart';
import 'package:gradeon/core/widgets/states.dart';
import 'package:gradeon/core/widgets/ui.dart';
import 'package:gradeon/data/models/academics.dart';
import 'package:gradeon/data/models/student.dart';
import 'package:gradeon/features/teacher_tools/controllers/teacher_controller.dart';
import 'package:gradeon/features/teacher_tools/views/teacher_action_bar.dart';
import 'package:intl/intl.dart';
import 'package:phosphor_flutter/phosphor_flutter.dart';

final _houses = {
  'Emerald': AppColors.ok,
  'Sapphire': AppColors.subject('maths').fill,
  'Ruby': AppColors.subject('hindi').fill,
  'Amber': AppColors.houses[3],
};

class MarkAttendanceView extends GetView<MarkAttendanceController> {
  const MarkAttendanceView({super.key});

  @override
  Widget build(BuildContext context) {
    final c = context.app;
    final late = c.dark ? AppColors.blackboard.mariText : AppColors.late;
    return Obx(() {
      controller.marks.length;
      final cls = controller.schoolClass;
      return PageFrame(
        leading: const BackGlass(),
        actions: [
          GlassPress(
            onTap: controller.allPresent,
            child: Semantics(
              button: true,
              child: Glass(
                height: 44,
                width: 150,
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(PhosphorIconsRegular.arrowCounterClockwise, size: 15, color: c.ink),
                    const SizedBox(width: 6),
                    Flexible(
                      child: Text(
                        'teacher.all_present'.tr,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: AppText.chip(color: c.ink, height: 1),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
        topPadding: MediaQuery.paddingOf(context).top + 60,
        padContent: false,
        bottomBar: controller.students.isEmpty
            ? null
            : Semantics(
                liveRegion: true,
                child: TeacherActionBar(
                  text: Text.rich(
                    TextSpan(
                      children: [
                        TextSpan(text: 'teacher.n_present'.trp({'n': '${controller.present}'})),
                        if (controller.absent > 0)
                          TextSpan(
                            text: ' · ${'teacher.n_absent'.trp({'n': '${controller.absent}'})}',
                            style: TextStyle(color: c.badText),
                          ),
                        if (controller.late > 0)
                          TextSpan(
                            text: ' · ${'teacher.n_late'.trp({'n': '${controller.late}'})}',
                            style: TextStyle(color: late),
                          ),
                      ],
                    ),
                    style: AppText.ts(color: c.ink, height: 1.2, tabular: true),
                  ),
                  action: 'teacher.submit',
                  kind: BtnKind.ink,
                  loading: controller.saving.value,
                  onPressed: controller.saving.value ? null : () => unawaited(controller.submit()),
                ),
              ),
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  cls == null
                      ? 'teacher.attendance'.tr
                      : '${'teacher.class_n'.trp({'class': classLabel(cls)})} · ${DateFormat('EEEE').format(DateTime.now())}',
                  style: context.type.h2,
                ),
                const SizedBox(height: 6),
                Text('teacher.attendance_hint'.tr, style: context.type.cap),
              ],
            ),
          ),
          const SizedBox(height: 16),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: ViewStateView(
              state: controller.state.value,
              onRetry: controller.load,
              errorKey: controller.errorMessage.value,
              emptyArt: EmptyArt.attendance,
            emptyTitle: 'teacher.no_students',
              emptyBody: 'teacher.no_students_body',
              child: LayoutBuilder(
                builder: (context, box) {
                  final cols = box.maxWidth >= 600 ? 6 : 4;
                  final w = (box.maxWidth - 6 * (cols - 1)) / cols;
                  return Wrap(
                    spacing: 6,
                    runSpacing: 4,
                    children: [
                      for (final s in controller.students)
                        SizedBox(
                          width: w,
                          child: _Kid(student: s, mark: controller.marks[s.id], onTap: () => controller.cycle(s.id)),
                        ),
                    ],
                  );
                },
              ),
            ),
          ),
        ],
      );
    });
  }
}

class _Kid extends StatelessWidget {
  const _Kid({required this.student, required this.mark, required this.onTap});

  final Student student;
  final AttendanceStatus? mark;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.app;
    final absent = mark == AttendanceStatus.absent;
    final late = mark == AttendanceStatus.lateArrival;
    final house = _houses[student.house] ?? Avatar.houseFor(student.name);
    final state = absent
        ? 'teacher.absent'.tr
        : late
        ? 'teacher.late'.tr
        : 'teacher.present'.tr;
    return Semantics(
      button: true,
      label: '${student.name}, $state. ${'teacher.tap_to_change'.tr}',
      excludeSemantics: true,
      child: Pressable(
        onTap: onTap,
        child: AnimatedContainer(
          duration: AppMotion.t3,
          curve: const Cubic(.2, .8, .2, 1),
          padding: const EdgeInsets.fromLTRB(2, 8, 2, 6),
          decoration: BoxDecoration(
            color: absent
                ? c.badSoft
                : late
                ? c.lateSoft
                : Colors.transparent,
            borderRadius: BorderRadius.circular(18),
          ),
          child: Column(
            children: [
              Stack(
                clipBehavior: Clip.none,
                children: [
                  AnimatedContainer(
                    duration: AppMotion.t3,
                    width: 52,
                    height: 52,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: absent ? c.paper : house,
                      shape: BoxShape.circle,
                      border: absent ? Border.all(color: AppColors.bad, width: 2.5) : null,
                    ),
                    child: Text(
                      Avatar.initialsOf(student.name),
                      style: AppText.t(color: absent
                            ? AppColors.bad
                            : house == AppColors.houses[3]
                            ? AppColors.mariInk
                            : AppColors.white, height: 1),
                    ),
                  ),
                  if (absent || late)
                    Positioned(
                      right: -3,
                      top: -3,
                      child: Container(
                        width: 22,
                        height: 22,
                        alignment: Alignment.center,
                        decoration: BoxDecoration(
                          color: absent ? AppColors.bad : AppColors.late,
                          shape: BoxShape.circle,
                          border: Border.all(color: c.chalk, width: 2),
                        ),
                        child: Text(absent ? 'A' : 'L', style: AppText.tiny(color: AppColors.white)),
                      ),
                    ),
                ],
              ),
              const SizedBox(height: 6),
              Text(
                student.name.split(' ').first,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                textAlign: TextAlign.center,
                style: AppText.capB(color: c.ink, height: 1.1),
              ),
              Text('teacher.roll'.trp({'n': student.rollNo}), style: context.type.tiny),
            ],
          ),
        ),),
    );
  }
}

// ───────────────────────────── Assign homework ─────────────────────────────
