import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';
import '../models/app_models.dart';
import '../services/storage_service.dart';
import 'account_screen.dart';

class SettingsScreen extends StatefulWidget {
  final bool isDarkMode;
  final ValueChanged<bool> onToggleDarkMode;

  const SettingsScreen({
    super.key,
    required this.isDarkMode,
    required this.onToggleDarkMode,
  });

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  ShenwangUser? _user;
  String _searchEngine = 'Google';
  bool _bottomAddressBar = false;

  @override
  void initState() {
    super.initState();
    _loadSettings();
  }

  Future<void> _loadSettings() async {
    final u = await StorageService.getUser();
    final engine = await StorageService.getSearchEngine();
    final bottomBar = await StorageService.getBottomAddressBar();
    if (mounted) {
      setState(() {
        _user = u;
        _searchEngine = engine;
        _bottomAddressBar = bottomBar;
      });
    }
  }

  void _pickSearchEngine() {
    final engines = ['Google', 'Bing', 'DuckDuckGo'];
    showModalBottomSheet(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Padding(
              padding: EdgeInsets.all(16),
              child: Text('เลือกเครื่องมือค้นหาหลัก',
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
            ),
            ...engines.map((e) => RadioListTile<String>(
                  title: Text(e),
                  value: e,
                  groupValue: _searchEngine,
                  activeColor: const Color(0xFF154EC1),
                  onChanged: (val) async {
                    if (val != null) {
                      await StorageService.setSearchEngine(val);
                      setState(() => _searchEngine = val);
                    }
                    if (ctx.mounted) Navigator.pop(ctx);
                  },
                )),
          ],
        ),
      ),
    );
  }

  void _pickAddressBarPosition() {
    showModalBottomSheet(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Padding(
              padding: EdgeInsets.all(16),
              child: Text('ตำแหน่งแถบที่อยู่ (Address Bar)',
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
            ),
            RadioListTile<bool>(
              title: const Text('ด้านบน (ค่าเริ่มต้น)'),
              value: false,
              groupValue: _bottomAddressBar,
              activeColor: const Color(0xFF154EC1),
              onChanged: (val) async {
                await StorageService.setBottomAddressBar(false);
                setState(() => _bottomAddressBar = false);
                if (ctx.mounted) Navigator.pop(ctx);
              },
            ),
            RadioListTile<bool>(
              title: const Text('ด้านล่าง (ใช้งานมือเดียวสะดวก)'),
              value: true,
              groupValue: _bottomAddressBar,
              activeColor: const Color(0xFF154EC1),
              onChanged: (val) async {
                await StorageService.setBottomAddressBar(true);
                setState(() => _bottomAddressBar = true);
                if (ctx.mounted) Navigator.pop(ctx);
              },
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _clearAllBrowsingData() async {
    await StorageService.clearHistory();
    await WebViewCookieManager().clearCookies();
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
            content: Text('ลบประวัติการท่องเว็บ แคช และคุกกี้ทั้งหมดแล้ว')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('การตั้งค่า')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const Padding(
            padding: EdgeInsets.only(left: 4, bottom: 8),
            child: Text('คุณและ Shenwang',
                style: TextStyle(
                    fontWeight: FontWeight.bold,
                    fontSize: 13,
                    color: Color(0xFF154EC1))),
          ),
          Card(
            shape:
                RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
            child: ListTile(
              leading: CircleAvatar(
                backgroundColor: const Color(0xFF154EC1),
                child: Text(
                  _user != null && _user!.name.isNotEmpty
                      ? _user!.name[0].toUpperCase()
                      : 'S',
                  style: const TextStyle(color: Colors.white),
                ),
              ),
              title: Text(_user != null ? _user!.name : 'ลงชื่อเข้าใช้ Shenwang'),
              subtitle: Text(_user != null
                  ? _user!.email
                  : 'ซิงค์บุ๊กมาร์กและการตั้งค่าข้ามอุปกรณ์'),
              trailing: const Icon(Icons.chevron_right),
              onTap: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(builder: (_) => const AccountScreen()),
                ).then((_) => _loadSettings());
              },
            ),
          ),
          const SizedBox(height: 18),
          const Padding(
            padding: EdgeInsets.only(left: 4, bottom: 8),
            child: Text('พื้นฐาน',
                style: TextStyle(
                    fontWeight: FontWeight.bold,
                    fontSize: 13,
                    color: Color(0xFF154EC1))),
          ),
          Card(
            shape:
                RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
            child: Column(
              children: [
                ListTile(
                  leading: const Icon(Icons.search),
                  title: const Text('เครื่องมือค้นหา'),
                  subtitle: Text(_searchEngine),
                  onTap: _pickSearchEngine,
                ),
                const Divider(height: 1),
                ListTile(
                  leading: const Icon(Icons.web_asset),
                  title: const Text('แถบที่อยู่'),
                  subtitle: Text(_bottomAddressBar ? 'ด้านล่าง' : 'ด้านบน'),
                  onTap: _pickAddressBarPosition,
                ),
                const Divider(height: 1),
                ListTile(
                  leading: const Icon(Icons.delete_outline, color: Colors.red),
                  title: const Text('ความเป็นส่วนตัวและความปลอดภัย'),
                  subtitle: const Text('ลบข้อมูลการท่องเว็บ แคช และคุกกี้'),
                  onTap: _clearAllBrowsingData,
                ),
              ],
            ),
          ),
          const SizedBox(height: 18),
          const Padding(
            padding: EdgeInsets.only(left: 4, bottom: 8),
            child: Text('ขั้นสูง',
                style: TextStyle(
                    fontWeight: FontWeight.bold,
                    fontSize: 13,
                    color: Color(0xFF154EC1))),
          ),
          Card(
            shape:
                RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
            child: Column(
              children: [
                SwitchListTile(
                  secondary: Icon(widget.isDarkMode
                      ? Icons.dark_mode
                      : Icons.light_mode_outlined),
                  title: const Text('ลักษณะที่ปรากฏ (โหมดมืด)'),
                  subtitle: Text(widget.isDarkMode ? 'เปิดใช้งาน' : 'ปิดอยู่'),
                  value: widget.isDarkMode,
                  activeColor: const Color(0xFF154EC1),
                  onChanged: widget.onToggleDarkMode,
                ),
                const Divider(height: 1),
                const ListTile(
                  leading: Icon(Icons.info_outline),
                  title: Text('เกี่ยวกับ SBS Search'),
                  subtitle: Text('เวอร์ชัน 2.1.0 • พัฒนาโดย Shenwang Ent.'),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
