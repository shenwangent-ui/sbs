import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'browser_screen.dart';

class ArchitectureScreen extends StatelessWidget {
  const ArchitectureScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final layers = [
      {
        'title': '1. SBS Search Core Engine',
        'desc': 'ระบบดึงข้อมูลและจัดอันดับผลการค้นหาจากเว็บ ข่าวสาร และรูปภาพแบบเรียลไทม์',
        'icon': Icons.travel_explore,
      },
      {
        'title': '2. Shenwang Account Identity (OAuth 2.0)',
        'desc': 'ระบบยืนยันตัวตนกลางแบบ Single Sign-On สำหรับทุกบริการในเครือ Shenwang',
        'icon': Icons.verified_user_outlined,
      },
      {
        'title': '3. Multi-Platform Native Shell',
        'desc': 'รันได้ทั้งบน Android (.APK/.AAB), Windows (.EXE) และ Web PWA จากฐานข้อมูลเดียว',
        'icon': Icons.devices,
      },
      {
        'title': '4. Local Privacy & Sync Vault',
        'desc': 'จัดเก็บบุ๊กมาร์กและประวัติการค้นหาในเครื่องอย่างปลอดภัย พร้อมซิงค์เมื่อล็อกอิน',
        'icon': Icons.lock_outline,
      },
      {
        'title': '5. Open Developer API & Playground',
        'desc': 'เชื่อมต่อ REST API สำหรับนักพัฒนาเพื่อดึงผลค้นหาและระบบล็อกอินไปใช้งานต่อ',
        'icon': Icons.code,
      },
    ];

    return Scaffold(
      appBar: AppBar(title: const Text('สถาปัตยกรรมระบบ 5 ส่วน')),
      body: ListView.separated(
        padding: const EdgeInsets.all(16),
        itemCount: layers.length,
        separatorBuilder: (_, __) => const SizedBox(height: 12),
        itemBuilder: (_, idx) {
          final item = layers[idx];
          return Card(
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
            child: ListTile(
              contentPadding: const EdgeInsets.all(16),
              leading: CircleAvatar(
                backgroundColor: const Color(0xFF154EC1).withOpacity(0.12),
                child: Icon(item['icon'] as IconData, color: const Color(0xFF154EC1)),
              ),
              title: Text(item['title'] as String,
                  style: const TextStyle(fontWeight: FontWeight.bold)),
              subtitle: Padding(
                padding: const EdgeInsets.only(top: 6),
                child: Text(item['desc'] as String),
              ),
            ),
          );
        },
      ),
    );
  }
}

class DeveloperApiScreen extends StatefulWidget {
  const DeveloperApiScreen({super.key});

  @override
  State<DeveloperApiScreen> createState() => _DeveloperApiScreenState();
}

class _DeveloperApiScreenState extends State<DeveloperApiScreen> {
  String _apiKey = 'sbs_live_98f2a4c71e0b4d3a91c8e5f2';

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Developer API & Playground')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('API Key ของคุณ',
                      style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                  const SizedBox(height: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                    decoration: BoxDecoration(
                      color: Colors.grey.withOpacity(0.12),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Row(
                      children: [
                        Expanded(
                          child: Text(_apiKey,
                              style: const TextStyle(fontFamily: 'monospace', fontSize: 13)),
                        ),
                        IconButton(
                          icon: const Icon(Icons.copy, size: 18),
                          onPressed: () {
                            Clipboard.setData(ClipboardData(text: _apiKey));
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(content: Text('คัดลอก API Key แล้ว')),
                            );
                          },
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 10),
                  OutlinedButton.icon(
                    onPressed: () {
                      setState(() {
                        _apiKey = 'sbs_live_${DateTime.now().millisecondsSinceEpoch}';
                      });
                    },
                    icon: const Icon(Icons.refresh, size: 18),
                    label: const Text('สร้าง Key ใหม่'),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),
          const Text('Endpoints ที่พร้อมใช้งาน',
              style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
          const SizedBox(height: 8),
          const ListTile(
            leading: Chip(label: Text('GET', style: TextStyle(fontSize: 11))),
            title: Text('/api/v1/search?q=query'),
            subtitle: Text('ค้นหาข้อมูลเว็บและข่าวสาร'),
          ),
          const ListTile(
            leading: Chip(label: Text('POST', style: TextStyle(fontSize: 11))),
            title: Text('/api/v1/oauth/token'),
            subtitle: Text('ตรวจสอบสิทธิ์ Shenwang Account'),
          ),
        ],
      ),
    );
  }
}

class DownloadAppScreen extends StatelessWidget {
  const DownloadAppScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('โหลดแอพ (.EXE / .APK / .AAB)')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
            child: ListTile(
              contentPadding: const EdgeInsets.all(16),
              leading: const Icon(Icons.android, size: 36, color: Colors.green),
              title: const Text('Android Package (.APK)',
                  style: TextStyle(fontWeight: FontWeight.bold)),
              subtitle: const Text('เวอร์ชันล่าสุดสำหรับสมาร์ทโฟนและแท็บเล็ต Android'),
              trailing: FilledButton(
                style: FilledButton.styleFrom(backgroundColor: const Color(0xFF154EC1)),
                onPressed: () {
                  Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (_) => const BrowserScreen(
                        initialUrl: 'https://github.com/shenwangent-ui/sbs/releases/tag/latest',
                        initialTitle: 'ดาวน์โหลด SBS Search',
                      ),
                    ),
                  );
                },
                child: const Text('ดาวน์โหลด'),
              ),
            ),
          ),
          const SizedBox(height: 12),
          Card(
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
            child: ListTile(
              contentPadding: const EdgeInsets.all(16),
              leading: const Icon(Icons.desktop_windows, size: 36, color: Color(0xFF154EC1)),
              title: const Text('Windows Installer (.EXE)',
                  style: TextStyle(fontWeight: FontWeight.bold)),
              subtitle: const Text('ตัวติดตั้งสำหรับคอมพิวเตอร์ Windows 10 / 11'),
              trailing: FilledButton(
                style: FilledButton.styleFrom(backgroundColor: const Color(0xFF154EC1)),
                onPressed: () {
                  Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (_) => const BrowserScreen(
                        initialUrl: 'https://github.com/shenwangent-ui/sbs/releases/tag/latest',
                        initialTitle: 'ดาวน์โหลด SBS Search',
                      ),
                    ),
                  );
                },
                child: const Text('ดาวน์โหลด'),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
