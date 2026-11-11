// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'campus.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

Installment _$InstallmentFromJson(Map<String, dynamic> json) => Installment(
  id: json['id'] as String,
  title: json['title'] as String,
  amount: (json['amount'] as num).toInt(),
  dueDate: DateTime.parse(json['dueDate'] as String),
  paid: json['paid'] as bool,
  paidOn: json['paidOn'] == null
      ? null
      : DateTime.parse(json['paidOn'] as String),
  method: json['method'] as String?,
  reference: json['reference'] as String?,
);

Map<String, dynamic> _$InstallmentToJson(Installment instance) =>
    <String, dynamic>{
      'id': instance.id,
      'title': instance.title,
      'amount': instance.amount,
      'dueDate': instance.dueDate.toIso8601String(),
      'paid': instance.paid,
      'paidOn': ?instance.paidOn?.toIso8601String(),
      'method': ?instance.method,
      'reference': ?instance.reference,
    };

Receipt _$ReceiptFromJson(Map<String, dynamic> json) => Receipt(
  id: json['id'] as String,
  installmentId: json['installmentId'] as String,
  title: json['title'] as String,
  amount: (json['amount'] as num).toInt(),
  paidOn: DateTime.parse(json['paidOn'] as String),
  method: json['method'] as String,
  reference: json['reference'] as String,
);

Map<String, dynamic> _$ReceiptToJson(Receipt instance) => <String, dynamic>{
  'id': instance.id,
  'installmentId': instance.installmentId,
  'title': instance.title,
  'amount': instance.amount,
  'paidOn': instance.paidOn.toIso8601String(),
  'method': instance.method,
  'reference': instance.reference,
};

FeeAccount _$FeeAccountFromJson(Map<String, dynamic> json) => FeeAccount(
  studentId: json['studentId'] as String,
  academicYear: json['academicYear'] as String,
  installments: (json['installments'] as List<dynamic>)
      .map((e) => Installment.fromJson(e as Map<String, dynamic>))
      .toList(),
  receipts: (json['receipts'] as List<dynamic>)
      .map((e) => Receipt.fromJson(e as Map<String, dynamic>))
      .toList(),
);

Map<String, dynamic> _$FeeAccountToJson(FeeAccount instance) =>
    <String, dynamic>{
      'studentId': instance.studentId,
      'academicYear': instance.academicYear,
      'installments': instance.installments.map((e) => e.toJson()).toList(),
      'receipts': instance.receipts.map((e) => e.toJson()).toList(),
    };

Notice _$NoticeFromJson(Map<String, dynamic> json) => Notice(
  id: json['id'] as String,
  title: json['title'] as String,
  body: json['body'] as String,
  category: json['category'] as String,
  audience: json['audience'] as String,
  pinned: json['pinned'] as bool,
  date: DateTime.parse(json['date'] as String),
  author: json['author'] as String,
  attachments: (json['attachments'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
  needsAck: json['needsAck'] as bool? ?? false,
  acked: json['acked'] as bool? ?? false,
);

Map<String, dynamic> _$NoticeToJson(Notice instance) => <String, dynamic>{
  'id': instance.id,
  'title': instance.title,
  'body': instance.body,
  'category': instance.category,
  'audience': instance.audience,
  'pinned': instance.pinned,
  'date': instance.date.toIso8601String(),
  'author': instance.author,
  'attachments': instance.attachments,
  'needsAck': instance.needsAck,
  'acked': instance.acked,
};

Rsvp _$RsvpFromJson(Map<String, dynamic> json) => Rsvp(
  userId: json['userId'] as String,
  status: $enumDecode(_$RsvpStatusEnumMap, json['status']),
);

Map<String, dynamic> _$RsvpToJson(Rsvp instance) => <String, dynamic>{
  'userId': instance.userId,
  'status': _$RsvpStatusEnumMap[instance.status]!,
};

const _$RsvpStatusEnumMap = {
  RsvpStatus.going: 'going',
  RsvpStatus.maybe: 'maybe',
  RsvpStatus.cant: 'cant',
};

SchoolEvent _$SchoolEventFromJson(Map<String, dynamic> json) => SchoolEvent(
  id: json['id'] as String,
  title: json['title'] as String,
  description: json['description'] as String,
  date: DateTime.parse(json['date'] as String),
  time: json['time'] as String,
  venue: json['venue'] as String,
  category: json['category'] as String,
  imageUrl: json['imageUrl'] as String,
  rsvps: (json['rsvps'] as List<dynamic>)
      .map((e) => Rsvp.fromJson(e as Map<String, dynamic>))
      .toList(),
);

Map<String, dynamic> _$SchoolEventToJson(SchoolEvent instance) =>
    <String, dynamic>{
      'id': instance.id,
      'title': instance.title,
      'description': instance.description,
      'date': instance.date.toIso8601String(),
      'time': instance.time,
      'venue': instance.venue,
      'category': instance.category,
      'imageUrl': instance.imageUrl,
      'rsvps': instance.rsvps.map((e) => e.toJson()).toList(),
    };

ChatThread _$ChatThreadFromJson(Map<String, dynamic> json) => ChatThread(
  id: json['id'] as String,
  title: json['title'] as String,
  subtitle: json['subtitle'] as String,
  participantIds: (json['participantIds'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
  avatarUrl: json['avatarUrl'] as String,
  online: json['online'] as bool,
);

Map<String, dynamic> _$ChatThreadToJson(ChatThread instance) =>
    <String, dynamic>{
      'id': instance.id,
      'title': instance.title,
      'subtitle': instance.subtitle,
      'participantIds': instance.participantIds,
      'avatarUrl': instance.avatarUrl,
      'online': instance.online,
    };

ChatMessage _$ChatMessageFromJson(Map<String, dynamic> json) => ChatMessage(
  id: json['id'] as String,
  threadId: json['threadId'] as String,
  senderId: json['senderId'] as String,
  text: json['text'] as String,
  sentAt: DateTime.parse(json['sentAt'] as String),
  read: json['read'] as bool,
);

Map<String, dynamic> _$ChatMessageToJson(ChatMessage instance) =>
    <String, dynamic>{
      'id': instance.id,
      'threadId': instance.threadId,
      'senderId': instance.senderId,
      'text': instance.text,
      'sentAt': instance.sentAt.toIso8601String(),
      'read': instance.read,
    };

LibraryBook _$LibraryBookFromJson(Map<String, dynamic> json) => LibraryBook(
  id: json['id'] as String,
  title: json['title'] as String,
  author: json['author'] as String,
  category: json['category'] as String,
  isbn: json['isbn'] as String,
  available: json['available'] as bool,
  coverUrl: json['coverUrl'] as String,
  borrowedBy: json['borrowedBy'] as String?,
  dueDate: json['dueDate'] == null
      ? null
      : DateTime.parse(json['dueDate'] as String),
  loanId: json['loanId'] as String?,
  fine: json['fine'] as num? ?? 0,
  overdueDays: (json['overdueDays'] as num?)?.toInt() ?? 0,
  renewalsLeft: (json['renewalsLeft'] as num?)?.toInt(),
  waiting: (json['waiting'] as num?)?.toInt() ?? 0,
);

Map<String, dynamic> _$LibraryBookToJson(LibraryBook instance) =>
    <String, dynamic>{
      'id': instance.id,
      'title': instance.title,
      'author': instance.author,
      'category': instance.category,
      'isbn': instance.isbn,
      'available': instance.available,
      'coverUrl': instance.coverUrl,
      'borrowedBy': ?instance.borrowedBy,
      'dueDate': ?instance.dueDate?.toIso8601String(),
      'loanId': ?instance.loanId,
      'fine': instance.fine,
      'overdueDays': instance.overdueDays,
      'renewalsLeft': ?instance.renewalsLeft,
      'waiting': instance.waiting,
    };

BusContact _$BusContactFromJson(Map<String, dynamic> json) =>
    BusContact(name: json['name'] as String, phone: json['phone'] as String);

Map<String, dynamic> _$BusContactToJson(BusContact instance) =>
    <String, dynamic>{'name': instance.name, 'phone': instance.phone};

BusStop _$BusStopFromJson(Map<String, dynamic> json) => BusStop(
  name: json['name'] as String,
  time: json['time'] as String,
  reached: json['reached'] as bool? ?? false,
  isMine: json['isMine'] as bool? ?? false,
);

Map<String, dynamic> _$BusStopToJson(BusStop instance) => <String, dynamic>{
  'name': instance.name,
  'time': instance.time,
  'reached': instance.reached,
  'isMine': instance.isMine,
};

TransportInfo _$TransportInfoFromJson(Map<String, dynamic> json) =>
    TransportInfo(
      studentId: json['studentId'] as String,
      routeName: json['routeName'] as String,
      busNumber: json['busNumber'] as String,
      etaMinutes: (json['etaMinutes'] as num).toInt(),
      progress: (json['progress'] as num).toDouble(),
      stops: (json['stops'] as List<dynamic>)
          .map((e) => BusStop.fromJson(e as Map<String, dynamic>))
          .toList(),
      driverName: json['driverName'] as String? ?? '',
      call: json['call'] == null
          ? null
          : BusContact.fromJson(json['call'] as Map<String, dynamic>),
      running: json['running'] as bool? ?? false,
      live: json['live'] as bool? ?? false,
      lastSeen: json['lastSeen'] == null
          ? null
          : DateTime.parse(json['lastSeen'] as String),
    );

Map<String, dynamic> _$TransportInfoToJson(TransportInfo instance) =>
    <String, dynamic>{
      'studentId': instance.studentId,
      'routeName': instance.routeName,
      'busNumber': instance.busNumber,
      'etaMinutes': instance.etaMinutes,
      'progress': instance.progress,
      'stops': instance.stops.map((e) => e.toJson()).toList(),
      'driverName': instance.driverName,
      'call': ?instance.call?.toJson(),
      'running': instance.running,
      'live': instance.live,
      'lastSeen': ?instance.lastSeen?.toIso8601String(),
    };

LeaveRequest _$LeaveRequestFromJson(Map<String, dynamic> json) => LeaveRequest(
  id: json['id'] as String,
  studentId: json['studentId'] as String,
  from: DateTime.parse(json['from'] as String),
  to: DateTime.parse(json['to'] as String),
  reason: json['reason'] as String,
  status: $enumDecode(_$LeaveStatusEnumMap, json['status']),
  appliedOn: DateTime.parse(json['appliedOn'] as String),
  reviewedBy: json['reviewedBy'] as String?,
  reviewNote: json['reviewNote'] as String?,
  note: json['note'] as String?,
);

Map<String, dynamic> _$LeaveRequestToJson(LeaveRequest instance) =>
    <String, dynamic>{
      'id': instance.id,
      'studentId': instance.studentId,
      'from': instance.from.toIso8601String(),
      'to': instance.to.toIso8601String(),
      'reason': instance.reason,
      'status': _$LeaveStatusEnumMap[instance.status]!,
      'appliedOn': instance.appliedOn.toIso8601String(),
      'reviewedBy': ?instance.reviewedBy,
      'reviewNote': ?instance.reviewNote,
      'note': ?instance.note,
    };

const _$LeaveStatusEnumMap = {
  LeaveStatus.pending: 'pending',
  LeaveStatus.approved: 'approved',
  LeaveStatus.rejected: 'rejected',
  LeaveStatus.withdrawn: 'withdrawn',
};

GalleryPhoto _$GalleryPhotoFromJson(Map<String, dynamic> json) => GalleryPhoto(
  id: json['id'] as String,
  url: json['url'] as String,
  caption: json['caption'] as String,
  tagged:
      (json['tagged'] as List<dynamic>?)?.map((e) => e as String).toList() ??
      [],
);

Map<String, dynamic> _$GalleryPhotoToJson(GalleryPhoto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'url': instance.url,
      'caption': instance.caption,
      'tagged': instance.tagged,
    };

GalleryAlbum _$GalleryAlbumFromJson(Map<String, dynamic> json) => GalleryAlbum(
  id: json['id'] as String,
  title: json['title'] as String,
  date: DateTime.parse(json['date'] as String),
  blurb: json['blurb'] as String,
  photos: (json['photos'] as List<dynamic>)
      .map((e) => GalleryPhoto.fromJson(e as Map<String, dynamic>))
      .toList(),
);

Map<String, dynamic> _$GalleryAlbumToJson(GalleryAlbum instance) =>
    <String, dynamic>{
      'id': instance.id,
      'title': instance.title,
      'date': instance.date.toIso8601String(),
      'blurb': instance.blurb,
      'photos': instance.photos.map((e) => e.toJson()).toList(),
    };

AppNotification _$AppNotificationFromJson(Map<String, dynamic> json) =>
    AppNotification(
      id: json['id'] as String,
      userId: json['userId'] as String,
      title: json['title'] as String,
      body: json['body'] as String,
      type: json['type'] as String,
      date: DateTime.parse(json['date'] as String),
      read: json['read'] as bool,
      route: json['route'] as String,
    );

Map<String, dynamic> _$AppNotificationToJson(AppNotification instance) =>
    <String, dynamic>{
      'id': instance.id,
      'userId': instance.userId,
      'title': instance.title,
      'body': instance.body,
      'type': instance.type,
      'date': instance.date.toIso8601String(),
      'read': instance.read,
      'route': instance.route,
    };
