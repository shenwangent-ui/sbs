import 'package:flutter/material.dart';
import '../models/app_models.dart';
import '../services/storage_service.dart';
import 'browser_screen.dart';

class LibraryScreen extends StatefulWidget {
  final int initialTab;
  const LibraryScreen({super.key, this.initialTab = 0});

  @override
  State<LibraryScreen> createState() => _LibraryScreenState();
}

class _LibraryScreenState extends State<LibraryScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;
  List<BookmarkItem> _bookmarks = [];
  List<String> _history = [];

  @override
  void initState() {
    super.initState();
    _tabController =
        TabController(length: 2, vsync: this, initialIndex: widget.initialTab);
    _refresh();
  }

  Future<void> _refresh() async {
    final b = await StorageService.getBookmarks();
    final h = await StorageService.getHistory();
    if (mounted) {
      setState(() {
        _bookmarks = b;
        _history = h;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('คลังข้อมูล SBS'),
        bottom: TabBar(
          controller: _tabController,
          tabs: [
            Tab(text: 'บุ๊กมาร์ก (${_bookmarks.length})'),
            Tab(text: 'ประวัติการค้นหา (${_history.length})'),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tabController,
        children: [
          _bookmarks.isEmpty
              ? const Center(child: Text('ยังไม่มีบุ๊กมาร์กที่บันทึกไว้'))
              : ListView.builder(
                  itemCount: _bookmarks.length,
                  itemBuilder: (_, idx) {
                    final item = _bookmarks[idx];
                    return ListTile(
                      leading:
                          const Icon(Icons.bookmark, color: Color(0xFF1D4ED8)),
                      title: Text(item.title,
                          maxLines: 1, overflow: TextOverflow.ellipsis),
                      subtitle: Text(item.url,
                          maxLines: 1, overflow: TextOverflow.ellipsis),
                      trailing: IconButton(
                        icon: const Icon(Icons.delete_outline, size: 20),
                        onPressed: () async {
                          await StorageService.removeBookmark(item.url);
                          _refresh();
                        },
                      ),
                      onTap: () {
                        Navigator.push(
                          context,
                          MaterialPageRoute(
                            builder: (_) => BrowserScreen(
                              initialUrl: item.url,
                              initialTitle: item.title,
                            ),
                          ),
                        ).then((_) => _refresh());
                      },
                    );
                  },
                ),
          Column(
            children: [
              if (_history.isNotEmpty)
                Align(
                  alignment: Alignment.centerRight,
                  child: TextButton.icon(
                    onPressed: () async {
                      await StorageService.clearHistory();
                      _refresh();
                    },
                    icon: const Icon(Icons.delete_sweep, size: 18),
                    label: const Text('ล้างประวัติทั้งหมด'),
                  ),
                ),
              Expanded(
                child: _history.isEmpty
                    ? const Center(child: Text('ยังไม่มีประวัติการค้นหา'))
                    : ListView.builder(
                        itemCount: _history.length,
                        itemBuilder: (_, idx) {
                          final q = _history[idx];
                          return ListTile(
                            leading: const Icon(Icons.history),
                            title: Text(q),
                            onTap: () {
                              Navigator.push(
                                context,
                                MaterialPageRoute(
                                  builder: (_) => BrowserScreen(
                                    initialUrl:
                                        'https://www.google.com/search?q=${Uri.encodeComponent(q)}',
                                    initialTitle: q,
                                  ),
                                ),
                              );
                            },
                          );
                        },
                      ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
