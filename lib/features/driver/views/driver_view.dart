import 'dart:async';

import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:gradeon/core/utils/extensions.dart';
import 'package:gradeon/core/widgets/empty_kit.dart';
import 'package:gradeon/core/widgets/page.dart';
import 'package:gradeon/core/widgets/sheets.dart';
import 'package:gradeon/core/widgets/states.dart';
import 'package:gradeon/core/widgets/ui.dart';
import 'package:gradeon/data/models/driver.dart';
import 'package:gradeon/features/driver/controllers/driver_controller.dart';
import 'package:intl/intl.dart';
import 'package:phosphor_flutter/phosphor_flutter.dart';

/// The driver's Home and Trips: today's routes, start a trip, mark each child at their stop, say the bus is late, end the trip.
class DriverView extends GetView<DriverController> {
  const DriverView({super.key});

  @override
  Widget build(BuildContext context) {
    return Obx(() {
      final routes = controller.routes.toList();
      return PageFrame(
        dockPage: true,
        onRefresh: controller.load,
        children: [
          Rise(child: PageTitle('driver.title', subtitle: DateFormat('EEEE d MMMM').format(DateTime.now()))),
          ViewStateView(
            state: controller.state.value,
            onRetry: controller.load,
            errorKey: controller.errorMessage.value,
            emptyArt: EmptyArt.transport,
            emptyTitle: 'driver.empty',
            emptyBody: 'driver.empty_body',
            emptyHint: 'driver.empty_hint',
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [for (var i = 0; i < routes.length; i++) Rise(index: i + 1, child: _RouteCard(route: routes[i], controller: controller))],
            ),
          ),
        ],
      );
    });
  }
}

class _RouteCard extends StatelessWidget {
  const _RouteCard({required this.route, required this.controller});

  final DriverRoute route;
  final DriverController controller;

  @override
  Widget build(BuildContext context) {
    final c = context.app;
    final trip = route.running;
    final done = route.trips.where((t) => t.endedAt != null).length;
    return Padding(
      padding: const EdgeInsets.only(top: 16),
      child: EduCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(route.name, style: context.type.h3),
                      Text('${route.vehicle} · ${'driver.trips_done'.trn(done)}', style: context.type.cap),
                    ],
                  ),
                ),
                if (trip != null) Chip2('driver.running'.tr, background: c.okSoft, foreground: c.ink),
              ],
            ),
            const SizedBox(height: 16),
            if (trip == null)
              Btn(
                controller.kindNow == 'morning' ? 'driver.start_morning' : 'driver.start_afternoon',
                icon: PhosphorIconsRegular.play,
                expand: true,
                loading: controller.busy.value,
                onPressed: () => unawaited(controller.start(route)),
              )
            else ...[
              if (trip.lateMinutes > 0)
                Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: Text('driver.late_told'.trp({'n': '${trip.lateMinutes}'}), style: context.type.s),
                ),
              for (final stop in route.stops) ...[
                SectionLabel('${stop.time} · ${stop.name}', top: 12),
                if (stop.riders.isEmpty) Text('driver.no_riders'.tr, style: context.type.cap),
                for (final rider in stop.riders) _RiderRow(route: route, trip: trip, stop: stop, rider: rider, controller: controller),
              ],
              const SizedBox(height: 16),
              Row(
                children: [
                  Expanded(
                    child: Btn('driver.late', kind: BtnKind.quiet, icon: PhosphorIconsRegular.clockCountdown, onPressed: () => unawaited(_late(context, trip))),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Btn('driver.end', kind: BtnKind.ink, icon: PhosphorIconsRegular.flagCheckered, loading: controller.busy.value, onPressed: () => unawaited(_end(trip))),
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }

  Future<void> _end(BusTrip trip) async {
    final ok = await confirmSheet(title: 'driver.end_title', body: 'driver.end_body', confirm: 'driver.end', danger: false, icon: PhosphorIconsRegular.flagCheckered);
    if (ok) await controller.end(trip.id);
  }

  /// Running late: how many minutes and why; the office and the families on the route are told.
  Future<void> _late(BuildContext context, BusTrip trip) async {
    var minutes = 10;
    controller.reason.clear();
    final send = await showSheet<bool>(
      StatefulBuilder(
        builder: (context, setState) => SheetBody(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
            Text('driver.late_title'.tr, style: context.type.h2),
            const SizedBox(height: 16),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final m in const [5, 10, 15, 30, 45])
                  Chip2('driver.minutes'.trp({'n': '$m'}), on: m == minutes, onTap: () => setState(() => minutes = m)),
              ],
            ),
            const SizedBox(height: 16),
            Field(controller: controller.reason, label: 'driver.late_reason', hint: 'driver.late_hint'),
            const SizedBox(height: 16),
            Btn('driver.late_send', expand: true, onPressed: () => Get.back<bool>(result: true)),
            const SizedBox(height: 16),
            ],
          ),
        ),
      ),
    );
    if (send ?? false) {
      final why = controller.reason.text.trim();
      await controller.late(trip.id, minutes, why.length < 3 ? 'driver.late_default'.tr : why);
    }
  }
}

class _RiderRow extends StatelessWidget {
  const _RiderRow({required this.route, required this.trip, required this.stop, required this.rider, required this.controller});

  final DriverRoute route;
  final BusTrip trip;
  final DriverStop stop;
  final Rider rider;
  final DriverController controller;

  @override
  Widget build(BuildContext context) {
    final c = context.app;
    final now = controller.markOf(route, trip.id, rider.id);
    const events = ['boarded', 'dropped', 'absent'];
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          Avatar(rider.name, size: 36, background: c.paper2, foreground: c.ink),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(rider.name, style: context.type.t, maxLines: 1, overflow: TextOverflow.ellipsis),
                Text(now == null ? rider.className : 'driver.mark_$now'.tr, style: context.type.cap),
              ],
            ),
          ),
          for (final e in events)
            Padding(
              padding: const EdgeInsets.only(left: 6),
              child: Chip2(
                'driver.do_$e'.tr,
                on: now == e,
                onTap: controller.busy.value ? null : () => unawaited(controller.mark(route, trip.id, rider, e, stop.id)),
              ),
            ),
        ],
      ),
    );
  }
}
