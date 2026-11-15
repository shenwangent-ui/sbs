import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';
import '../models/app_models.dart';
import '../services/storage_service.dart';
import 'account_screen.dart';
import 'browser_screen.dart';
import 'library_screen.dart';
import 'settings_screen.dart';

class _QuickTag {
  final String label;
  final String queryOrUrl;
  const _QuickTag(this.label, this.queryOrUrl);
}

class HomeScreen extends StatefulWidget {
  final bool isDarkMode;
  final ValueChanged<bool> onToggleDarkMode;

  const HomeScreen({
    super.key,
    required this.isDarkMode,
    required this.onToggleDarkMode,
  });

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  final GlobalKey<ScaffoldState> _scaffoldKey = GlobalKey<ScaffoldState>();
  final TextEditingController _searchController = TextEditingController();
  ShenwangUser? _user;
  int _bookmarksCount = 0;

  static const List<_QuickTag> _quickTags = [
    _QuickTag('Google', 'https://www.google.com'),
    _QuickTag('YouTube', 'https://m.youtube.com'),
    _QuickTag('เทคโนโลยี AI ล่าสุด 2026', 'เทคโนโลยี AI ล่าสุด 2026'),
    _QuickTag('GitHub', 'https://github.com'),
    _QuickTag('Wikipedia ประเทศไทย', 'https://th.m.wikipedia.org'),
  ];

  @override
  void initState() {
    super.initState();
    _loadState();
  }

  Future<void> _loadState() async {
    final u = await StorageService.getUser();
    final b = await StorageService.getBookmarks();
    if (mounted) {
      setState(() {
        _user = u;
        _bookmarksCount = b.length;
      });
    }
  }

  Future<void> _performSearch(String query, {bool incognito = false}) async {
    final trimmed = query.trim();
    if (trimmed.isEmpty) return;

    String targetUrl;
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      targetUrl = trimmed;
    } else if (trimmed.contains('.') && !trimmed.contains(' ')) {
      targetUrl = 'https://$trimmed';
    } else {
      if (!incognito) {
        await StorageService.addHistory(trimmed);
      }
      final engine = await StorageService.getSearchEngine();
      targetUrl = StorageService.buildSearchUrl(trimmed, engine);
    }

    _searchController.clear();
    if (!mounted) return;
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => BrowserScreen(
          initialUrl: targetUrl,
          initialTitle: trimmed,
          isIncognito: incognito,
          isDarkMode: widget.isDarkMode,
          onToggleDarkMode: widget.onToggleDarkMode,
        ),
      ),
    ).then((_) => _loadState());
  }

  @override
  Widget build(BuildContext context) {
    final isDark = widget.isDarkMode;
    final bgColor = isDark ? const Color(0xFF0F172A) : Colors.white;
    final textColor = isDark ? Colors.white : const Color(0xFF0F172A);

    return Scaffold(
      key: _scaffoldKey,
      backgroundColor: bgColor,
      endDrawer: _buildRightMenuDrawer(isDark, textColor),
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              child: Row(
                children: [
                  Image.asset('assets/icon/logo.png', width: 26, height: 26),
                  const SizedBox(width: 8),
                  Text(
                    'SBS Search',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                      color: textColor,
                    ),
                  ),
                  const Spacer(),
                  IconButton(
                    visualDensity: VisualDensity.compact,
                    icon: const Icon(Icons.bookmark_border, size: 21),
                    tooltip: 'หน้าที่บันทึกไว้',
                    onPressed: () {
                      Navigator.push(
                        context,
                        MaterialPageRoute(
                            builder: (_) => const LibraryScreen(initialTab: 0)),
                      ).then((_) => _loadState());
                    },
                  ),
                  IconButton(
                    visualDensity: VisualDensity.compact,
                    icon: const Icon(Icons.history, size: 21),
                    tooltip: 'ประวัติการค้นหา',
                    onPressed: () {
                      Navigator.push(
                        context,
                        MaterialPageRoute(
                            builder: (_) => const LibraryScreen(initialTab: 1)),
                      ).then((_) => _loadState());
                    },
                  ),
                  IconButton(
                    visualDensity: VisualDensity.compact,
                    icon: Icon(
                      isDark ? Icons.light_mode_outlined : Icons.dark_mode_outlined,
                      size: 21,
                    ),
                    tooltip: 'สลับธีม',
                    onPressed: () => widget.onToggleDarkMode(!isDark),
                  ),
                  const SizedBox(width: 4),
                  InkWell(
                    onTap: () {
                      Navigator.push(
                        context,
                        MaterialPageRoute(builder: (_) => const AccountScreen()),
                      ).then((_) => _loadState());
                    },
                    borderRadius: BorderRadius.circular(20),
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 12, vertical: 7),
                      decoration: BoxDecoration(
                        color: const Color(0xFF154EC1),
                        borderRadius: BorderRadius.circular(20),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Icon(Icons.verified_user_outlined,
                              size: 15, color: Colors.white),
                          const SizedBox(width: 5),
                          Text(
                            _user != null ? _user!.name : 'ลงชื่อเข้าใช้',
                            style: const TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                              color: Colors.white,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(width: 4),
                  IconButton(
                    visualDensity: VisualDensity.compact,
                    icon: const Icon(Icons.menu, size: 24),
                    tooltip: 'SBS Search Menu',
                    onPressed: () => _scaffoldKey.currentState?.openEndDrawer(),
                  ),
                ],
              ),
            ),
            Expanded(
              child: Center(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.symmetric(horizontal: 22),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Image.asset('assets/icon/logo.png', width: 64, height: 64),
                      const SizedBox(height: 16),
                      RichText(
                        text: TextSpan(
                          style: const TextStyle(
                            fontSize: 36,
                            fontWeight: FontWeight.w800,
                            letterSpacing: -0.8,
                          ),
                          children: [
                            const TextSpan(
                              text: 'SBS ',
                              style: TextStyle(color: Color(0xFF154EC1)),
                            ),
                            TextSpan(
                              text: 'Search',
                              style: TextStyle(color: textColor),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 10),
                      Text(
                        'เอนจินค้นหาข้อมูลจริงจากเว็บทั่วโลก พร้อมระบบบัญชีอิสระ\nShenwang Account',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          fontSize: 13.5,
                          height: 1.45,
                          color: isDark ? Colors.grey[400] : const Color(0xFF64748B),
                        ),
                      ),
                      const SizedBox(height: 28),
                      Container(
                        height: 54,
                        padding: const EdgeInsets.only(left: 16, right: 6),
                        decoration: BoxDecoration(
                          color: isDark ? const Color(0xFF1E293B) : Colors.white,
                          borderRadius: BorderRadius.circular(30),
                          border: Border.all(
                            color: isDark
                                ? Colors.grey[700]!
                                : const Color(0xFFE2E8F0),
                          ),
                          boxShadow: [
                            BoxShadow(
                              color: Colors.black.withOpacity(0.04),
                              blurRadius: 14,
                              offset: const Offset(0, 4),
                            ),
                          ],
                        ),
                        child: Row(
                          children: [
                            const Icon(Icons.search,
                                color: Color(0xFF94A3B8), size: 21),
                            const SizedBox(width: 10),
                            Expanded(
                              child: TextField(
                                controller: _searchController,
                                textInputAction: TextInputAction.search,
                                onSubmitted: _performSearch,
                                style: const TextStyle(fontSize: 14),
                                decoration: const InputDecoration(
                                  border: InputBorder.none,
                                  hintText: 'ค้นหาบนเว็บ ข่าวสาร รูปภาพ หรือ URL...',
                                  hintStyle: TextStyle(
                                    color: Color(0xFF94A3B8),
                                    fontSize: 13.5,
                                  ),
                                ),
                              ),
                            ),
                            const SizedBox(width: 6),
                            FilledButton(
                              onPressed: () =>
                                  _performSearch(_searchController.text),
                              style: FilledButton.styleFrom(
                                backgroundColor: const Color(0xFF154EC1),
                                padding: const EdgeInsets.symmetric(
                                    horizontal: 20, vertical: 11),
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(24),
                                ),
                              ),
                              child: const Text(
                                'ค้นหา',
                                style: TextStyle(
                                  fontSize: 13.5,
                                  fontWeight: FontWeight.w600,
                                  color: Colors.white,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 22),
                      Wrap(
                        alignment: WrapAlignment.center,
                        spacing: 8,
                        runSpacing: 10,
                        children: _quickTags.map((tag) {
                          return InkWell(
                            onTap: () => _performSearch(tag.queryOrUrl),
                            borderRadius: BorderRadius.circular(10),
                            child: Container(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 14, vertical: 8),
                              decoration: BoxDecoration(
                                color: isDark
                                    ? const Color(0xFF1E293B)
                                    : const Color(0xFFF8FAFC),
                                borderRadius: BorderRadius.circular(10),
                                border: Border.all(
                                  color: isDark
                                      ? Colors.grey[800]!
                                      : const Color(0xFFE2E8F0),
                                ),
                              ),
                              child: Text(
                                tag.label,
                                style: TextStyle(
                                  fontSize: 12.5,
                                  fontWeight: FontWeight.w500,
                                  color: isDark
                                      ? Colors.grey[200]
                                      : const Color(0xFF334155),
                                ),
                              ),
                            ),
                          );
                        }).toList(),
                      ),
                      const SizedBox(height: 40),
                    ],
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildRightMenuDrawer(bool isDark, Color textColor) {
    return Drawer(
      width: MediaQuery.of(context).size.width * 0.78,
      backgroundColor: isDark ? const Color(0xFF0F172A) : Colors.white,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.zero),
      child: SafeArea(
        child: ListView(
          padding: EdgeInsets.zero,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 16, 12, 12),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    'SBS Search Menu',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                      color: textColor,
                    ),
                  ),
                  IconButton(
                    icon: const Icon(Icons.close, size: 22),
                    onPressed: () => Navigator.pop(context),
                  ),
                ],
              ),
            ),
            const Divider(height: 1),
            const SizedBox(height: 6),
            _drawerMenuItem(
              icon: Icons.search,
              iconColor: const Color(0xFF154EC1),
              title: 'หน้าแรก',
              onTap: () => Navigator.pop(context),
            ),
            _drawerMenuItem(
              icon: Icons.add_box_outlined,
              iconColor: const Color(0xFF0284C7),
              title: 'แท็บใหม่',
              onTap: () {
                Navigator.pop(context);
                _performSearch('https://www.google.com', incognito: false);
              },
            ),
            _drawerMenuItem(
              icon: Icons.privacy_tip_outlined,
              iconColor: Colors.deepPurple,
              title: 'แท็บใหม่ที่ไม่ระบุตัวตน',
              onTap: () {
                Navigator.pop(context);
                _performSearch('https://www.google.com', incognito: true);
              },
            ),
            const Divider(height: 16),
            _drawerMenuItem(
              icon: Icons.verified_user_outlined,
              iconColor: const Color(0xFF154EC1),
              title: _user != null
                  ? 'บัญชี: ${_user!.name}'
                  : 'ลงชื่อเข้าใช้ Shenwang Account',
              onTap: () {
                Navigator.pop(context);
                Navigator.push(
                  context,
                  MaterialPageRoute(builder: (_) => const AccountScreen()),
                ).then((_) => _loadState());
              },
            ),
            _drawerMenuItem(
              icon: Icons.bookmark_border,
              iconColor: const Color(0xFFE11D48),
              title: 'บุ๊กมาร์ก ($_bookmarksCount)',
              onTap: () {
                Navigator.pop(context);
                Navigator.push(
                  context,
                  MaterialPageRoute(
                      builder: (_) => const LibraryScreen(initialTab: 0)),
                ).then((_) => _loadState());
              },
            ),
            _drawerMenuItem(
              icon: Icons.history,
              iconColor: const Color(0xFFD97706),
              title: 'ประวัติการเข้าชม',
              onTap: () {
                Navigator.pop(context);
                Navigator.push(
                  context,
                  MaterialPageRoute(
                      builder: (_) => const LibraryScreen(initialTab: 1)),
                ).then((_) => _loadState());
              },
            ),
            _drawerMenuItem(
              icon: Icons.delete_outline,
              iconColor: Colors.red,
              title: 'ลบข้อมูลการท่องเว็บ',
              onTap: () async {
                Navigator.pop(context);
                await StorageService.clearHistory();
                await WebViewCookieManager().clearCookies();
                if (mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                        content: Text('ลบประวัติการท่องเว็บและคุกกี้แล้ว')),
                  );
                }
              },
            ),
            const Divider(height: 16),
            _drawerMenuItem(
              icon: Icons.settings_outlined,
              iconColor: const Color(0xFF475569),
              title: 'การตั้งค่า',
              onTap: () {
                Navigator.pop(context);
                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => SettingsScreen(
                      isDarkMode: widget.isDarkMode,
                      onToggleDarkMode: widget.onToggleDarkMode,
                    ),
                  ),
                ).then((_) => _loadState());
              },
            ),
          ],
        ),
      ),
    );
  }

  Widget _drawerMenuItem({
    required IconData icon,
    required Color iconColor,
    required String title,
    required VoidCallback onTap,
  }) {
    return ListTile(
      contentPadding: const EdgeInsets.symmetric(horizontal: 22, vertical: 1),
      leading: Icon(icon, color: iconColor, size: 21),
      title: Text(
        title,
        style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500),
      ),
      onTap: onTap,
    );
  }
}
