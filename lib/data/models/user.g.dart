// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'user.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AppUser _$AppUserFromJson(Map<String, dynamic> json) => AppUser(
  id: json['id'] as String,
  role: $enumDecode(_$UserRoleEnumMap, json['role']),
  name: json['name'] as String,
  email: json['email'] as String,
  phone: json['phone'] as String,
  avatarUrl: json['avatarUrl'] as String,
  password: json['password'] as String,
  childIds: (json['childIds'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
  studentId: json['studentId'] as String?,
  teacherId: json['teacherId'] as String?,
);

Map<String, dynamic> _$AppUserToJson(AppUser instance) => <String, dynamic>{
  'id': instance.id,
  'role': _$UserRoleEnumMap[instance.role]!,
  'name': instance.name,
  'email': instance.email,
  'phone': instance.phone,
  'avatarUrl': instance.avatarUrl,
  'password': instance.password,
  'childIds': instance.childIds,
  'studentId': ?instance.studentId,
  'teacherId': ?instance.teacherId,
};

const _$UserRoleEnumMap = {
  UserRole.student: 'student',
  UserRole.parent: 'parent',
  UserRole.teacher: 'teacher',
  UserRole.driver: 'driver',
};
