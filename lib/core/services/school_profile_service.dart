import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:gradeon/core/config/app_config.dart';

/// Reads the school's own name and tagline from its API at start-up, so the app follows what the school sets in its admin.
/// Without a build profile (`SCHOOL` and `API_BASE_URL`) nothing happens and the demo values stay. A slow or failed call
/// leaves the built-in values: the app must always open.
class SchoolProfileService {
  const SchoolProfileService._();

  static Future<void> load() async {
    if (!AppConfig.live) return;
    final client = HttpClient()..connectionTimeout = const Duration(seconds: 8);
    try {
      final base = AppConfig.apiBase.replaceAll(RegExp(r'/$'), '');
      final req = await client.getUrl(Uri.parse('$base/v1/brand')).timeout(const Duration(seconds: 8));
      req.headers.set('x-school', AppConfig.schoolSlug);
      final res = await req.close().timeout(const Duration(seconds: 20));
      if (res.statusCode != 200) return;
      final json = jsonDecode(await res.transform(utf8.decoder).join()) as Map<String, dynamic>;
      final name = json['name'];
      final tagline = json['tagline'];
      if (name is String && name.trim().isNotEmpty) AppConfig.schoolName = name.trim();
      if (tagline is String && tagline.trim().isNotEmpty) AppConfig.schoolTagline = tagline.trim();
      AppConfig.demoSchool.value = json['demoMode'] == true;
    } on Object {
      // shortcut: any failure keeps the built-in values, retrying at the next start; add a cached copy when offline use matters.
    } finally {
      client.close(force: true);
    }
  }
}
