# SBS Search Flutter (All-in-One: Web, iOS, Android, Windows, macOS, Linux / Custom OS)

โค้ดชุดนี้ใช้ Dart/Flutter เพียงชุดเดียวในการคอมไพล์เป็นแอพเนทีฟสำหรับทุกแพลตฟอร์ม โดยเชื่อมต่อกับเซิร์ฟเวอร์ SBS Engine (`server.ts`) ทั้งระบบค้นหา (`/api/v1/search`), พรีวิวอ่านเว็บแบบไร้บราวเซอร์ (`/api/v1/preview`), และระบบบัญชี Shenwang Account (`/api/v1/auth/*`):

## คำสั่งสร้างโปรเจกต์และคอมไพล์
```bash
cd flutter-app
flutter create . --platforms=android,ios,linux,macos,windows,web --org th.shenwang --project-name sbs_search
flutter pub get

# 1. OS คอมพิวเตอร์ที่พัฒนาเอง / Linux (ทำงานได้แม้ไม่มี Chrome/บราวเซอร์ใน OS)
flutter build linux --release

# 2. Windows (.exe)
flutter build windows --release

# 3. Apple macOS (.app) & iOS (.ipa)
flutter build macos --release
flutter build ios --release --no-codesign

# 4. Android (.apk & .aab)
flutter build apk --release
flutter build appbundle --release

# 5. Web
flutter build web --release
```
