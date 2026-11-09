import 'dart:async';

import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:gradeon/core/config/app_config.dart';
import 'package:gradeon/core/routes/app_routes.dart';
import 'package:gradeon/core/services/auth_service.dart';
import 'package:gradeon/core/services/school_config.dart';
import 'package:gradeon/core/services/theme_service.dart';
import 'package:gradeon/core/theme/app_colors.dart';
import 'package:gradeon/core/theme/app_theme.dart';
import 'package:gradeon/core/theme/app_typography.dart';
import 'package:gradeon/core/theme/tokens.dart';
import 'package:gradeon/core/utils/extensions.dart';
import 'package:gradeon/core/utils/haptics.dart';
import 'package:gradeon/core/widgets/glass_controls.dart';
import 'package:gradeon/core/widgets/page.dart';
import 'package:gradeon/core/widgets/sheets.dart';
import 'package:gradeon/core/widgets/toast.dart';
import 'package:gradeon/core/widgets/ui.dart';
import 'package:gradeon/data/models/student.dart';
import 'package:gradeon/data/repositories/directory_repository.dart';
import 'package:gradeon/features/chat/controllers/chat_controller.dart';
import 'package:gradeon/features/settings/views/privacy_sheet.dart';
import 'package:phosphor_flutter/phosphor_flutter.dart';
import 'package:url_launcher/url_launcher.dart';

const _locales = [Locale('en'), Locale('hi'), Locale('mr')];
const _localeNames = ['English', 'हिंदी', 'मराठी'];

/// Text size slider runs 85% to 125%.
double _scaleOf(double t) => .85 + t * .40;
double _tOf(double scale) => ((scale - .85) / .40).clamp(0, 1);

Future<void> _launch(Uri uri) async {
  try {
    if (!await launchUrl(uri, mode: LaunchMode.externalApplication)) {
      ToastHelper.show('errors.cant_open', kind: ToastKind.error);
    }
  } on Exception {
    ToastHelper.show('errors.cant_open', kind: ToastKind.error);
  }
}

Future<void> signOut() async {
  final ok = await confirmSheet(
    title: 'settings.logout_title',
    body: 'settings.logout_body',
    confirm: 'common.logout',
    cancel: 'settings.stay',
  );
  if (ok) await Get.find<AuthService>().signOut();
}

class SettingsView extends StatelessWidget {
  const SettingsView({super.key});

  @override
  Widget build(BuildContext context) {
    final theme = Get.find<ThemeService>();
    final c = context.app;
    return Obx(() {
      final mode = theme.mode.value;
      // Only the languages the school offers (console: The app → Languages offered).
      final offered = [for (final (i, l) in _locales.indexed) if (SchoolConfig.languages.contains(l.languageCode)) i];
      final lang = offered.indexWhere((i) => _locales[i].languageCode == theme.locale.value.languageCode);
      final toggles = <(String, String, bool, ValueChanged<bool>)>[
        ('settings.motion', 'settings.motion_hint', theme.reduceMotion.value, (v) => theme.setReduceMotion(value: v)),
        (
          'settings.hw_reminders',
          'settings.hw_reminders_hint',
          theme.notifyHomework.value,
          (v) => theme.setNotify(homework: v),
        ),
        (
          'settings.fee_reminders',
          'settings.fee_reminders_hint',
          theme.notifyFees.value,
          (v) => theme.setNotify(fees: v),
        ),
      ];
      return PageFrame(
        leading: const BackGlass(),
        children: [
          const PageTitle('settings.title'),
          SectionLabel('settings.look'.tr, top: 18),
          EduCard(
            padding: const EdgeInsets.all(10),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  children: [
                    for (final (i, m) in AppThemeMode.values.indexed) ...[
                      if (i > 0) const SizedBox(width: 6),
                      Expanded(
                        child: _ThemeTile(mode: m, on: mode == m, onTap: () => theme.setMode(m)),
                      ),
                    ],
                  ],
                ),
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 4),
                  child: Container(height: 1, color: c.line),
                ),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
                  child: Row(
                    children: [
                      Expanded(child: Text('settings.text_size'.tr, style: context.type.ts)),
                      Text(
                        '${(theme.textScale.value * 100).round()}%',
                        style: context.type.cap.copyWith(fontFeatures: const [FontFeature.tabularFigures()]),
                      ),
                    ],
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(4, 8, 4, 4),
                  child: Row(
                    children: [
                      Text('A', style: AppText.capB(color: c.ink, height: 1)),
                      const SizedBox(width: 8),
                      Expanded(
                        child: GlassSlider(
                          value: _tOf(theme.textScale.value),
                          label: 'settings.text_size'.tr,
                          describe: (t) => '${(_scaleOf(t) * 100).round()}%',
                          divisions: 8,
                          onChanged: (t) => theme.setTextScale(double.parse(_scaleOf(t).toStringAsFixed(2))),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Text('A', style: AppText.h3(color: c.ink, height: 1)),
                    ],
                  ),
                ),
              ],
            ),
          ),
          if (offered.length > 1) ...[
            SectionLabel('settings.language'.tr, top: 16),
            GlassSegmented(
              labels: [for (final i in offered) _localeNames[i]],
              index: lang < 0 ? 0 : lang,
              height: 48,
              droplet: c.ink,
              dropletText: c.chalk,
              semanticLabel: 'settings.language'.tr,
              onChanged: (i) => theme.setLocale(_locales[offered[i]]),
            ),
          ],
          SectionLabel('settings.comfort'.tr, top: 16),
          EduCard(
            child: Column(
              children: [
                for (final (i, t) in toggles.indexed) ...[
                  if (i > 0) const Hr(indent: 14),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                    child: Row(
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(t.$1.tr, style: context.type.ts),
                              Text(t.$2.tr, style: context.type.cap),
                            ],
                          ),
                        ),
                        const SizedBox(width: 12),
                        GlassSwitch(value: t.$3, label: t.$1.tr, onChanged: t.$4),
                      ],
                    ),
                  ),
                ],
              ],
            ),
          ),
          SectionLabel('settings.account'.tr, top: 16),
          EduCard(
            child: Column(
              children: [
                _LinkRow(
                  icon: PhosphorIconsRegular.info,
                  label: 'menu.about',
                  onTap: () => Get.toNamed<void>(AppRoutes.about),
                ),
                const Hr(indent: 46),
                _LinkRow(
                  icon: PhosphorIconsRegular.question,
                  label: 'menu.help',
                  onTap: () => Get.toNamed<void>(AppRoutes.help),
                ),
                const Hr(indent: 46),
                _LinkRow(icon: PhosphorIconsRegular.shieldCheck, label: 'privacy.title', onTap: () => unawaited(showPrivacy())),
                const Hr(indent: 46),
                _LinkRow(
                  icon: PhosphorIconsRegular.signOut,
                  label: 'common.logout',
                  color: c.badText,
                  onTap: () => unawaited(signOut()),
                ),
              ],
            ),
          ),
        ],
      );
    });
  }
}

class _ThemeTile extends StatelessWidget {
  const _ThemeTile({required this.mode, required this.on, required this.onTap});

  final AppThemeMode mode;
  final bool on;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.app;
    final (bg, bar, name) = switch (mode) {
      AppThemeMode.light => (AppColors.light.chalk, AppColors.light.paper, 'settings.theme_chalk'),
      AppThemeMode.dark => (AppColors.blackboard.chalk, AppColors.blackboard.paper, 'settings.theme_blackboard'),
      AppThemeMode.amoled => (AppColors.amoled.chalk, AppColors.amoled.paper, 'settings.theme_amoled'),
      AppThemeMode.system => (null, AppColors.mari, 'settings.theme_auto'),
    };
    return Semantics(
      button: true,
      selected: on,
      label: name.tr,
      excludeSemantics: true,
      child: Pressable(
        onTap: () {
          Haptics.selection();
          onTap();
        },
        child: Padding(
          padding: const EdgeInsets.all(6),
          child: Column(
            children: [
              AnimatedContainer(
                duration: AppMotion.t3,
                height: 64,
                decoration: BoxDecoration(
                  color: bg,
                  gradient: bg == null
                      ? LinearGradient(
                          colors: [AppColors.light.chalk, AppColors.light.chalk, AppColors.blackboard.chalk, AppColors.blackboard.chalk],
                          stops: const [0, .5, .5, 1],
                        )
                      : null,
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: on ? c.ink : c.line2, width: on ? 2.5 : 1),
                ),
                child: Stack(
                  children: [
                    Positioned(
                      left: 8,
                      top: 8,
                      child: Container(
                        width: 16,
                        height: 30,
                        decoration: BoxDecoration(
                          color: AppColors.subject('maths').fill,
                          borderRadius: const BorderRadius.horizontal(left: Radius.circular(2), right: Radius.circular(6)),
                        ),
                      ),
                    ),
                    Positioned(
                      left: 28,
                      top: 14,
                      child: Container(
                        width: 16,
                        height: 24,
                        decoration: BoxDecoration(
                          color: AppColors.subject('hindi').fill,
                          borderRadius: const BorderRadius.horizontal(left: Radius.circular(2), right: Radius.circular(6)),
                        ),
                      ),
                    ),
                    Positioned(
                      left: 8,
                      right: 8,
                      bottom: 8,
                      child: Container(
                        height: 12,
                        decoration: BoxDecoration(color: bar, borderRadius: BorderRadius.circular(6)),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 6),
              Text(
                name.tr,
                style: AppText.capB(color: c.ink, height: 1.2),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _LinkRow extends StatelessWidget {
  const _LinkRow({required this.icon, required this.label, required this.onTap, this.color});

  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final Color? color;

  @override
  Widget build(BuildContext context) => Pressable(
    onTap: onTap,
    scale: .985,
    child: Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
      child: Row(
        children: [
          Icon(icon, size: 18, color: color ?? context.app.ink),
          const SizedBox(width: 12),
          Expanded(
            child: Text(label.tr, style: context.type.ts.copyWith(color: color)),
          ),
          if (color == null) Icon(PhosphorIconsRegular.caretRight, size: 16, color: context.app.ink3),
        ],
      ),
    ),
  );
}

class AboutView extends StatefulWidget {
  const AboutView({super.key});

  @override
  State<AboutView> createState() => _AboutViewState();
}

class _AboutViewState extends State<AboutView> {
  SchoolInfo? _school;

  @override
  void initState() {
    super.initState();
    unawaited(
      Get.find<DirectoryRepository>()
          .school()
          .then((s) {
            if (mounted) setState(() => _school = s);
          })
          .catchError((Object _) {}),
    );
  }

  @override
  Widget build(BuildContext context) {
    final c = context.app;
    final s = _school;
    final inset = MediaQuery.paddingOf(context);
    const books = [('maths', 120.0), ('science', 150.0), ('hindi', 104.0), ('social', 136.0), ('art', 96.0)];
    return PageFrame(
      padContent: false,
      topPadding: 0,
      leading: const BackGlass(),
      children: [
        SizedBox(
          height: 156 + inset.top,
          child: Stack(
            alignment: Alignment.bottomCenter,
            children: [
              Positioned(
                bottom: 0,
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    for (final (i, b) in books.indexed) ...[
                      if (i > 0) const SizedBox(width: 4),
                      Container(
                        width: 54,
                        height: b.$2,
                        decoration: BoxDecoration(
                          color: AppColors.subject(b.$1).fill,
                          borderRadius: const BorderRadius.only(
                            topLeft: Radius.circular(6),
                            topRight: Radius.circular(10),
                          ),
                        ),
                        foregroundDecoration: spineDecoration,
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 20, 20, 0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Overline('about.for'.trp({'version': AppConfig.version.split('.').take(2).join('.')})),
              const SizedBox(height: 8),
              Text(s?.name ?? AppConfig.schoolName, style: context.type.h2),
              const SizedBox(height: 4),
              Text(
                s?.tagline ?? AppConfig.schoolTagline,
                style: context.type.ts.copyWith(color: c.mariText),
              ),
              if (s != null) ...[
                const SizedBox(height: 10),
                Text(s.about, style: context.type.s),
                const SizedBox(height: 16),
                EduCard(
                  child: Column(
                    children: [
                      _Fact(
                        icon: PhosphorIconsRegular.mapPin,
                        title: s.address,
                        sub: 'about.maps'.tr,
                        onTap: () => _launch(
                          Uri.https('www.google.com', '/maps/search/', {
                            'api': '1',
                            'query': '${s.name}, ${s.address}',
                          }),
                        ),
                      ),
                      const Hr(indent: 44),
                      if (s.officeHours.isNotEmpty || s.principal.isNotEmpty) ...[
                        _Fact(
                          icon: PhosphorIconsRegular.clock,
                          title: s.officeHours.isNotEmpty ? 'about.office'.trp({'hours': s.officeHours}) : _principal(s),
                          sub: s.officeHours.isNotEmpty && s.principal.isNotEmpty ? _principal(s) : null,
                        ),
                        const Hr(indent: 44),
                      ],
                      _Fact(
                        icon: PhosphorIconsRegular.phone,
                        title: s.phone,
                        sub: s.email,
                        onTap: () => _launch(Uri(scheme: 'tel', path: s.phone)),
                      ),
                    ],
                  ),
                ),
              ],
              const SizedBox(height: 16),
              Wrap(
                alignment: WrapAlignment.center,
                spacing: 16,
                children: [
                  for (final (key, action) in [
                    ('about.privacy', () => Get.toNamed<void>(AppRoutes.help)),
                    ('about.terms', () => Get.toNamed<void>(AppRoutes.help)),
                    (
                      'about.licences',
                      () => showLicensePage(
                        context: context,
                        applicationName: 'Gradeon',
                        applicationVersion: AppConfig.version,
                      ),
                    ),
                  ])
                    TextButton(
                      onPressed: action,
                      style: TextButton.styleFrom(foregroundColor: c.mariText, textStyle: AppText.capB()),
                      child: Text(key.tr),
                    ),
                ],
              ),
              // Long-press the version to open the design system (developer tool).
              GestureDetector(
                onLongPress: () {
                  Haptics.medium();
                  unawaited(Get.toNamed<void>(AppRoutes.designSystem));
                },
                child: Center(
                  child: Text(
                    'about.version'.trp({'version': AppConfig.version, 'build': '${AppConfig.build}'}),
                    textAlign: TextAlign.center,
                    style: context.type.cap,
                  ),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

String _principal(SchoolInfo s) => s.founded > 0
    ? 'about.principal'.trp({'name': s.principal, 'year': '${s.founded}'})
    : 'about.principal_only'.trp({'name': s.principal});

class _Fact extends StatelessWidget {
  const _Fact({required this.icon, required this.title, this.sub, this.onTap});

  final IconData icon;
  final String title;
  final String? sub;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) => Pressable(
    onTap: onTap,
    scale: onTap == null ? 1 : .985,
    child: Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.only(top: 1),
            child: Icon(icon, size: 18, color: context.app.ink3),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: context.type.ts),
                if (sub != null) Text(sub!, style: context.type.cap),
              ],
            ),
          ),
        ],
      ),
    ),
  );
}

class HelpView extends StatefulWidget {
  const HelpView({super.key});

  @override
  State<HelpView> createState() => _HelpViewState();
}

class _HelpViewState extends State<HelpView> {
  final _query = TextEditingController();
  var _expanded = 1;
  SchoolInfo? _school;

  static const _faqs = 4;

  @override
  void initState() {
    super.initState();
    unawaited(
      Get.find<DirectoryRepository>()
          .school()
          .then((s) {
            if (mounted) setState(() => _school = s);
          })
          .catchError((Object _) {}),
    );
  }

  @override
  void dispose() {
    _query.dispose();
    super.dispose();
  }

  /// Opens the family's thread with the office, or calls it when there is none.
  void _chatOffice() {
    final chat = Get.isRegistered<ChatListController>() ? Get.find<ChatListController>() : null;
    final thread = chat?.threads.where((t) => t.title.toLowerCase().contains('office')).firstOrNull;
    if (thread != null) {
      unawaited(Get.toNamed<void>('/chat/${thread.id}'));
    } else if (_school != null) {
      unawaited(_launch(Uri(scheme: 'tel', path: _school!.phone)));
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.app;
    final q = _query.text.trim().toLowerCase();
    final faqs = [
      for (var i = 1; i <= _faqs; i++)
        if (q.isEmpty || 'help.faq${i}_q'.tr.toLowerCase().contains(q) || 'help.faq${i}_a'.tr.toLowerCase().contains(q))
          i,
    ];
    final s = _school;
    return PageFrame(
      leading: const BackGlass(),
      children: [
        const PageTitle('help.title'),
        const SizedBox(height: 12),
        Field(
          controller: _query,
          hint: 'help.search',
          icon: PhosphorIconsRegular.magnifyingGlass,
          minHeight: 50,
          fill: c.paper2,
          borderless: true,
          onChanged: (_) => setState(() {}),
        ),
        SectionLabel('help.talk'.tr, top: 20),
        Row(
          children: [
            for (final (i, t) in [
              (
                PhosphorIconsRegular.chatCircle,
                'help.chat_office',
                c.ink,
                c.chalk,
                _chatOffice,
              ),
              (
                PhosphorIconsRegular.phone,
                'help.call',
                AppColors.subject('science').fill,
                AppColors.white,
                () => s == null ? null : _launch(Uri(scheme: 'tel', path: s.phone)),
              ),
              (
                PhosphorIconsRegular.envelopeSimple,
                'help.email',
                AppColors.subject('maths').fill,
                AppColors.white,
                () => s == null ? null : _launch(Uri(scheme: 'mailto', path: s.email)),
              ),
            ].indexed) ...[
              if (i > 0) const SizedBox(width: 8),
              Expanded(
                child: Semantics(
                  button: true,
                  label: t.$2.tr,
                  excludeSemantics: true,
                  child: Pressable(
                    onTap: t.$5,
                    child: Container(
                      padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 6),
                      decoration: BoxDecoration(
                        color: c.paper,
                        borderRadius: BorderRadius.circular(18),
                        border: Border.all(color: c.line),
                      ),
                      child: Column(
                        children: [
                          Container(
                            width: 42,
                            height: 42,
                            decoration: BoxDecoration(color: t.$3, shape: BoxShape.circle),
                            child: Icon(t.$1, size: 18, color: t.$4),
                          ),
                          const SizedBox(height: 8),
                          Text(t.$2.tr, style: AppText.capB(color: c.ink, height: 1.2)),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ],
        ),
        SectionLabel('help.common'.tr, top: 20),
        if (faqs.isEmpty)
          Text('help.no_match'.tr, style: context.type.cap)
        else
          EduCard(
            child: Column(
              children: [
                for (final (n, i) in faqs.indexed) ...[
                  if (n > 0) const Hr(),
                  _Faq(
                    question: 'help.faq${i}_q'.tr,
                    answer: 'help.faq${i}_a'.tr,
                    open: _expanded == i || q.isNotEmpty,
                    onTap: () => setState(() => _expanded = _expanded == i ? 0 : i),
                  ),
                ],
              ],
            ),
          ),
        const SizedBox(height: 12),
        Btn(
          'help.report',
          kind: BtnKind.quiet,
          icon: PhosphorIconsRegular.flag,
          expand: true,
          onPressed: s == null
              ? null
              : () => _launch(
                  Uri(
                    scheme: 'mailto',
                    path: s.email,
                    query: 'subject=${Uri.encodeComponent('Gradeon ${AppConfig.version}: problem report')}',
                  ),
                ),
        ),
      ],
    );
  }
}

class _Faq extends StatelessWidget {
  const _Faq({required this.question, required this.answer, required this.open, required this.onTap});

  final String question;
  final String answer;
  final bool open;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Semantics(
        button: true,
        expanded: open,
        child: Pressable(
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                Expanded(child: Text(question, style: context.type.ts)),
                AnimatedRotation(
                  turns: open ? .5 : 0,
                  duration: AppMotion.t3,
                  child: Icon(PhosphorIconsRegular.caretDown, size: 18, color: context.app.ink),
                ),
              ],
            ),
          ),),
      ),
      AnimatedSize(
        duration: context.reduceMotion ? Duration.zero : AppMotion.t3,
        curve: const Cubic(.2, .8, .2, 1),
        alignment: Alignment.topCenter,
        child: open
            ? Padding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                child: Text(answer, style: context.type.s),
              )
            : const SizedBox(width: double.infinity),
      ),
    ],
  );
}
