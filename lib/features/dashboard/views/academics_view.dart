import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:gradeon/core/routes/app_routes.dart';
import 'package:gradeon/core/theme/app_colors.dart';
import 'package:gradeon/core/theme/app_typography.dart';
import 'package:gradeon/core/theme/tokens.dart';
import 'package:gradeon/core/utils/extensions.dart';
import 'package:gradeon/core/utils/formatters.dart';
import 'package:gradeon/core/utils/schedule.dart';
import 'package:gradeon/core/widgets/empty_art.dart';
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
          ViewStateView(
            state: state,
            onRetry: controller.load,
            errorKey: controller.errorMessage.value,
            emptyTitle: 'academics.empty',
            emptyBody: 'academics.empty_body',
            emptyArt: EmptyArt.books,
            emptyHint: 'academics.empty_hint',
            emptyActions: [EmptyAction('common.ask_teacher', icon: PhosphorIconsRegular.chatCircle, onTap: () => ShellController.showTab('chat'))],
            child: controller.shelf.isEmpty
                ? const SizedBox.shrink()
                : Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _Shelf(controller: controller, selected: selected),
                      const SizedBox(height: 22),
                      Rise(
                        index: 1,
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
    return SizedBox(
      height: 206,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          Positioned(
            left: -20,
            right: -20,
            top: 172,
            height: 8,
            child: DecoratedBox(
              decoration: BoxDecoration(color: context.app.line2, borderRadius: BorderRadius.circular(2)),
            ),
          ),
          Positioned.fill(
            bottom: 34,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              clipBehavior: Clip.none,
              padding: const EdgeInsets.only(top: 20),
              itemCount: controller.shelf.length,
              separatorBuilder: (_, _) => const SizedBox(width: 10),
              itemBuilder: (context, i) => Align(
                alignment: Alignment.bottomCenter,
                child: _Book(
                  item: controller.shelf[i],
                  raised: i == selected,
                  onTap: () => controller.selected.value = i,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _Book extends StatelessWidget {
  const _Book({required this.item, required this.raised, required this.onTap});

  final SubjectShelf item;
  final bool raised;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final pigment = AppColors.subject(item.subject);
    return Semantics(
      button: true,
      selected: raised,
      label: subjectName(item.subject),
      child: GestureDetector(
        onTap: onTap,
        child: AnimatedContainer(
          duration: AppDurations.medium,
          curve: kSpring,
          transform: Matrix4.translationValues(0, raised ? -16 : 0, 0),
          width: 82,
          height: 152,
          padding: const EdgeInsets.fromLTRB(16, 12, 10, 12),
          decoration: BoxDecoration(
            color: pigment.fill,
            borderRadius: const BorderRadius.horizontal(left: Radius.circular(6), right: Radius.circular(16)),
            boxShadow: const [
              BoxShadow(color: Color(0x8010201B), blurRadius: 18, spreadRadius: -12, offset: Offset(0, 10)),
            ],
          ),
          foregroundDecoration: spineDecoration,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(item.mark?.grade ?? '—', style: anek(24, 760, width: 120, height: 1, color: pigment.on)),
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Long names ("Social studies", "Computer") shrink; never split mid-word.
                  FittedBox(
                    fit: BoxFit.scaleDown,
                    alignment: Alignment.centerLeft,
                    child: Text(
                      subjectName(item.subject),
                      maxLines: 1,
                      style: anek(13, 700, width: 110, height: 1.1, color: pigment.on),
                    ),
                  ),
                  if (item.pending.isNotEmpty)
                    Text(
                      'academics.n_due'.trp({'n': '${item.pending.length}'}),
                      style: anek(13, 520, width: 110, height: 1.1, color: pigment.on.withValues(alpha: .85)),
                    ),
                ],
              ),
            ],
          ),
        ),
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
                  color: c.dark ? Color.lerp(pigment, Colors.white, .45) : pigment,
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
        '${DateFormat('MMMM').format(DateTime.now())} · ${'academics.streak'.trp({'n': '${controller.streak}'})}',
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
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
                child: Row(
                  children: [
                    SizedBox(
                      width: 76,
                      child: Text(
                        rows[i].$1,
                        maxLines: 1,
                        style: anek(
                          rows[i].$1.length > 4 ? 20 : 26,
                          760,
                          width: 122,
                          height: 1,
                          color: context.app.ink,
                        ),
                      ),
                    ),
                    const SizedBox(width: 14),
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
