import 'package:flutter/material.dart';
import '../models/app_models.dart';
import '../services/storage_service.dart';
import 'account_screen.dart';
import 'browser_screen.dart';
import 'info_screens.dart';
import 'library_screen.dart';

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

  void _performSearch(String query) {
    final trimmed = query.trim();
    if (trimmed.isEmpty) return;

    String targetUrl;
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      targetUrl = trimmed;
    } else if (trimmed.contains('.') && !trimmed.contains(' ')) {
      targetUrl = 'https://$trimmed';
    } else {
      StorageService.addHistory(trimmed);
      targetUrl =
          'https://www.google.com/search?q=${Uri.encodeComponent(trimmed)}';
    }

    _searchController.clear();
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => BrowserScreen(
          initialUrl: targetUrl,
          initialTitle: trimmed,
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
            // Top Header Bar เหมือนในภาพตัวอย่างเป๊ะ
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

            // พื้นที่เนื้อหาตรงกลางหน้าจอ
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

                      // ช่องค้นหาทรงแคปซูล + ปุ่ม "ค้นหา" สีน้ำเงินด้านขวา
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

                      // ปุ่มแท็กทางลัด 5 ปุ่มตรงกลาง
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

  // เมนูสไลด์ด้านขวา (SBS Search Menu) เหมือนในภาพที่ 1 ทุกบรรทัด
  Widget _buildRightMenuDrawer(bool isDark, Color textColor) {
    return Drawer(
      width: MediaQuery.of(context).size.width * 0.78,
      backgroundColor: isDark ? const Color(0xFF0F172A) : Colors.white,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.zero),
      child: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
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
            const SizedBox(height: 8),
            _drawerMenuItem(
              icon: Icons.search,
              iconColor: const Color(0xFF154EC1),
              title: 'หน้าแรก',
              onTap: () => Navigator.pop(context),
            ),
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
              icon: Icons.layers_outlined,
              iconColor: const Color(0xFF4F46E5),
              title: 'สถาปัตยกรรมระบบ 5 ส่วน',
              onTap: () {
                Navigator.pop(context);
                Navigator.push(
                  context,
                  MaterialPageRoute(builder: (_) => const ArchitectureScreen()),
                );
              },
            ),
            _drawerMenuItem(
              icon: Icons.code,
              iconColor: const Color(0xFF0284C7),
              title: 'Developer API & Playground',
              onTap: () {
                Navigator.pop(context);
                Navigator.push(
                  context,
                  MaterialPageRoute(builder: (_) => const DeveloperApiScreen()),
                );
              },
            ),
            _drawerMenuItem(
              icon: Icons.bookmark_border,
              iconColor: const Color(0xFFE11D48),
              title: 'หน้าที่บันทึกไว้ ($_bookmarksCount)',
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
              title: 'ประวัติการค้นหา',
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
              icon: Icons.download_outlined,
              iconColor: const Color(0xFF059669),
              title: 'โหลดแอพ (.EXE / .APK / .AAB)',
              onTap: () {
                Navigator.pop(context);
                Navigator.push(
                  context,
                  MaterialPageRoute(builder: (_) => const DownloadAppScreen()),
                );
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
      contentPadding: const EdgeInsets.symmetric(horizontal: 22, vertical: 2),
      leading: Icon(icon, color: iconColor, size: 21),
      title: Text(
        title,
        style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500),
      ),
      onTap: onTap,
    );
  }
}
