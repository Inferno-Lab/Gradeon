import 'package:json_annotation/json_annotation.dart';

part 'user.g.dart';

enum UserRole {
  @JsonValue('student')
  student,
  @JsonValue('parent')
  parent,
  @JsonValue('teacher')
  teacher,
  @JsonValue('driver')
  driver,
}

@JsonSerializable()
class AppUser {
  const AppUser({
    required this.id,
    required this.role,
    required this.name,
    required this.email,
    required this.phone,
    required this.avatarUrl,
    required this.password,
    required this.childIds,
    this.studentId,
    this.teacherId,
  });

  factory AppUser.fromJson(Map<String, dynamic> json) => _$AppUserFromJson(json);

  final String id;
  final UserRole role;
  final String name;
  final String email;
  final String phone;
  final String avatarUrl;
  final String password;
  final List<String> childIds;
  final String? studentId;
  final String? teacherId;

  AppUser copyWith({String? avatarUrl, String? name}) => AppUser(
    id: id,
    role: role,
    name: name ?? this.name,
    email: email,
    phone: phone,
    avatarUrl: avatarUrl ?? this.avatarUrl,
    password: password,
    childIds: childIds,
    studentId: studentId,
    teacherId: teacherId,
  );

  Map<String, dynamic> toJson() => _$AppUserToJson(this);
}
