import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import '../models/app_models.dart';

class StorageService {
  static const _userKey = 'sbs_shenwang_user';
  static const _tokenKey = 'sbs_shenwang_token';
  static const _serverUrlKey = 'sbs_server_url';
  static const _bookmarksKey = 'sbs_bookmarks';
  static const _historyKey = 'sbs_history';
  static const _darkModeKey = 'sbs_dark_mode';
  static const _searchEngineKey = 'sbs_search_engine';
  static const _bottomBarKey = 'sbs_bottom_address_bar';

  static Future<String> getServerUrl() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(_serverUrlKey) ?? 'http://127.0.0.1:3000';
  }

  static Future<void> setServerUrl(String url) async {
    final clean = url.trim().replaceAll(RegExp(r'/+$'), '');
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_serverUrlKey, clean);
  }

  static Future<String?> getSessionToken() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(_tokenKey);
  }

  static Future<bool> getDarkMode() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getBool(_darkModeKey) ?? false;
  }

  static Future<void> setDarkMode(bool value) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_darkModeKey, value);
  }

  static Future<String> getSearchEngine() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(_searchEngineKey) ?? 'Google';
  }

  static Future<void> setSearchEngine(String engine) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_searchEngineKey, engine);
  }

  static Future<bool> getBottomAddressBar() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getBool(_bottomBarKey) ?? false;
  }

  static Future<void> setBottomAddressBar(bool isBottom) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_bottomBarKey, isBottom);
  }

  static String buildSearchUrl(String query, String engine) {
    final encoded = Uri.encodeComponent(query);
    switch (engine) {
      case 'Bing':
        return 'https://www.bing.com/search?q=$encoded';
      case 'DuckDuckGo':
        return 'https://duckduckgo.com/?q=$encoded';
      case 'Google':
      default:
        return 'https://www.google.com/search?q=$encoded';
    }
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

  static Future<void> saveAuthSession(
    ShenwangUser user,
    String token, {
    List<dynamic>? serverBookmarks,
    List<dynamic>? serverHistory,
  }) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_userKey, user.encode());
    await prefs.setString(_tokenKey, token);

    if (serverBookmarks != null) {
      final parsedBookmarks = serverBookmarks
          .whereType>()
          .map((e) => BookmarkItem.fromJson(e))
          .toList();
      await prefs.setString(_bookmarksKey,
          jsonEncode(parsedBookmarks.map((e) => e.toJson()).toList()));
    }
    if (serverHistory != null) {
      final parsedHistory = serverHistory.map((e) => e.toString()).toList();
      await prefs.setStringList(_historyKey, parsedHistory);
    }
  }

  static Future<void> clearUser() async {
    final prefs = await SharedPreferences.getInstance();
    final token = prefs.getString(_tokenKey);
    final baseUrl = await getServerUrl();
    if (token != null && token.isNotEmpty) {
      try {
        await http.post(
          Uri.parse('$baseUrl/api/v1/auth/logout'),
          headers: {'Authorization': 'Bearer $token'},
        ).timeout(const Duration(seconds: 4));
      } catch (_) {}
    }
    await prefs.remove(_userKey);
    await prefs.remove(_tokenKey);
  }

  static Future<void> syncWithServer() async {
    final token = await getSessionToken();
    if (token == null || token.isEmpty) return;
    final baseUrl = await getServerUrl();
    final bookmarks = await getBookmarks();
    final history = await getHistory();
    try {
      await http
          .put(
            Uri.parse('$baseUrl/api/v1/user/sync'),
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer $token',
            },
            body: jsonEncode({
              'bookmarks': bookmarks.map((e) => e.toJson()).toList(),
              'history': history,
            }),
          )
          .timeout(const Duration(seconds: 5));
    } catch (_) {}
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
    await syncWithServer();
  }

  static Future<void> removeBookmark(String url) async {
    final list = await getBookmarks();
    list.removeWhere((b) => b.url == url);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(
        _bookmarksKey, jsonEncode(list.map((e) => e.toJson()).toList()));
    await syncWithServer();
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
    await syncWithServer();
  }

  static Future<void> clearHistory() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_historyKey);
    await syncWithServer();
  }
}
