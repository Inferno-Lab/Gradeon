import 'dart:async';

import 'package:flutter/material.dart';
import 'package:tangent/core/widgets/app_icons.dart';
import 'package:flutter/semantics.dart';
import 'package:get/get.dart';
import 'package:tangent/core/theme/app_colors.dart';
import 'package:tangent/core/theme/app_typography.dart';
import 'package:tangent/core/utils/extensions.dart';
import 'package:tangent/core/utils/haptics.dart';
import 'package:tangent/core/widgets/empty_kit.dart';
import 'package:tangent/core/widgets/glass.dart';
import 'package:tangent/core/widgets/page.dart';
import 'package:tangent/core/widgets/states.dart';
import 'package:tangent/core/widgets/ui.dart';
import 'package:tangent/data/models/campus.dart';
import 'package:tangent/features/notifications/controllers/notifications_controller.dart';
import 'package:intl/intl.dart';
import 'package:phosphor_flutter/phosphor_flutter.dart';
import 'package:tangent/core/utils/clock.dart';


({IconData? icon, String? glyph, Color fill, Color on, String label}) _kind(BuildContext context, String type) {
  final c = context.app;
  return switch (type) {
    'fees' => (icon: AppIcons.fees, glyph: null, fill: c.badSoft, on: c.badText, label: 'notifications.t_fees'.tr),
    'homework' => (
      icon: AppIcons.homework,
      glyph: null,
      fill: AppColors.subject('maths').soft,
      on: AppColors.subject('maths').ink,
      label: 'notifications.t_homework'.tr,
    ),
    'attendance' => (
      icon: PhosphorIconsBold.check,
      glyph: null,
      fill: c.okSoft,
      on: AppColors.ok,
      label: 'notifications.t_attendance'.tr,
    ),
    'event' => (
      icon: PhosphorIconsRegular.calendarBlank,
      glyph: null,
      fill: AppColors.subject('science').fill,
      on: AppColors.subject('science').on,
      label: 'notifications.t_event'.tr,
    ),
    'results' => (
      icon: PhosphorIconsRegular.trophy,
      glyph: null,
      fill: c.mariSoft,
      on: c.mariText,
      label: 'notifications.t_results'.tr,
    ),
    _ => (
      icon: PhosphorIconsRegular.chatCircle,
      glyph: null,
      fill: c.paper2,
      on: c.ink2,
      label: 'notifications.t_school'.tr,
    ),
  };
}

class NotificationsView extends GetView<NotificationsController> {
  const NotificationsView({super.key});

  @override
  Widget build(BuildContext context) {
    return Obx(() {
      controller.filter.value;
      controller.gone.length;
      final list = controller.visible;
      final today = DateUtils.dateOnly(Clock.now());
      final weekAgo = today.subtract(const Duration(days: 6));
      final groups = <(String, List<AppNotification>)>[
        ('notifications.today', list.where((n) => !n.date.isBefore(today)).toList()),
        ('notifications.this_week', list.where((n) => n.date.isBefore(today) && !n.date.isBefore(weekAgo)).toList()),
        ('notifications.earlier', list.where((n) => n.date.isBefore(weekAgo)).toList()),
      ].where((g) => g.$2.isNotEmpty).toList();
      final filters = [
        'all',
        ...controller.children,
        if (controller.items.any((n) => schoolNoticeTypes.contains(n.type))) 'school',
      ];
      return PageFrame(
        leading: const BackGlass(),
        actions: [
          if (controller.unread > 0)
            GlassPress(
              onTap: () => unawaited(controller.readAll()),
              child: Semantics(
                button: true,
                child: Glass(
                  height: 44,
                  width: 132,
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(PhosphorIconsBold.check, size: 15, color: context.app.ink),
                      const SizedBox(width: 6),
                      Flexible(
                        child: Text(
                          'notifications.read_all'.tr,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: AppText.chip(color: context.app.ink, height: 1),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
        ],
        topPadding: MediaQuery.paddingOf(context).top + 60,
        onRefresh: controller.load,
        // Dismissed by mistake: bring it back for a few seconds.
        bottomBar: controller.undoable.value == null
            ? null
            : Glass(
                height: 64,
                radius: 999,
                padding: const EdgeInsets.only(left: 20, right: 8),
                child: Row(
                  children: [
                    Expanded(child: Text('notifications.removed'.tr, style: AppText.capB(color: context.app.ink3))),
                    Btn('notifications.undo', kind: BtnKind.quiet, height: 48, onPressed: () => unawaited(controller.undo())),
                  ],
                ),
              ),
        children: [
          const Rise(child: PageTitle('notifications.title')),
          ViewStateView(
            state: controller.state.value,
            onRetry: controller.load,
            errorKey: controller.errorMessage.value,
            emptyTitle: 'notifications.empty',
            emptyBody: 'notifications.empty_body',
            emptyArt: EmptyArt.notifications,
            emptyHint: 'notifications.empty_hint',
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (filters.length > 1) ...[
                  const SizedBox(height: 12),
                  Rise(
                    index: 1,
                    child: Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        for (final f in filters)
                          Semantics(
                            selected: controller.filter.value == f,
                            child: Chip2(
                              f == 'all'
                                  ? 'notifications.all_n'.trp({
                                      'n': '${controller.items.length - controller.gone.length}',
                                    })
                                  : f == 'school'
                                  ? 'notifications.school'.tr
                                  : f,
                              on: controller.filter.value == f,
                              onTap: () => controller.filter.value = f,
                            ),
                          ),
                      ],
                    ),
                  ),
                ],
                if (groups.isEmpty)
                  const EmptyState(art: EmptyArt.notifications, title: 'notifications.none_here', body: 'notifications.none_here_body'),
                for (var g = 0; g < groups.length; g++) ...[
                  Rise(index: 2 + g, child: SectionLabel(groups[g].$1.tr, top: 20)),
                  Rise(
                    index: 2 + g,
                    child: EduCard(
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(24),
                        child: Column(
                          children: [
                            for (var i = 0; i < groups[g].$2.length; i++) ...[
                              if (i > 0) const Hr(),
                              _Row(
                                item: groups[g].$2[i],
                                controller: controller,
                                today: g == 0 && groups[g].$1 == 'notifications.today',
                              ),
                            ],
                          ],
                        ),
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      );
    });
  }
}

class _Row extends StatelessWidget {
  const _Row({required this.item, required this.controller, required this.today});

  final AppNotification item;
  final NotificationsController controller;
  final bool today;

  @override
  Widget build(BuildContext context) {
    final c = context.app;
    final kind = _kind(context, item.type);
    final when = today ? DateFormat('H:mm').format(item.date) : DateFormat('EEE d MMM').format(item.date);
    return Dismissible(
      key: ValueKey(item.id),
      direction: DismissDirection.endToStart,
      onUpdate: (d) {
        if (d.reached && !d.previousReached) Haptics.selection();
      },
      onDismissed: (_) => unawaited(controller.dismiss(item)),
      background: ColoredBox(
        color: AppColors.bad,
        child: Align(
          alignment: Alignment.centerRight,
          child: Padding(
            padding: const EdgeInsets.only(right: 20),
            child: Glass(
              width: 76,
              height: 52,
              radius: 999,
              kind: GlassKind.lens,
              onPigment: true,
              shadow: false,
              child: Icon(
                PhosphorIconsRegular.trash,
                color: AppColors.white,
                semanticLabel: 'notifications.dismiss'.tr,
              ),
            ),
          ),
        ),
      ),
      child: Semantics(
        button: true,
        label: '${item.read ? '' : '${'notifications.unread'.tr}, '}${item.title}, ${item.body}',
        excludeSemantics: true,
        customSemanticsActions: {
          CustomSemanticsAction(label: 'notifications.dismiss'.tr): () => unawaited(controller.dismiss(item)),
        },
        child: Material(
          color: c.paper,
          child: Pressable(
            onTap: () => Get.toNamed<void>(item.route),
            child: Stack(
              children: [
                if (!item.read) Positioned(left: 5, top: 28, child: Dot(context.app.brand, size: 7)),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Container(
                        width: 40,
                        height: 40,
                        alignment: Alignment.center,
                        decoration: BoxDecoration(color: kind.fill, borderRadius: BorderRadius.circular(12)),
                        child: kind.glyph != null
                            ? Text(kind.glyph!, style: AppText.t(color: kind.on, height: 1))
                            : Icon(kind.icon, size: 18, color: kind.on),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(item.title, style: context.type.t),
                            const SizedBox(height: 2),
                            Text(item.body, style: context.type.s, maxLines: 2, overflow: TextOverflow.ellipsis),
                            const SizedBox(height: 4),
                            Text('$when · ${kind.label}', style: context.type.cap),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),),
        ),
      ),
    );
  }
}
