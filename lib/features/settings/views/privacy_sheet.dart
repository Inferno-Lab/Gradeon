import 'dart:async';

import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:tangent/core/config/app_config.dart';
import 'package:tangent/core/services/auth_service.dart';
import 'package:tangent/core/services/school_config.dart';
import 'package:tangent/core/utils/extensions.dart';
import 'package:tangent/core/widgets/glass_controls.dart';
import 'package:tangent/core/widgets/sheets.dart';
import 'package:tangent/core/widgets/toast.dart';
import 'package:tangent/core/widgets/ui.dart';
import 'package:tangent/data/datasources/remote_datasource.dart';
import 'package:tangent/data/models/user.dart';

/// The school's privacy notice and grievance officer (Settings → Privacy).
Future<void> showPrivacy() => showSheet<void>(const PrivacySheet());

/// Once, right after sign-in: a family reads the school's privacy notice and agrees before using the app,
/// when the console requires it (Privacy → Families must consent). Nothing to ask on sample content.
Future<void> askConsentIfNeeded() async {
  if (!AppConfig.live || !SchoolConfig.consentRequired || Get.find<AuthService>().role != UserRole.parent) return;
  try {
    final me = Map<String, dynamic>.from(await Get.find<RemoteDataSource>().get('/v1/f/me') as Map);
    if (me['consentedAt'] != null) return;
  } on Object {
    return; // asked again on the next start
  }
  await showSheet<void>(const PrivacySheet(consent: true), dismissible: false);
}

class PrivacySheet extends StatefulWidget {
  const PrivacySheet({this.consent = false, super.key});

  /// Asks for consent (and the photo answer) instead of only showing the notice.
  final bool consent;

  @override
  State<PrivacySheet> createState() => _PrivacySheetState();
}

class _PrivacySheetState extends State<PrivacySheet> {
  var _photos = false;
  var _busy = false;

  Future<void> _agree() async {
    setState(() => _busy = true);
    try {
      await Get.find<RemoteDataSource>().post('/v1/f/consent', {if (SchoolConfig.photoConsent) 'photos': _photos});
      Get.back<void>();
    } on Object {
      if (mounted) setState(() => _busy = false);
      ToastHelper.show('privacy.save_failed', kind: ToastKind.error);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.app;
    final notice = AppConfig.privacyNotice.isEmpty ? 'privacy.default_notice'.tr : AppConfig.privacyNotice;
    return PopScope(
      canPop: !widget.consent,
      child: SheetBody(
        padding: const EdgeInsets.fromLTRB(24, 20, 24, 20),
        // The answer stays in view however long the school's notice is.
        footer: widget.consent
            ? Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Btn('privacy.agree', expand: true, loading: _busy, onPressed: _agree),
                  const SizedBox(height: 10),
                  Btn(
                    'common.logout',
                    kind: BtnKind.quiet,
                    expand: true,
                    onPressed: _busy ? null : () => unawaited(Get.find<AuthService>().signOut()),
                  ),
                ],
              )
            : null,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                const SchoolMark(size: 36),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(widget.consent ? 'privacy.consent_title'.tr : 'privacy.title'.tr, style: context.type.h2),
                ),
              ],
            ),
            if (widget.consent) ...[
              const SizedBox(height: 10),
              Text('privacy.consent_intro'.trp({'school': AppConfig.schoolName}), style: context.type.b.copyWith(color: c.ink2)),
            ],
            const SizedBox(height: 12),
            EduCard(
              padding: const EdgeInsets.all(16),
              child: Text(notice, style: context.type.s),
            ),
            if (AppConfig.privacyOfficer.isNotEmpty) ...[
              const SizedBox(height: 10),
              Text('privacy.officer'.trp({'who': AppConfig.privacyOfficer}), style: context.type.cap),
            ],
            if (widget.consent) ...[
              if (SchoolConfig.photoConsent) ...[
                const SizedBox(height: 16),
                Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('privacy.photos'.tr, style: context.type.ts),
                          Text('privacy.photos_hint'.tr, style: context.type.cap),
                        ],
                      ),
                    ),
                    const SizedBox(width: 12),
                    GlassSwitch(value: _photos, label: 'privacy.photos'.tr, onChanged: (v) => setState(() => _photos = v)),
                  ],
                ),
              ],
            ],
          ],
        ),
      ),
    );
  }
}
