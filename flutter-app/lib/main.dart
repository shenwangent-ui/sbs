import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

const String kDefaultBaseUrl =
    'https://ais-pre-brb74sikfl77hnu7quzboq-74288553499.asia-southeast1.run.app';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const SBSSearchFlutterApp());
}

class SBSSearchFlutterApp extends StatefulWidget {
  const SBSSearchFlutterApp({super.key});

  @override
  State<SBSSearchFlutterApp> createState() => _SBSSearchFlutterAppState();
}

class _SBSSearchFlutterAppState extends State<SBSSearchFlutterApp> {
  ThemeMode _themeMode = ThemeMode.system;

  void _toggleTheme() {
    setState(() {
      _themeMode =
          _themeMode == ThemeMode.dark ? ThemeMode.light : ThemeMode.dark;
    });
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'SBS Engine | Shenwang Search',
      debugShowCheckedModeBanner: false,
      themeMode: _themeMode,
      theme: ThemeData(
        useMaterial3: true,
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFF1D4ED8),
          brightness: Brightness.light,
        ),
        scaffoldBackgroundColor: const Color(0xFFF8FAFC),
      ),
      darkTheme: ThemeData(
        useMaterial3: true,
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFF3B82F6),
          brightness: Brightness.dark,
        ),
        scaffoldBackgroundColor: const Color(0xFF0F1115),
      ),
      home: SearchHomeScreen(onToggleTheme: _toggleTheme),
    );
  }
}

class ShenwangUser {
  final String uid;
  final String identifier;
  final String displayName;

  ShenwangUser({
    required this.uid,
    required this.identifier,
    required this.displayName,
  });

  factory ShenwangUser.fromJson(Map<String, dynamic> json) {
    return ShenwangUser(
      uid: (json['uid'] ?? '').toString(),
      identifier: (json['identifier'] ?? '').toString(),
      displayName: (json['displayName'] ?? 'User').toString(),
    );
  }
}

class SearchHomeScreen extends StatefulWidget {
  final VoidCallback onToggleTheme;

  const SearchHomeScreen({super.key, required this.onToggleTheme});

  @override
  State<SearchHomeScreen> createState() => _SearchHomeScreenState();
}

class _SearchHomeScreenState extends State<SearchHomeScreen> {
  final TextEditingController _queryController = TextEditingController();
  String _baseUrl = kDefaultBaseUrl;
  String? _sessionToken;
  ShenwangUser? _user;

  bool _loading = false;
  String? _error;
  String? _aiSummary;
  String? _searchMeta;
  List<Map<String, dynamic>> _results = [];
  List<String> _relatedQueries = [];
  List<String> _trending = [];

  @override
  void initState() {
    super.initState();
    _restoreSession();
    _loadTrending();
  }

  Future<void> _restoreSession() async {
    final prefs = await SharedPreferences.getInstance();
    final savedBase = prefs.getString('sbs_base_url');
    final savedToken = prefs.getString('shenwang_token');
    if (savedBase != null && savedBase.isNotEmpty) {
      _baseUrl = savedBase;
    }
    if (savedToken != null && savedToken.isNotEmpty) {
      try {
        final resp = await http.get(
          Uri.parse('$_baseUrl/api/v1/auth/me'),
          headers: {'Authorization': 'Bearer $savedToken'},
        );
        if (resp.statusCode == 200) {
          final data = jsonDecode(resp.body) as Map<String, dynamic>;
          if (data['authenticated'] == true && data['user'] != null) {
            setState(() {
              _sessionToken = savedToken;
              _user = ShenwangUser.fromJson(
                  Map<String, dynamic>.from(data['user'] as Map));
            });
          }
        }
      } catch (_) {}
    }
  }

  Future<void> _loadTrending() async {
    try {
      final resp = await http.get(Uri.parse('$_baseUrl/api/v1/trending'));
      if (resp.statusCode == 200) {
        final data = jsonDecode(resp.body);
        if (data is Map && data['queries'] is List) {
          setState(() {
            _trending = (data['queries'] as List)
                .map((e) => e.toString())
                .take(8)
                .toList();
          });
        }
      }
    } catch (_) {}
  }

  Future<void> _performSearch([String? overrideQuery]) async {
    final q = (overrideQuery ?? _queryController.text).trim();
    if (q.isEmpty) return;
    if (overrideQuery != null) {
      _queryController.text = q;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final uri = Uri.parse('$_baseUrl/api/v1/search').replace(
        queryParameters: {'q': q, 'lang': 'th', 'mode': 'all'},
      );
      final resp = await http.get(uri).timeout(const Duration(seconds: 25));
      if (resp.statusCode != 200) {
        throw Exception('HTTP ${resp.statusCode}');
      }
      final data = jsonDecode(resp.body) as Map<String, dynamic>;
      final rawResults = (data['results'] as List?) ?? [];
      final rawRelated = (data['relatedQueries'] as List?) ?? [];
      setState(() {
        _aiSummary = data['aiSummary']?.toString();
        _searchMeta =
            '${data['totalResults'] ?? ''} • ${data['searchTime'] ?? '0'}s';
        _results = rawResults
            .whereType<Map>()
            .map((m) => Map<String, dynamic>.from(m))
            .toList();
        _relatedQueries = rawRelated.map((e) => e.toString()).toList();
      });
    } catch (e) {
      setState(() {
        _error = 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ค้นหาได้: $e';
      });
    } finally {
      if (mounted) {
        setState(() => _loading = false);
      }
    }
  }

  void _openPreview(String url, String title) {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => NativeReaderScreen(
          baseUrl: _baseUrl,
          initialUrl: url,
          initialTitle: title,
        ),
      ),
    );
  }

  Future<void> _openAccountDialog() async {
    await showDialog<void>(
      context: context,
      builder: (_) => ShenwangAccountDialog(
        baseUrl: _baseUrl,
        currentUser: _user,
        onSignedIn: (token, user) async {
          final prefs = await SharedPreferences.getInstance();
          await prefs.setString('shenwang_token', token);
          if (mounted) {
            setState(() {
              _sessionToken = token;
              _user = user;
            });
          }
        },
        onSignedOut: () async {
          final prefs = await SharedPreferences.getInstance();
          await prefs.remove('shenwang_token');
          if (mounted) {
            setState(() {
              _sessionToken = null;
              _user = null;
            });
          }
        },
      ),
    );
  }

  Future<void> _openServerSettings() async {
    final ctrl = TextEditingController(text: _baseUrl);
    await showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('ตั้งค่า Server Endpoint'),
        content: TextField(
          controller: ctrl,
          decoration: const InputDecoration(
            labelText: 'SBS Engine URL',
            hintText: kDefaultBaseUrl,
            border: OutlineInputBorder(),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('ยกเลิก'),
          ),
          FilledButton(
            onPressed: () async {
              final next = ctrl.text.trim().replaceAll(RegExp(r'/$'), '');
              if (next.startsWith('http')) {
                final prefs = await SharedPreferences.getInstance();
                await prefs.setString('sbs_base_url', next);
                if (mounted) setState(() => _baseUrl = next);
              }
              if (ctx.mounted) Navigator.pop(ctx);
            },
            child: const Text('บันทึก'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(
        title: Row(
          children: [
            Container(
              width: 32,
              height: 32,
              decoration: BoxDecoration(
                color: const Color(0xFF1D4ED8),
                borderRadius: BorderRadius.circular(9),
              ),
              alignment: Alignment.center,
              child: const Text(
                'S',
                style: TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ),
            const SizedBox(width: 10),
            const Text(
              'SBS Engine',
              style: TextStyle(fontWeight: FontWeight.w700, fontSize: 18),
            ),
          ],
        ),
        actions: [
          IconButton(
            tooltip: 'สลับธีม',
            onPressed: widget.onToggleTheme,
            icon: const Icon(Icons.brightness_6_outlined),
          ),
          IconButton(
            tooltip: 'ตั้งค่าเซิร์ฟเวอร์',
            onPressed: _openServerSettings,
            icon: const Icon(Icons.dns_outlined),
          ),
          Padding(
            padding: const EdgeInsets.only(right: 12),
            child: FilledButton.tonalIcon(
              onPressed: _openAccountDialog,
              icon: const Icon(Icons.account_circle_outlined, size: 18),
              label: Text(
                _user != null ? _user!.displayName : 'Shenwang Account',
              ),
            ),
          ),
        ],
      ),
      body: Column(
        children: [
          Container(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
            decoration: BoxDecoration(
              border: Border(
                bottom: BorderSide(color: scheme.outlineVariant.withOpacity(0.4)),
              ),
            ),
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _queryController,
                    textInputAction: TextInputAction.search,
                    onSubmitted: (_) => _performSearch(),
                    decoration: InputDecoration(
                      hintText: 'ค้นหาเว็บ ข่าว ความรู้ หรือวาง URL...',
                      prefixIcon: const Icon(Icons.search),
                      filled: true,
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(14),
                        borderSide: BorderSide.none,
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                FilledButton(
                  onPressed: _loading ? null : () => _performSearch(),
                  style: FilledButton.styleFrom(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 20,
                      vertical: 16,
                    ),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14),
                    ),
                  ),
                  child: _loading
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Colors.white,
                          ),
                        )
                      : const Text('ค้นหา'),
                ),
              ],
            ),
          ),
          Expanded(
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                if (_error != null)
                  Card(
                    color: scheme.errorContainer,
                    child: Padding(
                      padding: const EdgeInsets.all(14),
                      child: Text(
                        _error!,
                        style: TextStyle(color: scheme.onErrorContainer),
                      ),
                    ),
                  ),
                if (_results.isEmpty && !_loading) ...[
                  Text(
                    'หัวข้อยอดนิยม',
                    style: Theme.of(context).textTheme.titleSmall,
                  ),
                  const SizedBox(height: 10),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: _trending
                        .map(
                          (t) => ActionChip(
                            label: Text(t),
                            onPressed: () => _performSearch(t),
                          ),
                        )
                        .toList(),
                  ),
                ],
                if (_searchMeta != null)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: Text(
                      _searchMeta!,
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  ),
                if (_aiSummary != null && _aiSummary!.trim().isNotEmpty)
                  Card(
                    margin: const EdgeInsets.only(bottom: 14),
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            'สรุปคำตอบอัจฉริยะ',
                            style: TextStyle(
                              fontWeight: FontWeight.w700,
                              color: Color(0xFF1D4ED8),
                            ),
                          ),
                          const SizedBox(height: 8),
                          Text(
                            _aiSummary!,
                            style: const TextStyle(height: 1.5),
                          ),
                        ],
                      ),
                    ),
                  ),
                ..._results.map((item) {
                  final title = (item['title'] ?? 'Untitled').toString();
                  final url = (item['url'] ?? '').toString();
                  final domain = (item['domain'] ?? item['source'] ?? '').toString();
                  final snippet = (item['snippet'] ?? '').toString();
                  return Card(
                    margin: const EdgeInsets.only(bottom: 10),
                    child: InkWell(
                      borderRadius: BorderRadius.circular(12),
                      onTap: url.isNotEmpty ? () => _openPreview(url, title) : null,
                      child: Padding(
                        padding: const EdgeInsets.all(14),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              url.isNotEmpty ? url : domain,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(
                                fontSize: 12,
                                color: scheme.primary,
                              ),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              title,
                              style: const TextStyle(
                                fontSize: 16,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                            if (snippet.isNotEmpty) ...[
                              const SizedBox(height: 6),
                              Text(
                                snippet,
                                maxLines: 3,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(
                                  fontSize: 13,
                                  color: scheme.onSurfaceVariant,
                                ),
                              ),
                            ],
                          ],
                        ),
                      ),
                    ),
                  );
                }),
                if (_relatedQueries.isNotEmpty) ...[
                  const SizedBox(height: 10),
                  Text(
                    'คำค้นหาที่เกี่ยวข้อง',
                    style: Theme.of(context).textTheme.titleSmall,
                  ),
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: _relatedQueries
                        .map(
                          (q) => ActionChip(
                            label: Text(q),
                            onPressed: () => _performSearch(q),
                          ),
                        )
                        .toList(),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class NativeReaderScreen extends StatefulWidget {
  final String baseUrl;
  final String initialUrl;
  final String initialTitle;

  const NativeReaderScreen({
    super.key,
    required this.baseUrl,
    required this.initialUrl,
    required this.initialTitle,
  });

  @override
  State<NativeReaderScreen> createState() => _NativeReaderScreenState();
}

class _NativeReaderScreenState extends State<NativeReaderScreen> {
  late String _currentUrl;
  late String _currentTitle;
  bool _loading = true;
  String? _error;
  String? _aiSummary;
  List<Map<String, dynamic>> _blocks = [];
  List<Map<String, dynamic>> _links = [];

  @override
  void initState() {
    super.initState();
    _currentUrl = widget.initialUrl;
    _currentTitle = widget.initialTitle;
    _loadPreview(_currentUrl);
  }

  Future<void> _loadPreview(String url) async {
    setState(() {
      _currentUrl = url;
      _loading = true;
      _error = null;
    });
    try {
      final uri = Uri.parse('${widget.baseUrl}/api/v1/preview').replace(
        queryParameters: {'url': url},
      );
      final resp = await http.get(uri).timeout(const Duration(seconds: 20));
      if (resp.statusCode != 200) throw Exception('HTTP ${resp.statusCode}');
      final data = jsonDecode(resp.body) as Map<String, dynamic>;
      final reader = (data['reader'] as Map?) ?? {};
      setState(() {
        _currentUrl = (data['finalUrl'] ?? url).toString();
        _currentTitle = (data['title'] ?? _currentTitle).toString();
        _aiSummary = reader['aiSummary']?.toString();
        _error = data['blockedReason']?.toString();
        _blocks = ((reader['blocks'] as List?) ?? [])
            .whereType<Map>()
            .map((e) => Map<String, dynamic>.from(e))
            .toList();
        _links = ((reader['links'] as List?) ?? [])
            .whereType<Map>()
            .map((e) => Map<String, dynamic>.from(e))
            .toList();
      });
    } catch (e) {
      setState(() {
        _error = 'ไม่สามารถโหลดเนื้อหาเว็บได้: $e';
      });
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(
        titleSpacing: 0,
        title: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
          margin: const EdgeInsets.only(right: 8),
          decoration: BoxDecoration(
            color: scheme.surfaceContainerHighest,
            borderRadius: BorderRadius.circular(10),
          ),
          child: Text(
            _currentUrl,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontSize: 12, fontFamily: 'monospace'),
          ),
        ),
        actions: [
          IconButton(
            onPressed: () => _loadPreview(_currentUrl),
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                Text(
                  _currentTitle,
                  style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                        fontWeight: FontWeight.w700,
                      ),
                ),
                const SizedBox(height: 12),
                if (_error != null && _error!.isNotEmpty)
                  Card(
                    color: scheme.secondaryContainer,
                    child: Padding(
                      padding: const EdgeInsets.all(12),
                      child: Text(_error!),
                    ),
                  ),
                if (_aiSummary != null && _aiSummary!.isNotEmpty)
                  Card(
                    margin: const EdgeInsets.only(bottom: 12),
                    child: Padding(
                      padding: const EdgeInsets.all(14),
                      child: Text(_aiSummary!, style: const TextStyle(height: 1.5)),
                    ),
                  ),
                ..._blocks.map((block) {
                  final text = (block['text'] ?? '').toString();
                  final isHeading = block['type'] == 'heading';
                  return Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: Text(
                      text,
                      style: TextStyle(
                        fontSize: isHeading ? 18 : 15,
                        fontWeight:
                            isHeading ? FontWeight.w700 : FontWeight.normal,
                        height: 1.55,
                      ),
                    ),
                  );
                }),
                if (_links.isNotEmpty) ...[
                  const Divider(height: 28),
                  Text(
                    'ลิงก์ภายในหน้านี้',
                    style: Theme.of(context).textTheme.titleSmall,
                  ),
                  const SizedBox(height: 8),
                  ..._links.take(15).map((link) {
                    final href = (link['url'] ?? '').toString();
                    final label = (link['text'] ?? href).toString();
                    return ListTile(
                      dense: true,
                      leading: const Icon(Icons.link, size: 18),
                      title: Text(label, maxLines: 1, overflow: TextOverflow.ellipsis),
                      subtitle: Text(href, maxLines: 1, overflow: TextOverflow.ellipsis),
                      onTap: href.startsWith('http') ? () => _loadPreview(href) : null,
                    );
                  }),
                ],
              ],
            ),
    );
  }
}

class ShenwangAccountDialog extends StatefulWidget {
  final String baseUrl;
  final ShenwangUser? currentUser;
  final Future<void> Function(String token, ShenwangUser user) onSignedIn;
  final Future<void> Function() onSignedOut;

  const ShenwangAccountDialog({
    super.key,
    required this.baseUrl,
    required this.currentUser,
    required this.onSignedIn,
    required this.onSignedOut,
  });

  @override
  State<ShenwangAccountDialog> createState() => _ShenwangAccountDialogState();
}

class _ShenwangAccountDialogState extends State<ShenwangAccountDialog> {
  bool _isRegister = false;
  bool _busy = false;
  String? _error;
  final _nameCtrl = TextEditingController();
  final _idCtrl = TextEditingController();
  final _passCtrl = TextEditingController();

  Future<void> _submit() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final endpoint = _isRegister
          ? '${widget.baseUrl}/api/v1/auth/register'
          : '${widget.baseUrl}/api/v1/auth/login';
      final body = _isRegister
          ? {
              'displayName': _nameCtrl.text.trim(),
              'identifier': _idCtrl.text.trim(),
              'password': _passCtrl.text,
            }
          : {
              'identifier': _idCtrl.text.trim(),
              'password': _passCtrl.text,
            };
      final resp = await http.post(
        Uri.parse(endpoint),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode(body),
      );
      final data = jsonDecode(resp.body) as Map<String, dynamic>;
      if (resp.statusCode >= 400) {
        setState(() => _error = (data['error'] ?? 'Auth failed').toString());
        return;
      }
      final token = (data['sessionToken'] ?? '').toString();
      final user = ShenwangUser.fromJson(
          Map<String, dynamic>.from(data['user'] as Map));
      await widget.onSignedIn(token, user);
      if (mounted) Navigator.pop(context);
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (widget.currentUser != null) {
      return AlertDialog(
        title: const Text('Shenwang Account'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              widget.currentUser!.displayName,
              style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 4),
            Text(widget.currentUser!.identifier),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('ปิด'),
          ),
          FilledButton(
            onPressed: () async {
              await widget.onSignedOut();
              if (context.mounted) Navigator.pop(context);
            },
            child: const Text('ออกจากระบบ'),
          ),
        ],
      );
    }

    return AlertDialog(
      title: Text(_isRegister ? 'สร้างบัญชี Shenwang' : 'ลงชื่อเข้าใช้ Shenwang'),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (_error != null)
              Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: Text(_error!, style: const TextStyle(color: Colors.red)),
              ),
            if (_isRegister) ...[
              TextField(
                controller: _nameCtrl,
                decoration: const InputDecoration(labelText: 'ชื่อที่แสดง'),
              ),
              const SizedBox(height: 8),
            ],
            TextField(
              controller: _idCtrl,
              decoration:
                  const InputDecoration(labelText: 'Shenwang ID หรืออีเมล'),
            ),
            const SizedBox(height: 8),
            TextField(
              controller: _passCtrl,
              obscureText: true,
              decoration: const InputDecoration(labelText: 'รหัสผ่าน'),
            ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => setState(() => _isRegister = !_isRegister),
          child: Text(_isRegister ? 'มีบัญชีแล้ว' : 'สร้างบัญชีใหม่'),
        ),
        FilledButton(
          onPressed: _busy ? null : _submit,
          child: Text(_isRegister ? 'สมัครสมาชิก' : 'เข้าสู่ระบบ'),
        ),
      ],
    );
  }
}
