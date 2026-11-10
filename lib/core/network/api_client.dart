import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:get/get.dart';
import 'package:gradeon/core/config/app_config.dart';
import 'package:gradeon/core/services/connectivity_service.dart';
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
    this.onLocked,
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

  /// Called when the school answers 423: a module or feature was taken away, so the app reloads what the school has.
  final void Function()? onLocked;

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

  // What the app keeps for offline use: Home, the timetable, fees, homework, notices, attendance and events.
  static final _cachePaths = RegExp(
    r'^/v1/f/(me|school|notices|events|attendance/today|students/[^/]+/(fees|attendance)|classes/[^/]+/(timetable|homework))$',
  );
  static bool _cacheable(String path) => _cachePaths.hasMatch(path);

  // Writes that can wait for the network: a teacher's attendance, marked in a classroom with no signal.
  static bool _queueable(String path) => path == '/attendance';
  static const _outboxKey = 'outbox';

  Future<void> _queue(String path, Map<String, dynamic> body) async {
    final list = [...(_storage.read<List<dynamic>>(_outboxKey) ?? const [])];
    list.add({'path': path, 'body': body});
    await _storage.write(_outboxKey, list);
  }

  /// Sends what was queued while offline, oldest first. Returns how many went through.
  Future<int> flushOutbox() async {
    final list = [...(_storage.read<List<dynamic>>(_outboxKey) ?? const [])];
    var sent = 0;
    while (list.isNotEmpty) {
      final item = Map<String, dynamic>.from(list.first as Map);
      try {
        await _send('POST', item['path'] as String, body: Map<String, dynamic>.from(item['body'] as Map), canQueue: false);
      } on AppException catch (e) {
        if (e.message == 'errors.network') break;
      }
      list.removeAt(0);
      sent++;
      await _storage.write(_outboxKey, list);
    }
    return sent;
  }

  /// Uploads a file straight to the school's storage (the API hands out a short-lived address), then tells the API it
  /// arrived; the API checks it is what it says. Returns the file's ID.
  Future<String> upload({required String kind, required String ownerId, required String path}) async {
    final file = File(path);
    final name = path.split(RegExp(r'[\\/]')).last;
    final ext = name.split('.').last.toLowerCase();
    final mime = const {'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png', 'webp': 'image/webp', 'pdf': 'application/pdf'}[ext];
    if (mime == null) throw const AppException('errors.file_type');
    final bytes = await file.readAsBytes();
    final start = Map<String, dynamic>.from(
      await _send('POST', '/v1/files', body: {'kind': kind, 'ownerId': ownerId, 'name': name, 'mime': mime, 'bytes': bytes.length}) as Map,
    );
    final up = Map<String, dynamic>.from(start['upload'] as Map);
    final client = HttpClient()..connectionTimeout = _timeout;
    try {
      final req = await client.openUrl(up['method'] as String, Uri.parse(up['url'] as String));
      Map<String, dynamic>.from(up['headers'] as Map).forEach((k, v) => req.headers.set(k, '$v'));
      req.contentLength = bytes.length;
      req.add(bytes);
      final res = await req.close().timeout(const Duration(minutes: 2));
      await res.drain<void>();
      if (res.statusCode >= 300) throw const AppException('errors.upload');
    } on AppException {
      rethrow;
    } on Object {
      throw const AppException('errors.upload');
    } finally {
      client.close(force: true);
    }
    final id = start['fileId'] as String;
    await _send('POST', '/v1/files/$id/done', body: const {});
    return id;
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

  Future<dynamic> _send(String method, String path, {Map<String, dynamic>? query, Map<String, dynamic>? body, bool retried = false, bool canQueue = true}) async {
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
      if (res.statusCode >= 200 && res.statusCode < 300) {
        if (method == 'GET' && _cacheable(uri.path)) {
          unawaited(_storage.writeCache(uri.toString(), jsonEncode({'at': DateTime.now().toIso8601String(), 'body': text})));
        }
        if (Get.isRegistered<ConnectivityService>()) Get.find<ConnectivityService>().lastSynced.value = null;
        return json;
      }
      if (res.statusCode == 401 && !open && !retried && await _renew()) {
        return await _send(method, path, query: query, body: body, retried: true, canQueue: canQueue);
      }
      if (res.statusCode == 401 && !open) {
        await clearTokens();
        onSignedOut?.call();
      }
      if (res.statusCode == 423) onLocked?.call();
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
      // No network: the last copy of this screen's data, said to be from then; attendance waits to be sent.
      if (method == 'GET' && _cacheable(uri.path)) {
        final saved = await _storage.readCache(uri.toString());
        if (saved != null) {
          final copy = jsonDecode(saved) as Map<String, dynamic>;
          if (Get.isRegistered<ConnectivityService>()) {
            Get.find<ConnectivityService>().lastSynced.value = DateTime.tryParse(copy['at'] as String? ?? '');
          }
          final body = copy['body'] as String? ?? '';
          return body.isEmpty ? null : jsonDecode(body);
        }
      }
      if (method == 'POST' && canQueue && _queueable(path) && body != null) {
        await _queue(path, body);
        return {'queued': true};
      }
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
