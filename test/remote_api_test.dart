import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:gradeon/core/network/api_client.dart';
import 'package:gradeon/core/services/storage_service.dart';
import 'package:gradeon/core/utils/app_exception.dart';
import 'package:gradeon/data/datasources/remote_datasource.dart';
import 'package:gradeon/data/models/academics.dart';
import 'package:gradeon/data/models/user.dart';
import 'package:gradeon/data/repositories/academic_repository.dart';
import 'package:gradeon/data/repositories/auth_repository.dart';
import 'package:gradeon/data/repositories/campus_repository.dart';

/// A stand-in for the school's API that records what the app sends and answers with the shapes the real one does.
class _Fake {
  late HttpServer server;
  final seen = <({String method, String path, Map<String, String> headers, Object? body})>[];
  var expireNext = false;
  var accessToken = 'access-1';
  var refuseRefresh = false;

  Future<void> start() async {
    server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    unawaited(server.forEach(_handle));
  }

  String get base => 'http://127.0.0.1:${server.port}';

  Future<void> _handle(HttpRequest req) async {
    final text = await utf8.decoder.bind(req).join();
    final body = text.isEmpty ? null : jsonDecode(text);
    final path = req.uri.path + (req.uri.hasQuery ? '?${req.uri.query}' : '');
    seen.add((method: req.method, path: path, headers: {for (final h in ['x-school', 'authorization']) h: req.headers.value(h) ?? ''}, body: body));
    Future<void> send(int code, Object? json) async {
      req.response
        ..statusCode = code
        ..headers.contentType = ContentType.json;
      if (json != null) req.response.write(jsonEncode(json));
      await req.response.close();
    }

    final p = req.uri.path;
    if (p == '/v1/auth/login') {
      final b = body! as Map;
      if (b['password'] != 'right') return send(401, {'code': 'unauthenticated', 'message': 'That password isn’t right.'});
      return send(200, {'step': 'otp', 'challenge': {'challengeId': 'ch1', 'channel': 'sms', 'maskedTo': '+91 98••• ••012', 'expiresInSeconds': 600, 'demoCode': '424242'}});
    }
    if (p == '/v1/auth/verify') {
      if ((body! as Map)['code'] != '424242') return send(401, {'code': 'unauthenticated', 'message': 'That code isn’t right.'});
      return send(200, {'accessToken': accessToken, 'refreshToken': 'refresh-1', 'user': <String, dynamic>{}});
    }
    if (p == '/v1/auth/refresh') {
      if (refuseRefresh) return send(401, {'code': 'unauthenticated', 'message': 'Your session has ended. Sign in again.'});
      accessToken = 'access-2';
      return send(200, {'accessToken': 'access-2', 'refreshToken': 'refresh-2', 'user': <String, dynamic>{}});
    }
    if (req.headers.value('authorization') != 'Bearer $accessToken' || expireNext) {
      expireNext = false;
      return send(401, {'code': 'unauthenticated', 'message': 'Your session has ended. Sign in again.'});
    }
    return switch (p) {
      '/v1/f/me' => send(200, {'id': 'usr_priya', 'role': 'parent', 'name': 'Priya Sharma', 'email': 'priya@example.com', 'phone': '+91 98220 11002', 'avatarUrl': '', 'password': '', 'childIds': ['stu_aarav', 'stu_ananya']}),
      '/v1/f/students/stu_aarav/fees' => send(200, {
        'studentId': 'stu_aarav', 'academicYear': '2026–27',
        'installments': [
          {'id': 'inv1', 'title': 'Term 1 tuition', 'amount': 18500, 'dueDate': '2026-04-20', 'paid': true, 'paidOn': '2026-04-22', 'method': 'upi', 'reference': 'UPI123'},
          {'id': 'inv2', 'title': 'Term 2 tuition', 'amount': 18500, 'dueDate': '2026-10-23', 'paid': false},
        ],
        'receipts': [{'id': 'pay1', 'installmentId': 'inv1', 'title': 'Term 1 tuition', 'amount': 18500, 'paidOn': '2026-04-22', 'method': 'upi', 'reference': 'UPI123'}],
      }),
      '/v1/f/attendance/today' => send(200, {'stu_aarav': 'late', 'stu_diya': 'absent'}),
      '/v1/f/classes/cls_8a/marks' => send(200, {'stu_aarav': 44}),
      '/v1/f/students/stu_aarav/transport' => send(200, null),
      '/v1/f/library/books/b1/reserve' => send(409, {'code': 'conflict', 'message': 'The library catalogue is not online yet.'}),
      '/v1/f/attendance' => send(200, {'ok': true}),
      _ => send(404, {'code': 'not_found', 'message': 'That address does not exist.'}),
    };
  }
}

void main() {
  late _Fake fake;
  late StorageService storage;
  late ApiClient client;
  var signedOut = 0;

  setUp(() async {
    fake = _Fake();
    await fake.start();
    storage = StorageService(memory: <String, dynamic>{});
    signedOut = 0;
    client = ApiClient(storage: storage, base: fake.base, school: 'greenfield', onSignedOut: () => signedOut++);
  });
  tearDown(() => fake.server.close(force: true));

  group('ApiClient', () {
    test('names the school, puts family routes under /v1/f and sends the token', () async {
      await client.saveTokens({'accessToken': 'access-1', 'refreshToken': 'refresh-1'});
      await client.get('/me');
      final call = fake.seen.single;
      expect(call.path, '/v1/f/me');
      expect(call.headers['x-school'], 'greenfield');
      expect(call.headers['authorization'], 'Bearer access-1');
    });

    test('reaches the sign-in routes by their full path and sends no token to them', () async {
      await client.saveTokens({'accessToken': 'access-1', 'refreshToken': 'refresh-1'});
      await client.post('/v1/auth/login', {'identifier': 'a', 'password': 'right', 'client': 'mobile'});
      expect(fake.seen.single.path, '/v1/auth/login');
      expect(fake.seen.single.headers['authorization'], '');
      expect(fake.seen.single.body, containsPair('client', 'mobile'));
    });

    test('turns the server’s sentence into the exception, and a dead server into a network error', () async {
      await client.saveTokens({'accessToken': 'access-1', 'refreshToken': 'refresh-1'});
      await expectLater(client.post('/library/books/b1/reserve', {}), throwsA(isA<AppException>().having((e) => e.message, 'message', 'The library catalogue is not online yet.')));
      await expectLater(client.get('/nothing'), throwsA(isA<AppException>().having((e) => e.message, 'message', 'That address does not exist.')));
      await fake.server.close(force: true);
      await expectLater(client.get('/me'), throwsA(isA<AppException>().having((e) => e.message, 'message', 'errors.network')));
    });

    test('renews an expired token once and repeats the call', () async {
      await client.saveTokens({'accessToken': 'access-1', 'refreshToken': 'refresh-1'});
      fake.expireNext = true;
      final me = await client.get('/me') as Map;
      expect(me['name'], 'Priya Sharma');
      expect(fake.seen.map((c) => c.path), ['/v1/f/me', '/v1/auth/refresh', '/v1/f/me']);
      expect(fake.seen.last.headers['authorization'], 'Bearer access-2');
      expect(storage.read<String>(StorageKeys.refreshToken), 'refresh-2');
      expect((fake.seen[1].body as Map)['client'], 'mobile');
      expect(signedOut, 0);
    });

    test('signs the person out when the session cannot be renewed', () async {
      await client.saveTokens({'accessToken': 'old', 'refreshToken': 'refresh-1'});
      fake.refuseRefresh = true;
      await expectLater(client.get('/me'), throwsA(isA<AppException>()));
      expect(storage.read<String>(StorageKeys.accessToken), isNull);
      expect(signedOut, 1);
    });

    test('refuses to run without a school profile', () async {
      final bare = ApiClient(storage: storage, base: '', school: '');
      await expectLater(bare.get('/me'), throwsA(isA<AppException>().having((e) => e.message, 'message', 'errors.remote_unconfigured')));
    });
  });

  group('real sign-in', () {
    late RemoteAuthRepository auth;
    setUp(() => auth = RemoteAuthRepository(RemoteDataSource(client)));

    test('a right password asks for the code, and the code opens the app as the person', () async {
      await expectLater(
        auth.login(email: 'priya@example.com', password: 'right'),
        throwsA(isA<OtpRequired>().having((e) => e.demoCode, 'demo code', '424242').having((e) => e.sentTo, 'sent to', contains('98'))),
      );
      final user = await auth.loginWithOtp(email: 'priya@example.com', otp: '424242');
      expect(user.role, UserRole.parent);
      expect(user.childIds, ['stu_aarav', 'stu_ananya']);
      expect(client.hasSession, isTrue);
      expect((fake.seen.firstWhere((c) => c.path == '/v1/auth/login').body as Map)['client'], 'mobile');
      expect((fake.seen.firstWhere((c) => c.path == '/v1/auth/verify').body as Map)['client'], 'mobile');
    });

    test('a wrong password and a wrong code say so, and a code with no password step says to start again', () async {
      await expectLater(auth.login(email: 'priya@example.com', password: 'wrong'), throwsA(isA<AppException>().having((e) => e.message, 'm', contains('password'))));
      await expectLater(auth.loginWithOtp(email: 'priya@example.com', otp: '111111'), throwsA(isA<AppException>().having((e) => e.message, 'm', 'errors.code_expired')));
      await expectLater(auth.login(email: 'priya@example.com', password: 'right'), throwsA(isA<OtpRequired>()));
      await expectLater(auth.loginWithOtp(email: 'priya@example.com', otp: '111111'), throwsA(isA<AppException>().having((e) => e.message, 'm', contains('code'))));
    });
  });

  group('repositories read the real shapes', () {
    setUp(() => client.saveTokens({'accessToken': 'access-1', 'refreshToken': 'refresh-1'}));

    test('the fee account, with receipts', () async {
      final account = await RemoteFeeRepository(RemoteDataSource(client)).forStudent('stu_aarav');
      expect(account!.installments.map((i) => i.paid), [true, false]);
      expect(account.receipts.single.reference, 'UPI123');
      expect(account.academicYear, '2026–27');
    });

    test('today’s attendance as a map the teacher screen can use, and marks sent with the right words', () async {
      final repo = RemoteAttendanceRepository(RemoteDataSource(client));
      final today = await repo.todayForClass(['stu_aarav', 'stu_diya']);
      expect(today, {'stu_aarav': AttendanceStatus.lateArrival, 'stu_diya': AttendanceStatus.absent});
      await repo.markToday({'stu_aarav': AttendanceStatus.lateArrival, 'stu_diya': AttendanceStatus.present});
      expect(fake.seen.last.body, {'stu_aarav': 'late', 'stu_diya': 'present'});
    });

    test('the marks draft, and no transport as nothing rather than a crash', () async {
      expect(await RemoteExamRepository(RemoteDataSource(client)).marksDraft('cls_8a', 'maths'), {'stu_aarav': 44});
      expect(await RemoteTransportRepository(RemoteDataSource(client)).forStudent('stu_aarav'), isNull);
    });
  });
}
