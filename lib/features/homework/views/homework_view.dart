import 'dart:async';

import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:gradeon/core/routes/app_routes.dart';
import 'package:gradeon/core/theme/app_colors.dart';
import 'package:gradeon/core/theme/app_typography.dart';
import 'package:gradeon/core/utils/extensions.dart';
import 'package:gradeon/core/utils/formatters.dart';
import 'package:gradeon/core/widgets/empty_art.dart';
import 'package:gradeon/core/widgets/glass.dart';
import 'package:gradeon/core/widgets/glass_controls.dart';
import 'package:gradeon/core/widgets/page.dart';
import 'package:gradeon/core/widgets/states.dart';
import 'package:gradeon/core/widgets/toast.dart';
import 'package:gradeon/core/widgets/ui.dart';
import 'package:gradeon/data/models/academics.dart';
import 'package:gradeon/features/dashboard/views/dashboard_view.dart';
import 'package:gradeon/features/homework/controllers/homework_controller.dart';
import 'package:gradeon/features/shell/shell_controller.dart';
import 'package:intl/intl.dart';
import 'package:phosphor_flutter/phosphor_flutter.dart';

class HomeworkView extends GetView<HomeworkController> {
  const HomeworkView({super.key});

  @override
  Widget build(BuildContext context) {
    return Obx(() {
      final tab = controller.tab.value;
      final groups = _groups(controller.visible, tab);
      final counts = [
        controller.count(HomeworkStatus.pending),
        controller.count(HomeworkStatus.submitted),
        controller.count(HomeworkStatus.graded),
      ];
      return PageFrame(
        leading: const BackGlass(),
        actions: [
          GlassIconButton(
            icon: PhosphorIconsRegular.magnifyingGlass,
            label: 'common.search'.tr,
            onTap: () => Get.toNamed<void>(AppRoutes.search),
          ),
        ],
        onRefresh: controller.load,
        bottomBarHeight: 56,
        bottomBar: GlassSegmented(
          labels: [
            'homework.tab_due'.trp({'n': '${counts[0]}'}),
            'homework.tab_sent'.trp({'n': '${counts[1]}'}),
            'homework.tab_graded'.trp({'n': '${counts[2]}'}),
          ],
          index: tab,
          semanticLabel: 'homework.status'.tr,
          onChanged: (i) => controller.tab.value = i,
        ),
        children: [
          PageTitle('homework.title', subtitle: _summary(controller, tab, counts)),
          ViewStateView(
            state: controller.state.value,
            onRetry: controller.load,
            errorKey: controller.errorMessage.value,
            child: groups.isEmpty
                ? _empty(controller, tab)
                : Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      for (final group in groups) ...[
                        SectionLabel(group.$1, top: 20),
                        for (var i = 0; i < group.$2.length; i++)
                          Padding(
                            padding: const EdgeInsets.only(bottom: 10),
                            child: Rise(index: i, child: _HomeworkRow(item: group.$2[i], tab: tab)),
                          ),
                      ],
                    ],
                  ),
          ),
        ],
      );
    });
  }

  /// Nothing at all yet reads differently from a tab that is simply clear.
  Widget _empty(HomeworkController controller, int tab) {
    if (controller.items.isEmpty) {
      return EmptyState(
        art: EmptyArt.homework,
        title: 'homework.none_yet',
        body: 'homework.none_yet_body',
        hint: 'homework.none_yet_hint',
        actions: [
          EmptyAction(
            'homework.ask_teacher',
            icon: PhosphorIconsRegular.chatCircle,
            onTap: () => ShellController.showTab(ShellController.chatTab),
          ),
        ],
      );
    }
    return switch (tab) {
      0 => EmptyState(
        art: EmptyArt.attendance,
        title: 'homework.all_done',
        body: 'homework.all_done_body',
        actions: [EmptyAction('homework.see_graded', icon: PhosphorIconsRegular.checks, onTap: () => controller.tab.value = 2)],
      ),
      1 => const EmptyState(art: EmptyArt.plane, title: 'homework.none_sent', body: 'homework.none_sent_body'),
      _ => const EmptyState(art: EmptyArt.columns, title: 'homework.none_graded', body: 'homework.none_graded_body'),
    };
  }

  String _summary(HomeworkController controller, int tab, List<int> counts) {
    final items = controller.visible;
    switch (tab) {
      case 0:
        if (controller.items.isEmpty) return 'homework.summary_new'.tr;
        if (items.isEmpty) return 'homework.summary_none'.tr;
        final soonest = [...items]..sort((a, b) => a.dueOn.compareTo(b.dueOn));
        return 'homework.summary_due'.trp({
          'n': '${counts[0]}',
          'when': Formatters.countdown(soonest.first.dueOn).trp({'count': '${Formatters.daysUntil(soonest.first.dueOn)}'}).toLowerCase(),
        });
      case 1:
        return 'homework.summary_sent'.trp({'n': '${counts[1]}'});
      default:
        return 'homework.summary_graded'.trp({'n': '${counts[2]}'});
    }
  }

  List<(String, List<Homework>)> _groups(List<Homework> items, int tab) {
    if (items.isEmpty) return const [];
    if (tab == 1) return [('homework.waiting'.tr, items)];
    if (tab == 2) {
      final byMonth = <String, List<Homework>>{};
      final sorted = [...items]..sort((a, b) => b.dueOn.compareTo(a.dueOn));
      for (final hw in sorted) {
        byMonth.putIfAbsent(DateFormat('MMMM').format(hw.dueOn), () => []).add(hw);
      }
      return byMonth.entries.map((e) => (e.key, e.value)).toList();
    }
    final sorted = [...items]..sort((a, b) => a.dueOn.compareTo(b.dueOn));
    final buckets = <String, List<Homework>>{};
    for (final hw in sorted) {
      final d = Formatters.daysUntil(hw.dueOn);
      final key = d < 0
          ? 'homework.overdue'
          : d == 0
          ? 'time.today_cap'
          : d == 1
          ? 'homework.tomorrow'
          : d <= 7 - DateTime.now().weekday
          ? 'homework.this_week'
          : d <= 14 - DateTime.now().weekday
          ? 'homework.next_week'
          : 'homework.later';
      buckets.putIfAbsent(key.tr, () => []).add(hw);
    }
    return buckets.entries.map((e) => (e.key, e.value)).toList();
  }
}

class _HomeworkRow extends StatelessWidget {
  const _HomeworkRow({required this.item, required this.tab});

  final Homework item;
  final int tab;

  @override
  Widget build(BuildContext context) {
    final c = context.app;
    final controller = Get.find<HomeworkController>();
    final mine = controller.studentId == null ? null : item.forStudent(controller.studentId!);
    final teacher = controller.teachers[item.teacherId] ?? '';
    final days = Formatters.daysUntil(item.dueOn);
    late final String meta;
    late final String stamp;
    late final Color tone;
    switch (tab) {
      case 1:
        meta = 'homework.sent_meta'.trp({
          'date': DateFormat('d MMM').format(mine?.submittedAt ?? item.dueOn),
          'file': mine?.fileName ?? '',
        });
        stamp = 'homework.stamp_sent'.tr;
        tone = AppColors.ok;
      case 2:
        meta = '${mine?.marks ?? 0}/${item.maxMarks}${(mine?.feedback ?? '').isEmpty ? '' : ' · “${mine!.feedback}”'}';
        stamp = mine?.grade ?? '—';
        tone = (mine?.grade ?? '').startsWith('A') ? AppColors.ok : (c.dark ? const Color(0xFFF6BA45) : AppColors.late);
      default:
        meta = [
          if (teacher.isNotEmpty) teacher,
          if (item.attachments.isNotEmpty) 'homework.n_files'.trp({'n': '${item.attachments.length}'}),
          'homework.n_marks'.trp({'n': '${item.maxMarks}'}),
        ].join(' · ');
        if (days < 0) {
          stamp = 'homework.stamp_late'.tr;
          tone = c.badText;
        } else if (days <= 1) {
          stamp = daysStamp(item.dueOn);
          tone = c.dark ? const Color(0xFFF6BA45) : AppColors.late;
        } else {
          stamp = DateFormat('EEE').format(item.dueOn);
          tone = AppColors.off;
        }
    }
    return EduCard(
      radius: 22,
      onTap: () => Get.toNamed<void>(AppRoutes.homeworkDetail.replaceFirst(':id', item.id)),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
      child: Row(
        children: [
          Cover(subject: item.subject),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(item.title, maxLines: 1, overflow: TextOverflow.ellipsis, style: context.type.t),
                const SizedBox(height: 2),
                Text(meta, maxLines: 1, overflow: TextOverflow.ellipsis, style: context.type.cap),
              ],
            ),
          ),
          const SizedBox(width: 10),
          Stamp(stamp, color: tone),
        ],
      ),
    );
  }
}

class HomeworkDetailView extends GetView<HomeworkDetailController> {
  const HomeworkDetailView({super.key});

  @override
  Widget build(BuildContext context) {
    return Obx(() {
      final item = controller.item;
      final state = controller.state.value;
      final inset = MediaQuery.paddingOf(context);
      final heroH = 221 + inset.top;
      final mine = controller.mine;
      final pending = mine == null || mine.status == HomeworkStatus.pending;
      final pigment = item == null ? null : AppColors.subject(item.subject);
      return PageFrame(
        leading: BackGlass(color: pigment?.on),
        actions: [
          GlassIconButton(
            icon: PhosphorIconsRegular.bell,
            label: 'homework.remind'.tr,
            color: pigment?.on,
            onTap: () => ToastHelper.show('homework.reminder_set', kind: ToastKind.success),
          ),
          GlassIconButton(
            icon: PhosphorIconsRegular.export,
            label: 'common.share'.tr,
            color: pigment?.on,
            onTap: () => ToastHelper.show('homework.shared', kind: ToastKind.success),
          ),
        ],
        topPadding: 0,
        padContent: false,
        bottomBar: item != null && pending ? _ActionBar(item: item) : null,
        children: [
          if (item == null)
            Padding(
              padding: EdgeInsets.fromLTRB(20, inset.top + 70, 20, 0),
              child: ViewStateView(
                state: state,
                onRetry: controller.load,
                errorKey: controller.errorMessage.value,
                emptyArt: EmptyArt.search,
            emptyTitle: 'homework.not_found',
                child: const SizedBox.shrink(),
              ),
            )
          else ...[
            _Hero(item: item, height: heroH, teacher: controller.teacher),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 18, 20, 0),
              child: _DetailBody(item: item, mine: mine),
            ),
          ],
        ],
      );
    });
  }
}

class _Hero extends StatelessWidget {
  const _Hero({required this.item, required this.height, required this.teacher});

  final Homework item;
  final double height;
  final String? teacher;

  @override
  Widget build(BuildContext context) {
    final hw = item;
    final pigment = AppColors.subject(hw.subject);
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: context.reduceMotion ? 1 : .6, end: 1),
      duration: const Duration(milliseconds: 600),
      curve: const Cubic(.2, .8, .2, 1),
      builder: (context, t, child) => Transform(
        alignment: Alignment.topCenter,
        transform: Matrix4.diagonal3Values(1, t, 1),
        child: child,
      ),
      child: Container(
        height: height,
        padding: const EdgeInsets.fromLTRB(24, 0, 24, 22),
        alignment: Alignment.bottomLeft,
        decoration: BoxDecoration(color: pigment.fill),
        foregroundDecoration: const BoxDecoration(
          border: Border(left: BorderSide(color: Color(0x2E000000), width: 10)),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Overline(
              teacher == null ? subjectName(hw.subject) : '${subjectName(hw.subject)} · $teacher',
              color: pigment.on.withValues(alpha: .8),
            ),
            const SizedBox(height: 10),
            Text(hw.title, style: context.type.h1.copyWith(color: pigment.on), maxLines: 3),
          ],
        ),
      ),
    );
  }
}

class _DetailBody extends StatelessWidget {
  const _DetailBody({required this.item, required this.mine});

  final Homework item;
  final HomeworkSubmission? mine;

  @override
  Widget build(BuildContext context) {
    final c = context.app;
    final days = Formatters.daysUntil(item.dueOn);
    final submitted = item.submissions.where((s) => s.status != HomeworkStatus.pending).length;
    final status = mine?.status ?? HomeworkStatus.pending;
    final dueLabel = '${Formatters.countdown(item.dueOn).trp({'count': '$days'})} · ${DateFormat('EEE d MMM').format(item.dueOn)}';
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Rise(
          child: Wrap(
            spacing: 8,
            runSpacing: 8,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              Stamp(dueLabel, color: days < 0 ? c.badText : (c.dark ? const Color(0xFFF6BA45) : AppColors.late)),
              Chip2('homework.n_marks'.trp({'n': '${item.maxMarks}'}), height: 30),
              Chip2('status.${status.name}', height: 30),
            ],
          ),
        ),
        const SizedBox(height: 16),
        Rise(index: 1, child: Text(item.description, style: context.type.b)),
        if (status != HomeworkStatus.pending && mine != null) ...[
          const SizedBox(height: 18),
          Rise(
            index: 2,
            child: EduCard(
              padding: const EdgeInsets.all(16),
              color: status == HomeworkStatus.graded ? c.okSoft : null,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(child: Overline('homework.your_work'.tr)),
                      if (status == HomeworkStatus.graded)
                        Stamp('${mine!.grade ?? ''} · ${mine!.marks ?? 0}/${item.maxMarks}', color: AppColors.ok)
                      else
                        Stamp('homework.stamp_sent'.tr, color: AppColors.ok),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'homework.sent_meta'.trp({
                      'date': DateFormat('d MMM').format(mine!.submittedAt ?? DateTime.now()),
                      'file': mine!.fileName ?? '',
                    }),
                    style: context.type.t,
                  ),
                  if ((mine!.feedback ?? '').isNotEmpty) ...[
                    const SizedBox(height: 6),
                    Text('“${mine!.feedback}”', style: context.type.s),
                  ],
                ],
              ),
            ),
          ),
        ],
        if (item.attachments.isNotEmpty) ...[
          Rise(index: 2, child: SectionLabel('homework.attached'.trp({'n': '${item.attachments.length}'}))),
          Rise(
            index: 3,
            child: EduCard(
              child: Column(
                children: [
                  for (var i = 0; i < item.attachments.length; i++) ...[
                    if (i > 0) const Hr(indent: 66),
                    _FileRow(name: item.attachments[i]),
                  ],
                ],
              ),
            ),
          ),
        ],
        const SizedBox(height: 14),
        Rise(
          index: 4,
          child: Text(
            'homework.assigned_line'.trp({
              'date': DateFormat('EEE d MMM').format(item.assignedOn),
              'n': '$submitted',
              'total': '${item.submissions.length}',
            }),
            style: context.type.cap,
          ),
        ),
      ],
    );
  }
}

class _FileRow extends StatelessWidget {
  const _FileRow({required this.name});

  final String name;

  @override
  Widget build(BuildContext context) {
    final c = context.app;
    final ext = name.contains('.') ? name.split('.').last.toUpperCase() : 'FILE';
    return Pressable(
      onTap: () => ToastHelper.show('homework.downloaded', kind: ToastKind.success),
      scale: .985,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        child: Row(
          children: [
            Container(
              width: 40,
              height: 46,
              alignment: Alignment.bottomCenter,
              padding: const EdgeInsets.only(bottom: 5),
              decoration: BoxDecoration(
                color: c.paper2,
                borderRadius: const BorderRadius.only(
                  topLeft: Radius.circular(6),
                  topRight: Radius.circular(12),
                  bottomLeft: Radius.circular(6),
                  bottomRight: Radius.circular(6),
                ),
                border: Border.all(color: c.line2),
              ),
              child: Text(ext, style: anek(9.5, 760, height: 1, em: .06, color: c.ink2)),
            ),
            const SizedBox(width: 12),
            Expanded(child: Text(name, maxLines: 1, overflow: TextOverflow.ellipsis, style: context.type.t)),
            Icon(PhosphorIconsRegular.downloadSimple, size: 18, color: c.ink3),
          ],
        ),
      ),
    );
  }
}

class _ActionBar extends StatelessWidget {
  const _ActionBar({required this.item});

  final Homework item;

  @override
  Widget build(BuildContext context) {
    return Glass(
      height: 64,
      radius: 32,
      padding: const EdgeInsets.symmetric(horizontal: 8),
      child: Row(
        children: [
          Expanded(
            flex: 5,
            child: Btn(
              'homework.upload',
              kind: BtnKind.plain,
              icon: PhosphorIconsRegular.uploadSimple,
              expand: true,
              height: 48,
              onPressed: () => unawaited(_homework().upload(item)),
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            flex: 6,
            child: Btn(
              'homework.scan',
              icon: PhosphorIconsRegular.camera,
              expand: true,
              height: 48,
              onPressed: () => Get.toNamed<void>(AppRoutes.homeworkScan, arguments: item),
            ),
          ),
        ],
      ),
    );
  }
}

HomeworkController _homework() =>
    Get.isRegistered<HomeworkController>() ? Get.find<HomeworkController>() : Get.put(HomeworkController());
