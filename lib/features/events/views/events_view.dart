import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:gradeon/core/theme/app_colors.dart';
import 'package:gradeon/core/theme/app_typography.dart';
import 'package:gradeon/core/utils/calendar.dart';
import 'package:gradeon/core/utils/extensions.dart';
import 'package:gradeon/core/widgets/empty_art.dart';
import 'package:gradeon/core/widgets/glass.dart';
import 'package:gradeon/core/widgets/glass_controls.dart';
import 'package:gradeon/core/widgets/page.dart';
import 'package:gradeon/core/widgets/sheets.dart';
import 'package:gradeon/core/widgets/states.dart';
import 'package:gradeon/core/widgets/ui.dart';
import 'package:gradeon/data/models/campus.dart';
import 'package:gradeon/features/events/controllers/events_controller.dart';
import 'package:intl/intl.dart';
import 'package:phosphor_flutter/phosphor_flutter.dart';

const _answers = [RsvpStatus.going, RsvpStatus.maybe, RsvpStatus.cant];

/// Event pigment by category.
SubjectColor _pigment(String category) => AppColors.subject(switch (category) {
  'academic' => 'science',
  'cultural' => 'hindi',
  'sports' => 'pe',
  _ => 'social',
});

String _time(String hhmm) {
  final p = hhmm.split(':');
  final t = DateTime(2000, 1, 1, int.parse(p[0]), int.parse(p[1]));
  return DateFormat(t.minute == 0 ? 'h a' : 'h:mm a').format(t).toLowerCase();
}

void _openEvent(SchoolEvent e) => unawaited(Get.toNamed<void>('/events/${e.id}'));

class EventsView extends GetView<EventsController> {
  const EventsView({super.key});

  @override
  Widget build(BuildContext context) {
    return Obx(() {
      controller.pending.length;
      final featured = controller.featured;
      final rest = controller.upcoming.where((e) => e.id != featured?.id).toList();
      return PageFrame(
        leading: const BackGlass(),
        actions: [
          GlassIconButton(
            icon: PhosphorIconsRegular.calendarBlank,
            label: 'events.month'.tr,
            onTap: () => unawaited(showSheet<void>(_MonthSheet(controller: controller))),
          ),
        ],
        onRefresh: controller.load,
        children: [
          const Rise(child: PageTitle('events.title')),
          ViewStateView(
            state: controller.state.value,
            onRetry: controller.load,
            errorKey: controller.errorMessage.value,
            emptyTitle: 'events.empty',
            emptyBody: 'events.empty_body',
            emptyArt: EmptyArt.calendar,
            emptyHint: 'events.empty_hint',
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (featured != null) ...[
                  const SizedBox(height: 18),
                  Rise(
                    index: 1,
                    child: _Featured(event: featured, controller: controller),
                  ),
                ],
                if (rest.isNotEmpty) ...[
                  const Rise(index: 2, child: SectionLabel('events.coming_up')),
                  Rise(
                    index: 3,
                    child: EduCard(
                      child: Column(
                        children: [
                          for (var i = 0; i < rest.length; i++) ...[
                            if (i > 0) const Hr(indent: 80),
                            _Row(event: rest[i], answer: controller.mine(rest[i])),
                          ],
                        ],
                      ),
                    ),
                  ),
                ],
                if (featured == null) const EmptyState(art: EmptyArt.calendar, title: 'events.none_coming', body: 'events.none_coming_body'),
              ],
            ),
          ),
        ],
      );
    });
  }
}

class _Featured extends StatelessWidget {
  const _Featured({required this.event, required this.controller});

  final SchoolEvent event;
  final EventsController controller;

  @override
  Widget build(BuildContext context) {
    final pigment = _pigment(event.category);
    final answer = controller.mine(event);
    return Container(
      height: 206,
      decoration: BoxDecoration(color: pigment.fill, borderRadius: BorderRadius.circular(26)),
      clipBehavior: Clip.antiAlias,
      child: Stack(
        children: [
          Positioned(
            right: -30,
            top: -30,
            child: Container(
              width: 150,
              height: 150,
              decoration: const BoxDecoration(color: Color(0x1AFFFFFF), shape: BoxShape.circle),
            ),
          ),
          Positioned.fill(
            child: Pressable(
              onTap: () => _openEvent(event),
              scale: 1,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(18, 18, 18, 80),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Overline(
                      '${DateFormat('EEE d MMM').format(event.date)} · ${event.time} · ${event.venue.toLowerCase()}',
                      color: pigment.on.withValues(alpha: .8),
                    ),
                    const SizedBox(height: 10),
                    Text(
                      event.title,
                      style: context.type.h2.copyWith(color: pigment.on),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 4),
                    Text(
                      answer == null ? '${event.description} ${'events.coming_q'.tr}' : event.description,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: context.type.s.copyWith(color: pigment.on.withValues(alpha: .85)),
                    ),
                  ],
                ),
              ),
            ),
          ),
          Positioned(
            left: 14,
            right: 14,
            bottom: 14,
            child: GlassSegmented(
              labels: const ['events.going', 'events.maybe', 'events.cant_short'],
              index: answer == null ? -1 : _answers.indexOf(answer),
              height: 52,
              fontSize: 14.5,
              onPigment: true,
              semanticLabel: 'events.rsvp'.tr,
              onChanged: (i) => unawaited(controller.rsvp(event.id, _answers[i])),
            ),
          ),
        ],
      ),
    );
  }
}

class _DateBlock extends StatelessWidget {
  const _DateBlock({required this.date});

  final DateTime date;

  @override
  Widget build(BuildContext context) {
    final now = DateTime.now();
    // Dates outside this month name the month so "2" is never ambiguous.
    final sub = date.month == now.month && date.year == now.year
        ? DateFormat('EEE').format(date)
        : DateFormat('MMM').format(date);
    return SizedBox(
      width: 52,
      child: Column(
        children: [
          Text('${date.day}', style: anek(26, 780, width: 122, height: 1, color: context.app.ink)),
          Text(sub.toUpperCase(), style: anek(10.5, 700, height: 1.3, em: .08, color: context.app.ink3)),
        ],
      ),
    );
  }
}

class _Row extends StatelessWidget {
  const _Row({required this.event, required this.answer});

  final SchoolEvent event;
  final RsvpStatus? answer;

  @override
  Widget build(BuildContext context) {
    final c = context.app;
    final stamp = switch (answer) {
      RsvpStatus.going => ('events.going'.tr, AppColors.ok),
      RsvpStatus.maybe => ('events.maybe'.tr, c.dark ? const Color(0xFFF6BA45) : AppColors.late),
      RsvpStatus.cant => ('events.not_going'.tr, AppColors.off),
      null => null,
    };
    return Pressable(
      onTap: () => _openEvent(event),
      scale: .985,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        child: Row(
          children: [
            _DateBlock(date: event.date),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(event.title, style: context.type.t),
                  Text('${_time(event.time)} · ${event.venue.toLowerCase()}', style: context.type.cap),
                ],
              ),
            ),
            if (stamp != null) ...[const SizedBox(width: 8), Stamp(stamp.$1, color: stamp.$2)],
          ],
        ),
      ),
    );
  }
}

class _MonthSheet extends StatefulWidget {
  const _MonthSheet({required this.controller});

  final EventsController controller;

  @override
  State<_MonthSheet> createState() => _MonthSheetState();
}

class _MonthSheetState extends State<_MonthSheet> {
  var _month = DateTime(DateTime.now().year, DateTime.now().month);

  @override
  Widget build(BuildContext context) {
    final c = context.app;
    final events = widget.controller.items;
    final lead = _month.weekday - 1;
    final count = DateUtils.getDaysInMonth(_month.year, _month.month);
    final rows = ((lead + count) / 7).ceil();
    final today = DateUtils.dateOnly(DateTime.now());
    List<SchoolEvent> on(DateTime d) => events.where((e) => DateUtils.isSameDay(e.date, d)).toList();
    final listed = events.where((e) => e.date.year == _month.year && e.date.month == _month.month).toList()
      ..sort((a, b) => a.date.compareTo(b.date));
    return SheetBody(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(child: Text(DateFormat('MMMM y').format(_month), style: context.type.h2)),
              IconButton(
                tooltip: 'leave.prev_month'.tr,
                onPressed: () => setState(() => _month = DateTime(_month.year, _month.month - 1)),
                icon: Icon(PhosphorIconsRegular.caretLeft, color: c.ink),
              ),
              IconButton(
                tooltip: 'leave.next_month'.tr,
                onPressed: () => setState(() => _month = DateTime(_month.year, _month.month + 1)),
                icon: Icon(PhosphorIconsRegular.caretRight, color: c.ink),
              ),
            ],
          ),
          const SizedBox(height: 8),
          for (var r = 0; r < rows; r++)
            Row(
              children: [
                for (var col = 0; col < 7; col++)
                  Expanded(
                    child: Builder(
                      builder: (context) {
                        final day = r * 7 + col - lead + 1;
                        if (day < 1 || day > count) return const SizedBox(height: 44);
                        final d = DateTime(_month.year, _month.month, day);
                        final has = on(d);
                        return Semantics(
                          button: has.isNotEmpty,
                          label:
                              '${DateFormat('d MMMM').format(d)}${has.isEmpty ? '' : ', ${has.map((e) => e.title).join(', ')}'}',
                          excludeSemantics: true,
                          child: GestureDetector(
                            behavior: HitTestBehavior.opaque,
                            onTap: has.isEmpty
                                ? null
                                : () {
                                    Get.back<void>();
                                    _openEvent(has.first);
                                  },
                            child: SizedBox(
                              height: 44,
                              child: Column(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  Container(
                                    width: 32,
                                    height: 32,
                                    alignment: Alignment.center,
                                    decoration: BoxDecoration(
                                      shape: BoxShape.circle,
                                      color: has.isNotEmpty ? _pigment(has.first.category).fill : null,
                                      border: d == today ? Border.all(color: c.line2, width: 1.5) : null,
                                    ),
                                    child: Text(
                                      '$day',
                                      style: anek(
                                        14,
                                        has.isNotEmpty ? 700 : 560,
                                        height: 1,
                                        tabular: true,
                                        color: has.isNotEmpty ? _pigment(has.first.category).on : c.ink2,
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        );
                      },
                    ),
                  ),
              ],
            ),
          const SizedBox(height: 12),
          if (listed.isEmpty)
            Padding(
              padding: const EdgeInsets.only(bottom: 16),
              child: Text('events.none_month'.tr, style: context.type.cap),
            )
          else
            for (final e in listed)
              Pressable(
                onTap: () {
                  Get.back<void>();
                  _openEvent(e);
                },
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  child: Row(
                    children: [
                      Dot(_pigment(e.category).fill, size: 10),
                      const SizedBox(width: 12),
                      Expanded(child: Text(e.title, style: context.type.t)),
                      Text(DateFormat('EEE d').format(e.date), style: context.type.cap),
                    ],
                  ),
                ),
              ),
          const SizedBox(height: 12),
        ],
      ),
    );
  }
}

class EventDetailView extends GetView<EventsController> {
  const EventDetailView({super.key});

  @override
  Widget build(BuildContext context) {
    final c = context.app;
    final inset = MediaQuery.paddingOf(context);
    return Obx(() {
      controller.pending.length;
      controller.state.value;
      final event = controller.byId(Get.parameters['id']);
      if (event == null) {
        return PageFrame(
          leading: const BackGlass(),
          onRefresh: controller.load,
          children: [
            ViewStateView(
              state: controller.state.value,
              onRetry: controller.load,
              errorKey: controller.errorMessage.value,
              child: const EmptyState(art: EmptyArt.search, title: 'events.gone', body: 'events.gone_body'),
            ),
          ],
        );
      }
      final pigment = _pigment(event.category);
      final answer = controller.mine(event);
      final going = controller.going(event);
      final start = event.time.split(':');
      final gates = DateTime(
        2000,
        1,
        1,
        int.parse(start[0]),
        int.parse(start[1]),
      ).subtract(const Duration(minutes: 15));
      final droplet = switch (answer) {
        RsvpStatus.going => AppColors.ok,
        RsvpStatus.maybe => AppColors.late,
        _ => c.ink,
      };
      return PageFrame(
        padContent: false,
        topPadding: 0,
        leading: BackGlass(color: pigment.on),
        actions: [
          GlassIconButton(
            icon: PhosphorIconsRegular.calendarPlus,
            label: 'notices.add_calendar'.tr,
            color: pigment.on,
            onTap: () => unawaited(
              addToCalendar(
                title: event.title,
                first: event.date,
                details: '${_time(event.time)} · ${event.venue}\n${event.description}',
              ),
            ),
          ),
        ],
        bottomBarHeight: 60,
        bottomBar: GlassSegmented(
          labels: const ['events.going', 'events.maybe', 'events.cant'],
          index: answer == null ? -1 : _answers.indexOf(answer),
          height: 60,
          droplet: droplet,
          dropletText: answer == null || answer == RsvpStatus.cant ? c.chalk : AppColors.white,
          semanticLabel: 'events.are_you_going'.tr,
          onChanged: (i) => unawaited(controller.rsvp(event.id, _answers[i])),
        ),
        children: [
          Container(
            height: 256 + inset.top,
            color: pigment.fill,
            padding: const EdgeInsets.fromLTRB(22, 0, 22, 22),
            child: Stack(
              clipBehavior: Clip.none,
              children: [
                Positioned(
                  right: -62,
                  top: inset.top - 4,
                  child: Container(
                    width: 200,
                    height: 200,
                    decoration: const BoxDecoration(color: Color(0x14FFFFFF), shape: BoxShape.circle),
                  ),
                ),
                Positioned(
                  right: 28,
                  top: inset.top + 66,
                  child: Container(
                    width: 70,
                    height: 70,
                    decoration: const BoxDecoration(color: Color(0x809BC53D), shape: BoxShape.circle),
                  ),
                ),
                Align(
                  alignment: Alignment.bottomLeft,
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                        decoration: BoxDecoration(color: AppColors.white, borderRadius: BorderRadius.circular(16)),
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(
                              '${event.date.day}',
                              style: anek(30, 780, width: 122, height: 1, color: const Color(0xFF10201B)),
                            ),
                            Text(
                              DateFormat('MMM · EEE').format(event.date).toUpperCase(),
                              style: anek(11, 700, height: 1.3, em: .08, color: const Color(0xFF10201B)),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Text(event.title, style: context.type.h1.copyWith(color: pigment.on)),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          Padding(
            padding: EdgeInsets.fromLTRB(math.max(20, (MediaQuery.sizeOf(context).width - 720) / 2), 20, 20, 0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Rise(
                  child: EduCard(
                    child: Column(
                      children: [
                        _Fact(
                          icon: PhosphorIconsRegular.clock,
                          title: _time(event.time),
                          sub: 'events.gates'.trp({'time': DateFormat('h:mm').format(gates)}),
                        ),
                        const Hr(indent: 46),
                        _Fact(icon: PhosphorIconsRegular.mapPin, title: event.venue),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                Rise(index: 1, child: Text(event.description, style: context.type.b)),
                if (going > 0) ...[
                  const SizedBox(height: 16),
                  Rise(
                    index: 2,
                    child: Text(
                      going == 1 ? 'events.one_going'.tr : 'events.n_going'.trp({'n': '$going'}),
                      style: anek(13, 600, height: 1.3, color: c.ink3),
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

class _Fact extends StatelessWidget {
  const _Fact({required this.icon, required this.title, this.sub});

  final IconData icon;
  final String title;
  final String? sub;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(top: 2),
          child: Icon(icon, size: 18, color: context.app.ink),
        ),
        const SizedBox(width: 14),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: context.type.t),
              if (sub != null) Text(sub!, style: context.type.cap),
            ],
          ),
        ),
      ],
    ),
  );
}
