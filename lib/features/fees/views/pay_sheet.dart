import 'dart:async';

import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:gradeon/core/config/app_config.dart';
import 'package:gradeon/core/routes/app_routes.dart';
import 'package:gradeon/core/theme/app_colors.dart';
import 'package:gradeon/core/theme/app_typography.dart';
import 'package:gradeon/core/theme/tokens.dart';
import 'package:gradeon/core/utils/extensions.dart';
import 'package:gradeon/core/utils/formatters.dart';
import 'package:gradeon/core/utils/haptics.dart';
import 'package:gradeon/core/widgets/glass.dart';
import 'package:gradeon/core/widgets/page.dart';
import 'package:gradeon/core/widgets/sheets.dart';
import 'package:gradeon/core/widgets/ui.dart';
import 'package:gradeon/data/models/campus.dart';
import 'package:gradeon/features/fees/controllers/fees_controller.dart';
import 'package:gradeon/features/fees/views/receipt_view.dart';
import 'package:phosphor_flutter/phosphor_flutter.dart';

/// Payment sheet with slide-to-pay so a payment never happens by accident.
class PaySheet extends StatefulWidget {
  const PaySheet({required this.item, super.key});

  final Installment item;

  @override
  State<PaySheet> createState() => _PaySheetState();
}

class _PaySheetState extends State<PaySheet> {
  var _method = 'upi';
  var _x = 0.0;
  var _drag = false;
  var _busy = false;
  Receipt? _receipt;

  static const _methods = [
    ('upi', 'UPI', 'fees.upi_title', 'fees.upi_sub'),
    ('upi_id', '@', 'fees.upi_id_title', 'fees.upi_id_sub'),
    ('card', null, 'fees.card_title', 'fees.card_sub'),
    ('netbanking', null, 'fees.net_title', 'fees.net_sub'),
  ];

  Future<void> _pay(double max) async {
    setState(() {
      _drag = false;
      _busy = true;
      _x = max;
    });
    Haptics.medium();
    final receipt = await Get.find<FeesController>().pay(widget.item, _method == 'upi_id' ? 'upi' : _method);
    if (!mounted) return;
    if (receipt == null) {
      setState(() {
        _busy = false;
        _x = 0;
      });
      return;
    }
    setState(() {
      _busy = false;
      _receipt = receipt;
    });
  }

  @override
  Widget build(BuildContext context) {
    final c = context.app;
    final student = Get.find<FeesController>().student?.name.split(' ').first ?? '';
    return SheetBody(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SizedBox(height: 16),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Overline('${widget.item.title} · $student'),
                    const SizedBox(height: 10),
                    Text(Formatters.inr(widget.item.amount), style: context.type.dl),
                  ],
                ),
              ),
              Semantics(
                button: true,
                label: 'common.close'.tr,
                child: Pressable(
                  onTap: () => Get.back<void>(),
                  child: Container(
                    width: 44,
                    height: 44,
                    decoration: BoxDecoration(color: c.paper2, shape: BoxShape.circle),
                    child: Icon(PhosphorIconsRegular.x, size: 18, color: c.ink),
                  ),),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text('fees.to_school'.trp({'school': AppConfig.schoolName}), style: context.type.cap),
          SectionLabel('fees.pay_with'.tr, top: 20),
          for (final m in _methods)
            Padding(
              padding: const EdgeInsets.only(bottom: 6),
              child: Semantics(
                selected: _method == m.$1,
                button: true,
                child: Pressable(
                  onTap: _receipt != null || _busy ? null : () => setState(() => _method = m.$1),
                  scale: .985,
                  child: AnimatedContainer(
                    duration: AppMotion.t2,
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                    decoration: BoxDecoration(
                      color: _method == m.$1 ? c.paper2 : Colors.transparent,
                      borderRadius: BorderRadius.circular(18),
                      border: Border.all(color: _method == m.$1 ? c.ink : Colors.transparent, width: 2),
                    ),
                    child: Row(
                      children: [
                        Container(
                          width: 40,
                          height: 40,
                          alignment: Alignment.center,
                          decoration: BoxDecoration(
                            color: c.paper,
                            borderRadius: BorderRadius.circular(10),
                            border: Border.all(color: c.line),
                          ),
                          child: m.$2 != null
                              ? Text(m.$2!, style: AppText.o(color: c.ink))
                              : Icon(
                                  m.$1 == 'card' ? PhosphorIconsRegular.creditCard : PhosphorIconsRegular.bank,
                                  size: 18,
                                  color: c.ink,
                                ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(m.$3.tr, style: context.type.t),
                              Text(m.$4.tr, style: context.type.cap),
                            ],
                          ),
                        ),
                        Container(
                          width: 22,
                          height: 22,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            border: Border.all(
                              color: _method == m.$1 ? c.ink : c.line2,
                              width: _method == m.$1 ? 7 : 2,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          const SizedBox(height: 16),
          _SlideToPay(
            x: _x,
            dragging: _drag,
            busy: _busy,
            paid: _receipt != null,
            amount: Formatters.inr(widget.item.amount),
            onStart: () => setState(() => _drag = true),
            onMove: (x) => setState(() => _x = x),
            onEnd: (max, velocity) {
              // Past the middle, or a flick, pays: nobody should have to drag the whole track.
              if (_x > max * .55 || velocity > 600) {
                unawaited(_pay(max));
              } else {
                setState(() {
                  _drag = false;
                  _x = 0;
                });
              }
            },
          ),
          SizedBox(
            height: 36,
            child: _receipt == null
                ? null
                : Align(
                    alignment: Alignment.bottomCenter,
                    child: Padding(
                      padding: const EdgeInsets.only(bottom: 8),
                      child: Pressable(
                        onTap: () {
                          Get.back<void>();
                          unawaited(
                            Get.toNamed<void>(
                              AppRoutes.receipt,
                              arguments: receiptArgs(_receipt!, Get.find<FeesController>()),
                            ),
                          );
                        },
                        child: Text('fees.see_receipt'.tr, style: AppText.capB(color: c.mariText)),
                      ),
                    ),
                  ),
          ),
        ],
      ),
    );
  }
}

class _SlideToPay extends StatelessWidget {
  const _SlideToPay({
    required this.x,
    required this.dragging,
    required this.busy,
    required this.paid,
    required this.amount,
    required this.onStart,
    required this.onMove,
    required this.onEnd,
  });

  final double x;
  final bool dragging;
  final bool busy;
  final bool paid;
  final String amount;
  final VoidCallback onStart;
  final ValueChanged<double> onMove;
  final void Function(double max, double velocity) onEnd;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, box) {
        const thumb = 76.0;
        final max = box.maxWidth - thumb - 4;
        final label = paid
            ? 'fees.paid_amount'.trp({'amount': amount})
            : busy
            ? 'fees.processing'.tr
            : 'fees.slide'.trp({'amount': amount});
        return Semantics(
          slider: true,
          label: 'fees.slide'.trp({'amount': amount}),
          onIncrease: paid || busy ? null : () => onEnd(max, 0),
          child: GestureDetector(
            behavior: HitTestBehavior.opaque,
            onHorizontalDragStart: paid || busy ? null : (_) => onStart(),
            onHorizontalDragUpdate: paid || busy ? null : (d) => onMove((x + d.delta.dx).clamp(0, max)),
            onHorizontalDragEnd: paid || busy ? null : (d) => onEnd(max, d.primaryVelocity ?? 0),
            child: AnimatedContainer(
            duration: AppMotion.t4,
            height: 64,
            decoration: BoxDecoration(
              color: paid ? AppColors.ok : AppColors.light.ink,
              borderRadius: BorderRadius.circular(34),
            ),
            clipBehavior: Clip.antiAlias,
            child: Stack(
              children: [
                Positioned(
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: x + 40,
                  child: ColoredBox(color: AppColors.mari.withValues(alpha: 0.35)),
                ),
                Center(
                  child: Opacity(
                    opacity: paid || busy ? 1 : (1 - x / 180).clamp(.15, 1),
                    child: Text(label, style: AppText.t(color: AppColors.white, height: 1)),
                  ),
                ),
                AnimatedPositioned(
                  duration: dragging || context.reduceMotion ? Duration.zero : AppMotion.t4,
                  curve: const Cubic(.3, 1.45, .45, 1),
                  left: 4 + x.clamp(0, max),
                  top: 4,
                  width: thumb,
                  height: 56,
                  child: Glass(
                      kind: GlassKind.lens,
                      radius: 999,
                      tint: AppColors.white,
                      child: Center(
                        child: busy
                            ? SizedBox.square(
                                dimension: 20,
                                child: CircularProgressIndicator(strokeWidth: 2.4, color: AppColors.light.ink),
                              )
                            : Icon(
                                paid ? PhosphorIconsBold.check : PhosphorIconsBold.caretRight,
                                color: AppColors.light.ink,
                                size: 22,
                              ),
                      ),
                    ),
                  ),
              ],
            ),
          ),
          ),
        );
      },
    );
  }
}
