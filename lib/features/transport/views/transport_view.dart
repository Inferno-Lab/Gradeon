import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:gradeon/core/routes/app_routes.dart';
import 'package:gradeon/core/theme/app_colors.dart';
import 'package:gradeon/core/theme/app_typography.dart';
import 'package:gradeon/core/utils/extensions.dart';
import 'package:gradeon/core/utils/view_state.dart';
import 'package:gradeon/core/widgets/empty_art.dart';
import 'package:gradeon/core/widgets/glass.dart';
import 'package:gradeon/core/widgets/page.dart';
import 'package:gradeon/core/widgets/states.dart';
import 'package:gradeon/core/widgets/ui.dart';
import 'package:gradeon/data/models/campus.dart';
import 'package:gradeon/features/transport/controllers/transport_controller.dart';
import 'package:phosphor_flutter/phosphor_flutter.dart';

/// Bus: painted map with the bus as a glass bubble, then the stops sheet.
class TransportView extends GetView<TransportController> {
  const TransportView({super.key});

  @override
  Widget build(BuildContext context) {
    final c = context.app;
    final inset = MediaQuery.paddingOf(context);
    return Obx(() {
      final route = controller.route;
      if (route == null || controller.state.value != ViewState.success) {
        return PageFrame(
          leading: const BackGlass(),
          onRefresh: controller.load,
          children: [
            const PageTitle('transport.title'),
            const SizedBox(height: 18),
            ViewStateView(
              state: controller.state.value,
              onRetry: controller.load,
              errorKey: controller.errorMessage.value,
              emptyTitle: 'transport.empty',
              emptyBody: 'transport.empty_body',
              emptyArt: EmptyArt.bus,
              emptyHint: 'transport.empty_hint',
              emptyActions: [EmptyAction('common.ask_office', icon: PhosphorIconsRegular.lifebuoy, onTap: () => Get.toNamed<void>(AppRoutes.help))],
              child: const SizedBox.shrink(),
            ),
          ],
        );
      }
      return Scaffold(
        backgroundColor: c.chalk,
        body: LayoutBuilder(
          builder: (context, box) {
            // The map is drawn at 390 wide and scales with the screen; the
            // sheet always keeps at least 45% of the height.
            final scale = box.maxWidth / 390;
            final mapH = math.min(470 * scale, box.maxHeight * .55);
            return Stack(
              children: [
                Positioned(
                  left: 0,
                  right: 0,
                  top: 0,
                  height: mapH,
                  child: _RouteMap(route: route, scale: scale),
                ),
                Positioned(
                  left: 16,
                  right: 16,
                  top: inset.top + 8,
                  child: Row(
                    children: [
                      const BackGlass(),
                      const Spacer(),
                      Glass(
                        height: 44,
                        width: 170,
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            PulseDot(AppColors.ok),
                            const SizedBox(width: 8),
                            Flexible(
                              child: Text(
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                'transport.live'.trp({'route': route.routeName.split(' · ').first}),
                                style: anek(14, 680, height: 1, color: c.ink),
                              ),
                            ),
                          ],
                        ),
                      ),
                      const Spacer(),
                      GlassIconButton(
                        icon: PhosphorIconsRegular.crosshair,
                        label: 'transport.centre'.tr,
                        onTap: () => _BusBubble.nudge.value++,
                      ),
                    ],
                  ),
                ),
                Positioned(
                  left: 0,
                  right: 0,
                  top: mapH - 26,
                  bottom: 0,
                  child: _StopsSheet(route: route, controller: controller),
                ),
              ],
            );
          },
        ),
      );
    });
  }
}

class _RouteMap extends StatelessWidget {
  const _RouteMap({required this.route, required this.scale});

  final TransportInfo route;
  final double scale;

  static Path routePath() => Path()
    ..moveTo(70, 60)
    ..cubicTo(80, 160, 120, 250, 200, 300)
    // SVG "S 300 340, 330 400": first control mirrors (120,250) about (200,300).
    ..cubicTo(280, 350, 300, 340, 330, 400);

  @override
  Widget build(BuildContext context) {
    final metric = routePath().computeMetrics().first;
    final progress = route.progress.clamp(0.0, 1.0);
    final bus = metric.getTangentForOffset(metric.length * progress)!.position * scale;
    return Semantics(
      label: 'transport.map_label'.trp({'route': route.routeName}),
      image: true,
      child: ClipRect(
        child: Stack(
          children: [
            Positioned.fill(
              child: CustomPaint(
                painter: _MapPainter(route: route, scale: scale),
              ),
            ),
            Positioned(left: bus.dx - 32, top: bus.dy - 32, child: const _BusBubble()),
          ],
        ),
      ),
    );
  }
}

class _MapPainter extends CustomPainter {
  _MapPainter({required this.route, required this.scale});

  final TransportInfo route;
  final double scale;

  static int _minutes(String hhmm) {
    final p = hhmm.split(':');
    return int.parse(p[0]) * 60 + int.parse(p[1]);
  }

  @override
  void paint(Canvas canvas, Size size) {
    canvas
      ..drawRect(Offset.zero & size, Paint()..color = const Color(0xFFE3E8E2))
      ..save()
      ..scale(scale);
    Paint road(Color color, double width) => Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = width;
    const paper = Color(0xFFFBFCF9);
    canvas
      ..drawPath(
        Path()
          ..moveTo(-10, 120)
          ..cubicTo(80, 140, 160, 90, 400, 110),
        road(paper, 18),
      )
      ..drawPath(
        Path()
          ..moveTo(60, -10)
          ..cubicTo(80, 160, 40, 300, 90, 480),
        road(paper, 14),
      )
      ..drawPath(
        Path()
          ..moveTo(-10, 330)
          ..cubicTo(120, 300, 260, 360, 400, 320),
        road(paper, 22),
      )
      ..drawPath(
        Path()
          ..moveTo(250, -10)
          ..cubicTo(230, 120, 300, 240, 280, 480),
        road(paper, 12),
      )
      ..drawRect(const Rect.fromLTWH(150, 180, 70, 60), Paint()..color = const Color(0xFFD2DDD2))
      ..drawRect(const Rect.fromLTWH(300, 380, 60, 50), Paint()..color = const Color(0xFFD2DDD2))
      ..drawPath(
        Path()
          ..moveTo(-10, 410)
          ..cubicTo(60, 400, 120, 440, 180, 430),
        road(const Color(0xFFBFD6E6), 16),
      );

    const ink = Color(0xFF10201B);
    final path = _RouteMap.routePath();
    final metric = path.computeMetrics().first;
    final progress = route.progress.clamp(0.0, 1.0);
    canvas
      ..drawPath(path, road(ink, 5)..strokeCap = StrokeCap.round)
      ..drawPath(metric.extractPath(0, metric.length * progress), road(AppColors.mari, 5)..strokeCap = StrokeCap.round);

    // Stops sit along the route in proportion to their scheduled times.
    final stops = route.stops;
    if (stops.isNotEmpty) {
      final t0 = _minutes(stops.first.time);
      final span = math.max(1, _minutes(stops.last.time) - t0);
      final next = stops.indexWhere((s) => !s.reached);
      for (var i = 0; i < stops.length; i++) {
        final at = metric
            .getTangentForOffset(metric.length * ((_minutes(stops[i].time) - t0) / span).clamp(0, 1))!
            .position;
        final last = i == stops.length - 1;
        if (last) {
          canvas
            ..drawCircle(at, 9, Paint()..color = AppColors.mari)
            ..drawCircle(at, 9, road(ink, 3));
        } else if (stops[i].reached) {
          canvas.drawCircle(at, 7, Paint()..color = ink);
        } else {
          canvas
            ..drawCircle(at, 7, Paint()..color = paper)
            ..drawCircle(at, 7, road(ink, i == next ? 3 : 2));
        }
        if (i == 0 || last) {
          final label = TextPainter(
            text: TextSpan(
              text: stops[i].name,
              style: anek(11, 700, height: 1, color: const Color(0xFF36443F)),
            ),
            textDirection: TextDirection.ltr,
          )..layout();
          // First label sits down-right of its stop (up-right ran under the top pill), last label below-left.
          final o = i == 0 ? at + const Offset(14, 22) : at + Offset(-48, 25 - label.height * .8);
          label.paint(canvas, o);
        }
      }
    }
    canvas.restore();
  }

  @override
  bool shouldRepaint(_MapPainter old) => old.route != route || old.scale != scale;
}

class _BusBubble extends StatefulWidget {
  const _BusBubble();

  /// Bumped by "Centre on bus" to make the bubble bounce where it is.
  static final nudge = 0.obs;

  @override
  State<_BusBubble> createState() => _BusBubbleState();
}

class _BusBubbleState extends State<_BusBubble> with TickerProviderStateMixin {
  late final _ride = AnimationController(vsync: this, duration: const Duration(seconds: 3));
  late final _pop = AnimationController(vsync: this, duration: const Duration(milliseconds: 600), value: 1);
  late final Worker _worker;

  @override
  void initState() {
    super.initState();
    _worker = ever(_BusBubble.nudge, (_) => _pop.forward(from: 0));
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (context.reduceMotion) {
      _ride.value = 0;
    } else if (!_ride.isAnimating) {
      _ride.repeat(reverse: true);
    }
  }

  @override
  void dispose() {
    _worker.dispose();
    _ride.dispose();
    _pop.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
    animation: Listenable.merge([_ride, _pop]),
    builder: (context, child) {
      final t = Curves.easeInOut.transform(_ride.value);
      final pop = 1 + .18 * math.sin(math.pi * _pop.value) * (1 - _pop.value);
      return Transform.translate(
        offset: Offset(10 * t, -8 * t),
        child: Transform.scale(scale: pop, child: child),
      );
    },
    child: DecoratedBox(
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        boxShadow: [
          BoxShadow(
            color: const Color(0xFF10201B).withValues(alpha: .5),
            blurRadius: 26,
            spreadRadius: -8,
            offset: const Offset(0, 12),
          ),
        ],
      ),
      child: const Glass(
        width: 64,
        height: 64,
        radius: 32,
        kind: GlassKind.lens,
        shadow: false,
        tint: Color(0x2EFFFFFF),
        child: Icon(PhosphorIconsBold.bus, color: Color(0xFF10201B), size: 24),
      ),
    ),
  );
}

class _StopsSheet extends StatelessWidget {
  const _StopsSheet({required this.route, required this.controller});

  final TransportInfo route;
  final TransportController controller;

  static const _row = 37.0;

  @override
  Widget build(BuildContext context) {
    final c = context.app;
    final stops = route.stops;
    final reached = stops.where((s) => s.reached).length;
    final next = stops.indexWhere((s) => !s.reached);
    return Container(
      decoration: BoxDecoration(
        color: c.paper,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(32)),
        border: Border(top: BorderSide(color: c.line)),
      ),
      child: ListView(
        padding: EdgeInsets.fromLTRB(20, 22, 20, MediaQuery.paddingOf(context).bottom + 22),
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Overline('transport.to'.trp({'stop': stops.isEmpty ? '' : stops.last.name})),
                    const SizedBox(height: 8),
                    Text.rich(
                      TextSpan(
                        text: '${route.etaMinutes}',
                        children: [TextSpan(text: ' ${'transport.min'.tr}', style: const TextStyle(fontSize: 22))],
                      ),
                      style: context.type.dl,
                    ),
                  ],
                ),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    route.busNumber,
                    style: context.type.mono.copyWith(fontSize: 13, fontWeight: FontWeight.w600, color: c.ink),
                  ),
                  const SizedBox(height: 4),
                  Text(route.routeName, style: context.type.cap),
                ],
              ),
            ],
          ),
          const SizedBox(height: 16),
          SizedBox(
            height: stops.length * _row,
            child: Stack(
              children: [
                Positioned(
                  left: 6,
                  top: _row / 2,
                  bottom: _row / 2,
                  child: Container(width: 2, color: c.line2),
                ),
                if (reached > 0)
                  Positioned(
                    left: 6,
                    top: _row / 2,
                    height:
                        _row * (math.min(reached, stops.length - 1) - (reached < stops.length ? .5 : 0)).clamp(0, 99),
                    child: Container(width: 2, color: c.ink),
                  ),
                Column(
                  children: [
                    for (var i = 0; i < stops.length; i++)
                      SizedBox(
                        height: _row,
                        child: _StopRow(stop: stops[i], next: i == next, last: i == stops.length - 1),
                      ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              Avatar(route.driver.name, background: c.paper2, foreground: c.ink),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(route.driver.name, style: context.type.t),
                    Text('transport.driver'.tr, style: context.type.cap),
                  ],
                ),
              ),
              Semantics(
                label: 'transport.call_driver'.trp({'name': route.driver.name}),
                excludeSemantics: true,
                child: Btn(
                  'transport.call',
                  kind: BtnKind.quiet,
                  small: true,
                  icon: PhosphorIconsRegular.phone,
                  onPressed: () => unawaited(controller.callDriver()),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _StopRow extends StatelessWidget {
  const _StopRow({required this.stop, required this.next, required this.last});

  final BusStop stop;
  final bool next;
  final bool last;

  @override
  Widget build(BuildContext context) {
    final c = context.app;
    final Widget dot = stop.reached && !last
        ? Dot(c.ink, size: 14)
        : Container(
            width: 14,
            height: 14,
            decoration: BoxDecoration(
              color: last ? AppColors.mari : c.paper,
              shape: BoxShape.circle,
              border: Border.all(color: c.ink, width: 3),
            ),
          );
    final name = last
        ? 'transport.your_stop'.trp({'stop': stop.name})
        : next
        ? 'transport.next_stop'.trp({'stop': stop.name})
        : stop.name;
    final time = stop.time.startsWith('0') ? stop.time.substring(1) : stop.time;
    return Row(
      children: [
        dot,
        const SizedBox(width: 12),
        Expanded(
          child: Text(
            name,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: stop.reached && !last ? context.type.s : context.type.t.copyWith(fontSize: 15),
          ),
        ),
        Text(time, style: context.type.mono.copyWith(color: c.ink3, fontSize: 13)),
      ],
    );
  }
}
