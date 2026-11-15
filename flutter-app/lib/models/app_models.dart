import 'dart:convert';

class ShenwangUser {
  final String uid;
  final String displayName;
  final String identifier;
  final String avatarColor;
  final String createdAt;

  ShenwangUser({
    required this.uid,
    required this.displayName,
    required this.identifier,
    this.avatarColor = 'cobalt',
    required this.createdAt,
  });

  String get name => displayName;
  String get email => identifier;
  String get shenwangId => identifier;

  Map<String, dynamic> toJson() => {
        'uid': uid,
        'displayName': displayName,
        'identifier': identifier,
        'avatarColor': avatarColor,
        'createdAt': createdAt,
      };

  factory ShenwangUser.fromJson(Map<String, dynamic> json) => ShenwangUser(
        uid: json['uid'] ?? json['id'] ?? '',
        displayName: json['displayName'] ?? json['name'] ?? 'ผู้ใช้งาน Shenwang',
        identifier: json['identifier'] ?? json['email'] ?? 'sw_user',
        avatarColor: json['avatarColor'] ?? 'cobalt',
        createdAt: json['createdAt'] ?? '',
      );

  String encode() => jsonEncode(toJson());
  static ShenwangUser decode(String source) =>
      ShenwangUser.fromJson(jsonDecode(source));
}

class BookmarkItem {
  final String title;
  final String url;
  final String createdAt;

  BookmarkItem({
    required this.title,
    required this.url,
    required this.createdAt,
  });

  Map<String, dynamic> toJson() => {
        'title': title,
        'url': url,
        'createdAt': createdAt,
      };

  factory BookmarkItem.fromJson(Map<String, dynamic> json) => BookmarkItem(
        title: json['title'] ?? '',
        url: json['url'] ?? '',
        createdAt: json['createdAt'] ?? '',
      );
}

class BrowserTabItem {
  final String id;
  String title;
  String url;
  final bool isIncognito;

  BrowserTabItem({
    required this.id,
    required this.title,
    required this.url,
    this.isIncognito = false,
  });
}
