import 'dart:async';

import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:tangent/core/services/school_config.dart';
import 'package:tangent/core/routes/app_routes.dart';
import 'package:tangent/core/theme/app_colors.dart';
import 'package:tangent/core/theme/app_typography.dart';
import 'package:tangent/core/utils/extensions.dart';
import 'package:tangent/core/widgets/empty_kit.dart';
import 'package:tangent/core/widgets/glass.dart';
import 'package:tangent/core/widgets/glass_controls.dart';
import 'package:tangent/core/widgets/page.dart';
import 'package:tangent/core/widgets/states.dart';
import 'package:tangent/core/widgets/ui.dart';
import 'package:tangent/data/models/campus.dart';
import 'package:tangent/features/leave/controllers/leave_controller.dart';
import 'package:intl/intl.dart';
import 'package:phosphor_flutter/phosphor_flutter.dart';

class LeaveView extends GetView<LeaveController> {
  const LeaveView({super.key});

  @override
  Widget build(BuildContext context) {
    return Obx(() {
      controller.state.value;
      final items = controller.items;
      final unexplained = controller.unexplained;
      return PageFrame(
        leading: const BackGlass(),
        onRefresh: controller.load,
        bottomBarHeight: 56,
        bottomBar: Center(
          child: GlassPress(
            onTap: () => Get.toNamed<void>(AppRoutes.leaveApply),
            child: Semantics(
              button: true,
              child: Glass(
                width: 200,
                height: 56,
                radius: 999,
                tint: context.app.brand,
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(PhosphorIconsBold.plus, size: 22, color: context.app.onBrand),
                    const SizedBox(width: 8),
                    Text('leave.new'.tr, style: AppText.t(color: context.app.onBrand, height: 1)),
                  ],
                ),
              ),
            ),
          ),
        ),
        children: [
          Rise(
            child: PageTitle(
              'leave.title',
              subtitle: controller.childName == null
                  ? null
                  : [
                      controller.childName!,
                      'leave.taken'.trn(controller.takenThisTerm),
                      if (controller.waiting > 0) 'leave.waiting_n'.trp({'n': '${controller.waiting}'}),
                    ].join(' · '),
            ),
          ),
          ViewStateView(
            state: controller.state.value,
            onRetry: controller.load,
            errorKey: controller.errorMessage.value,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (unexplained != null) ...[
                  const SizedBox(height: 16),
                  Rise(index: 2, child: _Unexplained(date: unexplained)),
                ],
                const Rise(index: 3, child: SectionLabel('leave.requests')),
                if (items.isEmpty)
                  const EmptyState(
                    art: EmptyArt.leave,
                    title: 'leave.empty',
                    body: 'leave.empty_body',
                    hint: 'leave.empty_hint',
                  )
                else
                  Rise(
                    index: 3,
                    child: EduCard(
                      child: Column(
                        children: [
                          for (var i = 0; i < items.length; i++) ...[
                            if (i > 0) const Hr(indent: 86),
                            _Request(item: items[i], teacher: controller.teacherName),
                          ],
                        ],
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ],
      );
    });
  }
}

class _DateTile extends StatelessWidget {
  const _DateTile({required this.day, required this.caption, this.background, this.foreground, this.captionColor});

  final int day;
  final String caption;
  final Color? background;
  final Color? foreground;
  final Color? captionColor;

  @override
  Widget build(BuildContext context) => Container(
    width: 58,
    padding: const EdgeInsets.symmetric(vertical: 8),
    decoration: BoxDecoration(color: background ?? context.app.paper2, borderRadius: BorderRadius.circular(12)),
    child: Column(
      children: [
        Text('$day', style: AppText.num(color: foreground ?? context.app.ink)),
        const SizedBox(height: 2),
        Text(caption, style: AppText.o(color: captionColor ?? context.app.ink3, height: 1.2)),
      ],
    ),
  );
}

class _Unexplained extends StatelessWidget {
  const _Unexplained({required this.date});

  final DateTime date;

  @override
  Widget build(BuildContext context) => Pressable(
    onTap: () => Get.toNamed<void>(AppRoutes.leaveApply, arguments: {'past': date}),
    child: Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(color: context.app.badSoft, borderRadius: BorderRadius.circular(24)),
      child: Row(
        children: [
          _DateTile(
            day: date.day,
            caption: DateFormat('MMM').format(date).toUpperCase(),
            background: AppColors.bad,
            foreground: AppColors.white,
            captionColor: AppColors.white.withValues(alpha: .85),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('leave.no_reason'.tr, style: context.type.t),
                Text(
                  'leave.no_reason_body'.trp({'day': DateFormat('EEEE').format(date)}),
                  style: context.type.cap,
                ),
              ],
            ),
          ),
          Icon(PhosphorIconsRegular.caretRight, size: 18, color: context.app.ink),
        ],
      ),
    ),
  );
}

class _Request extends StatelessWidget {
  const _Request({required this.item, required this.teacher});

  final LeaveRequest item;
  final String? teacher;

  @override
  Widget build(BuildContext context) {
    final c = context.app;
    final days = leaveSpan(item);
    final (stamp, tone) = switch (item.status) {
      LeaveStatus.pending => ('leave.waiting', c.dark ? AppColors.blackboard.mariText : AppColors.late),
      LeaveStatus.approved => ('leave.approved', AppColors.ok),
      LeaveStatus.rejected => ('leave.declined', c.badText),
      LeaveStatus.withdrawn => ('leave.withdrawn', c.ink3),
    };
    final sameMonth = item.from.month == item.to.month;
    final range = days == 1
        ? DateFormat('EEE d MMM').format(item.from)
        : '${DateFormat(sameMonth ? 'EEE d' : 'EEE d MMM').format(item.from)} – ${DateFormat('EEE d MMM').format(item.to)}';
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _DateTile(
            day: item.from.day,
            caption: '${DateFormat('MMM').format(item.from).toUpperCase()} · ${days}D',
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(child: Text(item.reason, style: context.type.t)),
                    const SizedBox(width: 8),
                    Stamp(stamp.tr, color: tone),
                  ],
                ),
                const SizedBox(height: 4),
                Text(
                  [if (item.note != null && item.note!.trim().isNotEmpty) item.note!.trim(), '$range.'].join(' '),
                  style: context.type.s,
                ),
                if (item.status == LeaveStatus.pending)
                  Padding(
                    padding: const EdgeInsets.only(top: 6),
                    child: Row(
                      children: [
                        Expanded(
                          child: Text(
                            teacher == null
                                ? 'leave.sent_on'.trp({'date': DateFormat('EEE d MMM').format(item.appliedOn)})
                                : 'leave.sent_to'.trp({
                                    'date': DateFormat('EEE d MMM').format(item.appliedOn),
                                    'name': teacher!,
                                  }),
                            style: context.type.cap,
                          ),
                        ),
                        // Not answered yet: the parent can take it back.
                        Btn('leave.withdraw', kind: BtnKind.quiet, small: true, onPressed: () => unawaited(Get.find<LeaveController>().withdraw(item))),
                      ],
                    ),
                  )
                else if (item.reviewNote != null)
                  Container(
                    margin: const EdgeInsets.only(top: 8),
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                    decoration: BoxDecoration(color: c.paper2, borderRadius: BorderRadius.circular(16)),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('“${item.reviewNote}”', style: context.type.s),
                        if (item.reviewedBy != null) ...[
                          const SizedBox(height: 4),
                          Text(item.reviewedBy!, style: context.type.cap),
                        ],
                      ],
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

class LeaveApplyView extends GetView<LeaveApplyController> {
  const LeaveApplyView({super.key});

  @override
  Widget build(BuildContext context) {
    final c = context.app;
    return Obx(() {
      final past = controller.mode.value == 1;
      final s = controller.start.value;
      final e = controller.end.value;
      String chip(String key, DateTime? d) =>
          '${key.tr} · ${d == null ? 'leave.choose'.tr : DateFormat('EEE d MMM').format(d)}';
      return PageFrame(
        leading: const BackGlass(close: true),
        actions: [
          SizedBox(
            width: 240,
            child: GlassSegmented(
              labels: ['leave.upcoming'.tr, 'leave.past'.tr],
              index: controller.mode.value,
              height: 44,
              onChanged: controller.setMode,
              semanticLabel: 'leave.kind'.tr,
            ),
          ),
        ],
        topPadding: MediaQuery.paddingOf(context).top + 60,
        bottomBar: Glass(
          height: 64,
          radius: 999,
          padding: const EdgeInsets.only(left: 20, right: 8),
          child: Row(
            children: [
              Expanded(
                child: Text(
                  'leave.goes_to'.tr,
                  style: AppText.capB(color: c.ink3),
                  maxLines: 2,
                ),
              ),
              Btn(
                'leave.send',
                height: 48,
                loading: controller.sending.value,
                onPressed: controller.sending.value ? null : () => unawaited(controller.send()),
              ),
            ],
          ),
        ),
        children: [
          Builder(builder: (context) => Text(past ? 'leave.explain_title'.tr : 'leave.ask_title'.tr, style: context.type.h2)),
          const SizedBox(height: 12),
          Wrap(
            crossAxisAlignment: WrapCrossAlignment.center,
            spacing: 8,
            runSpacing: 8,
            children: [
              Chip2(
                chip('leave.from', s),
                on: controller.picking.value == 0 || s != null,
                onTap: () => controller.picking.value = 0,
              ),
              Icon(PhosphorIconsRegular.arrowRight, size: 15, color: c.ink3),
              Chip2(
                chip('leave.to', e),
                on: controller.picking.value == 1 || e != null,
                onTap: s == null ? null : () => controller.picking.value = 1,
              ),
            ],
          ),
          const SizedBox(height: 12),
          EduCard(
            padding: const EdgeInsets.all(12),
            child: _RangeCalendar(controller: controller),
          ),
          const SizedBox(height: 16),
          Padding(
            padding: const EdgeInsets.only(left: 4, bottom: 8),
            child: Text('leave.reason'.tr, style: AppText.capB(color: c.ink2, height: 1.2)),
          ),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final r in SchoolConfig.leaveReasons)
                Semantics(
                  selected: controller.reason.value == r,
                  child: Chip2(
                    r,
                    on: controller.reason.value == r,
                    onTap: () => controller.reason.value = r,
                  ),
                ),
            ],
          ),
          const SizedBox(height: 12),
          Field(
            controller: controller.note,
            label: controller.teacherName == null
                ? '${'leave.note'.tr} · ${'common.optional'.tr}'
                : '${'leave.note_for'.trp({'name': controller.teacherName!})} · ${'common.optional'.tr}',
            hint: past ? 'leave.note_hint_past' : 'leave.note_hint',
            maxLines: 4,
            minHeight: 76,
            textInputAction: TextInputAction.newline,
            keyboard: TextInputType.multiline,
          ),
          const SizedBox(height: 12),
          Align(
            alignment: Alignment.centerLeft,
            child: controller.attachment.value == null
                ? Pressable(
                    onTap: () => unawaited(controller.attach()),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(vertical: 8),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(PhosphorIconsRegular.paperclip, size: 18, color: c.ink2),
                          const SizedBox(width: 8),
                          Text('leave.attach'.tr, style: AppText.capB(color: c.ink2)),
                        ],
                      ),
                    ),
                  )
                : Chip2(
                    controller.attachment.value!,
                    icon: PhosphorIconsRegular.x,
                    onTap: () => controller.attachment.value = null,
                  ),
          ),
        ],
      );
    });
  }
}

class _RangeCalendar extends StatelessWidget {
  const _RangeCalendar({required this.controller});

  final LeaveApplyController controller;

  static const _cell = 38.0;

  @override
  Widget build(BuildContext context) {
    final c = context.app;
    final month = controller.month.value;
    controller.holidays.length;
    final s = controller.start.value;
    final e = controller.end.value;
    final today = controller.today;
    final first = DateTime(month.year, month.month);
    final lead = first.weekday - 1;
    final count = DateUtils.getDaysInMonth(month.year, month.month);
    var cells = lead + count;
    // Explaining an absence: weeks after this one hold nothing pickable.
    if (controller.mode.value == 1 && month.year == today.year && month.month == today.month) {
      cells = lead + today.day + (7 - today.weekday);
      cells = cells > lead + count ? lead + count : cells;
    }
    final rows = (cells / 7).ceil();
    final n = controller.schoolDays;
    Widget arrow(IconData icon, int delta, String label) => controller.canShift(delta)
        ? Semantics(
            button: true,
            label: label.tr,
            child: Pressable(
              onTap: () => controller.shift(delta),
              child: SizedBox(width: 32, height: 32, child: Icon(icon, size: 16, color: c.ink)),),
          )
        : const SizedBox(width: 32, height: 32);
    return GestureDetector(
      onHorizontalDragEnd: (d) {
        final v = d.primaryVelocity ?? 0;
        if (v.abs() > 200) controller.shift(v < 0 ? 1 : -1);
      },
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(child: Text(DateFormat('MMMM y').format(month), style: context.type.t)),
              if (n > 0)
                Text(n == 1 ? 'leave.one_day'.tr : 'leave.n_days'.trn(n), style: context.type.cap),
              const SizedBox(width: 4),
              arrow(PhosphorIconsRegular.caretLeft, -1, 'leave.prev_month'),
              arrow(PhosphorIconsRegular.caretRight, 1, 'leave.next_month'),
            ],
          ),
          const SizedBox(height: 4),
          Row(
            children: [
              for (final w in ['M', 'T', 'W', 'T', 'F', 'S', 'S'])
                Expanded(
                  child: Text(
                    w,
                    textAlign: TextAlign.center,
                    style: AppText.o(color: c.ink3, height: 1.4),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 4),
          for (var r = 0; r < rows; r++)
            Padding(
              padding: const EdgeInsets.only(bottom: 4),
              child: Row(
                children: [
                  for (var col = 0; col < 7; col++)
                    Expanded(child: _cellAt(context, r * 7 + col - lead + 1, month, count, s, e, today)),
                ],
              ),
            ),
          const SizedBox(height: 4),
          Text('leave.calendar_rule'.tr, style: context.type.cap),
        ],
      ),
    );
  }

  Widget _cellAt(BuildContext context, int day, DateTime month, int count, DateTime? s, DateTime? e, DateTime today) {
    if (day < 1 || day > count) return const SizedBox(height: _cell);
    final c = context.app;
    final d = DateTime(month.year, month.month, day);
    final off = controller.disabled(d);
    final isStart = s != null && d == s;
    final isEnd = e != null && d == e;
    final inRange = s != null && e != null && !d.isBefore(s) && !d.isAfter(e);
    final edge = isStart || isEnd;
    return Semantics(
      button: !off,
      selected: inRange,
      label: DateFormat('d MMMM').format(d),
      excludeSemantics: true,
      child: Pressable(
        onTap: off ? null : () => controller.pick(d),
        child: SizedBox(
          height: _cell,
          child: Stack(
            alignment: Alignment.center,
            children: [
              // The range is a marigold band; it starts and ends at the circles' centres.
              if (inRange && s != e)
                if (edge)
                  Align(
                    alignment: isStart ? Alignment.centerRight : Alignment.centerLeft,
                    child: FractionallySizedBox(widthFactor: .5, heightFactor: 1, child: ColoredBox(color: c.mariSoft)),
                  )
                else
                  Positioned.fill(child: ColoredBox(color: c.mariSoft)),
              if (edge)
                Container(
                  width: _cell,
                  height: _cell,
                  decoration: BoxDecoration(color: c.ink, shape: BoxShape.circle),
                )
              else if (d == today)
                Container(
                  width: _cell,
                  height: _cell,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    border: Border.all(color: c.line2, width: 1.5),
                  ),
                ),
              Opacity(
                opacity: off ? .45 : 1,
                child: Text(
                  '$day',
                  style: AppText.chip(color: edge ? c.chalk : (off ? c.ink3 : c.ink), height: 1, tabular: true),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
