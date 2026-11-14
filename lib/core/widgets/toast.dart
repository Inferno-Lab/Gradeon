import 'dart:async';

import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:tangent/core/theme/app_colors.dart';
import 'package:tangent/core/theme/tokens.dart';
import 'package:tangent/core/utils/extensions.dart';
import 'package:tangent/core/widgets/glass.dart';
import 'package:phosphor_flutter/phosphor_flutter.dart';

enum ToastKind { success, error, info }

class _Toast {
  _Toast(this.message, this.kind, this.body);

  final String message;
  final ToastKind kind;
  final String? body;
  final key = UniqueKey();
}

/// Glass toasts that drop from the top. [ToastHost] sits above the navigator.
abstract final class ToastHelper {
  static final _items = <_Toast>[].obs;

  static void show(String messageKey, {ToastKind kind = ToastKind.info, String? body}) {
    if (Get.testMode) return;
    final toast = _Toast(messageKey, kind, body);
    _items.add(toast);
    if (_items.length > 2) _items.removeAt(0);
    Timer(AppMotion.toastHold, () => _items.remove(toast));
  }
}

class ToastHost extends StatelessWidget {
  const ToastHost({required this.child, super.key});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        child,
        Positioned(
          left: 0,
          right: 0,
          top: MediaQuery.paddingOf(context).top + 6,
          // Above the Navigator there is no Material, so text would get the debug double underline.
          child: Material(type: MaterialType.transparency, child: Obx(() {
            final items = ToastHelper._items.toList();
            return Column(
              children: [
                for (final toast in items)
                  Padding(
                    key: toast.key,
                    padding: const EdgeInsets.only(bottom: 10),
                    child: _ToastCard(toast: toast),
                  ),
              ],
            );
          })),
        ),
      ],
    );
  }
}

class _ToastCard extends StatelessWidget {
  const _ToastCard({required this.toast});

  final _Toast toast;

  @override
  Widget build(BuildContext context) {
    final c = context.app;
    final (color, icon) = switch (toast.kind) {
      ToastKind.success => (AppColors.ok, PhosphorIconsBold.check),
      ToastKind.error => (AppColors.bad, PhosphorIconsBold.exclamationMark),
      ToastKind.info => (c.ink, PhosphorIconsBold.info),
    };
    final card = Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 420),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24),
          child: Semantics(
            liveRegion: true,
            child: Glass(
              height: 56,
              radius: 999,
              tint: c.paper.withValues(alpha: .97),
              padding: const EdgeInsets.only(left: 10, right: 16),
              child: Row(
                children: [
                  Container(
                    width: 38,
                    height: 38,
                    decoration: BoxDecoration(
                      color: color,
                      shape: BoxShape.circle,
                    ),
                    child: Icon(icon, size: 18, color: toast.kind == ToastKind.info ? c.chalk : AppColors.white),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          toast.message.tr,
                          maxLines: toast.body == null ? 2 : 1,
                          overflow: TextOverflow.ellipsis,
                          style: context.type.ts,
                        ),
                        if (toast.body != null)
                          Text(
                            toast.body!.tr,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: context.type.cap,
                          ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
    if (context.reduceMotion) return card;
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0, end: 1),
      duration: AppMotion.t4,
      curve: kEase,
      builder: (context, t, child) => Opacity(
        opacity: t.clamp(0, 1),
        child: Transform.translate(
          offset: Offset(0, -70 * (1 - t)),
          child: Transform.scale(scale: .9 + .1 * t, child: child),
        ),
      ),
      child: card,
    );
  }
}
