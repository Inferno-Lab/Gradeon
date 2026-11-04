import 'dart:async';

import 'package:flutter/material.dart';
import 'package:gradeon/core/theme/tokens.dart';
import 'package:gradeon/core/utils/extensions.dart';

/// Fade-and-rise entrance with a 35ms stagger (first five items), skipped under Reduce motion.
class Rise extends StatefulWidget {
  const Rise({required this.child, this.index = 0, super.key});

  final Widget child;
  final int index;

  @override
  State<Rise> createState() => _RiseState();
}

class _RiseState extends State<Rise> with SingleTickerProviderStateMixin {
  late final _c = AnimationController(vsync: this, duration: AppDurations.rise);
  late final _a = CurvedAnimation(parent: _c, curve: kEase);
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    // Stagger the first few items only; a long list should not wait on its tail.
    final delay = 35 * widget.index.clamp(0, 5);
    if (delay == 0) {
      _c.forward();
    } else {
      _timer = Timer(Duration(milliseconds: delay), () {
        if (mounted) _c.forward();
      });
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (context.reduceMotion) return widget.child;
    return AnimatedBuilder(
      animation: _a,
      child: widget.child,
      builder: (context, child) => Opacity(
        opacity: _a.value,
        child: Transform.translate(offset: Offset(0, 12 * (1 - _a.value)), child: child),
      ),
    );
  }
}
