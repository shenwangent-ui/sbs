import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';
import '../models/app_models.dart';
import '../services/storage_service.dart';

class BrowserScreen extends StatefulWidget {
  final String initialUrl;
  final String initialTitle;

  const BrowserScreen({
    super.key,
    required this.initialUrl,
    this.initialTitle = 'SBS Browser',
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

  @override
  void initState() {
    super.initState();
    _tabs.add(BrowserTabItem(
      id: DateTime.now().millisecondsSinceEpoch.toString(),
      title: widget.initialTitle,
      url: widget.initialUrl,
    ));
    _currentTitle = widget.initialTitle;
    _urlController = TextEditingController(text: widget.initialUrl);

    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
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

    _checkBookmarkStatus(widget.initialUrl);
  }

  Future<void> _checkBookmarkStatus(String url) async {
    final list = await StorageService.getBookmarks();
    if (mounted) {
      setState(() {
        _isBookmarked = list.any((b) => b.url == url);
      });
    }
  }

  void _navigateToInput(String input) {
    var trimmed = input.trim();
    if (trimmed.isEmpty) return;
    Uri uri;
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      uri = Uri.parse(trimmed);
    } else if (trimmed.contains('.') && !trimmed.contains(' ')) {
      uri = Uri.parse('https://$trimmed');
    } else {
      StorageService.addHistory(trimmed);
      uri = Uri.parse(
          'https://www.google.com/search?q=${Uri.encodeComponent(trimmed)}');
    }
    _controller.loadRequest(uri);
    FocusScope.of(context).unfocus();
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
                  FilledButton.icon(
                    onPressed: () {
                      setState(() {
                        _tabs.add(BrowserTabItem(
                          id: DateTime.now().millisecondsSinceEpoch.toString(),
                          title: 'แท็บใหม่',
                          url: 'https://www.google.com',
                        ));
                        _activeIndex = _tabs.length - 1;
                        _urlController.text = 'https://www.google.com';
                      });
                      _controller.loadRequest(Uri.parse('https://www.google.com'));
                      Navigator.pop(ctx);
                    },
                    icon: const Icon(Icons.add, size: 18),
                    label: const Text('เปิดแท็บใหม่'),
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
                      leading: Icon(Icons.public,
                          color: isSelected ? const Color(0xFF1D4ED8) : null),
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
        appBar: AppBar(
          automaticallyImplyLeading: false,
          titleSpacing: 8,
          title: Row(
            children: [
              IconButton(
                icon: const Icon(Icons.home_outlined),
                tooltip: 'กลับหน้าหลัก SBS',
                onPressed: () => Navigator.pop(context),
              ),
              Expanded(
                child: Container(
                  height: 40,
                  padding: const EdgeInsets.symmetric(horizontal: 12),
                  decoration: BoxDecoration(
                    color: isDark ? Colors.grey[850] : Colors.grey[100],
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: TextField(
                    controller: _urlController,
                    textInputAction: TextInputAction.go,
                    onSubmitted: _navigateToInput,
                    style: const TextStyle(fontSize: 13),
                    decoration: const InputDecoration(
                      border: InputBorder.none,
                      hintText: 'ค้นหาหรือพิมพ์ URL...',
                      isDense: true,
                      contentPadding: EdgeInsets.symmetric(vertical: 10),
                    ),
                  ),
                ),
              ),
              IconButton(
                icon: Icon(
                  _isBookmarked ? Icons.bookmark : Icons.bookmark_border,
                  color: _isBookmarked ? const Color(0xFF1D4ED8) : null,
                ),
                onPressed: _toggleBookmark,
              ),
              InkWell(
                onTap: _openTabManager,
                borderRadius: BorderRadius.circular(8),
                child: Container(
                  width: 26,
                  height: 26,
                  margin: const EdgeInsets.only(right: 6),
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    border: Border.all(
                      color: isDark ? Colors.white70 : Colors.black87,
                      width: 1.6,
                    ),
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: Text(
                    '${_tabs.length}',
                    style: const TextStyle(
                        fontSize: 12, fontWeight: FontWeight.bold),
                  ),
                ),
              ),
            ],
          ),
          bottom: _progress < 1.0
              ? PreferredSize(
                  preferredSize: const Size.fromHeight(2),
                  child: LinearProgressIndicator(
                    value: _progress,
                    minHeight: 2,
                    color: const Color(0xFF1D4ED8),
                  ),
                )
              : null,
        ),
        body: WebViewWidget(controller: _controller),
        bottomNavigationBar: SafeArea(
          child: Container(
            height: 48,
            decoration: BoxDecoration(
              border: Border(
                top: BorderSide(
                  color: isDark ? Colors.grey[800]! : Colors.grey[200]!,
                ),
              ),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceAround,
              children: [
                IconButton(
                  icon: const Icon(Icons.arrow_back_ios_new, size: 18),
                  onPressed: () async {
                    if (await _controller.canGoBack()) {
                      await _controller.goBack();
                    }
                  },
                ),
                IconButton(
                  icon: const Icon(Icons.arrow_forward_ios, size: 18),
                  onPressed: () async {
                    if (await _controller.canGoForward()) {
                      await _controller.goForward();
                    }
                  },
                ),
                IconButton(
                  icon: const Icon(Icons.refresh, size: 20),
                  onPressed: () => _controller.reload(),
                ),
                IconButton(
                  icon: const Icon(Icons.tab, size: 20),
                  onPressed: _openTabManager,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
