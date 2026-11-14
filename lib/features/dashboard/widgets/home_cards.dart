import 'dart:async';

import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:tangent/core/routes/app_routes.dart';
import 'package:tangent/core/services/auth_service.dart';
import 'package:tangent/core/services/school_config.dart';
import 'package:tangent/core/theme/app_colors.dart';
import 'package:tangent/core/utils/extensions.dart';
import 'package:tangent/core/theme/tokens.dart';
import 'package:tangent/core/utils/formatters.dart';
import 'package:tangent/core/utils/status.dart';
import 'package:tangent/core/widgets/app_icons.dart';
import 'package:tangent/core/widgets/page.dart';
import 'package:tangent/core/widgets/ui.dart';
import 'package:tangent/data/models/academics.dart';
import 'package:tangent/data/models/campus.dart';
import 'package:tangent/features/dashboard/controllers/dashboard_controller.dart';
import 'package:tangent/features/dashboard/views/dashboard_view.dart';
import 'package:intl/intl.dart';
import 'package:phosphor_flutter/phosphor_flutter.dart';

/// The quick buttons under the greeting (console: The app → Quick buttons), for families. The server keeps only
/// buttons of modules the school has.
class QuickRow extends StatelessWidget {
  const QuickRow({super.key});

  static const _buttons = <String, (String, IconData, String)>{
    'payFees': ('quick.pay_fees', AppIcons.fees, AppRoutes.fees),
    'applyLeave': ('quick.apply_leave', AppIcons.calendar, AppRoutes.leaveApply),
    'messageTeacher': ('quick.message_teacher', AppIcons.messages, AppRoutes.chat),
    'timetable': ('quick.timetable', AppIcons.timetable, AppRoutes.timetable),
    'homework': ('quick.homework', AppIcons.homework, AppRoutes.homework),
    'events': ('quick.events', AppIcons.events, AppRoutes.events),
  };

  @override
  Widget build(BuildContext context) {
    return Obx(() {
      final keys = SchoolConfig.quick.where(_buttons.containsKey).toList();
      if (keys.isEmpty) return const SizedBox.shrink();
      // The quick tiles of the ParentHome board: up to four, each an icon on the brand's soft fill with its name below.
      final c = context.app;
      return Padding(
        padding: const EdgeInsets.only(top: 4),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            for (final (i, k) in keys.take(4).indexed) ...[
              if (i > 0) const SizedBox(width: 10),
              Expanded(
                child: Pressable(
                  onTap: () => Get.toNamed<void>(_buttons[k]!.$3),
                  label: _buttons[k]!.$1.tr,
                  child: Column(
                    children: [
                      Container(
                        height: 60,
                        decoration: BoxDecoration(color: c.mariSoft, borderRadius: BorderRadius.circular(AppRadius.panel)),
                        alignment: Alignment.center,
                        child: Icon(_buttons[k]!.$2, size: 24, color: c.mariText),
                      ),
                      const SizedBox(height: 6),
                      Text(_buttons[k]!.$1.tr, maxLines: 1, overflow: TextOverflow.ellipsis, textAlign: TextAlign.center, style: context.type.capB.copyWith(color: c.ink)),
                    ],
                  ),
                ),
              ),
            ],
          ],
        ),
      );
    });
  }
}

/// The latest notices, pinned ones first (console: Home screen cards → Latest notices).
class NoticesCard extends StatelessWidget {
  const NoticesCard({required this.notices, super.key});

  final List<Notice> notices;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SectionLabel('home.latest_notices'.tr, top: 24, action: 'common.see_all', onAction: () => Get.toNamed<void>(AppRoutes.notices)),
        EduCard(
          child: Column(
            children: [
              for (final (i, n) in notices.indexed) ...[
                if (i > 0) const Hr(),
                NoticeLine(notice: n),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

/// Merged Due stack: fees, homework and replies in one card.
class DueList extends StatelessWidget {
  const DueList({required this.items, this.showChild = false, super.key});

  final List<DueItem> items;
  final bool showChild;

  @override
  Widget build(BuildContext context) {
    return EduCard(
      child: Column(
        children: [
          for (var i = 0; i < items.length; i++) ...[
            if (i > 0) const Hr(indent: 68),
            _DueRow(item: items[i], showChild: showChild),
          ],
        ],
      ),
    );
  }
}

class _DueRow extends StatelessWidget {
  const _DueRow({required this.item, required this.showChild});

  final DueItem item;
  final bool showChild;

  @override
  Widget build(BuildContext context) {
    final c = context.app;
    final child = showChild && item.childName != null ? ' · ${item.childName}' : '';
    switch (item.kind) {
      case DueKind.fee:
        final fee = item.installment!;
        final overdue = moneyStatus(fee) == MoneyStatus.overdue;
        final late = -Formatters.daysUntil(fee.dueDate);
        return _Row(
          leading: _MoneyCover(overdue: overdue),
          title: '${fee.title}$child',
          subtitle: overdue
              ? 'home.fee_late'.trp({'amount': Formatters.inr(fee.amount), 'n': '$late'})
              : 'home.fee_due_on'.trp({
                  'amount': Formatters.inr(fee.amount),
                  'date': DateFormat('EEE d MMM').format(fee.dueDate),
                }),
          subtitleColor: overdue ? c.badText : null,
          trailing: overdue
              ? Btn('home.pay', small: true, onPressed: () => unawaited(_openFees(item, pay: true)))
              : Stamp(daysStamp(fee.dueDate), color: c.lateText),
          onTap: () => unawaited(_openFees(item)),
        );
      case DueKind.homework:
        final hw = item.homework!;
        return _Row(
          leading: Cover(subject: hw.subject),
          title: '${hw.title}$child',
          subtitle:
              '${subjectName(hw.subject)} · ${Formatters.countdown(hw.dueOn).trp({'count': '${Formatters.daysUntil(hw.dueOn)}'}).toLowerCase()}',
          trailing: Stamp(daysStamp(hw.dueOn), color: c.lateText),
          onTap: () => Get.toNamed<void>(AppRoutes.homeworkDetail.replaceFirst(':id', hw.id)),
        );
      case DueKind.event:
        final event = item.event!;
        return _Row(
          leading: Cover(subject: _eventPigment(event)),
          title: 'home.reply_to'.trp({'title': event.title}),
          subtitle: 'home.are_you_going'.trp({'date': DateFormat('EEE d MMM').format(event.date)}),
          trailing: Icon(PhosphorIconsRegular.caretRight, size: 18, color: c.ink3),
          onTap: () => Get.toNamed<void>(AppRoutes.eventDetail.replaceFirst(':id', event.id)),
        );
    }
  }
}

String _eventPigment(SchoolEvent event) => switch (event.category) {
  'sports' => 'pe',
  'academic' => 'maths',
  'cultural' => 'hindi',
  _ => 'science',
};

class _MoneyCover extends StatelessWidget {
  const _MoneyCover({required this.overdue});

  final bool overdue;

  @override
  Widget build(BuildContext context) {
    final c = context.app;
    return Container(
      width: 40,
      height: 40,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: overdue ? c.badSoft : c.lateSoft,
        borderRadius: BorderRadius.circular(AppRadius.md),
      ),
      child: Icon(AppIcons.fees, size: 20, color: overdue ? c.badText : c.lateText),
    );
  }
}

class _Row extends StatelessWidget {
  const _Row({
    required this.leading,
    required this.title,
    required this.subtitle,
    this.subtitleColor,
    this.trailing,
    this.onTap,
  });

  final Widget leading;
  final String title;
  final String subtitle;
  final Color? subtitleColor;
  final Widget? trailing;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return Pressable(
      onTap: onTap,
      scale: .985,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        child: Row(
          children: [
            leading,
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, maxLines: 1, overflow: TextOverflow.ellipsis, style: context.type.t),
                  const SizedBox(height: 2),
                  Text(
                    subtitle,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: context.type.capB.copyWith(color: subtitleColor),
                  ),
                ],
              ),
            ),
            if (trailing != null) ...[const SizedBox(width: 10), trailing!],
          ],
        ),
      ),
    );
  }
}

/// Parent strip: each child's attendance and current class today.
class ChildrenStrip extends StatelessWidget {
  const ChildrenStrip({required this.children, super.key});

  final List<ChildToday> children;

  @override
  Widget build(BuildContext context) {
    final c = context.app;
    return EduCard(
      child: Column(
        children: [
          for (var i = 0; i < children.length; i++) ...[
            if (i > 0) const Hr(indent: 66),
            Builder(
              builder: (context) {
                final child = children[i];
                final status = child.status;
                final (label, tone) = switch (status) {
                  AttendanceStatus.present => ('attendance.present', AppColors.ok),
                  AttendanceStatus.absent => ('attendance.absent', c.badText),
                  AttendanceStatus.lateArrival => ('attendance.late', AppColors.late),
                  AttendanceStatus.holiday => ('attendance.holiday', AppColors.off),
                  null => ('attendance.not_marked', AppColors.off),
                };
                final period = child.period;
                final now = period == null
                    ? 'home.no_class_now'.tr
                    : period.kind == PeriodKind.klass
                    ? 'home.subject_now'.trp({'subject': subjectName(period.subject)})
                    : subjectName(period.subject);
                return Pressable(
                  onTap: () => Get.toNamed<void>(AppRoutes.attendance),
                  scale: .985,
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                    child: Row(
                      children: [
                        Avatar(
                          child.student.name,
                          initials: Avatar.siblingInitials(child.student.name, [
                            for (final k in children) k.student.name,
                          ]),
                          background: i.isEven ? AppColors.subject('maths').fill : AppColors.subject('hindi').fill,
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text.rich(
                                TextSpan(
                                  text: child.student.name.split(' ').first,
                                  children: [
                                    TextSpan(
                                      text:
                                          ' · ${child.schoolClass.name.replaceAll(RegExp('[^0-9]'), '')} ${child.schoolClass.section}',
                                      style: context.type.cap,
                                    ),
                                  ],
                                ),
                                style: context.type.t,
                              ),
                              const SizedBox(height: 2),
                              Text(
                                '${label.tr} · $now',
                                style: context.type.cap,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ],
                          ),
                        ),
                        Stamp(label.tr, color: tone),
                      ],
                    ),
                  ),
                );
              },
            ),
          ],
        ],
      ),
    );
  }
}

class NoticeLine extends StatelessWidget {
  const NoticeLine({required this.notice, super.key});

  final Notice notice;

  @override
  Widget build(BuildContext context) {
    return Pressable(
      onTap: () => Get.toNamed<void>(AppRoutes.noticeDetail.replaceFirst(':id', notice.id)),
      scale: .985,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        child: Row(
          children: [
            Stamp('notices.cat_${notice.category}'.tr, color: noticeTone(context, notice.category), size: 10),
            const SizedBox(width: 12),
            Expanded(
              child: Text(notice.title, maxLines: 1, overflow: TextOverflow.ellipsis, style: context.type.t),
            ),
          ],
        ),
      ),
    );
  }
}

Color noticeTone(BuildContext context, String category) {
  final c = context.app;
  return switch (category) {
    'exams' => c.badText,
    'academic' => c.mariText,
    'sports' => AppColors.ok,
    'holiday' => AppColors.subject('social').fill,
    'fees' => c.lateText,
    _ => c.ink3,
  };
}

/// Opens Fees for the child the fee belongs to, optionally straight into paying it.
Future<void> _openFees(DueItem item, {bool pay = false}) async {
  final auth = Get.find<AuthService>();
  if (item.studentId != null && item.studentId != auth.activeStudentId.value) {
    await auth.switchChild(item.studentId!);
  }
  await Get.toNamed<void>(AppRoutes.fees, arguments: pay ? {'pay': item.installment!.id} : null);
}
