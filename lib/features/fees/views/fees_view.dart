import 'dart:async';

import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:tangent/core/routes/app_routes.dart';
import 'package:tangent/core/services/school_config.dart';
import 'package:tangent/core/services/theme_service.dart';
import 'package:tangent/core/theme/tokens.dart';
import 'package:tangent/core/utils/extensions.dart';
import 'package:tangent/core/utils/formatters.dart';
import 'package:tangent/core/utils/status.dart';
import 'package:tangent/core/widgets/app_icons.dart';
import 'package:tangent/core/widgets/empty_kit.dart';
import 'package:tangent/core/widgets/glass_controls.dart';
import 'package:tangent/core/widgets/page.dart';
import 'package:tangent/core/widgets/sheets.dart';
import 'package:tangent/core/widgets/states.dart';
import 'package:tangent/core/widgets/ui.dart';
import 'package:tangent/data/models/campus.dart';
import 'package:tangent/features/fees/controllers/fees_controller.dart';
import 'package:tangent/features/fees/views/pay_sheet.dart';
import 'package:tangent/features/fees/views/receipt_view.dart';
import 'package:intl/intl.dart';
import 'package:phosphor_flutter/phosphor_flutter.dart';
import 'package:tangent/core/utils/clock.dart';

export 'package:tangent/features/fees/views/pay_sheet.dart';
export 'package:tangent/features/fees/views/receipt_view.dart';

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
          await Future<void>.delayed(AppMotion.press);
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
          // As the ParentFees board: what is due, in the school's bright colour on its deep one, with the Pay button.
          Builder(
            builder: (context) => Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                PageTitle(
                  'fees.title',
                  subtitle: account == null || student == null
                      ? null
                      : '${account.academicYear.replaceAll('-', '–')} · ${student.name.split(' ').first}${cls == null ? '' : ' · ${cls.name} ${cls.section}'}',
                ),
                if (account != null && account.installments.isNotEmpty) ...[
                  const SizedBox(height: 16),
                  _Due(controller: controller),
                ],
              ],
            ),
          ),
          ViewStateView(
            state: state,
            onRetry: controller.load,
            errorKey: controller.errorMessage.value,
            emptyTitle: 'fees.empty',
            emptyBody: 'fees.empty_body',
            emptyArt: EmptyArt.fees,
            emptyHint: 'fees.empty_hint',
            emptyActions: [EmptyAction('common.ask_office', icon: PhosphorIconsRegular.lifebuoy, onTap: () => Get.toNamed<void>(AppRoutes.help))],
            child: account == null ? const SizedBox.shrink() : _Body(controller: controller, account: account),
          ),
        ],
      );
    });
  }
}

/// The header's figure: the next instalment due, or the year paid in full.
class _Due extends StatelessWidget {
  const _Due({required this.controller});

  final FeesController controller;

  @override
  Widget build(BuildContext context) {
    final c = context.app;
    final next = controller.next;
    if (next == null) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('fees.all_paid'.tr, style: context.type.capB),
          const SizedBox(height: 4),
          Text(Formatters.inr(controller.paid), style: context.type.dl.copyWith(color: c.bright)),
        ],
      );
    }
    final overdue = moneyStatus(next) == MoneyStatus.overdue;
    final days = Formatters.daysUntil(next.dueDate);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          (overdue ? 'fees.was_due' : 'fees.due_on').trp({'date': DateFormat('d MMMM').format(next.dueDate)}),
          style: context.type.capB,
        ),
        const SizedBox(height: 4),
        Text(Formatters.inr(next.amount), style: context.type.dl.copyWith(color: c.bright)),
        const SizedBox(height: 4),
        Text(
          '${next.title} · ${overdue ? 'fees.days_late'.trn(-days) : 'fees.due_in'.trn(days)}',
          style: context.type.s.copyWith(color: c.ink2),
        ),
        if (SchoolConfig.allows('fees.onlinePayment')) ...[
          const SizedBox(height: 16),
          Btn(
            'fees.pay_amount'.trp({'amount': Formatters.inr(next.amount)}),
            kind: BtnKind.bright,
            expand: true,
            onPressed: () => unawaited(openPaySheet(next)),
          ),
        ],
      ],
    );
  }
}

class _Body extends StatelessWidget {
  const _Body({required this.controller, required this.account});

  final FeesController controller;
  final FeeAccount account;

  @override
  Widget build(BuildContext context) {
    final c = context.app;
    final next = controller.next;
    final theme = Get.find<ThemeService>();
    final items = [...account.installments]..sort((a, b) => a.dueDate.compareTo(b.dueDate));
    final receipts = [...account.receipts]..sort((a, b) => b.paidOn.compareTo(a.paidOn));
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Rise(
          child: _Card(
            title: 'fees.plan',
            child: Column(
              children: [
                for (final (i, item) in items.indexed) _PlanRow(item: item, first: i == 0),
                _Kv(
                  label: Text('fees.total'.tr, style: context.type.t),
                  value: Text(Formatters.inr(controller.total), style: context.type.h3),
                ),
              ],
            ),
          ),
        ),
        if (receipts.isNotEmpty) ...[
          const SizedBox(height: 12),
          Rise(
            index: 1,
            child: _Card(
              title: 'fees.paid',
              action: 'fees.all_receipts',
              onAction: () => unawaited(_receipts(context, account, controller)),
              child: Column(children: [for (final r in receipts.take(3)) _ReceiptRow(receipt: r, controller: controller)]),
            ),
          ),
        ],
        const SizedBox(height: 12),
        Rise(
          index: 2,
          child: _Card(
            child: Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Row(
                children: [
                  Container(
                    width: 40,
                    height: 40,
                    decoration: BoxDecoration(color: c.mariSoft, borderRadius: BorderRadius.circular(AppRadius.md)),
                    child: Icon(AppIcons.notifications, size: 20, color: c.mariText),
                  ),
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
                                      next.dueDate.subtract(const Duration(days: 3)).isBefore(Clock.now())
                                          ? Clock.now().add(const Duration(days: 1))
                                          : next.dueDate.subtract(const Duration(days: 3)),
                                    ),
                                  })
                                : 'fees.reminders_off'.tr,
                            style: context.type.s,
                          ),
                        ),
                      ],
                    ),
                  ),
                  Obx(
                    () => GlassSwitch(
                      value: theme.notifyFees.value,
                      label: 'fees.remind_early',
                      onColor: context.app.brand,
                      onChanged: (v) => theme.setNotify(fees: v),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }
}

/// The board's card: paper, radius 24, a display-voice title and an optional link on the right.
class _Card extends StatelessWidget {
  const _Card({required this.child, this.title, this.action, this.onAction});

  final Widget child;
  final String? title;
  final String? action;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) => EduCard(
    padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (title != null)
          Padding(
            padding: const EdgeInsets.only(bottom: 4),
            child: Row(
              children: [
                Expanded(child: Text(title!.tr, style: context.type.h3)),
                if (action != null)
                  Pressable(onTap: onAction, child: Text(action!.tr, style: context.type.ts.copyWith(color: context.app.mariText))),
              ],
            ),
          ),
        child,
      ],
    ),
  );
}

/// One line of the board's key and value list, with a hairline above all but the first.
class _Kv extends StatelessWidget {
  const _Kv({required this.label, required this.value, this.first = false, this.onTap});

  final Widget label;
  final Widget value;
  final bool first;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) => Pressable(
    onTap: onTap,
    child: Container(
      constraints: const BoxConstraints(minHeight: 48),
      padding: const EdgeInsets.symmetric(vertical: 8),
      decoration: BoxDecoration(border: first ? null : Border(top: BorderSide(color: context.app.line))),
      child: Row(children: [Expanded(child: label), const SizedBox(width: 12), value]),
    ),
  );
}

class _PlanRow extends StatelessWidget {
  const _PlanRow({required this.item, required this.first});

  final Installment item;
  final bool first;

  @override
  Widget build(BuildContext context) {
    final c = context.app;
    final status = moneyStatus(item);
    final (tag, colour) = switch (status) {
      MoneyStatus.paid => ('fees.status_paid'.tr, c.okText),
      MoneyStatus.overdue => ('fees.status_late'.tr, c.badText),
      _ => ('fees.due_on'.trp({'date': DateFormat('d MMM').format(item.dueDate)}), c.lateText),
    };
    return _Kv(
      first: first,
      onTap: status == MoneyStatus.paid ? null : () => unawaited(openPaySheet(item)),
      label: Row(
        children: [
          Flexible(child: Text(item.title, maxLines: 1, overflow: TextOverflow.ellipsis, style: context.type.b)),
          const SizedBox(width: 8),
          Stamp(tag, color: colour),
        ],
      ),
      value: Text(Formatters.inr(item.amount), style: context.type.t),
    );
  }
}

class _ReceiptRow extends StatelessWidget {
  const _ReceiptRow({required this.receipt, required this.controller});

  final Receipt receipt;
  final FeesController controller;

  @override
  Widget build(BuildContext context) {
    final c = context.app;
    return Pressable(
      onTap: () => unawaited(Get.toNamed<void>(AppRoutes.receipt, arguments: receiptArgs(receipt, controller))),
      label: 'fees.see_receipt'.tr,
      child: Container(
        constraints: const BoxConstraints(minHeight: 64),
        padding: const EdgeInsets.symmetric(vertical: 10),
        decoration: BoxDecoration(border: Border(top: BorderSide(color: c.line))),
        child: Row(
          children: [
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(color: c.okSoft, borderRadius: BorderRadius.circular(AppRadius.md)),
              child: Icon(PhosphorIconsBold.check, size: 18, color: c.okText),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'fees.paid_on_line'.trp({'amount': Formatters.inr(receipt.amount), 'date': DateFormat('d MMMM').format(receipt.paidOn)}),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: context.type.t,
                  ),
                  Text('${receipt.title} · ${'fees.${receipt.method}'.tr}', maxLines: 1, overflow: TextOverflow.ellipsis, style: context.type.s),
                ],
              ),
            ),
            const SizedBox(width: 8),
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(color: c.paper2, shape: BoxShape.circle),
              child: Icon(PhosphorIconsRegular.downloadSimple, size: 18, color: c.ink),
            ),
          ],
        ),
      ),
    );
  }
}

Future<void> _receipts(BuildContext context, FeeAccount account, FeesController controller) => showSheet<void>(
  SheetBody(
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SizedBox(height: 16),
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

Future<void> openPaySheet(Installment item) async {
  // The school takes fees at the office only: say so instead of opening a payment the server would refuse.
  if (!SchoolConfig.allows('fees.onlinePayment')) return;
  await showSheet<void>(PaySheet(item: item));
}
