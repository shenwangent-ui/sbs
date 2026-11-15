import 'dart:math';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
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
    final email = _emailController.text.trim();
    final pass = _passwordController.text.trim();
    if (email.isEmpty || pass.length < 4) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('กรุณากรอกอีเมลและรหัสผ่านให้ครบถ้วน')),
      );
      return;
    }

    final displayName = _isRegister && _nameController.text.trim().isNotEmpty
        ? _nameController.text.trim()
        : email.split('@').first;

    final user = ShenwangUser(
      id: 'sw_${DateTime.now().millisecondsSinceEpoch}',
      name: displayName,
      email: email,
      shenwangId: '${displayName.toLowerCase()}@shenwang.id',
      createdAt: DateTime.now().toIso8601String(),
    );

    await StorageService.saveUser(user);
    if (mounted) {
      setState(() => _user = user);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
            content: Text(_isRegister
                ? 'สร้างบัญชี Shenwang Account สำเร็จ!'
                : 'เข้าสู่ระบบ Shenwang Account สำเร็จ!')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Shenwang Account'),
      ),
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
          backgroundColor: const Color(0xFF1D4ED8),
          child: Text(
            user.name.isNotEmpty ? user.name[0].toUpperCase() : 'S',
            style: const TextStyle(
                fontSize: 34, fontWeight: FontWeight.bold, color: Colors.white),
          ),
        ),
        const SizedBox(height: 14),
        Text(user.name,
            style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold)),
        const SizedBox(height: 4),
        Text(user.shenwangId,
            style: const TextStyle(
                fontSize: 14,
                color: Color(0xFF1D4ED8),
                fontWeight: FontWeight.w600)),
        const SizedBox(height: 4),
        Text(user.email, style: const TextStyle(color: Colors.grey)),
        const SizedBox(height: 28),
        Card(
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
          child: Column(
            children: [
              ListTile(
                leading: const Icon(Icons.verified_user, color: Colors.green),
                title: const Text('สถานะบัญชี Shenwang ID'),
                subtitle: const Text('ยืนยันตัวตนและซิงค์ข้อมูลในเครื่องแล้ว'),
                trailing: IconButton(
                  icon: const Icon(Icons.copy, size: 18),
                  onPressed: () {
                    Clipboard.setData(ClipboardData(text: user.shenwangId));
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('คัดลอก Shenwang ID แล้ว')),
                    );
                  },
                ),
              ),
              const Divider(height: 1),
              ListTile(
                leading: const Icon(Icons.security, color: Color(0xFF1D4ED8)),
                title: const Text('ระบบเข้าสู่ระบบกลาง (OAuth 2.0)'),
                subtitle: const Text('พร้อมเชื่อมต่อบริการในเครือ Shenwang Ent.'),
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
          'บัญชีเดียวสำหรับ SBS Search และบริการในเครือ Shenwang',
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
            labelText: 'อีเมล หรือ Shenwang ID',
            prefixIcon: const Icon(Icons.alternate_email),
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(14)),
          ),
        ),
        const SizedBox(height: 14),
        TextField(
          controller: _passwordController,
          obscureText: _obscurePassword,
          decoration: InputDecoration(
            labelText: 'รหัสผ่าน',
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
          onPressed: _submitAuth,
          style: FilledButton.styleFrom(
            backgroundColor: const Color(0xFF1D4ED8),
            padding: const EdgeInsets.symmetric(vertical: 14),
            shape:
                RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
          ),
          child: Text(
            _isRegister ? 'สมัครสมาชิก' : 'เข้าสู่ระบบ',
            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
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
