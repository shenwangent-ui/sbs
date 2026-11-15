import 'dart:convert';

class ShenwangUser {
  final String id;
  final String name;
  final String email;
  final String shenwangId;
  final String createdAt;

  ShenwangUser({
    required this.id,
    required this.name,
    required this.email,
    required this.shenwangId,
    required this.createdAt,
  });

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'email': email,
        'shenwangId': shenwangId,
        'createdAt': createdAt,
      };

  factory ShenwangUser.fromJson(Map<String, dynamic> json) => ShenwangUser(
        id: json['id'] ?? '',
        name: json['name'] ?? 'ผู้ใช้งาน Shenwang',
        email: json['email'] ?? '',
        shenwangId: json['shenwangId'] ?? 'sw_user',
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
