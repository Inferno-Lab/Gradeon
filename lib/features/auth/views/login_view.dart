import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:get/get.dart';
import 'package:gradeon/core/config/app_config.dart';
import 'package:gradeon/core/routes/app_routes.dart';
import 'package:gradeon/core/theme/app_colors.dart';
import 'package:gradeon/core/theme/app_typography.dart';
import 'package:gradeon/core/utils/extensions.dart';
import 'package:gradeon/core/utils/validators.dart';
import 'package:gradeon/core/widgets/glass.dart';
import 'package:gradeon/core/widgets/glass_controls.dart';
import 'package:gradeon/core/widgets/ui.dart';
import 'package:gradeon/data/models/user.dart';
import 'package:gradeon/features/auth/controllers/login_controller.dart';
import 'package:phosphor_flutter/phosphor_flutter.dart';

class LoginView extends GetView<LoginController> {
  const LoginView({super.key});

  @override
  Widget build(BuildContext context) {
    return Obx(
      () => AnimatedSwitcher(
        duration: context.reduceMotion ? Duration.zero : const Duration(milliseconds: 320),
        child: controller.useOtp.value
            ? _OtpScreen(key: const ValueKey('otp'), controller: controller)
            : _PasswordScreen(key: const ValueKey('pw'), controller: controller),
      ),
    );
  }
}

/// Book spines along the top edge.
class Bookshelf extends StatelessWidget {
  const Bookshelf({this.height = 150, super.key});

  final double height;

  @override
  Widget build(BuildContext context) {
    const books = [
      ('maths', 1.2, .88),
      ('science', .9, .79),
      ('english', 1.0, .93),
      ('hindi', .8, .73),
      ('social', 1.1, .85),
      ('computer', .9, .97),
      ('art', 1.0, .8),
      ('pe', .8, .89),
    ];
    return SizedBox(
      height: height,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          for (final b in books)
            Expanded(
              flex: (b.$2 * 10).round(),
              child: Container(
                height: height * b.$3,
                margin: const EdgeInsets.only(right: 3),
                decoration: BoxDecoration(
                  color: AppColors.subject(b.$1).fill,
                  borderRadius: const BorderRadius.vertical(top: Radius.circular(4)),
                ),
                foregroundDecoration: const BoxDecoration(
                  border: Border(top: BorderSide(color: Color(0x2E000000), width: 5)),
                  borderRadius: BorderRadius.vertical(top: Radius.circular(4)),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _PasswordScreen extends StatelessWidget {
  const _PasswordScreen({required this.controller, super.key});

  final LoginController controller;

  @override
  Widget build(BuildContext context) {
    final c = context.app;
    final inset = MediaQuery.paddingOf(context);
    return Scaffold(
      backgroundColor: c.chalk,
      body: ListView(
        padding: EdgeInsets.only(bottom: inset.bottom + 24),
        children: [
          Bookshelf(height: 103 + inset.top),
          Padding(
            padding: const EdgeInsets.fromLTRB(24, 26, 24, 0),
            child: Form(
              key: controller.formKey,
              child: AutofillGroup(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Rise(child: Text('auth.sign_in'.tr, style: context.type.h1)),
                    const SizedBox(height: 6),
                    Rise(index: 1, child: Text(AppConfig.schoolName, style: context.type.cap)),
                    const SizedBox(height: 22),
                    Rise(
                      index: 2,
                      child: Field(
                        controller: controller.email,
                        label: 'auth.school_email',
                        icon: PhosphorIconsRegular.envelopeSimple,
                        keyboard: TextInputType.emailAddress,
                        autofillHints: const [AutofillHints.email, AutofillHints.username],
                        textInputAction: TextInputAction.next,
                        validator: Validators.email,
                      ),
                    ),
                    const SizedBox(height: 14),
                    Rise(index: 3, child: _PasswordField(controller: controller)),
                    const SizedBox(height: 20),
                    Rise(
                      index: 4,
                      child: Obx(
                        () => Btn(
                          'auth.sign_in',
                          kind: BtnKind.ink,
                          expand: true,
                          loading: controller.loading.value,
                          onPressed: controller.submit,
                        ),
                      ),
                    ),
                    const SizedBox(height: 26),
                    Rise(
                      index: 5,
                      child: Row(
                        children: [
                          const Expanded(child: Hr()),
                          Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 10),
                            child: Overline('auth.or_demo'.tr),
                          ),
                          const Expanded(child: Hr()),
                        ],
                      ),
                    ),
                    const SizedBox(height: 14),
                    Rise(index: 6, child: _DemoCard(controller: controller)),
                    const SizedBox(height: 30),
                    Center(
                      child: GestureDetector(
                        onTap: () => Get.toNamed<void>(AppRoutes.help),
                        child: Text.rich(
                          TextSpan(
                            text: '${'auth.trouble'.tr} ',
                            children: [
                              TextSpan(
                                text: 'auth.contact_office'.tr,
                                style: anek(13, 650, height: 1.3, color: c.mariText),
                              ),
                            ],
                          ),
                          style: context.type.cap,
                          textAlign: TextAlign.center,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _PasswordField extends StatefulWidget {
  const _PasswordField({required this.controller});

  final LoginController controller;

  @override
  State<_PasswordField> createState() => _PasswordFieldState();
}

class _PasswordFieldState extends State<_PasswordField> {
  var _shown = false;

  @override
  Widget build(BuildContext context) {
    final c = context.app;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(
              child: Padding(
                padding: const EdgeInsets.only(left: 4),
                child: Text('auth.password'.tr, style: anek(13, 620, height: 1.2, color: c.ink2)),
              ),
            ),
            GestureDetector(
              onTap: () {
                widget.controller.useOtp.value = true;
                widget.controller.otp.clear();
              },
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 4),
                child: Text('auth.use_code'.tr, style: anek(13, 650, height: 1.2, color: c.mariText)),
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        Field(
          controller: widget.controller.password,
          icon: PhosphorIconsRegular.lockSimple,
          obscure: !_shown,
          autofillHints: const [AutofillHints.password],
          textInputAction: TextInputAction.done,
          onSubmitted: (_) => widget.controller.submit(),
          validator: Validators.password,
          trailing: Semantics(
            button: true,
            label: (_shown ? 'auth.hide_password' : 'auth.show_password').tr,
            child: GestureDetector(
              onTap: () => setState(() => _shown = !_shown),
              child: Padding(
                padding: const EdgeInsets.all(8),
                child: Icon(_shown ? PhosphorIconsRegular.eyeSlash : PhosphorIconsRegular.eye, size: 18, color: c.ink3),
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _DemoCard extends StatelessWidget {
  const _DemoCard({required this.controller});

  final LoginController controller;

  @override
  Widget build(BuildContext context) {
    final roles = [UserRole.parent, UserRole.teacher];
    return ClipRRect(
      borderRadius: BorderRadius.circular(24),
      child: SizedBox(
        height: 118,
        child: Stack(
          children: [
            Positioned.fill(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  for (final s in ['maths', 'science', 'hindi', 'social', 'computer', 'english', 'pe', 'art'])
                    Expanded(child: ColoredBox(color: AppColors.subject(s).fill)),
                ],
              ),
            ),
            Positioned(
              left: 12,
              right: 12,
              top: 14,
              child: Obx(
                () => GlassSegmented(
                  labels: const ['nav.parent', 'nav.teacher'],
                  index: controller.demoRole.value == null ? -1 : roles.indexOf(controller.demoRole.value!),
                  height: 48,
                  onPigment: true,
                  semanticLabel: 'auth.or_demo'.tr,
                  onChanged: (i) {
                    controller.demoRole.value = roles[i];
                    unawaited(controller.demo(roles[i]));
                  },
                ),
              ),
            ),
            Positioned(
              left: 18,
              right: 18,
              top: 74,
              child: Obx(
                () => Text(
                  'auth.demo_line_${controller.demoRole.value?.name ?? 'pick'}'.tr,
                  maxLines: 2,
                  style: anek(13, 560, height: 1.3, color: AppColors.white).copyWith(
                    shadows: const [Shadow(color: Color(0x73000000), blurRadius: 6, offset: Offset(0, 1))],
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _OtpScreen extends StatefulWidget {
  const _OtpScreen({required this.controller, super.key});

  final LoginController controller;

  @override
  State<_OtpScreen> createState() => _OtpScreenState();
}

class _OtpScreenState extends State<_OtpScreen> {
  final _focus = FocusNode();
  Timer? _timer;
  var _left = 30;

  @override
  void initState() {
    super.initState();
    _startTimer();
    widget.controller.otp.addListener(_changed);
    WidgetsBinding.instance.addPostFrameCallback((_) => _focus.requestFocus());
  }

  void _changed() => setState(() {});

  void _startTimer() {
    _timer?.cancel();
    setState(() => _left = 30);
    _timer = Timer.periodic(const Duration(seconds: 1), (t) {
      if (!mounted) return;
      if (_left <= 1) t.cancel();
      setState(() => _left--);
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    widget.controller.otp.removeListener(_changed);
    _focus.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.app;
    final inset = MediaQuery.paddingOf(context);
    final code = widget.controller.otp.text;
    void back() => widget.controller.useOtp.value = false;
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) back();
      },
      child: Scaffold(
        backgroundColor: c.chalk,
        resizeToAvoidBottomInset: true,
        body: Stack(
          children: [
            ListView(
              padding: EdgeInsets.only(bottom: inset.bottom + 120),
              children: [
                Bookshelf(height: 73 + inset.top),
                Padding(
                  padding: const EdgeInsets.fromLTRB(24, 30, 24, 0),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('auth.enter_code'.tr, style: context.type.h1),
                      const SizedBox(height: 8),
                      Text('auth.code_sent'.tr, style: context.type.b.copyWith(color: c.ink2)),
                      const SizedBox(height: 28),
                      GestureDetector(
                        onTap: _focus.requestFocus,
                        child: Semantics(
                          label: 'auth.one_time_code'.tr,
                          textField: true,
                          child: Stack(
                            children: [
                              Row(
                                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                children: [
                                  for (var i = 0; i < 6; i++)
                                    _Cell(
                                      char: i < code.length ? code[i] : null,
                                      active: i == code.length && _focus.hasFocus,
                                    ),
                                ],
                              ),
                              Opacity(
                                opacity: 0,
                                child: TextField(
                                  controller: widget.controller.otp,
                                  focusNode: _focus,
                                  keyboardType: TextInputType.number,
                                  autofillHints: const [AutofillHints.oneTimeCode],
                                  maxLength: 6,
                                  inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                                  onChanged: (v) {
                                    if (v.length == 6) unawaited(widget.controller.submit());
                                  },
                                  decoration: const InputDecoration(counterText: ''),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                      const SizedBox(height: 16),
                      Row(
                        children: [
                          Expanded(
                            child: _left > 0
                                ? Text.rich(
                                    TextSpan(
                                      text: '${'auth.resend_in'.tr} ',
                                      children: [
                                        TextSpan(
                                          text: '0:${_left.toString().padLeft(2, '0')}',
                                          style: anek(13, 650, height: 1.3, color: c.ink2),
                                        ),
                                      ],
                                    ),
                                    style: context.type.cap,
                                  )
                                : GestureDetector(
                                    onTap: _startTimer,
                                    child: Text('auth.resend'.tr, style: anek(13, 650, height: 1.3, color: c.mariText)),
                                  ),
                          ),
                          GestureDetector(
                            onTap: back,
                            child: Text('auth.use_password'.tr, style: anek(13, 650, height: 1.3, color: c.mariText)),
                          ),
                        ],
                      ),
                      const SizedBox(height: 26),
                      Container(
                        padding: const EdgeInsets.all(14),
                        decoration: BoxDecoration(color: c.paper2, borderRadius: BorderRadius.circular(18)),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Icon(PhosphorIconsRegular.shieldCheck, color: AppColors.ok),
                            const SizedBox(width: 12),
                            Expanded(child: Text('auth.code_note'.tr, style: context.type.s)),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            Positioned(
              left: 16,
              top: inset.top + 8,
              child: GlassIconButton(
                icon: PhosphorIconsRegular.caretLeft,
                label: 'common.back'.tr,
                color: AppColors.white,
                onTap: back,
              ),
            ),
            Positioned(
              left: 24,
              right: 24,
              bottom: 34 + inset.bottom,
              child: Obx(
                () => Btn(
                  'auth.verify',
                  kind: BtnKind.ink,
                  expand: true,
                  loading: widget.controller.loading.value,
                  onPressed: code.length == 6 ? widget.controller.submit : null,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Cell extends StatelessWidget {
  const _Cell({required this.char, required this.active});

  final String? char;
  final bool active;

  @override
  Widget build(BuildContext context) {
    final c = context.app;
    return AnimatedContainer(
      duration: const Duration(milliseconds: 160),
      width: 48,
      height: 60,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: c.paper,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: active ? c.ink : c.line2, width: active ? 2 : 1),
      ),
      child: char != null
          ? Text(char!, style: anek(28, 720, width: 115, height: 1, color: c.ink))
          : active
          ? const _Caret()
          : null,
    );
  }
}

class _Caret extends StatefulWidget {
  const _Caret();

  @override
  State<_Caret> createState() => _CaretState();
}

class _CaretState extends State<_Caret> with SingleTickerProviderStateMixin {
  late final _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 1000))..repeat();

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
    animation: _c,
    builder: (context, _) => Opacity(
      opacity: _c.value < .5 ? 1 : 0,
      child: Container(width: 2, height: 28, color: context.app.ink),
    ),
  );
}
