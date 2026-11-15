import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:webview_flutter/webview_flutter.dart';
import '../models/app_models.dart';
import '../services/storage_service.dart';
import 'library_screen.dart';
import 'settings_screen.dart';

class BrowserScreen extends StatefulWidget {
  final String initialUrl;
  final String initialTitle;
  final bool isIncognito;
  final bool isDarkMode;
  final ValueChanged<bool>? onToggleDarkMode;

  const BrowserScreen({
    super.key,
    required this.initialUrl,
    this.initialTitle = 'SBS Browser',
    this.isIncognito = false,
    this.isDarkMode = false,
    this.onToggleDarkMode,
  });

  @override
  State<BrowserScreen> createState() => _BrowserScreenState();
}

class _BrowserScreenState extends State<BrowserScreen> {
  final List<BrowserTabItem> _tabs = [];
  int _activeIndex = 0;
  late final WebViewController _controller;
  late final TextEditingController _urlController;
  double _progress = 0;
  String _currentTitle = '';
  bool _isBookmarked = false;
  bool _isDesktopMode = false;
  bool _bottomAddressBar = false;

  static const String _mobileUA =
      'Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';
  static const String _desktopUA =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

  @override
  void initState() {
    super.initState();
    _tabs.add(BrowserTabItem(
      id: DateTime.now().millisecondsSinceEpoch.toString(),
      title: widget.initialTitle,
      url: widget.initialUrl,
      isIncognito: widget.isIncognito,
    ));
    _currentTitle = widget.initialTitle;
    _urlController = TextEditingController(text: widget.initialUrl);

    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setUserAgent(_mobileUA)
      ..setNavigationDelegate(
        NavigationDelegate(
          onProgress: (p) {
            if (mounted) setState(() => _progress = p / 100.0);
          },
          onPageStarted: (url) {
            if (mounted) {
              setState(() {
                _urlController.text = url;
                _tabs[_activeIndex].url = url;
              });
              _checkBookmarkStatus(url);
            }
          },
          onPageFinished: (url) async {
            final title = await _controller.getTitle() ?? url;
            if (mounted) {
              setState(() {
                _currentTitle = title;
                _tabs[_activeIndex].title = title;
                _tabs[_activeIndex].url = url;
              });
              _checkBookmarkStatus(url);
            }
          },
        ),
      )
      ..loadRequest(Uri.parse(widget.initialUrl));

    _loadPrefs();
    _checkBookmarkStatus(widget.initialUrl);
  }

  Future<void> _loadPrefs() async {
    final bottom = await StorageService.getBottomAddressBar();
    if (mounted) setState(() => _bottomAddressBar = bottom);
  }

  Future<void> _checkBookmarkStatus(String url) async {
    final list = await StorageService.getBookmarks();
    if (mounted) {
      setState(() {
        _isBookmarked = list.any((b) => b.url == url);
      });
    }
  }

  Future<void> _navigateToInput(String input) async {
    var trimmed = input.trim();
    if (trimmed.isEmpty) return;
    Uri uri;
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      uri = Uri.parse(trimmed);
    } else if (trimmed.contains('.') && !trimmed.contains(' ')) {
      uri = Uri.parse('https://$trimmed');
    } else {
      if (!_tabs[_activeIndex].isIncognito) {
        await StorageService.addHistory(trimmed);
      }
      final engine = await StorageService.getSearchEngine();
      uri = Uri.parse(StorageService.buildSearchUrl(trimmed, engine));
    }
    _controller.loadRequest(uri);
    if (mounted) FocusScope.of(context).unfocus();
  }

  Future<void> _toggleBookmark() async {
    final url = _tabs[_activeIndex].url;
    if (_isBookmarked) {
      await StorageService.removeBookmark(url);
      if (mounted) {
        setState(() => _isBookmarked = false);
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('ลบบุ๊กมาร์กแล้ว')));
      }
    } else {
      await StorageService.addBookmark(BookmarkItem(
        title: _currentTitle.isNotEmpty ? _currentTitle : url,
        url: url,
        createdAt: DateTime.now().toIso8601String(),
      ));
      if (mounted) {
        setState(() => _isBookmarked = true);
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('บันทึกบุ๊กมาร์กแล้ว')));
      }
    }
  }

  void _openNewTab({bool incognito = false}) {
    setState(() {
      _tabs.add(BrowserTabItem(
        id: DateTime.now().millisecondsSinceEpoch.toString(),
        title: incognito ? 'แท็บไม่ระบุตัวตน' : 'แท็บใหม่',
        url: 'https://www.google.com',
        isIncognito: incognito,
      ));
      _activeIndex = _tabs.length - 1;
      _urlController.text = 'https://www.google.com';
    });
    _controller.loadRequest(Uri.parse('https://www.google.com'));
  }

  void _showFindInPageDialog() {
    final findCtrl = TextEditingController();
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('ค้นหาในหน้าเว็บ'),
        content: TextField(
          controller: findCtrl,
          autofocus: true,
          decoration: const InputDecoration(hintText: 'พิมพ์คำที่ต้องการหา...'),
          onSubmitted: (val) {
            if (val.trim().isNotEmpty) {
              _controller.runJavaScript(
                  "window.find('${val.trim().replaceAll("'", "\\'")}');");
            }
            Navigator.pop(ctx);
          },
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx), child: const Text('ยกเลิก')),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: const Color(0xFF154EC1)),
            onPressed: () {
              final val = findCtrl.text.trim();
              if (val.isNotEmpty) {
                _controller.runJavaScript(
                    "window.find('${val.replaceAll("'", "\\'")}');");
              }
              Navigator.pop(ctx);
            },
            child: const Text('ค้นหา'),
          ),
        ],
      ),
    );
  }

  void _translateCurrentPage() {
    final currentUrl = _tabs[_activeIndex].url;
    final translateUrl =
        'https://translate.google.com/translate?sl=auto&tl=th&u=${Uri.encodeComponent(currentUrl)}';
    _controller.loadRequest(Uri.parse(translateUrl));
  }

  Future<void> _toggleDesktopMode() async {
    setState(() => _isDesktopMode = !_isDesktopMode);
    await _controller.setUserAgent(_isDesktopMode ? _desktopUA : _mobileUA);
    await _controller.reload();
  }

  void _openBrowserMenuSheet() {
    final isIncognito = _tabs[_activeIndex].isIncognito;
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (ctx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 12),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              // แถวปุ่มควบคุม 5 ปุ่มด้านบนเหมือนเบราว์เซอร์จริง
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceAround,
                  children: [
                    _topCircleAction(Icons.arrow_back, () async {
                      Navigator.pop(ctx);
                      if (await _controller.canGoBack()) await _controller.goBack();
                    }),
                    _topCircleAction(Icons.arrow_forward, () async {
                      Navigator.pop(ctx);
                      if (await _controller.canGoForward()) {
                        await _controller.goForward();
                      }
                    }),
                    _topCircleAction(
                      _isBookmarked ? Icons.star : Icons.star_border,
                      () {
                        Navigator.pop(ctx);
                        _toggleBookmark();
                      },
                      color: _isBookmarked ? const Color(0xFF154EC1) : null,
                    ),
                    _topCircleAction(Icons.copy, () {
                      Navigator.pop(ctx);
                      Clipboard.setData(
                          ClipboardData(text: _tabs[_activeIndex].url));
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text('คัดลอกลิงก์หน้าเว็บแล้ว')),
                      );
                    }),
                    _topCircleAction(Icons.refresh, () {
                      Navigator.pop(ctx);
                      _controller.reload();
                    }),
                  ],
                ),
              ),
              const Divider(),
              ListTile(
                leading: const Icon(Icons.add_box_outlined),
                title: const Text('แท็บใหม่'),
                onTap: () {
                  Navigator.pop(ctx);
                  _openNewTab(incognito: false);
                },
              ),
              ListTile(
                leading: const Icon(Icons.privacy_tip_outlined),
                title: const Text('แท็บใหม่ที่ไม่ระบุตัวตน'),
                onTap: () {
                  Navigator.pop(ctx);
                  _openNewTab(incognito: true);
                },
              ),
              const Divider(height: 1),
              ListTile(
                leading: const Icon(Icons.history),
                title: const Text('ประวัติการเข้าชม'),
                onTap: () {
                  Navigator.pop(ctx);
                  Navigator.push(
                    context,
                    MaterialPageRoute(
                        builder: (_) => const LibraryScreen(initialTab: 1)),
                  );
                },
              ),
              ListTile(
                leading: const Icon(Icons.delete_outline, color: Colors.red),
                title: const Text('ลบข้อมูลการท่องเว็บ'),
                onTap: () async {
                  Navigator.pop(ctx);
                  await StorageService.clearHistory();
                  await WebViewCookieManager().clearCookies();
                  if (mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(
                          content: Text('ลบประวัติและคุกกี้ทั้งหมดแล้ว')),
                    );
                  }
                },
              ),
              ListTile(
                leading: const Icon(Icons.star_border),
                title: const Text('บุ๊กมาร์ก'),
                onTap: () {
                  Navigator.pop(ctx);
                  Navigator.push(
                    context,
                    MaterialPageRoute(
                        builder: (_) => const LibraryScreen(initialTab: 0)),
                  );
                },
              ),
              const Divider(height: 1),
              ListTile(
                leading: const Icon(Icons.find_in_page_outlined),
                title: const Text('ค้นหาในหน้าเว็บ'),
                onTap: () {
                  Navigator.pop(ctx);
                  _showFindInPageDialog();
                },
              ),
              ListTile(
                leading: const Icon(Icons.translate),
                title: const Text('แปลภาษา...'),
                onTap: () {
                  Navigator.pop(ctx);
                  _translateCurrentPage();
                },
              ),
              CheckboxListTile(
                secondary: const Icon(Icons.desktop_windows_outlined),
                title: const Text('เว็บไซต์แบบเดสก์ท็อป'),
                value: _isDesktopMode,
                activeColor: const Color(0xFF154EC1),
                onChanged: (_) {
                  Navigator.pop(ctx);
                  _toggleDesktopMode();
                },
              ),
              const Divider(height: 1),
              ListTile(
                leading: const Icon(Icons.settings_outlined),
                title: const Text('การตั้งค่า'),
                onTap: () {
                  Navigator.pop(ctx);
                  Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (_) => SettingsScreen(
                        isDarkMode: widget.isDarkMode,
                        onToggleDarkMode: widget.onToggleDarkMode ?? (_) {},
                      ),
                    ),
                  ).then((_) => _loadPrefs());
                },
              ),
              if (isIncognito)
                const Padding(
                  padding: EdgeInsets.only(top: 4),
                  child: Text('กำลังใช้งานในโหมดไม่ระบุตัวตน',
                      style: TextStyle(fontSize: 12, color: Colors.grey)),
                ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _topCircleAction(IconData icon, VoidCallback onTap, {Color? color}) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(24),
      child: CircleAvatar(
        radius: 21,
        backgroundColor: Colors.grey.withOpacity(0.12),
        child: Icon(icon, size: 20, color: color),
      ),
    );
  }

  void _openTabManager() {
    showModalBottomSheet(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setModalState) => Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text('แท็บที่เปิดอยู่ (${_tabs.length})',
                      style: const TextStyle(
                          fontSize: 16, fontWeight: FontWeight.bold)),
                  Row(
                    children: [
                      OutlinedButton.icon(
                        onPressed: () {
                          Navigator.pop(ctx);
                          _openNewTab(incognito: true);
                        },
                        icon: const Icon(Icons.privacy_tip_outlined, size: 16),
                        label: const Text('ไม่ระบุตัวตน'),
                      ),
                      const SizedBox(width: 8),
                      FilledButton.icon(
                        style: FilledButton.styleFrom(
                            backgroundColor: const Color(0xFF154EC1)),
                        onPressed: () {
                          Navigator.pop(ctx);
                          _openNewTab(incognito: false);
                        },
                        icon: const Icon(Icons.add, size: 16),
                        label: const Text('แท็บใหม่'),
                      ),
                    ],
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Flexible(
                child: ListView.builder(
                  shrinkWrap: true,
                  itemCount: _tabs.length,
                  itemBuilder: (_, idx) {
                    final tab = _tabs[idx];
                    final isSelected = idx == _activeIndex;
                    return ListTile(
                      selected: isSelected,
                      leading: Icon(
                        tab.isIncognito ? Icons.privacy_tip : Icons.public,
                        color: tab.isIncognito
                            ? Colors.deepPurple
                            : (isSelected ? const Color(0xFF154EC1) : null),
                      ),
                      title: Text(tab.title,
                          maxLines: 1, overflow: TextOverflow.ellipsis),
                      subtitle: Text(tab.url,
                          maxLines: 1, overflow: TextOverflow.ellipsis),
                      trailing: _tabs.length > 1
                          ? IconButton(
                              icon: const Icon(Icons.close, size: 18),
                              onPressed: () {
                                setState(() {
                                  _tabs.removeAt(idx);
                                  if (_activeIndex >= _tabs.length) {
                                    _activeIndex = _tabs.length - 1;
                                  }
                                });
                                _controller.loadRequest(
                                    Uri.parse(_tabs[_activeIndex].url));
                                setModalState(() {});
                              },
                            )
                          : null,
                      onTap: () {
                        setState(() {
                          _activeIndex = idx;
                          _urlController.text = tab.url;
                        });
                        _controller.loadRequest(Uri.parse(tab.url));
                        Navigator.pop(ctx);
                      },
                    );
                  },
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildAddressBar(bool isDark) {
    final isIncognito = _tabs[_activeIndex].isIncognito;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 6),
      decoration: BoxDecoration(
        color: isIncognito
            ? const Color(0xFF1E1B4B)
            : (isDark ? const Color(0xFF0F172A) : Colors.white),
        border: Border(
          bottom: BorderSide(
              color: isDark ? Colors.grey[850]! : Colors.grey[200]!),
        ),
      ),
      child: Row(
        children: [
          IconButton(
            visualDensity: VisualDensity.compact,
            icon: Icon(Icons.home_outlined,
                color: isIncognito ? Colors.white : null),
            tooltip: 'กลับหน้าหลัก SBS',
            onPressed: () => Navigator.pop(context),
          ),
          Expanded(
            child: Container(
              height: 38,
              padding: const EdgeInsets.symmetric(horizontal: 12),
              decoration: BoxDecoration(
                color: isIncognito
                    ? Colors.white.withOpacity(0.14)
                    : (isDark ? Colors.grey[850] : const Color(0xFFF1F5F9)),
                borderRadius: BorderRadius.circular(20),
              ),
              child: Row(
                children: [
                  if (isIncognito) ...[
                    const Icon(Icons.privacy_tip,
                        size: 16, color: Colors.amberAccent),
                    const SizedBox(width: 6),
                  ],
                  Expanded(
                    child: TextField(
                      controller: _urlController,
                      textInputAction: TextInputAction.go,
                      onSubmitted: _navigateToInput,
                      style: TextStyle(
                        fontSize: 13,
                        color: isIncognito ? Colors.white : null,
                      ),
                      decoration: InputDecoration(
                        border: InputBorder.none,
                        hintText: 'ค้นหาหรือพิมพ์ URL...',
                        hintStyle: TextStyle(
                            color: isIncognito ? Colors.white70 : null),
                        isDense: true,
                        contentPadding:
                            const EdgeInsets.symmetric(vertical: 9),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(width: 6),
          InkWell(
            onTap: _openTabManager,
            borderRadius: BorderRadius.circular(8),
            child: Container(
              width: 24,
              height: 24,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                border: Border.all(
                  color: isIncognito
                      ? Colors.white
                      : (isDark ? Colors.white70 : Colors.black87),
                  width: 1.6,
                ),
                borderRadius: BorderRadius.circular(6),
              ),
              child: Text(
                '${_tabs.length}',
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.bold,
                  color: isIncognito ? Colors.white : null,
                ),
              ),
            ),
          ),
          IconButton(
            visualDensity: VisualDensity.compact,
            icon: Icon(Icons.more_vert,
                color: isIncognito ? Colors.white : null),
            tooltip: 'ตัวเลือกเพิ่มเติม',
            onPressed: _openBrowserMenuSheet,
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) async {
        if (didPop) return;
        if (await _controller.canGoBack()) {
          await _controller.goBack();
        } else if (context.mounted) {
          Navigator.pop(context);
        }
      },
      child: Scaffold(
        body: SafeArea(
          child: Column(
            children: [
              if (!_bottomAddressBar) _buildAddressBar(isDark),
              if (_progress < 1.0)
                LinearProgressIndicator(
                  value: _progress,
                  minHeight: 2,
                  color: const Color(0xFF154EC1),
                ),
              Expanded(child: WebViewWidget(controller: _controller)),
              if (_bottomAddressBar) _buildAddressBar(isDark),
            ],
          ),
        ),
      ),
    );
  }
}
