import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:get/get.dart';
import 'package:gradeon/core/config/app_config.dart';
import 'package:gradeon/core/services/storage_service.dart';
import 'package:gradeon/core/utils/app_exception.dart';

/// Talks to the school's API. Every call names the school, carries the signed-in person's token and, when the token
/// has expired, asks for a new one once and repeats the call. Family routes live under `/v1/f`; the sign-in routes
/// (`/v1/auth/...`) are reached with their full path.
class ApiClient {
  ApiClient({
    StorageService? storage,
    String? base,
    String? school,
    this.onSignedOut,
    Duration timeout = const Duration(seconds: 20),
  }) : _storage = storage ?? Get.find<StorageService>(),
       _base = (base ?? AppConfig.apiBase).replaceAll(RegExp(r'/$'), ''),
       _school = school ?? AppConfig.schoolSlug,
       _timeout = timeout;

  final StorageService _storage;
  final String _base;
  final String _school;
  final Duration _timeout;

  /// Called when the session cannot be renewed, so the app can show the sign-in screen.
  final void Function()? onSignedOut;

  Future<String?>? _refreshing;

  bool get hasSession => _storage.read<String>(StorageKeys.accessToken) != null;

  Future<void> saveTokens(Map<String, dynamic> tokens) async {
    await _storage.write(StorageKeys.accessToken, tokens['accessToken']);
    await _storage.write(StorageKeys.refreshToken, tokens['refreshToken']);
  }

  Future<void> clearTokens() async {
    await _storage.remove(StorageKeys.accessToken);
    await _storage.remove(StorageKeys.refreshToken);
  }

  Future<dynamic> get(String path, {Map<String, dynamic>? query}) => _send('GET', path, query: query);

  Future<dynamic> post(String path, Map<String, dynamic> body) => _send('POST', path, body: body);

  Future<dynamic> patch(String path, Map<String, dynamic> body) => _send('PATCH', path, body: body);

  Uri _uri(String path, Map<String, dynamic>? query) {
    final full = path.startsWith('/v1/') ? path : '/v1/f$path';
    final q = {
      for (final e in (query ?? const <String, dynamic>{}).entries)
        if (e.value != null) e.key: '${e.value}',
    };
    return Uri.parse('$_base$full').replace(queryParameters: q.isEmpty ? null : q);
  }

  Future<dynamic> _send(String method, String path, {Map<String, dynamic>? query, Map<String, dynamic>? body, bool retried = false}) async {
    if (_base.isEmpty || _school.isEmpty) throw const AppException('errors.remote_unconfigured');
    final open = path.startsWith('/v1/auth/');
    final uri = _uri(path, query);
    final client = HttpClient()..connectionTimeout = _timeout;
    final started = DateTime.now();
    final hasToken = _storage.read<String>(StorageKeys.accessToken) != null;
    _logRequest(method: method, uri: uri, body: body, retried: retried, authed: hasToken && !open);
    try {
      final req = await client.openUrl(method, uri).timeout(_timeout);
      req.headers
        ..set('x-school', _school)
        ..set('accept', 'application/json');
      final token = _storage.read<String>(StorageKeys.accessToken);
      if (token != null && !open) req.headers.set('authorization', 'Bearer $token');
      if (body != null) {
        req.headers.contentType = ContentType.json;
        req.add(utf8.encode(jsonEncode(body)));
      }
      final res = await req.close().timeout(_timeout);
      final text = await res.transform(utf8.decoder).join().timeout(_timeout);
      final ms = DateTime.now().difference(started).inMilliseconds;
      final json = text.trim().isEmpty ? null : jsonDecode(text);
      _logResponse(method: method, uri: uri, status: res.statusCode, ms: ms, body: text);
      if (res.statusCode >= 200 && res.statusCode < 300) return json;
      if (res.statusCode == 401 && !open && !retried && await _renew()) {
        return await _send(method, path, query: query, body: body, retried: true);
      }
      if (res.statusCode == 401 && !open) {
        await clearTokens();
        onSignedOut?.call();
      }
      final message = json is Map && json['message'] is String ? json['message'] as String : 'errors.network';
      throw AppException(message);
    } on AppException {
      rethrow;
    } on Object catch (error) {
      final ms = DateTime.now().difference(started).inMilliseconds;
      _logBlock([
        'API ERROR',
        '  method:   $method',
        '  url:      $uri',
        '  duration: ${ms}ms',
        '  error:    $error',
      ]);
      throw const AppException('errors.network');
    } finally {
      client.close(force: true);
    }
  }

  void _logRequest({
    required String method,
    required Uri uri,
    required Map<String, dynamic>? body,
    required bool retried,
    required bool authed,
  }) {
    _logBlock([
      'API REQUEST${retried ? ' (retry)' : ''}',
      '  method:  $method',
      '  url:     $uri',
      '  school:  $_school',
      '  auth:    ${authed ? 'Bearer …' : 'none'}',
      if (body != null) ..._bodyLines(_safeJson(body)),
    ]);
  }

  void _logResponse({
    required String method,
    required Uri uri,
    required int status,
    required int ms,
    required String body,
  }) {
    _logBlock([
      'API RESPONSE',
      '  method:   $method',
      '  url:      $uri',
      '  status:   $status',
      '  duration: ${ms}ms',
      ..._bodyLines(_safeJson(_tryDecode(body))),
    ]);
  }

  static List<String> _bodyLines(dynamic value) => [
    '  body:',
    for (final line in _pretty(value).split('\n')) '    $line',
  ];

  static void _logBlock(List<String> lines) {
    debugPrint('┌── ${lines.first}');
    for (final line in lines.skip(1)) {
      debugPrint('│$line');
    }
    debugPrint('└────────────────────────────────');
  }

  /// Keeps passwords and tokens out of the console.
  static dynamic _safeJson(dynamic value) {
    const hide = {'password', 'refreshToken', 'accessToken', 'code', 'otp', 'token'};
    if (value is Map) {
      return {
        for (final e in value.entries)
          '${e.key}': hide.contains('${e.key}') ? '…' : _safeJson(e.value),
      };
    }
    if (value is List) return [for (final item in value) _safeJson(item)];
    return value;
  }

  static dynamic _tryDecode(String text) {
    final trimmed = text.trim();
    if (trimmed.isEmpty) return '(empty)';
    try {
      return jsonDecode(trimmed);
    } on Object {
      return trimmed;
    }
  }

  static String _pretty(dynamic value) {
    if (value is String) {
      return value.length <= 2000 ? value : '${value.substring(0, 2000)}…';
    }
    try {
      final encoded = const JsonEncoder.withIndent('  ').convert(value);
      return encoded.length <= 4000 ? encoded : '${encoded.substring(0, 4000)}…';
    } on Object {
      return '$value';
    }
  }

  /// One renewal at a time, however many calls found the token expired.
  Future<bool> _renew() async {
    _refreshing ??= _doRenew().whenComplete(() => _refreshing = null);
    return (await _refreshing) != null;
  }

  Future<String?> _doRenew() async {
    final refresh = _storage.read<String>(StorageKeys.refreshToken);
    if (refresh == null) return null;
    try {
      final tokens = await _send('POST', '/v1/auth/refresh', body: {'refreshToken': refresh, 'client': 'mobile'}, retried: true);
      if (tokens is! Map<String, dynamic>) return null;
      await saveTokens(tokens);
      return tokens['accessToken'] as String?;
    } on Object {
      return null;
    }
  }
}
