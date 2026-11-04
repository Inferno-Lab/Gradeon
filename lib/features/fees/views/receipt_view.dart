import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:gradeon/core/config/app_config.dart';
import 'package:gradeon/core/theme/app_colors.dart';
import 'package:gradeon/core/theme/app_typography.dart';
import 'package:gradeon/core/utils/extensions.dart';
import 'package:gradeon/core/utils/formatters.dart';
import 'package:gradeon/core/widgets/glass.dart';
import 'package:gradeon/core/widgets/page.dart';
import 'package:gradeon/core/widgets/states.dart';
import 'package:gradeon/core/widgets/toast.dart';
import 'package:gradeon/core/widgets/ui.dart';
import 'package:gradeon/data/models/campus.dart';
import 'package:gradeon/features/fees/controllers/fees_controller.dart';
import 'package:intl/intl.dart';
import 'package:phosphor_flutter/phosphor_flutter.dart';

Map<String, Object?> receiptArgs(Receipt r, FeesController controller) => {
  'receipt': r,
  'student': controller.student?.name,
  'roll': controller.student?.rollNo,
  'class': controller.schoolClass == null
      ? null
      : '${controller.schoolClass!.name.replaceAll(RegExp('[^0-9]'), '')} ${controller.schoolClass!.section}',
};

/// Receipt: the stored receipt printed on a perforated slip.
class ReceiptView extends StatelessWidget {
  const ReceiptView({super.key});

  @override
  Widget build(BuildContext context) {
    final args = Get.arguments is Map ? Get.arguments as Map : const <String, Object?>{};
    final receipt = args['receipt'] as Receipt?;
    final c = context.app;
    final inset = MediaQuery.paddingOf(context);
    if (receipt == null) {
      return const PageFrame(
        leading: BackGlass(close: true),
        children: [EmptyState(title: 'fees.no_receipt', body: 'fees.no_receipt_body')],
      );
    }
    final number =
        'GIS/${receipt.paidOn.year % 100}-${(receipt.paidOn.year + 1) % 100}/${receipt.id.replaceAll(RegExp('[^0-9]'), '').padLeft(4, '0').substring(receipt.id.replaceAll(RegExp('[^0-9]'), '').padLeft(4, '0').length - 4)}';
    final rows = [
      if (args['student'] != null)
        (
          'fees.student'.tr,
          '${args['student']} · ${args['class'] ?? ''} · ${'fees.roll'.trp({'n': '${args['roll'] ?? ''}'.padLeft(2, '0')})}',
          false,
        ),
      ('fees.paid_on'.tr, DateFormat('EEE d MMM y, HH:mm').format(receipt.paidOn), false),
      ('fees.method'.tr, 'fees.${receipt.method}'.tr, false),
      (receipt.method == 'upi' ? 'fees.upi_reference'.tr : 'fees.reference'.tr, receipt.reference, true),
      ('fees.receipt_no'.tr, number, true),
    ];
    return Scaffold(
      backgroundColor: c.chalk,
      body: Stack(
        children: [
          Positioned(
            left: 0,
            right: 0,
            top: 0,
            height: 253 + inset.top,
            child: ColoredBox(color: AppColors.subject('science').fill),
          ),
          Positioned(
            left: 16,
            right: 16,
            top: inset.top + 8,
            child: Row(
              children: [
                GlassIconButton(
                  icon: PhosphorIconsRegular.x,
                  label: 'common.close'.tr,
                  color: AppColors.white,
                  onTap: () => Get.back<void>(),
                ),
                Expanded(
                  child: Text(
                    'fees.payment_done'.tr,
                    textAlign: TextAlign.center,
                    style: anek(17, 700, height: 1, color: AppColors.white),
                  ),
                ),
                GlassIconButton(
                  icon: PhosphorIconsRegular.export,
                  label: 'fees.share_receipt'.tr,
                  color: AppColors.white,
                  onTap: () => ToastHelper.show('fees.shared', kind: ToastKind.success),
                ),
              ],
            ),
          ),
          Positioned.fill(
            top: inset.top + 96,
            child: ListView(
              padding: EdgeInsets.fromLTRB(24, 0, 24, inset.bottom + 110),
              children: [
                TweenAnimationBuilder<double>(
                  tween: Tween(begin: context.reduceMotion ? 1 : 0, end: 1),
                  duration: const Duration(milliseconds: 900),
                  curve: const Cubic(.2, .8, .2, 1),
                  builder: (context, t, child) => ClipRect(
                    child: Align(
                      alignment: Alignment.topCenter,
                      heightFactor: t,
                      child: Transform.translate(offset: Offset(0, -60 * (1 - t)), child: child),
                    ),
                  ),
                  child: _Slip(receipt: receipt, rows: rows),
                ),
              ],
            ),
          ),
          Positioned(
            left: 24,
            right: 24,
            bottom: 34 + inset.bottom,
            child: Row(
              children: [
                Expanded(
                  child: Btn(
                    'fees.save_pdf',
                    kind: BtnKind.quiet,
                    icon: PhosphorIconsRegular.downloadSimple,
                    expand: true,
                    onPressed: () => ToastHelper.show('fees.downloaded', kind: ToastKind.success),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Btn('common.done', kind: BtnKind.ink, expand: true, onPressed: () => Get.back<void>()),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _Slip extends StatelessWidget {
  const _Slip({required this.receipt, required this.rows});

  final Receipt receipt;
  final List<(String, String, bool)> rows;

  @override
  Widget build(BuildContext context) {
    final c = context.app;
    return DecoratedBox(
      decoration: const BoxDecoration(
        boxShadow: [BoxShadow(color: Color(0x8010201B), blurRadius: 60, spreadRadius: -30, offset: Offset(0, 30))],
      ),
      child: ClipPath(
        clipper: const _PerforatedClipper(),
        child: Container(
          color: c.paper,
          padding: const EdgeInsets.fromLTRB(22, 36, 22, 34),
          child: Stack(
            children: [
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Overline(AppConfig.schoolName),
                  const SizedBox(height: 4),
                  Text('fees.school_address'.tr, style: context.type.cap),
                  const SizedBox(height: 22),
                  Text(Formatters.inr(receipt.amount), style: context.type.dl),
                  const SizedBox(height: 6),
                  Text(receipt.title, style: context.type.t),
                  const Padding(padding: EdgeInsets.only(top: 18, bottom: 8), child: DashedLine()),
                  for (final r in rows)
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 7),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(r.$1, style: anek(14, 450, height: 1.3, color: c.ink3)),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Text(
                              r.$2,
                              textAlign: TextAlign.right,
                              style: r.$3
                                  ? context.type.mono.copyWith(color: c.ink)
                                  : anek(14, 600, height: 1.3, color: c.ink),
                            ),
                          ),
                        ],
                      ),
                    ),
                  const Padding(padding: EdgeInsets.symmetric(vertical: 10), child: DashedLine()),
                  Text('fees.receipt_note'.tr, style: context.type.cap),
                ],
              ),
              Positioned(
                right: -2,
                top: 66,
                child: TweenAnimationBuilder<double>(
                  tween: Tween(begin: context.reduceMotion ? 1 : 0, end: 1),
                  duration: const Duration(milliseconds: 1600),
                  curve: const Interval(.6, 1, curve: Cubic(.3, 1.45, .45, 1)),
                  builder: (context, t, child) => Opacity(
                    opacity: (t * .85).clamp(0, .85),
                    child: Transform.scale(scale: .86 + .14 * t, child: child),
                  ),
                  child: Transform.rotate(
                    angle: -.21,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                      decoration: BoxDecoration(
                        border: Border.all(color: AppColors.ok, width: 3),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Text(
                        'fees.paid_stamp'.tr,
                        style: anek(26, 800, width: 125, height: 1, em: .12, color: AppColors.ok),
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _PerforatedClipper extends CustomClipper<Path> {
  const _PerforatedClipper();

  @override
  Path getClip(Size size) {
    const r = 6.0;
    const step = 12.0;
    final path = Path()..moveTo(0, 0);
    for (var x = 0.0; x + step <= size.width + .5; x += step) {
      path.arcToPoint(Offset(x + step, 0), radius: const Radius.circular(r), clockwise: false);
    }
    path
      ..lineTo(size.width, 0)
      ..lineTo(size.width, size.height);
    for (var x = 0.0; x + step <= size.width + .5; x += step) {
      path.arcToPoint(Offset(size.width - x - step, size.height), radius: const Radius.circular(r), clockwise: false);
    }
    return path
      ..lineTo(0, size.height)
      ..close();
  }

  @override
  bool shouldReclip(_PerforatedClipper oldClipper) => false;
}
