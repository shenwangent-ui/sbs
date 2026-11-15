import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';
import '../models/app_models.dart';

class StorageService {
  static const _userKey = 'sbs_shenwang_user';
  static const _bookmarksKey = 'sbs_bookmarks';
  static const _historyKey = 'sbs_history';
  static const _darkModeKey = 'sbs_dark_mode';

  static Future<bool> getDarkMode() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getBool(_darkModeKey) ?? false;
  }

  static Future<void> setDarkMode(bool value) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_darkModeKey, value);
  }

  static Future<ShenwangUser?> getUser() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_userKey);
    if (raw == null || raw.isEmpty) return null;
    try {
      return ShenwangUser.decode(raw);
    } catch (_) {
      return null;
    }
  }

  static Future<void> saveUser(ShenwangUser user) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_userKey, user.encode());
  }

  static Future<void> clearUser() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_userKey);
  }

  static Future<List<BookmarkItem>> getBookmarks() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_bookmarksKey);
    if (raw == null) return [];
    final List decoded = jsonDecode(raw);
    return decoded.map((e) => BookmarkItem.fromJson(e)).toList();
  }

  static Future<void> addBookmark(BookmarkItem item) async {
    final list = await getBookmarks();
    list.removeWhere((b) => b.url == item.url);
    list.insert(0, item);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(
        _bookmarksKey, jsonEncode(list.map((e) => e.toJson()).toList()));
  }

  static Future<void> removeBookmark(String url) async {
    final list = await getBookmarks();
    list.removeWhere((b) => b.url == url);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(
        _bookmarksKey, jsonEncode(list.map((e) => e.toJson()).toList()));
  }

  static Future<List<String>> getHistory() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getStringList(_historyKey) ?? [];
  }

  static Future<void> addHistory(String query) async {
    final trimmed = query.trim();
    if (trimmed.isEmpty) return;
    final list = await getHistory();
    list.remove(trimmed);
    list.insert(0, trimmed);
    if (list.length > 50) list.removeLast();
    final prefs = await SharedPreferences.getInstance();
    await prefs.setStringList(_historyKey, list);
  }

  static Future<void> clearHistory() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_historyKey);
  }
}
