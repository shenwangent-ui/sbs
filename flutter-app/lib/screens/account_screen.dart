import 'dart:convert';
import 'dart:math';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;
import '../models/app_models.dart';
import '../services/storage_service.dart';

class AccountScreen extends StatefulWidget {
  const AccountScreen({super.key});

  @override
  State<AccountScreen> createState() => _AccountScreenState();
}

class _AccountScreenState extends State<AccountScreen> {
  ShenwangUser? _user;
  bool _isRegister = false;
  bool _isLoading = false;
  final _nameController = TextEditingController();
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _obscurePassword = true;

  @override
  void initState() {
    super.initState();
    _loadUser();
  }

  Future<void> _loadUser() async {
    final u = await StorageService.getUser();
    if (mounted) setState(() => _user = u);
  }

  String _generateStrongPassword([int length = 14]) {
    const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const lower = 'abcdefghijkmnopqrstuvwxyz';
    const digits = '23456789';
    const symbols = '!@#\$%&*-_';
    const all = upper + lower + digits + symbols;
    final rand = Random.secure();
    return List.generate(length, (_) => all[rand.nextInt(all.length)]).join();
  }

  Future<void> _submitAuth() async {
    final identifier = _emailController.text.trim();
    final password = _passwordController.text.trim();
    final displayName = _nameController.text.trim();

    if (identifier.isEmpty || password.length < 6) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
            content: Text('กรุณากรอกบัญชีผู้ใช้และรหัสผ่านอย่างน้อย 6 ตัวอักษร')),
      );
      return;
    }

    if (_isRegister && displayName.length < 2) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
            content: Text('กรุณากรอกชื่อที่แสดงอย่างน้อย 2 ตัวอักษร')),
      );
      return;
    }

    setState(() => _isLoading = true);
    final baseUrl = await StorageService.getServerUrl();
    final endpoint = _isRegister ? '/api/v1/auth/register' : '/api/v1/auth/login';

    try {
      final resp = await http
          .post(
            Uri.parse('$baseUrl$endpoint'),
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode({
              if (_isRegister) 'displayName': displayName,
              'identifier': identifier,
              'password': password,
            }),
          )
          .timeout(const Duration(seconds: 8));

      final data = jsonDecode(resp.body);
      if (resp.statusCode == 200 || resp.statusCode == 201) {
        final user = ShenwangUser.fromJson(data['user']);
        final token = data['sessionToken'] ?? '';
        await StorageService.saveAuthSession(
          user,
          token,
          serverBookmarks: data['bookmarks'],
          serverHistory: data['history'],
        );
        if (mounted) {
          setState(() {
            _user = user;
            _isLoading = false;
          });
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(_isRegister
                  ? 'สร้างบัญชีและซิงค์เข้าเซิร์ฟเวอร์สำเร็จ!'
                  : 'เข้าสู่ระบบและซิงค์ข้อมูลจากเซิร์ฟเวอร์แล้ว!'),
            ),
          );
        }
      } else {
        if (mounted) {
          setState(() => _isLoading = false);
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
                content: Text(data['error'] ?? 'เกิดข้อผิดพลาดในการยืนยันตัวตน')),
          );
        }
      }
    } catch (e) {
      if (mounted) {
        setState(() => _isLoading = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
                'เชื่อมต่อเซิร์ฟเวอร์ ($baseUrl) ไม่สำเร็จ กรุณาเปิดเซิร์ฟเวอร์หรือตั้งค่า URL'),
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Shenwang Account')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: _user != null ? _buildProfileView(_user!) : _buildAuthForm(),
      ),
    );
  }

  Widget _buildProfileView(ShenwangUser user) {
    return Column(
      children: [
        const SizedBox(height: 16),
        CircleAvatar(
          radius: 42,
          backgroundColor: const Color(0xFF154EC1),
          child: Text(
            user.displayName.isNotEmpty
                ? user.displayName[0].toUpperCase()
                : 'S',
            style: const TextStyle(
                fontSize: 34, fontWeight: FontWeight.bold, color: Colors.white),
          ),
        ),
        const SizedBox(height: 14),
        Text(user.displayName,
            style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold)),
        const SizedBox(height: 4),
        Text(user.identifier,
            style: const TextStyle(
                fontSize: 14,
                color: Color(0xFF154EC1),
                fontWeight: FontWeight.w600)),
        const SizedBox(height: 28),
        Card(
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
          child: Column(
            children: [
              ListTile(
                leading: const Icon(Icons.cloud_done, color: Colors.green),
                title: const Text('ซิงค์ฐานข้อมูลเดียวกับเว็บไซต์แล้ว'),
                subtitle: const Text('ใช้บัญชีนี้เข้าสู่ระบบบนเว็บไซต์ SBS Search ได้ทันที'),
                trailing: IconButton(
                  icon: const Icon(Icons.copy, size: 18),
                  onPressed: () {
                    Clipboard.setData(ClipboardData(text: user.identifier));
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('คัดลอก Shenwang ID แล้ว')),
                    );
                  },
                ),
              ),
              const Divider(height: 1),
              ListTile(
                leading: const Icon(Icons.sync, color: Color(0xFF154EC1)),
                title: const Text('ซิงค์บุ๊กมาร์กและประวัติเดี๋ยวนี้'),
                onTap: () async {
                  await StorageService.syncWithServer();
                  if (mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(
                          content: Text('ซิงค์ข้อมูลกับเซิร์ฟเวอร์เรียบร้อยแล้ว')),
                    );
                  }
                },
              ),
            ],
          ),
        ),
        const SizedBox(height: 24),
        SizedBox(
          width: double.infinity,
          child: OutlinedButton.icon(
            onPressed: () async {
              await StorageService.clearUser();
              if (mounted) setState(() => _user = null);
            },
            icon: const Icon(Icons.logout, color: Colors.red),
            label: const Text('ออกจากระบบ', style: TextStyle(color: Colors.red)),
          ),
        ),
      ],
    );
  }

  Widget _buildAuthForm() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Center(
          child: Image.asset('assets/icon/logo.png', width: 64, height: 64),
        ),
        const SizedBox(height: 14),
        Text(
          _isRegister ? 'สร้างบัญชี Shenwang Account' : 'ลงชื่อเข้าใช้ Shenwang',
          textAlign: TextAlign.center,
          style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold),
        ),
        const SizedBox(height: 6),
        const Text(
          'บัญชีเดียวซิงค์ข้อมูลร่วมกับเว็บไซต์ SBS Search โดยตรง',
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 13, color: Colors.grey),
        ),
        const SizedBox(height: 24),
        if (_isRegister) ...[
          TextField(
            controller: _nameController,
            decoration: InputDecoration(
              labelText: 'ชื่อที่แสดง (Display Name)',
              prefixIcon: const Icon(Icons.person_outline),
              border:
                  OutlineInputBorder(borderRadius: BorderRadius.circular(14)),
            ),
          ),
          const SizedBox(height: 14),
        ],
        TextField(
          controller: _emailController,
          keyboardType: TextInputType.emailAddress,
          decoration: InputDecoration(
            labelText: 'Shenwang ID หรือ อีเมล',
            prefixIcon: const Icon(Icons.alternate_email),
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(14)),
          ),
        ),
        const SizedBox(height: 14),
        TextField(
          controller: _passwordController,
          obscureText: _obscurePassword,
          decoration: InputDecoration(
            labelText: 'รหัสผ่าน (อย่างน้อย 6 ตัวอักษร)',
            prefixIcon: const Icon(Icons.lock_outline),
            suffixIcon: IconButton(
              icon: Icon(
                  _obscurePassword ? Icons.visibility : Icons.visibility_off),
              onPressed: () =>
                  setState(() => _obscurePassword = !_obscurePassword),
            ),
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(14)),
          ),
        ),
        if (_isRegister) ...[
          const SizedBox(height: 8),
          Align(
            alignment: Alignment.centerRight,
            child: TextButton.icon(
              onPressed: () {
                final pwd = _generateStrongPassword();
                _passwordController.text = pwd;
                setState(() => _obscurePassword = false);
                Clipboard.setData(ClipboardData(text: pwd));
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(
                      content: Text('สร้างรหัสผ่านปลอดภัยและคัดลอกแล้ว')),
                );
              },
              icon: const Icon(Icons.key, size: 16),
              label: const Text('สร้างรหัสผ่านที่ปลอดภัยอัตโนมัติ'),
            ),
          ),
        ],
        const SizedBox(height: 20),
        FilledButton(
          onPressed: _isLoading ? null : _submitAuth,
          style: FilledButton.styleFrom(
            backgroundColor: const Color(0xFF154EC1),
            padding: const EdgeInsets.symmetric(vertical: 14),
            shape:
                RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
          ),
          child: _isLoading
              ? const SizedBox(
                  height: 20,
                  width: 20,
                  child: CircularProgressIndicator(
                      strokeWidth: 2, color: Colors.white),
                )
              : Text(
                  _isRegister ? 'สมัครสมาชิก' : 'เข้าสู่ระบบ',
                  style: const TextStyle(
                      fontSize: 16, fontWeight: FontWeight.bold),
                ),
        ),
        const SizedBox(height: 12),
        TextButton(
          onPressed: () => setState(() => _isRegister = !_isRegister),
          child: Text(_isRegister
              ? 'มีบัญชี Shenwang อยู่แล้ว? เข้าสู่ระบบ'
              : 'ยังไม่มีบัญชี? สร้างบัญชี Shenwang ใหม่'),
        ),
      ],
    );
  }
}
