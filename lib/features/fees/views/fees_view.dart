import 'dart:async';

import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:gradeon/core/routes/app_routes.dart';
import 'package:gradeon/core/services/theme_service.dart';
import 'package:gradeon/core/theme/app_colors.dart';
import 'package:gradeon/core/theme/app_typography.dart';
import 'package:gradeon/core/utils/extensions.dart';
import 'package:gradeon/core/utils/formatters.dart';
import 'package:gradeon/core/utils/status.dart';
import 'package:gradeon/core/widgets/empty_art.dart';
import 'package:gradeon/core/widgets/glass.dart';
import 'package:gradeon/core/widgets/glass_controls.dart';
import 'package:gradeon/core/widgets/page.dart';
import 'package:gradeon/core/widgets/sheets.dart';
import 'package:gradeon/core/widgets/states.dart';
import 'package:gradeon/core/widgets/ui.dart';
import 'package:gradeon/data/models/campus.dart';
import 'package:gradeon/features/fees/controllers/fees_controller.dart';
import 'package:gradeon/features/fees/views/pay_sheet.dart';
import 'package:gradeon/features/fees/views/receipt_view.dart';
import 'package:intl/intl.dart';
import 'package:phosphor_flutter/phosphor_flutter.dart';

export 'package:gradeon/features/fees/views/pay_sheet.dart';
export 'package:gradeon/features/fees/views/receipt_view.dart';

class FeesView extends StatefulWidget {
  const FeesView({super.key});

  @override
  State<FeesView> createState() => _FeesViewState();
}

class _FeesViewState extends State<FeesView> {
  FeesController get controller => Get.find<FeesController>();

  @override
  void initState() {
    super.initState();
    // Home's "Pay" opens the sheet straight away.
    final args = Get.arguments;
    if (args is Map && args['pay'] is String) {
      WidgetsBinding.instance.addPostFrameCallback((_) async {
        Installment? find() => controller.account?.installments.where((x) => x.id == args['pay']).firstOrNull;
        // The account may still be loading, or reloading for a switched child.
        for (var i = 0; i < 40 && find() == null; i++) {
          await Future<void>.delayed(const Duration(milliseconds: 100));
        }
        final item = find();
        if (item != null && mounted) unawaited(openPaySheet(item));
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final standalone = ModalRoute.of(context)?.settings.name == AppRoutes.fees;
    return Obx(() {
      final state = controller.state.value;
      final account = controller.account;
      final student = controller.student;
      final cls = controller.schoolClass;
      return PageFrame(
        dockPage: !standalone,
        leading: standalone ? const BackGlass() : null,
        topPadding: standalone ? null : MediaQuery.paddingOf(context).top + 14,
        onRefresh: controller.load,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: PageTitle(
                  'fees.title',
                  subtitle: account == null || student == null
                      ? null
                      : '${account.academicYear.replaceAll('-', '–')} · ${student.name.split(' ').first}${cls == null ? '' : ' · ${cls.name} ${cls.section}'}',
                ),
              ),
              if (account != null && account.receipts.isNotEmpty)
                GlassPress(
                  onTap: () => unawaited(_receipts(context, account)),
                  child: Glass(
                    height: 44,
                    width: 116,
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(PhosphorIconsRegular.receipt, size: 15, color: context.app.ink),
                        const SizedBox(width: 6),
                        Flexible(
                          child: Text(
                            'fees.receipts'.tr,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: anek(14, 650, height: 1, color: context.app.ink),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 22),
          ViewStateView(
            state: state,
            onRetry: controller.load,
            errorKey: controller.errorMessage.value,
            emptyTitle: 'fees.empty',
            emptyBody: 'fees.empty_body',
            emptyArt: EmptyArt.wallet,
            emptyHint: 'fees.empty_hint',
            emptyActions: [EmptyAction('common.ask_office', icon: PhosphorIconsRegular.lifebuoy, onTap: () => Get.toNamed<void>(AppRoutes.help))],
            child: account == null ? const SizedBox.shrink() : _Body(controller: controller, account: account),
          ),
        ],
      );
    });
  }

  Future<void> _receipts(BuildContext context, FeeAccount account) => showSheet<void>(
    SheetBody(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SizedBox(height: 18),
          Text('fees.receipts'.tr, style: context.type.h2),
          const SizedBox(height: 8),
          for (final r in account.receipts)
            Pressable(
              onTap: () {
                Get.back<void>();
                unawaited(Get.toNamed<void>(AppRoutes.receipt, arguments: receiptArgs(r, controller)));
              },
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 12),
                child: Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(r.title, style: context.type.t),
                          Text('${DateFormat('d MMM y').format(r.paidOn)} · ${r.reference}', style: context.type.cap),
                        ],
                      ),
                    ),
                    Text(Formatters.inr(r.amount), style: context.type.t),
                  ],
                ),
              ),
            ),
          const SizedBox(height: 16),
        ],
      ),
    ),
  );
}


class _Body extends StatelessWidget {
  const _Body({required this.controller, required this.account});

  final FeesController controller;
  final FeeAccount account;

  @override
  Widget build(BuildContext context) {
    final c = context.app;
    final next = controller.next;
    final total = controller.total;
    final paid = controller.paid;
    final theme = Get.find<ThemeService>();
    final items = [...account.installments]..sort((a, b) => a.dueDate.compareTo(b.dueDate));
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Rise(child: next == null ? const _AllPaid() : _DueCard(item: next)),
        const SizedBox(height: 18),
        Rise(
          index: 1,
          child: Row(
            children: [
              Expanded(
                child: Text.rich(
                  TextSpan(
                    text: '${Formatters.inr(paid)} ',
                    children: [
                      TextSpan(
                        text: 'fees.of_paid'.trp({'total': Formatters.inr(total)}),
                        style: context.type.cap,
                      ),
                    ],
                  ),
                  style: context.type.t,
                ),
              ),
              Text('${total == 0 ? 0 : (paid / total * 100).round()}%', style: context.type.cap),
            ],
          ),
        ),
        const SizedBox(height: 10),
        Rise(
          index: 1,
          child: SizedBox(
            height: 12,
            child: Row(
              children: [
                for (var i = 0; i < items.length; i++) ...[
                  if (i > 0) const SizedBox(width: 3),
                  Expanded(
                    flex: items[i].amount,
                    child: _Segment(item: items[i], first: i == 0, last: i == items.length - 1),
                  ),
                ],
              ],
            ),
          ),
        ),
        const SizedBox(height: 18),
        Rise(
          index: 2,
          child: EduCard(
            padding: const EdgeInsets.fromLTRB(16, 6, 16, 6),
            child: Column(children: [for (final item in items) _TimelineRow(item: item)]),
          ),
        ),
        const SizedBox(height: 12),
        Rise(
          index: 3,
          child: EduCard(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            child: Row(
              children: [
                Icon(PhosphorIconsRegular.bell, color: c.mariText),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('fees.remind_early'.tr, style: context.type.t),
                      Obx(
                        () => Text(
                          theme.notifyFees.value && next != null
                              ? 'fees.next_reminder'.trp({
                                  'date': DateFormat('EEE d MMM').format(
                                    next.dueDate.subtract(const Duration(days: 3)).isBefore(DateTime.now())
                                        ? DateTime.now().add(const Duration(days: 1))
                                        : next.dueDate.subtract(const Duration(days: 3)),
                                  ),
                                })
                              : 'fees.reminders_off'.tr,
                          style: context.type.cap,
                        ),
                      ),
                    ],
                  ),
                ),
                Obx(
                  () => GlassSwitch(
                    value: theme.notifyFees.value,
                    label: 'fees.remind_early',
                    onColor: AppColors.mari,
                    onChanged: (v) => theme.setNotify(fees: v),
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _Segment extends StatelessWidget {
  const _Segment({required this.item, required this.first, required this.last});

  final Installment item;
  final bool first;
  final bool last;

  @override
  Widget build(BuildContext context) {
    final c = context.app;
    final status = moneyStatus(item);
    final radius = BorderRadius.horizontal(
      left: Radius.circular(first ? 6 : 2),
      right: Radius.circular(last ? 6 : 2),
    );
    if (status == MoneyStatus.paid) {
      return DecoratedBox(
        decoration: BoxDecoration(color: c.ink, borderRadius: radius),
      );
    }
    if (status == MoneyStatus.overdue) {
      return DecoratedBox(
        decoration: BoxDecoration(color: AppColors.bad, borderRadius: radius),
      );
    }
    return Hatch(
      radius: radius,
      child: DecoratedBox(
        decoration: BoxDecoration(
          borderRadius: radius,
          border: Border.all(color: c.line2),
        ),
      ),
    );
  }
}

class _AllPaid extends StatelessWidget {
  const _AllPaid();

  @override
  Widget build(BuildContext context) => EduCard(
    color: context.app.okSoft,
    padding: const EdgeInsets.all(18),
    child: Row(
      children: [
        const Icon(PhosphorIconsBold.checkCircle, color: AppColors.ok, size: 28),
        const SizedBox(width: 14),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('fees.all_paid'.tr, style: context.type.h3),
              Text('fees.all_paid_body'.tr, style: context.type.cap),
            ],
          ),
        ),
      ],
    ),
  );
}

class _DueCard extends StatelessWidget {
  const _DueCard({required this.item});

  final Installment item;

  @override
  Widget build(BuildContext context) {
    final overdue = moneyStatus(item) == MoneyStatus.overdue;
    final days = Formatters.daysUntil(item.dueDate);
    const ink = AppColors.mariInk;
    return Container(
      padding: const EdgeInsets.fromLTRB(18, 18, 18, 16),
      decoration: BoxDecoration(color: AppColors.mari, borderRadius: BorderRadius.circular(26)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Overline(
                  'fees.due_now'.trp({'title': item.title.toLowerCase()}),
                  color: ink.withValues(alpha: .75),
                ),
              ),
              const SizedBox(width: 10),
              Stamp(
                overdue ? 'fees.days_late'.trp({'n': '${-days}'}) : 'fees.due_in'.trp({'n': '$days'}),
                color: overdue ? const Color(0xFF7A1E12) : ink,
              ),
            ],
          ),
          const SizedBox(height: 12),
          Text(Formatters.inr(item.amount), style: context.type.dl.copyWith(color: ink)),
          const SizedBox(height: 14),
          Row(
            children: [
              Expanded(
                child: Text(
                  (overdue ? 'fees.was_due' : 'fees.due_on').trp({
                    'date': DateFormat('EEE d MMM').format(item.dueDate),
                  }),
                  style: context.type.s.copyWith(color: ink.withValues(alpha: .8)),
                ),
              ),
              Btn('common.pay_now', kind: BtnKind.ink, small: true, onPressed: () => unawaited(openPaySheet(item))),
            ],
          ),
        ],
      ),
    );
  }
}

class _TimelineRow extends StatelessWidget {
  const _TimelineRow({required this.item});

  final Installment item;

  @override
  Widget build(BuildContext context) {
    final c = context.app;
    final status = moneyStatus(item);
    final Widget node = switch (status) {
      MoneyStatus.paid => Dot(c.ink, size: 16),
      MoneyStatus.overdue => Container(
        width: 16,
        height: 16,
        decoration: BoxDecoration(
          color: AppColors.bad,
          shape: BoxShape.circle,
          boxShadow: [BoxShadow(color: c.badSoft, spreadRadius: 4)],
        ),
      ),
      _ => Container(
        width: 16,
        height: 16,
        decoration: BoxDecoration(
          color: c.paper,
          shape: BoxShape.circle,
          border: Border.all(color: status == MoneyStatus.due ? AppColors.late : c.ink3, width: 2.5),
        ),
      ),
    };
    final line = switch (status) {
      MoneyStatus.paid => 'fees.paid_line'.trp({
        'date': DateFormat('d MMM').format(item.paidOn ?? item.dueDate),
        'method': 'fees.${item.method ?? 'upi'}'.tr,
      }),
      MoneyStatus.overdue => 'fees.overdue_since'.trp({'date': DateFormat('d MMM').format(item.dueDate)}),
      _ => 'fees.due_line'.trp({
        'date': DateFormat('EEE d MMM').format(item.dueDate),
        'n': '${Formatters.daysUntil(item.dueDate)}',
      }),
    };
    return Pressable(
      onTap: status == MoneyStatus.paid ? null : () => unawaited(openPaySheet(item)),
      child: IntrinsicHeight(
        child: Row(
          children: [
            SizedBox(
              width: 30,
              child: Stack(
                alignment: Alignment.center,
                children: [
                  Positioned(top: 0, bottom: 0, left: 9, child: Container(width: 2, color: c.line2)),
                  Positioned(left: 2, child: node),
                ],
              ),
            ),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 10),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(item.title, style: context.type.t),
                    Text.rich(
                      TextSpan(
                        text: line,
                        children: [
                          if (status == MoneyStatus.paid && item.method == 'upi' && item.reference != null) ...[
                            const TextSpan(text: ' · '),
                            TextSpan(text: item.reference, style: context.type.mono),
                          ],
                        ],
                      ),
                      style: status == MoneyStatus.overdue
                          ? anek(13, 620, height: 1.3, color: c.badText)
                          : context.type.cap,
                    ),
                  ],
                ),
              ),
            ),
            Text(Formatters.inr(item.amount), style: anek(16.5, 650, height: 1, tabular: true, color: c.ink)),
          ],
        ),
      ),
    );
  }
}

Future<void> openPaySheet(Installment item) => showSheet<void>(PaySheet(item: item));
