import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:gradeon/core/theme/app_colors.dart';
import 'package:gradeon/core/utils/extensions.dart';

/// The scene drawn above an empty state. Each one shows the thing that will
/// appear, with an empty or dashed slot where it is still to come.
enum EmptyArt {
  books,
  calendar,
  wallet,
  bus,
  bell,
  chat,
  photos,
  notice,
  homework,
  columns,
  plane,
  search,
  clock,
  attendance,
}

class EmptyArtView extends StatelessWidget {
  const EmptyArtView(this.art, {this.height = 140, super.key});

  final EmptyArt art;
  final double height;

  @override
  Widget build(BuildContext context) {
    final c = context.app;
    return ExcludeSemantics(
      child: SizedBox(
        width: height * 220 / 150,
        height: height,
        child: CustomPaint(
          painter: _ArtPainter(art, ink: c.ink, paper: c.paper, paper2: c.paper2, line: c.line2, ground: c.ink3),
        ),
      ),
    );
  }
}

class _ArtPainter extends CustomPainter {
  _ArtPainter(this.art, {required this.ink, required this.paper, required this.paper2, required this.line, required this.ground});

  final EmptyArt art;
  final Color ink;
  final Color paper;
  final Color paper2;
  final Color line;
  final Color ground;

  Color _p(String id) => AppColors.subject(id).fill;

  @override
  void paint(Canvas canvas, Size size) {
    // Drawn on a 220 x 150 board and scaled to fit.
    canvas.scale(size.width / 220, size.height / 150);
    switch (art) {
      case EmptyArt.books:
        _books(canvas);
      case EmptyArt.calendar:
        _calendar(canvas);
      case EmptyArt.wallet:
        _wallet(canvas);
      case EmptyArt.bus:
        _bus(canvas);
      case EmptyArt.bell:
        _bell(canvas);
      case EmptyArt.chat:
        _chat(canvas);
      case EmptyArt.photos:
        _photos(canvas);
      case EmptyArt.notice:
        _notice(canvas);
      case EmptyArt.homework:
        _homework(canvas);
      case EmptyArt.columns:
        _columns(canvas);
      case EmptyArt.plane:
        _plane(canvas);
      case EmptyArt.search:
        _search(canvas);
      case EmptyArt.clock:
        _clock(canvas);
      case EmptyArt.attendance:
        _attendance(canvas);
    }
  }

  // ── primitives ──
  Paint _fill(Color c) => Paint()..color = c;

  Paint _stroke(Color c, [double w = 2]) => Paint()
    ..color = c
    ..style = PaintingStyle.stroke
    ..strokeWidth = w
    ..strokeCap = StrokeCap.round;

  void _rr(Canvas canvas, Rect r, double radius, Color c) => canvas.drawRRect(RRect.fromRectAndRadius(r, Radius.circular(radius)), _fill(c));

  void _shadow(Canvas canvas, Rect r, double radius) => canvas.drawRRect(
    RRect.fromRectAndRadius(r.shift(const Offset(0, 8)), Radius.circular(radius)),
    Paint()
      ..color = const Color(0x2610201B)
      ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 8),
  );

  void _dashed(Canvas canvas, Rect r, double radius, {Color? color}) {
    final path = Path()..addRRect(RRect.fromRectAndRadius(r, Radius.circular(radius)));
    final paint = _stroke(color ?? line, 2);
    for (final m in path.computeMetrics()) {
      for (var d = 0.0; d < m.length; d += 9) {
        canvas.drawPath(m.extractPath(d, math.min(d + 5, m.length)), paint);
      }
    }
  }

  void _ground(Canvas canvas, [double y = 128]) => canvas.drawLine(Offset(20, y), Offset(200, y), _stroke(line, 2));

  void _spark(Canvas canvas, Offset o, double r, Color c) {
    final p = Path()
      ..moveTo(o.dx, o.dy - r)
      ..quadraticBezierTo(o.dx, o.dy, o.dx + r, o.dy)
      ..quadraticBezierTo(o.dx, o.dy, o.dx, o.dy + r)
      ..quadraticBezierTo(o.dx, o.dy, o.dx - r, o.dy)
      ..quadraticBezierTo(o.dx, o.dy, o.dx, o.dy - r);
    canvas.drawPath(p, _fill(c));
  }

  void _lines(Canvas canvas, Offset from, List<double> widths, {double gap = 9, Color? color}) {
    for (var i = 0; i < widths.length; i++) {
      _rr(canvas, Rect.fromLTWH(from.dx, from.dy + i * gap, widths[i], 3), 1.5, color ?? line);
    }
  }

  // ── scenes ──
  void _books(Canvas canvas) {
    _ground(canvas);
    final spec = [('maths', 34.0, 84.0, 0.0), ('science', 64.0, 96.0, 0.0), ('hindi', 94.0, 76.0, 0.0)];
    for (final b in spec) {
      final r = Rect.fromLTWH(b.$2, 128 - b.$3, 26, b.$3);
      _rr(canvas, r, 5, _p(b.$1));
      _rr(canvas, Rect.fromLTWH(b.$2, r.top, 6, b.$3), 3, const Color(0x33000000));
      _rr(canvas, Rect.fromLTWH(b.$2 + 10, r.top + 14, 11, 3), 1.5, const Color(0x66FFFFFF));
    }
    canvas
      ..save()
      ..translate(132, 128)
      ..rotate(.22);
    _rr(canvas, const Rect.fromLTWH(0, -90, 26, 90), 5, _p('english'));
    _rr(canvas, const Rect.fromLTWH(0, -90, 6, 90), 3, const Color(0x33000000));
    canvas.restore();
    _dashed(canvas, const Rect.fromLTWH(164, 44, 26, 84), 5);
    _spark(canvas, const Offset(178, 26), 7, AppColors.mari);
  }

  void _calendar(Canvas canvas) {
    const r = Rect.fromLTWH(50, 20, 120, 106);
    _shadow(canvas, r, 14);
    _rr(canvas, r, 14, paper);
    canvas.drawRRect(RRect.fromRectAndRadius(r, const Radius.circular(14)), _stroke(line, 1.5));
    _rr(canvas, const Rect.fromLTWH(50, 20, 120, 28), 14, AppColors.mari);
    _rr(canvas, const Rect.fromLTWH(50, 34, 120, 14), 0, AppColors.mari);
    for (final x in [78.0, 142.0]) {
      _rr(canvas, Rect.fromLTWH(x - 3, 12, 6, 18), 3, ink);
    }
    for (var row = 0; row < 3; row++) {
      for (var col = 0; col < 5; col++) {
        final o = Offset(67 + col * 21.0, 66 + row * 22.0);
        if (row == 1 && col == 3) {
          canvas.drawCircle(o, 8, _stroke(AppColors.mari, 2));
        } else {
          canvas.drawCircle(o, 3, _fill(line));
        }
      }
    }
    _spark(canvas, const Offset(190, 40), 7, _p('science'));
  }

  void _wallet(Canvas canvas) {
    const r = Rect.fromLTWH(44, 32, 132, 86);
    _shadow(canvas, r, 14);
    _rr(canvas, r, 14, AppColors.mari);
    _rr(canvas, const Rect.fromLTWH(44, 52, 132, 16), 0, const Color(0x33000000));
    _rr(canvas, const Rect.fromLTWH(58, 88, 36, 6), 3, const Color(0x662B1C00));
    _rr(canvas, const Rect.fromLTWH(58, 100, 22, 5), 2.5, const Color(0x442B1C00));
    canvas.drawCircle(const Offset(152, 98), 11, _stroke(const Color(0x992B1C00), 2));
    canvas.drawCircle(const Offset(188, 36), 13, _fill(ink));
    _dashed(canvas, Rect.fromCircle(center: const Offset(26, 54), radius: 12), 12);
    _spark(canvas, const Offset(196, 80), 6, _p('maths'));
  }

  void _bus(Canvas canvas) {
    _ground(canvas, 124);
    for (var x = 24.0; x < 200; x += 22) {
      _rr(canvas, Rect.fromLTWH(x, 134, 12, 3), 1.5, line);
    }
    const body = Rect.fromLTWH(46, 52, 128, 60);
    _shadow(canvas, body, 14);
    _rr(canvas, body, 14, _p('social'));
    for (var i = 0; i < 4; i++) {
      _rr(canvas, Rect.fromLTWH(58 + i * 26.0, 62, 20, 20), 5, const Color(0xCCFFFFFF));
    }
    _rr(canvas, const Rect.fromLTWH(46, 94, 128, 6), 0, const Color(0x33000000));
    for (final x in [76.0, 146.0]) {
      canvas
        ..drawCircle(Offset(x, 114), 11, _fill(ink))
        ..drawCircle(Offset(x, 114), 4, _fill(paper));
    }
    canvas.drawCircle(const Offset(178, 36), 9, _fill(AppColors.mari));
    canvas.drawCircle(const Offset(178, 36), 3.5, _fill(ink));
    final trail = Path()
      ..moveTo(60, 38)
      ..quadraticBezierTo(110, 14, 168, 34);
    for (final m in trail.computeMetrics()) {
      for (var d = 0.0; d < m.length; d += 10) {
        canvas.drawPath(m.extractPath(d, math.min(d + 5, m.length)), _stroke(line, 2));
      }
    }
  }

  void _bell(Canvas canvas) {
    final bell = Path()
      ..moveTo(78, 100)
      ..quadraticBezierTo(80, 82, 80, 66)
      ..cubicTo(80, 40, 140, 40, 140, 66)
      ..quadraticBezierTo(140, 82, 142, 100)
      ..close();
    canvas.drawPath(bell.shift(const Offset(0, 8)), Paint()
      ..color = const Color(0x2610201B)
      ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 8));
    canvas.drawPath(bell, _fill(AppColors.mari));
    _rr(canvas, const Rect.fromLTWH(70, 98, 80, 10), 5, AppColors.mari);
    canvas.drawCircle(const Offset(110, 120), 8, _fill(ink));
    _rr(canvas, const Rect.fromLTWH(106, 28, 8, 12), 4, ink);
    canvas
      ..drawArc(const Rect.fromLTWH(44, 52, 20, 30), math.pi * .6, math.pi * .8, false, _stroke(line, 2.5))
      ..drawArc(const Rect.fromLTWH(156, 52, 20, 30), -math.pi * .4, math.pi * .8, false, _stroke(line, 2.5));
    _spark(canvas, const Offset(168, 26), 7, _p('hindi'));
    _spark(canvas, const Offset(52, 96), 5, _p('science'));
  }

  void _chat(Canvas canvas) {
    const a = Rect.fromLTWH(34, 30, 112, 50);
    _shadow(canvas, a, 18);
    _rr(canvas, a, 18, paper);
    canvas.drawRRect(RRect.fromRectAndRadius(a, const Radius.circular(18)), _stroke(line, 1.5));
    _lines(canvas, const Offset(50, 46), [78, 56, 66], gap: 9);
    const b = Rect.fromLTWH(84, 88, 104, 44);
    _rr(canvas, b, 18, ink);
    for (var i = 0; i < 3; i++) {
      canvas.drawCircle(Offset(114 + i * 18.0, 110), 4, _fill(i == 1 ? AppColors.mari : const Color(0x88FFFFFF)));
    }
    _spark(canvas, const Offset(176, 38), 7, _p('science'));
  }

  void _photos(Canvas canvas) {
    void frame(double dx, double dy, double angle, Color sky, {bool art = false}) {
      canvas
        ..save()
        ..translate(dx, dy)
        ..rotate(angle);
      const r = Rect.fromLTWH(-42, -50, 84, 100);
      _shadow(canvas, r, 8);
      _rr(canvas, r, 8, paper);
      _rr(canvas, const Rect.fromLTWH(-36, -44, 72, 72), 5, sky);
      if (art) {
        canvas
          ..drawCircle(const Offset(14, -22), 8, _fill(AppColors.mari))
          ..drawPath(
            Path()
              ..moveTo(-36, 28)
              ..lineTo(-12, -6)
              ..lineTo(6, 14)
              ..lineTo(18, 2)
              ..lineTo(36, 28)
              ..close(),
            _fill(const Color(0x66000000)),
          );
      }
      canvas.restore();
    }

    frame(80, 80, -.2, _p('hindi'));
    frame(140, 78, .18, _p('science'));
    frame(110, 76, 0, _p('art'), art: true);
    _spark(canvas, const Offset(182, 30), 7, AppColors.mari);
  }

  void _notice(Canvas canvas) {
    void slip(double dx, double dy, double angle, {bool empty = false, Color pin = AppColors.bad}) {
      canvas
        ..save()
        ..translate(dx, dy)
        ..rotate(angle);
      const r = Rect.fromLTWH(-40, -42, 80, 84);
      _shadow(canvas, r, 5);
      _rr(canvas, r, 5, paper);
      canvas.drawRRect(RRect.fromRectAndRadius(r, const Radius.circular(5)), _stroke(line, 1.5));
      if (empty) {
        _dashed(canvas, const Rect.fromLTWH(-30, -20, 60, 52), 4);
      } else {
        _rr(canvas, const Rect.fromLTWH(-30, -26, 30, 10), 3, const Color(0x33C23B2A));
        _lines(canvas, const Offset(-30, -4), [58, 44, 52], gap: 10);
      }
      canvas.drawCircle(const Offset(0, -42), 6, _fill(pin));
      canvas.restore();
    }

    slip(78, 78, -.1);
    slip(144, 76, .09, empty: true, pin: _p('maths'));
  }

  void _homework(Canvas canvas) {
    const sheet = Rect.fromLTWH(54, 20, 100, 112);
    _shadow(canvas, sheet, 8);
    _rr(canvas, sheet, 8, paper);
    canvas.drawRRect(RRect.fromRectAndRadius(sheet, const Radius.circular(8)), _stroke(line, 1.5));
    _rr(canvas, const Rect.fromLTWH(54, 20, 100, 22), 8, _p('maths'));
    _rr(canvas, const Rect.fromLTWH(54, 32, 100, 10), 0, _p('maths'));
    _lines(canvas, const Offset(68, 58), [72, 56, 64, 40], gap: 14);
    canvas.drawCircle(const Offset(136, 112), 9, _stroke(AppColors.ok, 2));
    canvas
      ..save()
      ..translate(172, 96)
      ..rotate(.7);
    _rr(canvas, const Rect.fromLTWH(-5, -52, 10, 64), 3, AppColors.mari);
    canvas
      ..drawPath(
        Path()
          ..moveTo(-5, 12)
          ..lineTo(5, 12)
          ..lineTo(0, 24)
          ..close(),
        _fill(const Color(0xFFE8C9A0)),
      )
      ..restore();
  }

  void _columns(Canvas canvas) {
    _ground(canvas, 128);
    final spec = [('maths', 56.0), ('science', 82.0), ('english', 66.0), ('hindi', 92.0)];
    for (var i = 0; i < spec.length; i++) {
      _rr(canvas, Rect.fromLTWH(38 + i * 32.0, 128 - spec[i].$2, 24, spec[i].$2), 6, _p(spec[i].$1));
    }
    _dashed(canvas, const Rect.fromLTWH(166, 56, 24, 72), 6);
    final path = Path()
      ..moveTo(40, 52)
      ..lineTo(98, 38)
      ..lineTo(130, 44)
      ..lineTo(176, 22);
    canvas.drawPath(path, _stroke(ink.withValues(alpha: .35), 2.5));
    _spark(canvas, const Offset(184, 20), 7, AppColors.mari);
  }

  void _plane(Canvas canvas) {
    final trail = Path()
      ..moveTo(24, 118)
      ..cubicTo(60, 120, 70, 78, 104, 80);
    for (final m in trail.computeMetrics()) {
      for (var d = 0.0; d < m.length; d += 10) {
        canvas.drawPath(m.extractPath(d, math.min(d + 5, m.length)), _stroke(line, 2));
      }
    }
    final plane = Path()
      ..moveTo(110, 82)
      ..lineTo(186, 40)
      ..lineTo(150, 108)
      ..lineTo(136, 84)
      ..close();
    canvas
      ..drawPath(plane.shift(const Offset(0, 8)), Paint()
        ..color = const Color(0x2610201B)
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 8))
      ..drawPath(plane, _fill(_p('english')))
      ..drawPath(
        Path()
          ..moveTo(136, 84)
          ..lineTo(186, 40)
          ..lineTo(142, 96)
          ..close(),
        _fill(const Color(0x33000000)),
      );
    _spark(canvas, const Offset(60, 50), 7, AppColors.mari);
  }

  void _search(Canvas canvas) {
    canvas.drawCircle(const Offset(98, 68), 38, _fill(paper));
    canvas
      ..drawCircle(const Offset(98, 68), 38, _stroke(ink, 8))
      ..drawLine(const Offset(126, 96), const Offset(160, 130), _stroke(ink, 10));
    _lines(canvas, const Offset(78, 58), [40, 28], gap: 12);
    _spark(canvas, const Offset(176, 40), 7, AppColors.mari);
    _spark(canvas, const Offset(40, 108), 5, _p('science'));
  }

  void _clock(Canvas canvas) {
    const blocks = [('maths', 28.0), ('science', 24.0), ('english', 32.0)];
    var y = 22.0;
    for (final b in blocks) {
      _rr(canvas, Rect.fromLTWH(70, y, 120, b.$2 + 4), 10, _p(b.$1));
      _rr(canvas, Rect.fromLTWH(82, y + 10, 50, 4), 2, const Color(0x66FFFFFF));
      y += b.$2 + 12;
    }
    _dashed(canvas, Rect.fromLTWH(70, y, 120, 26), 10);
    canvas
      ..drawCircle(const Offset(40, 74), 24, _fill(paper))
      ..drawCircle(const Offset(40, 74), 24, _stroke(ink, 4))
      ..drawLine(const Offset(40, 74), const Offset(40, 58), _stroke(ink, 3))
      ..drawLine(const Offset(40, 74), const Offset(52, 80), _stroke(AppColors.mari, 3));
  }

  void _attendance(Canvas canvas) {
    for (var row = 0; row < 3; row++) {
      for (var col = 0; col < 6; col++) {
        final o = Offset(46 + col * 26.0, 40 + row * 30.0);
        if (row == 0 && col < 4) {
          canvas.drawCircle(o, 10, _fill(AppColors.ok.withValues(alpha: .85)));
          canvas.drawPath(
            Path()
              ..moveTo(o.dx - 4, o.dy)
              ..lineTo(o.dx - 1, o.dy + 3)
              ..lineTo(o.dx + 5, o.dy - 3),
            _stroke(AppColors.white, 2),
          );
        } else {
          final r = Rect.fromCircle(center: o, radius: 10);
          final path = Path()..addOval(r);
          for (final m in path.computeMetrics()) {
            for (var d = 0.0; d < m.length; d += 7) {
              canvas.drawPath(m.extractPath(d, math.min(d + 3.5, m.length)), _stroke(line, 2));
            }
          }
        }
      }
    }
    _spark(canvas, const Offset(196, 24), 7, AppColors.mari);
  }

  @override
  bool shouldRepaint(_ArtPainter old) => old.art != art || old.ink != ink || old.paper != paper || old.line != line;
}
