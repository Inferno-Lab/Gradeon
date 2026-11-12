import 'package:json_annotation/json_annotation.dart';

part 'campus.g.dart';

enum LeaveStatus {
  @JsonValue('pending')
  pending,
  @JsonValue('approved')
  approved,
  @JsonValue('rejected')
  rejected,

  /// Taken back by the parent before the school answered.
  @JsonValue('withdrawn')
  withdrawn,
}

enum RsvpStatus {
  @JsonValue('going')
  going,
  @JsonValue('maybe')
  maybe,
  @JsonValue('cant')
  cant,
}

@JsonSerializable()
class Installment {
  const Installment({
    required this.id,
    required this.title,
    required this.amount,
    required this.dueDate,
    required this.paid,
    this.paidOn,
    this.method,
    this.reference,
  });

  factory Installment.fromJson(Map<String, dynamic> json) =>
      _$InstallmentFromJson(json);

  final String id;
  final String title;
  final int amount;
  final DateTime dueDate;
  final bool paid;
  final DateTime? paidOn;
  final String? method;
  final String? reference;

  Installment copyWith({
    bool? paid,
    DateTime? paidOn,
    String? method,
    String? reference,
  }) {
    return Installment(
      id: id,
      title: title,
      amount: amount,
      dueDate: dueDate,
      paid: paid ?? this.paid,
      paidOn: paidOn ?? this.paidOn,
      method: method ?? this.method,
      reference: reference ?? this.reference,
    );
  }

  Map<String, dynamic> toJson() => _$InstallmentToJson(this);
}

@JsonSerializable()
class Receipt {
  const Receipt({
    required this.id,
    required this.installmentId,
    required this.title,
    required this.amount,
    required this.paidOn,
    required this.method,
    required this.reference,
  });

  factory Receipt.fromJson(Map<String, dynamic> json) => _$ReceiptFromJson(json);

  final String id;
  final String installmentId;
  final String title;
  final int amount;
  final DateTime paidOn;
  final String method;
  final String reference;

  Map<String, dynamic> toJson() => _$ReceiptToJson(this);
}

@JsonSerializable()
class FeeAccount {
  const FeeAccount({
    required this.studentId,
    required this.academicYear,
    required this.installments,
    required this.receipts,
  });

  factory FeeAccount.fromJson(Map<String, dynamic> json) =>
      _$FeeAccountFromJson(json);

  final String studentId;
  final String academicYear;
  final List<Installment> installments;
  final List<Receipt> receipts;

  FeeAccount copyWith({
    List<Installment>? installments,
    List<Receipt>? receipts,
  }) {
    return FeeAccount(
      studentId: studentId,
      academicYear: academicYear,
      installments: installments ?? this.installments,
      receipts: receipts ?? this.receipts,
    );
  }

  Map<String, dynamic> toJson() => _$FeeAccountToJson(this);
}

@JsonSerializable()
class Notice {
  const Notice({
    required this.id,
    required this.title,
    required this.body,
    required this.category,
    required this.audience,
    required this.pinned,
    required this.date,
    required this.author,
    required this.attachments,
    this.needsAck = false,
    this.acked = false,
  });

  factory Notice.fromJson(Map<String, dynamic> json) => _$NoticeFromJson(json);

  final String id;
  final String title;
  final String body;
  final String category;
  final String audience;
  final bool pinned;
  final DateTime date;
  final String author;
  final List<String> attachments;

  /// The school asks families to say they have read it; [acked] once they have.
  @JsonKey(defaultValue: false)
  final bool needsAck;
  @JsonKey(defaultValue: false)
  final bool acked;

  Map<String, dynamic> toJson() => _$NoticeToJson(this);
}

@JsonSerializable()
class Rsvp {
  const Rsvp({required this.userId, required this.status});

  factory Rsvp.fromJson(Map<String, dynamic> json) => _$RsvpFromJson(json);

  final String userId;
  final RsvpStatus status;

  Map<String, dynamic> toJson() => _$RsvpToJson(this);
}

@JsonSerializable()
class SchoolEvent {
  const SchoolEvent({
    required this.id,
    required this.title,
    required this.description,
    required this.date,
    required this.time,
    required this.venue,
    required this.category,
    required this.imageUrl,
    required this.rsvps,
  });

  factory SchoolEvent.fromJson(Map<String, dynamic> json) =>
      _$SchoolEventFromJson(json);

  final String id;
  final String title;
  final String description;
  final DateTime date;
  final String time;
  final String venue;
  final String category;
  final String imageUrl;
  final List<Rsvp> rsvps;

  SchoolEvent copyWith({List<Rsvp>? rsvps}) => SchoolEvent(
    id: id,
    title: title,
    description: description,
    date: date,
    time: time,
    venue: venue,
    category: category,
    imageUrl: imageUrl,
    rsvps: rsvps ?? this.rsvps,
  );

  Map<String, dynamic> toJson() => _$SchoolEventToJson(this);
}

@JsonSerializable()
class ChatThread {
  const ChatThread({
    required this.id,
    required this.title,
    required this.subtitle,
    required this.participantIds,
    required this.avatarUrl,
    required this.online,
  });

  factory ChatThread.fromJson(Map<String, dynamic> json) =>
      _$ChatThreadFromJson(json);

  final String id;
  final String title;
  final String subtitle;
  final List<String> participantIds;
  final String avatarUrl;
  final bool online;

  Map<String, dynamic> toJson() => _$ChatThreadToJson(this);
}

@JsonSerializable()
class ChatMessage {
  const ChatMessage({
    required this.id,
    required this.threadId,
    required this.senderId,
    required this.text,
    required this.sentAt,
    required this.read,
  });

  factory ChatMessage.fromJson(Map<String, dynamic> json) =>
      _$ChatMessageFromJson(json);

  final String id;
  final String threadId;
  final String senderId;
  final String text;
  final DateTime sentAt;
  final bool read;

  Map<String, dynamic> toJson() => _$ChatMessageToJson(this);
}

@JsonSerializable()
class LibraryBook {
  const LibraryBook({
    required this.id,
    required this.title,
    required this.author,
    required this.category,
    required this.isbn,
    required this.available,
    required this.coverUrl,
    this.borrowedBy,
    this.dueDate,
    this.loanId,
    this.fine = 0,
    this.overdueDays = 0,
    this.renewalsLeft,
    this.waiting = 0,
  });

  factory LibraryBook.fromJson(Map<String, dynamic> json) =>
      _$LibraryBookFromJson(json);

  final String id;
  final String title;
  final String author;
  final String category;
  final String isbn;
  final bool available;
  final String coverUrl;
  final String? borrowedBy;
  final DateTime? dueDate;
  final String? loanId;

  /// What is owed on this loan so far, and how many days late it is.
  @JsonKey(defaultValue: 0)
  final num fine;
  @JsonKey(defaultValue: 0)
  final int overdueDays;
  final int? renewalsLeft;

  /// People waiting for a copy.
  @JsonKey(defaultValue: 0)
  final int waiting;

  LibraryBook copyWith({
    bool? available,
    String? borrowedBy,
    DateTime? dueDate,
    bool clearBorrow = false,
  }) {
    return LibraryBook(
      id: id,
      title: title,
      author: author,
      category: category,
      isbn: isbn,
      available: available ?? this.available,
      coverUrl: coverUrl,
      borrowedBy: clearBorrow ? null : borrowedBy ?? this.borrowedBy,
      dueDate: clearBorrow ? null : dueDate ?? this.dueDate,
      loanId: clearBorrow ? null : loanId,
      fine: clearBorrow ? 0 : fine,
      overdueDays: clearBorrow ? 0 : overdueDays,
      renewalsLeft: clearBorrow ? null : renewalsLeft,
      waiting: waiting,
    );
  }

  Map<String, dynamic> toJson() => _$LibraryBookToJson(this);
}

/// Whom a family calls about the bus: the attendant or the school office, as the school chose; never the driver, who is driving.
@JsonSerializable()
class BusContact {
  const BusContact({required this.name, required this.phone});

  factory BusContact.fromJson(Map<String, dynamic> json) => _$BusContactFromJson(json);

  final String name;
  final String phone;

  Map<String, dynamic> toJson() => _$BusContactToJson(this);
}

@JsonSerializable()
class BusStop {
  const BusStop({
    required this.name,
    required this.time,
    this.reached = false,
    this.isMine = false,
  });

  factory BusStop.fromJson(Map<String, dynamic> json) => _$BusStopFromJson(json);

  final String name;
  final String time;
  @JsonKey(defaultValue: false)
  final bool reached;

  /// The child's own stop.
  @JsonKey(defaultValue: false)
  final bool isMine;

  Map<String, dynamic> toJson() => _$BusStopToJson(this);
}

@JsonSerializable()
class TransportInfo {
  const TransportInfo({
    required this.studentId,
    required this.routeName,
    required this.busNumber,
    required this.etaMinutes,
    required this.progress,
    required this.stops,
    this.driverName = '',
    this.call,
    this.running = false,
    this.live = false,
    this.lastSeen,
  });

  factory TransportInfo.fromJson(Map<String, dynamic> json) =>
      _$TransportInfoFromJson(json);

  final String studentId;
  final String routeName;
  final String busNumber;
  final int etaMinutes;
  final double progress;
  final List<BusStop> stops;
  @JsonKey(defaultValue: '')
  final String driverName;
  final BusContact? call;

  /// A trip is under way now; [live] when the bus's position is fresh.
  @JsonKey(defaultValue: false)
  final bool running;
  @JsonKey(defaultValue: false)
  final bool live;
  final DateTime? lastSeen;

  Map<String, dynamic> toJson() => _$TransportInfoToJson(this);
}

@JsonSerializable()
class LeaveRequest {
  const LeaveRequest({
    required this.id,
    required this.studentId,
    required this.from,
    required this.to,
    required this.reason,
    required this.status,
    required this.appliedOn,
    this.reviewedBy,
    this.reviewNote,
    this.note,
  });

  factory LeaveRequest.fromJson(Map<String, dynamic> json) =>
      _$LeaveRequestFromJson(json);

  final String id;
  final String studentId;
  final DateTime from;
  final DateTime to;
  final String reason;
  final LeaveStatus status;
  final DateTime appliedOn;
  final String? reviewedBy;
  final String? reviewNote;

  /// The family's note to the class teacher.
  final String? note;

  LeaveRequest copyWith({LeaveStatus? status}) => LeaveRequest(
    id: id, studentId: studentId, from: from, to: to, reason: reason, status: status ?? this.status, appliedOn: appliedOn,
    reviewedBy: reviewedBy, reviewNote: reviewNote, note: note,
  );

  Map<String, dynamic> toJson() => _$LeaveRequestToJson(this);
}

@JsonSerializable()
class GalleryPhoto {
  const GalleryPhoto({
    required this.id,
    required this.url,
    required this.caption,
    this.tagged = const [],
  });

  factory GalleryPhoto.fromJson(Map<String, dynamic> json) =>
      _$GalleryPhotoFromJson(json);

  final String id;
  final String url;
  final String caption;

  /// Students who appear in the photo.
  @JsonKey(defaultValue: <String>[])
  final List<String> tagged;

  Map<String, dynamic> toJson() => _$GalleryPhotoToJson(this);
}

@JsonSerializable()
class GalleryAlbum {
  const GalleryAlbum({
    required this.id,
    required this.title,
    required this.date,
    required this.blurb,
    required this.photos,
  });

  factory GalleryAlbum.fromJson(Map<String, dynamic> json) =>
      _$GalleryAlbumFromJson(json);

  final String id;
  final String title;
  final DateTime date;
  final String blurb;
  final List<GalleryPhoto> photos;

  Map<String, dynamic> toJson() => _$GalleryAlbumToJson(this);
}

@JsonSerializable()
class AppNotification {
  const AppNotification({
    required this.id,
    required this.userId,
    required this.title,
    required this.body,
    required this.type,
    required this.date,
    required this.read,
    required this.route,
  });

  factory AppNotification.fromJson(Map<String, dynamic> json) =>
      _$AppNotificationFromJson(json);

  final String id;
  final String userId;
  final String title;
  final String body;
  final String type;
  final DateTime date;
  final bool read;
  final String route;

  AppNotification copyWith({bool? read}) => AppNotification(
    id: id,
    userId: userId,
    title: title,
    body: body,
    type: type,
    date: date,
    read: read ?? this.read,
    route: route,
  );

  Map<String, dynamic> toJson() => _$AppNotificationToJson(this);
}
