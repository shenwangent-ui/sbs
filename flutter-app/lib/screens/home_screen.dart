import 'package:flutter/material.dart';
import '../models/app_models.dart';
import '../services/storage_service.dart';
import 'account_screen.dart';
import 'browser_screen.dart';
import 'library_screen.dart';

class _QuickLink {
  final String title;
  final String url;
  final IconData icon;
  final Color color;

  const _QuickLink({
    required this.title,
    required this.url,
    required this.icon,
    required this.color,
  });
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
  final _searchController = TextEditingController();
  ShenwangUser? _user;
  List<String> _recentHistory = [];

  static const List<_QuickLink> _quickLinks = [
    _QuickLink(
      title: 'Google',
      url: 'https://www.google.com',
      icon: Icons.search,
      color: Color(0xFF2563EB),
    ),
    _QuickLink(
      title: 'YouTube',
      url: 'https://m.youtube.com',
      icon: Icons.play_circle_fill,
      color: Color(0xFFDC2626),
    ),
    _QuickLink(
      title: 'GitHub',
      url: 'https://github.com',
      icon: Icons.code,
      color: Color(0xFF1E293B),
    ),
    _QuickLink(
      title: 'Wikipedia',
      url: 'https://th.m.wikipedia.org',
      icon: Icons.menu_book,
      color: Color(0xFF059669),
    ),
    _QuickLink(
      title: 'ข่าววันนี้',
      url: 'https://news.google.com',
      icon: Icons.newspaper,
      color: Color(0xFFD97706),
    ),
    _QuickLink(
      title: 'แปลภาษา',
      url: 'https://translate.google.com',
      icon: Icons.translate,
      color: Color(0xFF4F46E5),
    ),
    _QuickLink(
      title: 'แผนที่',
      url: 'https://maps.google.com',
      icon: Icons.map,
      color: Color(0xFF16A34A),
    ),
    _QuickLink(
      title: 'Shenwang',
      url: 'https://github.com/shenwangent-ui',
      icon: Icons.shield,
      color: Color(0xFF1D4ED8),
    ),
  ];

  static const List<String> _trendingTopics = [
    'เทคโนโลยี AI ปี 2026',
    'ข่าวไอทีและซอฟต์แวร์ล่าสุด',
    'พยากรณ์อากาศวันนี้',
    'ราคาทองคำวันนี้',
  ];

  @override
  void initState() {
    super.initState();
    _loadState();
  }

  Future<void> _loadState() async {
    final u = await StorageService.getUser();
    final h = await StorageService.getHistory();
    if (mounted) {
      setState(() {
        _user = u;
        _recentHistory = h.take(4).toList();
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
    return Scaffold(
      appBar: AppBar(
        elevation: 0,
        backgroundColor: Colors.transparent,
        leading: IconButton(
          icon: Icon(isDark ? Icons.light_mode : Icons.dark_mode_outlined),
          tooltip: 'สลับโหมดมืด/สว่าง',
          onPressed: () => widget.onToggleDarkMode(!isDark),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.bookmarks_outlined),
            tooltip: 'บุ๊กมาร์กและประวัติ',
            onPressed: () {
              Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => const LibraryScreen()),
              ).then((_) => _loadState());
            },
          ),
          Padding(
            padding: const EdgeInsets.only(right: 12),
            child: InkWell(
              onTap: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(builder: (_) => const AccountScreen()),
                ).then((_) => _loadState());
              },
              borderRadius: BorderRadius.circular(20),
              child: Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                decoration: BoxDecoration(
                  color: const Color(0xFF1D4ED8).withOpacity(0.1),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.account_circle,
                        size: 20, color: Color(0xFF1D4ED8)),
                    const SizedBox(width: 6),
                    Text(
                      _user != null ? _user!.name : 'Shenwang ID',
                      style: const TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: Color(0xFF1D4ED8),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 20),
          child: Column(
            children: [
              const SizedBox(height: 24),
              Image.asset('assets/icon/logo.png', width: 84, height: 84),
              const SizedBox(height: 14),
              RichText(
                text: TextSpan(
                  style: const TextStyle(
                    fontSize: 32,
                    fontWeight: FontWeight.w800,
                    letterSpacing: -0.6,
                  ),
                  children: [
                    const TextSpan(
                      text: 'SBS ',
                      style: TextStyle(color: Color(0xFF1D4ED8)),
                    ),
                    TextSpan(
                      text: 'Search',
                      style: TextStyle(
                        color: isDark ? Colors.white : const Color(0xFF0F172A),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 6),
              const Text(
                'เครื่องมือค้นหาและเบราว์เซอร์อัจฉริยะโดย Shenwang Ent.',
                style: TextStyle(fontSize: 13, color: Colors.grey),
              ),
              const SizedBox(height: 28),
              Container(
                decoration: BoxDecoration(
                  color: isDark ? const Color(0xFF1E293B) : Colors.white,
                  borderRadius: BorderRadius.circular(28),
                  border: Border.all(
                    color: isDark ? Colors.grey[700]! : Colors.grey[300]!,
                  ),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withOpacity(0.05),
                      blurRadius: 12,
                      offset: const Offset(0, 4),
                    ),
                  ],
                ),
                child: Row(
                  children: [
                    const SizedBox(width: 16),
                    const Icon(Icons.search, color: Color(0xFF1D4ED8)),
                    const SizedBox(width: 10),
                    Expanded(
                      child: TextField(
                        controller: _searchController,
                        textInputAction: TextInputAction.search,
                        onSubmitted: _performSearch,
                        decoration: const InputDecoration(
                          border: InputBorder.none,
                          hintText: 'ค้นหาเว็บ หรือพิมพ์ที่อยู่ URL...',
                        ),
                      ),
                    ),
                    IconButton(
                      icon: const Icon(Icons.arrow_forward_rounded,
                          color: Color(0xFF1D4ED8)),
                      onPressed: () => _performSearch(_searchController.text),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 28),
              GridView.builder(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                itemCount: _quickLinks.length,
                gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: 4,
                  mainAxisSpacing: 14,
                  crossAxisSpacing: 10,
                  childAspectRatio: 0.9,
                ),
                itemBuilder: (_, idx) {
                  final item = _quickLinks[idx];
                  return InkWell(
                    onTap: () => _performSearch(item.url),
                    borderRadius: BorderRadius.circular(16),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Container(
                          width: 48,
                          height: 48,
                          decoration: BoxDecoration(
                            color: item.color.withOpacity(0.12),
                            borderRadius: BorderRadius.circular(14),
                          ),
                          child: Icon(item.icon, color: item.color, size: 24),
                        ),
                        const SizedBox(height: 6),
                        Text(
                          item.title,
                          style: const TextStyle(
                              fontSize: 12, fontWeight: FontWeight.w500),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ],
                    ),
                  );
                },
              ),
              const SizedBox(height: 20),
              if (_recentHistory.isNotEmpty) ...[
                Align(
                  alignment: Alignment.centerLeft,
                  child: Text(
                    'ค้นหาล่าสุด',
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.bold,
                      color: isDark ? Colors.grey[300] : Colors.grey[800],
                    ),
                  ),
                ),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: _recentHistory
                      .map((q) => ActionChip(
                            avatar: const Icon(Icons.history, size: 16),
                            label: Text(q, style: const TextStyle(fontSize: 12)),
                            onPressed: () => _performSearch(q),
                          ))
                      .toList(),
                ),
                const SizedBox(height: 20),
              ],
              Align(
                alignment: Alignment.centerLeft,
                child: Text(
                  'คำค้นหายอดนิยม',
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.bold,
                    color: isDark ? Colors.grey[300] : Colors.grey[800],
                  ),
                ),
              ),
              const SizedBox(height: 8),
              ..._trendingTopics.map(
                (topic) => ListTile(
                  dense: true,
                  contentPadding: EdgeInsets.zero,
                  leading: const Icon(Icons.trending_up,
                      size: 18, color: Color(0xFF1D4ED8)),
                  title: Text(topic, style: const TextStyle(fontSize: 13)),
                  trailing: const Icon(Icons.north_west, size: 15),
                  onTap: () => _performSearch(topic),
                ),
              ),
              const SizedBox(height: 24),
            ],
          ),
        ),
      ),
    );
  }
}
