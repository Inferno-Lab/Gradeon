import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:gradeon/core/theme/app_colors.dart';
import 'package:gradeon/core/theme/tokens.dart';
import 'package:gradeon/core/utils/extensions.dart';
import 'package:gradeon/core/widgets/ui.dart';
import 'package:phosphor_flutter/phosphor_flutter.dart';

/// Opens a paper sheet over a scrim (content sheets are solid, never glass).
/// [dismissible] false keeps it open until it closes itself (a step the person must answer).
Future<T?> showSheet<T>(Widget child, {bool dismissible = true}) {
  return Get.bottomSheet<T>(
    child,
    isScrollControlled: true,
    isDismissible: dismissible,
    enableDrag: dismissible,
    backgroundColor: Colors.transparent,
    barrierColor: Get.context?.app.scrim,
    enterBottomSheetDuration: AppMotion.t4,
    exitBottomSheetDuration: AppMotion.t3,
  );
}

class SheetBody extends StatelessWidget {
  const SheetBody({required this.child, this.padding = const EdgeInsets.fromLTRB(20, 0, 20, 0), this.footer, super.key});

  final Widget child;
  final EdgeInsetsGeometry padding;

  /// Stays in view under the scrolling [child] (the actions of a step the person must answer).
  final Widget? footer;

  @override
  Widget build(BuildContext context) {
    final inset = MediaQuery.viewInsetsOf(context).bottom;
    final safe = MediaQuery.paddingOf(context).bottom;
    return Padding(
      padding: EdgeInsets.only(bottom: inset),
      child: Container(
        constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(context).height * .9),
        decoration: BoxDecoration(
          color: context.app.paper,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(AppRadius.sheet)),
          boxShadow: [BoxShadow(color: AppColors.light.ink.withValues(alpha: 0.2), blurRadius: 40, offset: const Offset(0, -12))],
        ),
        child: SafeArea(
          top: false,
          minimum: EdgeInsets.only(bottom: safe > 0 ? 0 : 20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Grab(),
              Flexible(
                child: SingleChildScrollView(
                  padding: padding,
                  child: child,
                ),
              ),
              if (footer != null) Padding(padding: const EdgeInsets.fromLTRB(24, 12, 24, 16), child: footer),
            ],
          ),
        ),
      ),
    );
  }
}

/// Confirmation sheet from the canvas: icon bubble, title, body, two buttons.
Future<bool> confirmSheet({
  required String title,
  required String body,
  required String confirm,
  String cancel = 'common.cancel',
  bool danger = true,
  IconData icon = PhosphorIconsRegular.signOut,
}) async {
  final result = await showSheet<bool>(
    Builder(
      builder: (context) {
        final c = context.app;
        return SheetBody(
          padding: const EdgeInsets.fromLTRB(24, 24, 24, 20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  Container(
                    width: 46,
                    height: 46,
                    decoration: BoxDecoration(color: danger ? c.badSoft : c.mariSoft, shape: BoxShape.circle),
                    child: Icon(icon, color: danger ? c.badText : c.mariText),
                  ),
                  const SizedBox(width: 12),
                  Expanded(child: Text(title.tr, style: context.type.h2)),
                ],
              ),
              const SizedBox(height: 12),
              Text(body.tr, style: context.type.b.copyWith(color: c.ink2)),
              const SizedBox(height: 24),
              Btn(
                confirm,
                kind: danger ? BtnKind.danger : BtnKind.primary,
                expand: true,
                onPressed: () => Get.back(result: true),
              ),
              const SizedBox(height: 10),
              Btn(cancel, kind: BtnKind.quiet, expand: true, onPressed: () => Get.back(result: false)),
            ],
          ),
        );
      },
    ),
  );
  return result ?? false;
}
