import 'package:gradeon/core/config/app_config.dart';
import 'package:gradeon/core/utils/app_exception.dart';
import 'package:gradeon/data/datasources/mock_json_datasource.dart';
import 'package:gradeon/data/datasources/remote_datasource.dart';
import 'package:gradeon/data/models/user.dart';

abstract class AuthRepository {
  Future<AppUser> login({required String email, required String password});

  Future<AppUser> loginWithOtp({required String email, required String otp});

  /// Sends a sign-in code to a family's phone or email, with no password. Always ends in [OtpRequired].
  Future<Never> requestCode(String identifier);

  Future<AppUser> loginAs(UserRole role);
}

class MockAuthRepository implements AuthRepository {
  MockAuthRepository(this._ds);

  final MockJsonDataSource _ds;

  @override
  Future<AppUser> login({required String email, required String password}) {
    return _ds.guard(() => _match(email, password: password));
  }

  @override
  Future<AppUser> loginWithOtp({required String email, required String otp}) {
    return _ds.guard(() {
      if (otp != AppConfig.demoOtp) {
        throw const AppException('errors.bad_otp');
      }
      return _match(email);
    });
  }

  @override
  Future<Never> requestCode(String identifier) {
    return _ds.guard<Never>(() {
      _match(identifier);
      throw OtpRequired(identifier, demoCode: AppConfig.demoOtp);
    });
  }

  @override
  Future<AppUser> loginAs(UserRole role) {
    return _ds.guard(() {
      if (role == UserRole.student) throw const AppException('errors.student_login');
      const ids = {
        UserRole.parent: 'usr_priya',
        UserRole.teacher: 'usr_kavita',
      };
      return _byId(ids[role]!);
    });
  }

  AppUser _match(String email, {String? password}) {
    final needle = email.trim().toLowerCase();
    for (final user in _ds.users) {
      if (user.email.toLowerCase() != needle) continue;
      if (password != null && user.password != password) {
        throw const AppException('errors.bad_login');
      }
      return user;
    }
    throw const AppException('errors.bad_login');
  }

  AppUser _byId(String id) {
    for (final user in _ds.users) {
      if (user.id == id) return user;
    }
    throw const AppException('errors.bad_login');
  }
}

/// The school sent a sign-in code; the person has to type it. Thrown by the first step of a real sign-in.
class OtpRequired extends AppException {
  const OtpRequired(this.sentTo, {this.demoCode}) : super('auth.code_sent');

  final String sentTo;

  /// Only a demo school hands the code to the app, so the demo can be tried without a phone.
  final String? demoCode;
}

class RemoteAuthRepository implements AuthRepository {
  RemoteAuthRepository(this._remote);

  final RemoteDataSource _remote;
  String? _challenge;

  @override
  Future<AppUser> login({required String email, required String password}) async {
    final json = Map<String, dynamic>.from(await _remote.post('/v1/auth/login', {'identifier': email.trim(), 'password': password, 'client': 'mobile'}) as Map);
    if (json['step'] == 'done') return _enter(Map<String, dynamic>.from(json['tokens'] as Map));
    final challenge = Map<String, dynamic>.from(json['challenge'] as Map);
    _challenge = challenge['challengeId'] as String;
    throw OtpRequired(challenge['maskedTo'] as String? ?? '', demoCode: challenge['demoCode'] as String?);
  }

  Future<AppUser> _enter(Map<String, dynamic> tokens) async {
    await _remote.client.saveTokens(tokens);
    return AppUser.fromJson(Map<String, dynamic>.from(await _remote.get('/me') as Map));
  }

  @override
  Future<AppUser> loginWithOtp({
    required String email,
    required String otp,
  }) async {
    final challenge = _challenge;
    if (challenge == null) throw const AppException('errors.code_expired');
    final json = await _remote.post('/v1/auth/verify', {'challengeId': challenge, 'code': otp, 'client': 'mobile'});
    _challenge = null;
    return _enter(Map<String, dynamic>.from(json as Map));
  }

  @override
  Future<Never> requestCode(String identifier) async {
    final challenge = Map<String, dynamic>.from(await _remote.post('/v1/auth/code', {'identifier': identifier.trim(), 'client': 'mobile'}) as Map);
    _challenge = challenge['challengeId'] as String;
    throw OtpRequired(challenge['maskedTo'] as String? ?? '', demoCode: challenge['demoCode'] as String?);
  }

  @override
  Future<AppUser> loginAs(UserRole role) async {
    if (role == UserRole.student) throw const AppException('errors.student_login');
    const accounts = {
      UserRole.parent: 'priya.sharma@example.com',
      UserRole.teacher: 'kavita.iyer@greenfield.edu.in',
    };
    try {
      return await login(email: accounts[role]!, password: AppConfig.demoPassword);
    } on OtpRequired catch (otp) {
      // A demo school gives the code away so the cards work without a phone; any other school needs the real one.
      final code = otp.demoCode;
      if (code == null) rethrow;
      return loginWithOtp(email: accounts[role]!, otp: code);
    }
  }
}
