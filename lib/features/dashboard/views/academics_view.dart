import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:gradeon/core/routes/app_routes.dart';
import 'package:gradeon/core/theme/app_colors.dart';
import 'package:gradeon/core/theme/app_typography.dart';
import 'package:gradeon/core/theme/tokens.dart';
import 'package:gradeon/core/utils/extensions.dart';
import 'package:gradeon/core/utils/formatters.dart';
import 'package:gradeon/core/utils/schedule.dart';
import 'package:gradeon/core/utils/view_state.dart';
import 'package:gradeon/core/widgets/empty_kit.dart';
import 'package:gradeon/core/widgets/glass.dart';
import 'package:gradeon/core/widgets/page.dart';
import 'package:gradeon/core/widgets/states.dart';
import 'package:gradeon/core/widgets/ui.dart';
import 'package:gradeon/features/dashboard/controllers/academics_controller.dart';
import 'package:gradeon/features/shell/shell_controller.dart';
import 'package:intl/intl.dart';
import 'package:phosphor_flutter/phosphor_flutter.dart';

class AcademicsView extends GetView<AcademicsController> {
  const AcademicsView({super.key});

  @override
  Widget build(BuildContext context) {
    return Obx(() {
      final state = controller.state.value;
      final selected = controller.selected.value;
      return PageFrame(
        dockPage: true,
        onRefresh: controller.load,
        topPadding: MediaQuery.paddingOf(context).top + 14,
        children: [
          // The title and the subjects on the school's deep colour; the chosen subject is in its bright colour.
          Builder(
            builder: (context) => Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  children: [
                    Expanded(child: Text('nav.academics'.tr, style: context.type.h1)),
                    GlassIconButton(
                      icon: PhosphorIconsRegular.magnifyingGlass,
                      label: 'common.search'.tr,
                      onTap: () => Get.toNamed<void>(AppRoutes.search),
                    ),
                  ],
                ),
                if (state == ViewState.success && controller.shelf.isNotEmpty) ...[
                  const SizedBox(height: 16),
                  _Shelf(controller: controller, selected: selected),
                ],
              ],
            ),
          ),
          ViewStateView(
            state: state,
            onRetry: controller.load,
            errorKey: controller.errorMessage.value,
            emptyTitle: 'academics.empty',
            emptyBody: 'academics.empty_body',
            emptyArt: EmptyArt.results,
            emptyHint: 'academics.empty_hint',
            emptyActions: [EmptyAction('common.ask_teacher', icon: PhosphorIconsRegular.chatCircle, onTap: () => ShellController.showTab('chat'))],
            child: controller.shelf.isEmpty
                ? const SizedBox.shrink()
                : Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Rise(
                        child: _SubjectCard(item: controller.shelf[selected], examName: controller.latestExam?.name),
                      ),
                      Rise(index: 2, child: SectionLabel('academics.records'.tr)),
                      Rise(index: 3, child: _Records(controller: controller)),
                    ],
                  ),
          ),
        ],
      );
    });
  }
}

class _Shelf extends StatelessWidget {
  const _Shelf({required this.controller, required this.selected});

  final AcademicsController controller;
  final int selected;

  @override
  Widget build(BuildContext context) {
    final c = context.app;
    return SizedBox(
      height: 96,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        clipBehavior: Clip.none,
        itemCount: controller.shelf.length,
        separatorBuilder: (_, _) => const SizedBox(width: 8),
        itemBuilder: (context, i) {
          final item = controller.shelf[i];
          final on = i == selected;
          final ink = on ? c.onBright : c.ink;
          return Semantics(
            button: true,
            selected: on,
            label: subjectName(item.subject),
            child: Pressable(
              onTap: () => controller.selected.value = i,
              child: AnimatedContainer(
                duration: AppMotion.t2,
                curve: kEase,
                width: 104,
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(color: on ? c.bright : c.paper, borderRadius: BorderRadius.circular(AppRadius.field)),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(item.mark?.grade ?? '—', style: context.type.h2.copyWith(color: ink)),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(subjectName(item.subject), maxLines: 1, overflow: TextOverflow.ellipsis, style: context.type.capB.copyWith(color: ink)),
                        Text(
                          item.pending.isEmpty ? ' ' : 'academics.n_due'.trp({'n': '${item.pending.length}'}),
                          maxLines: 1,
                          style: context.type.tiny.copyWith(color: on ? ink : c.ink2),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}

class _SubjectCard extends StatelessWidget {
  const _SubjectCard({required this.item, required this.examName});

  final SubjectShelf item;
  final String? examName;

  @override
  Widget build(BuildContext context) {
    final c = context.app;
    final pigment = AppColors.subject(item.subject).fill;
    final next = item.nextToday;
    final line = next != null
        ? 'academics.next_today'.trp({'time': clockOf(minutesOf(next.start)), 'room': next.room})
        : item.nextDay != null
        ? 'academics.next_on'.trp({'day': 'day.${item.nextDay}'.tr})
        : 'academics.no_class'.tr;
    final hw = item.pending.firstOrNull;
    return EduCard(
      padding: const EdgeInsets.all(16),
      onTap: () => Get.toNamed<void>(AppRoutes.results),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Overline(
                  item.teacher == null ? subjectName(item.subject) : '${subjectName(item.subject)} · ${item.teacher}',
                  color: c.dark ? Color.lerp(pigment, AppColors.white, .45) : pigment,
                ),
              ),
              if (item.mark != null && examName != null)
                Stamp(
                  'academics.grade_in'.trp({'grade': item.mark!.grade, 'exam': examName!}),
                  color: AppColors.ok,
                ),
            ],
          ),
          const SizedBox(height: 10),
          Text(line, style: context.type.h3),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              if (hw != null)
                Chip2(
                  '${hw.title} · ${Formatters.countdown(hw.dueOn).trp({'count': '${Formatters.daysUntil(hw.dueOn)}'}).toLowerCase()}',
                  dot: AppColors.late,
                  onTap: () => Get.toNamed<void>(AppRoutes.homeworkDetail.replaceFirst(':id', hw.id)),
                ),
              if (item.mark != null) Chip2('${item.mark!.marks} / ${item.mark!.maxMarks}'),
            ],
          ),
        ],
      ),
    );
  }
}

class _Records extends StatelessWidget {
  const _Records({required this.controller});

  final AcademicsController controller;

  @override
  Widget build(BuildContext context) {
    final summary = controller.summary;
    final latest = controller.latest;
    final prev = controller.previous;
    final delta = latest != null && prev != null ? (latest.overallPercent - prev.overallPercent).round() : null;
    final now = controller.now;
    final next = controller.next;
    final rows = [
      (
        '${summary?.percent.round() ?? 0}%',
        'attendance.title'.tr,
        '${DateFormat('MMMM').format(DateTime.now())} · ${'academics.streak'.trn(controller.streak)}',
        AppRoutes.attendance,
      ),
      (
        '${controller.due.length}',
        'home.homework'.tr,
        controller.due.isEmpty
            ? 'home.nothing_due'.tr
            : 'academics.next_hw'.trp({
                'title': controller.due.first.title,
                'when': Formatters.countdown(
                  controller.due.first.dueOn,
                ).trp({'count': '${Formatters.daysUntil(controller.due.first.dueOn)}'}).toLowerCase(),
              }),
        AppRoutes.homework,
      ),
      (
        now == null ? '—' : clockOf(minutesOf(now.start)),
        'timetable.title'.tr,
        now == null
            ? 'academics.no_class_now'.tr
            : '${'home.subject_now'.trp({'subject': subjectName(now.subject)})}${next == null ? '' : ' · ${'academics.at'.trp({'subject': subjectName(next.subject), 'time': clockOf(minutesOf(next.start))})}'}',
        AppRoutes.timetable,
      ),
      (
        latest == null ? '—' : '${latest.overallPercent.round()}%',
        'results.title'.tr,
        latest == null
            ? 'results.none'.tr
            : 'academics.results_line'.trp({
                    'exam': controller.latestExam?.name ?? '',
                    'rank': '${latest.rank}',
                    'total': '${latest.totalStudents}',
                  }) +
                  (delta == null || delta == 0
                      ? ''
                      : ' · ${(delta > 0 ? 'academics.up' : 'academics.down').trp({'n': '${delta.abs()}'})}'),
        AppRoutes.results,
      ),
    ];
    return EduCard(
      child: Column(
        children: [
          for (var i = 0; i < rows.length; i++) ...[
            if (i > 0) const Hr(indent: 104),
            Pressable(
              onTap: () => Get.toNamed<void>(rows[i].$4),
              scale: .985,
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                child: Row(
                  children: [
                    SizedBox(
                      width: 76,
                      child: Text(
                        rows[i].$1,
                        maxLines: 1,
                        style: rows[i].$1.length > 4 ? AppText.h3(height: 1, color: context.app.ink) : AppText.h2(height: 1, color: context.app.ink),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(rows[i].$2, style: context.type.t),
                          Text(rows[i].$3, maxLines: 1, overflow: TextOverflow.ellipsis, style: context.type.cap),
                        ],
                      ),
                    ),
                    Icon(PhosphorIconsRegular.caretRight, size: 18, color: context.app.ink3),
                  ],
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}
