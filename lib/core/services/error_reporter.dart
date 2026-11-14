import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:tangent/core/config/app_config.dart';

/// Sends crashes to Tangent's error list (the console's Health page). Only builds for a real school report; debug runs print.
abstract final class ErrorReporter {
  static final _seen = <String>{};

  static void install() {
    final previous = FlutterError.onError;
    FlutterError.onError = (details) {
      previous?.call(details);
      report(details.exception, details.stack);
    };
    PlatformDispatcher.instance.onError = (error, stack) {
      report(error, stack);
      return false;
    };
  }

  static void report(Object error, StackTrace? stack) {
    if (!AppConfig.live || kDebugMode) return;
    final message = error.toString();
    // Once per message per run, and never a flood from one broken screen.
    if (!_seen.add(message) || _seen.length > 20) return;
    unawaited(_send(message, stack));
  }

  static Future<void> _send(String message, StackTrace? stack) async {
    final client = HttpClient()..connectionTimeout = const Duration(seconds: 8);
    try {
      final base = AppConfig.apiBase.replaceAll(RegExp(r'/$'), '');
      final req = await client.postUrl(Uri.parse('$base/v1/errors'));
      req.headers
        ..contentType = ContentType.json
        ..set('x-school', AppConfig.schoolSlug);
      final trace = stack?.toString() ?? '';
      req.write(jsonEncode({
        'source': 'app',
        'message': message.length > 500 ? message.substring(0, 500) : message,
        if (trace.isNotEmpty) 'stack': trace.length > 4000 ? trace.substring(0, 4000) : trace,
        'release': '${AppConfig.version}+${AppConfig.build}',
      }));
      await (await req.close()).drain<void>();
    } on Object {
      // shortcut: a report that cannot be sent is dropped; queue it on the phone if offline crashes need counting.
    } finally {
      client.close(force: true);
    }
  }
}
