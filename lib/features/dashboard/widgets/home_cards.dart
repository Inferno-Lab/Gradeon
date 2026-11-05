import 'dart:async';

import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:gradeon/core/routes/app_routes.dart';
import 'package:gradeon/core/services/auth_service.dart';
import 'package:gradeon/core/theme/app_colors.dart';
import 'package:gradeon/core/utils/extensions.dart';
import 'package:gradeon/core/utils/formatters.dart';
import 'package:gradeon/core/utils/status.dart';
import 'package:gradeon/core/widgets/ui.dart';
import 'package:gradeon/data/models/academics.dart';
import 'package:gradeon/data/models/campus.dart';
import 'package:gradeon/features/dashboard/controllers/dashboard_controller.dart';
import 'package:gradeon/features/dashboard/views/dashboard_view.dart';
import 'package:intl/intl.dart';
import 'package:phosphor_flutter/phosphor_flutter.dart';

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
      width: 42,
      height: 52,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: overdue ? c.badSoft : c.lateSoft,
        borderRadius: BorderRadius.circular(11),
      ),
      child: Text('₹', style: context.type.h2.copyWith(fontSize: 20, color: overdue ? c.badText : c.lateText)),
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
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
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
                    style: context.type.cap.copyWith(
                      color: subtitleColor,
                      fontWeight: subtitleColor == null ? null : FontWeight.w600,
                    ),
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
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
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
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
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
