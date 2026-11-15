import React, { useState } from 'react';
import {
  Download,
  Monitor,
  Smartphone,
  Globe,
  X,
  Check,
  Copy,
  WifiOff,
  Share,
  Terminal,
  Laptop,
  Layers,
  Server,
  Cpu,
} from 'lucide-react';
import { usePWAInstall, useOnlineStatus } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  compact?: boolean;
  onOpenPackagingModal?: () => void;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  compact = false,
  onOpenPackagingModal,
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        onClick={install}
        className={`flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-medium transition-colors whitespace-nowrap ${
          compact ? 'px-3 py-1.5 text-xs' : 'px-3.5 py-2 text-xs'
        }`}
        title="ติดตั้ง SBS Search เป็นแอพบนคอมพิวเตอร์หรือมือถือ"
      >
        <Download className="w-3.5 h-3.5 shrink-0" />
        <span>ติดตั้งเป็นแอพ</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          onClick={() => setShowIOSGuide(true)}
          className="flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
        >
          <Download className="w-3.5 h-3.5 shrink-0" />
          <span>ติดตั้งบน iOS</span>
        </button>

        {showIOSGuide && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4"
            onClick={() => setShowIOSGuide(false)}
          >
            <div
              className="w-full max-w-sm rounded-2xl bg-white dark:bg-[#1c1c1e] border border-slate-200 dark:border-slate-800 p-6 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  ติดตั้งบน iPhone / iPad
                </h3>
                <button
                  onClick={() => setShowIOSGuide(false)}
                  className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <ol className="space-y-2.5 text-sm text-slate-600 dark:text-slate-300">
                <li className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 text-xs font-bold flex items-center justify-center shrink-0">
                    1
                  </span>
                  <span>
                    แตะปุ่ม <Share className="inline w-3.5 h-3.5 mx-0.5" /> <strong>แชร์ (Share)</strong> ใน Safari
                  </span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 text-xs font-bold flex items-center justify-center shrink-0">
                    2
                  </span>
                  <span>
                    เลื่อนลงแล้วเลือก <strong>เพิ่มไปยังหน้าจอโฮม (Add to Home Screen)</strong>
                  </span>
                </li>
              </ol>
              <button
                onClick={() => setShowIOSGuide(false)}
                className="mt-5 w-full rounded-xl bg-blue-700 hover:bg-blue-800 py-2.5 text-sm font-medium text-white transition-colors"
              >
                เข้าใจแล้ว
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  if (onOpenPackagingModal) {
    return (
      <button
        onClick={onOpenPackagingModal}
        className="hidden sm:flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
        title="ฝังเป็นบราวเซอร์ใน OS / Flutter / Desktop / Mobile"
      >
        <Server className="w-3.5 h-3.5 text-blue-700 dark:text-blue-400 shrink-0" />
        <span>ฝังใน OS / โหลดแอพ</span>
      </button>
    );
  }

  return null;
};

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-xl bg-amber-600 px-3.5 py-2 text-xs font-medium text-white shadow-lg">
      <WifiOff className="w-3.5 h-3.5 shrink-0" />
      <span>โหมดออฟไลน์ — กำลังใช้ข้อมูลแคชของแอพ</span>
    </div>
  );
};

interface AppPackagingModalProps {
  open: boolean;
  onClose: () => void;
  showToast: (msg: string) => void;
}

export const AppPackagingModal: React.FC<AppPackagingModalProps> = ({
  open,
  onClose,
  showToast,
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [activePlatform, setActivePlatform] = useState<'os-embedded' | 'flutter' | 'os' | 'apple' | 'android' | 'pwa'>('os-embedded');
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);

  if (!open) return null;

  const copyCommand = (id: string, cmd: string) => {
    navigator.clipboard.writeText(cmd);
    setCopiedCmd(id);
    setTimeout(() => setCopiedCmd(null), 2000);
    showToast('คัดลอกคำสั่งแล้ว');
  };

  const osOneLinerCmd = `# คำสั่งเดียวติดตั้ง SBS Browser เป็น Core Daemon และ Default Browser ใน OS:
curl -sSL https://ais-pre-brb74sikfl77hnu7quzboq-74288553499.asia-southeast1.run.app/api/v1/packages/os-embedded.tar.gz | sudo tar -xz -C /opt && sudo bash /opt/sbs-browser/os-embedded/install-os.sh`;

  const osPrebakeCmd = `# วิธีฝังลงในขั้นตอนสร้าง Custom OS ISO / Rootfs Image:
cp -rf sbs-browser-os /path/to/custom-os/rootfs/opt/sbs-browser
chroot /path/to/custom-os/rootfs /opt/sbs-browser/os-embedded/install-os.sh`;

  const flutterBuildCmd = `cd flutter-app
flutter create . --platforms=android,ios,linux,macos,windows,web --org th.shenwang --project-name sbs_search
flutter pub get

# บิลด์ลง OS คอม / มือถือ / Apple / เว็บ จากโค้ดชุดเดียว:
flutter build linux --release     # OS คอมที่พัฒนาเอง / Linux (ไม่ต้องพึ่งบราวเซอร์!)
flutter build windows --release   # Windows (.exe)
flutter build macos --release     # Apple macOS (.app)
flutter build ios --release --no-codesign
flutter build apk --release && flutter build appbundle --release
flutter build web --release`;

  const osBuildCmd = `# รันเป็นแอพมี Chromium ในตัว (สำหรับ OS ที่ไม่มีบราวเซอร์)
npm install && npm run build
npx --yes electron@33 desktop/main.cjs --os-shell

# คอมไพล์เป็นไฟล์ติดตั้ง (.AppImage / .deb / .tar.gz / .exe)
npx --yes electron-builder@25 --config electron-builder.json --linux
npx --yes electron-builder@25 --config electron-builder.json --win`;

  const swiftBuildCmd = `cd apple-swift
swift build -c release
brew install xcodegen && xcodegen generate
open SBSSearch.xcodeproj`;

  const androidBuildCmd = `npm install && npm run build
npm install --no-save @capacitor/core@6 @capacitor/cli@6 @capacitor/android@6
npx cap add android && npx cap sync android
cd android && ./gradlew assembleRelease bundleRelease`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white dark:bg-[#1a1b1e] border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-md bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 text-[11px] font-bold tracking-wide uppercase">
                OS Embedded Engine
              </span>
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                บราวเซอร์ฝั่งเซิร์ฟเวอร์สำหรับฝังในระบบปฏิบัติการ
              </h2>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              โครงสร้างแบบเดียวกับ Google (ChromeOS/Android) และ Microsoft (Windows): ฝัง System Service ในเครื่อง ให้เป็น Default Browser และ Identity Engine ถาวร
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Direct Download Banner */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border border-blue-200 dark:border-blue-900/60 bg-blue-50/70 dark:bg-blue-950/20">
          <div className="space-y-0.5">
            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              ดาวน์โหลดแพ็กเกจระบบสำหรับฝังใน OS (.tar.gz)
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              รวม <code className="font-mono">sbs-browser.service</code>, ตัวเรียก CLI, ไฟล์ <code className="font-mono">.desktop</code>, ตัวติดตั้งอัตโนมัติ และสคริปต์ Rootfs
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <a
              href="/api/v1/packages/os-embedded.tar.gz"
              download="sbs-browser-os-embedded.tar.gz"
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold transition-colors whitespace-nowrap shadow-xs"
            >
              <Download className="w-3.5 h-3.5" />
              <span>โหลด OS Embedded (.tar.gz)</span>
            </a>
            <a
              href="/api/v1/packages/flutter-kit.tar.gz"
              download="sbs-search-flutter-kit.tar.gz"
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold transition-colors whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Flutter Kit</span>
            </a>
          </div>
        </div>

        {/* ปุ่มดาวน์โหลดตัวติดตั้งจริงสำหรับผู้ใช้ทั่วไป (PC .exe / มือถือ .apk) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <a
            href="https://github.com/shenwangent-ui/sbs/releases/download/latest/SBS-Search.exe"
            download="SBS-Search.exe"
            className="flex items-center justify-between p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-blue-600 transition-colors"
          >
            <div className="flex items-center gap-3">
              <Monitor className="w-5 h-5 text-blue-600 shrink-0" />
              <div>
                <div className="text-xs font-bold text-slate-900 dark:text-slate-100">
                  ดาวน์โหลดสำหรับคอมพิวเตอร์ (PC)
                </div>
                <div className="text-[11px] text-slate-500">Windows Installer (.exe • 96 MB)</div>
              </div>
            </div>
            <Download className="w-4 h-4 text-slate-400" />
          </a>

          <a
            href="https://github.com/shenwangent-ui/sbs/releases/download/latest/SBS-Search.apk"
            download="SBS-Search.apk"
            className="flex items-center justify-between p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-emerald-600 transition-colors"
          >
            <div className="flex items-center gap-3">
              <Smartphone className="w-5 h-5 text-emerald-600 shrink-0" />
              <div>
                <div className="text-xs font-bold text-slate-900 dark:text-slate-100">
                  ดาวน์โหลดสำหรับมือถือ (Android)
                </div>
                <div className="text-[11px] text-slate-500">Android Package (.apk • 18 MB)</div>
              </div>
            </div>
            <Download className="w-4 h-4 text-slate-400" />
          </a>
        </div>

        {/* Platform Tabs */}
        <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
          <button
            onClick={() => setActivePlatform('os-embedded')}
            className={`flex items-center justify-center gap-1.5 px-2.5 py-2.5 rounded-xl text-xs font-semibold border transition-colors ${
              activePlatform === 'os-embedded'
                ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
                : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50'
            }`}
          >
            <Server className="w-3.5 h-3.5 shrink-0" />
            <span>ฝังใน OS (หลัก)</span>
          </button>

          <button
            onClick={() => setActivePlatform('flutter')}
            className={`flex items-center justify-center gap-1.5 px-2.5 py-2.5 rounded-xl text-xs font-semibold border transition-colors ${
              activePlatform === 'flutter'
                ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
                : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50'
            }`}
          >
            <Layers className="w-3.5 h-3.5 shrink-0" />
            <span>Flutter</span>
          </button>

          <button
            onClick={() => setActivePlatform('os')}
            className={`flex items-center justify-center gap-1.5 px-2.5 py-2.5 rounded-xl text-xs font-semibold border transition-colors ${
              activePlatform === 'os'
                ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
                : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50'
            }`}
          >
            <Terminal className="w-3.5 h-3.5 shrink-0" />
            <span>Chromium Shell</span>
          </button>

          <button
            onClick={() => setActivePlatform('apple')}
            className={`flex items-center justify-center gap-1.5 px-2.5 py-2.5 rounded-xl text-xs font-semibold border transition-colors ${
              activePlatform === 'apple'
                ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
                : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50'
            }`}
          >
            <Laptop className="w-3.5 h-3.5 shrink-0" />
            <span>Apple Swift</span>
          </button>

          <button
            onClick={() => setActivePlatform('android')}
            className={`flex items-center justify-center gap-1.5 px-2.5 py-2.5 rounded-xl text-xs font-semibold border transition-colors ${
              activePlatform === 'android'
                ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
                : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5 shrink-0" />
            <span>Android</span>
          </button>

          <button
            onClick={() => setActivePlatform('pwa')}
            className={`flex items-center justify-center gap-1.5 px-2.5 py-2.5 rounded-xl text-xs font-semibold border transition-colors ${
              activePlatform === 'pwa'
                ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
                : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50'
            }`}
          >
            <Globe className="w-3.5 h-3.5 shrink-0" />
            <span>Web PWA</span>
          </button>
        </div>

        {activePlatform === 'os-embedded' && (
          <div className="space-y-4 text-xs sm:text-sm">
            <div className="p-4 rounded-xl border border-blue-200 dark:border-blue-900/50 bg-blue-50/40 dark:bg-blue-950/10 space-y-2.5">
              <div className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Cpu className="w-4 h-4 text-blue-700 dark:text-blue-400" />
                <span>การฝังเป็นบราวเซอร์ประจำระบบปฏิบัติการ (Built-in Server Browser)</span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                เหมือนที่ <strong>Google ฝังตัวเองใน Android / ChromeOS</strong> และ <strong>Microsoft ฝัง Edge ใน Windows</strong>:
                ระบบนี้จะรันเป็น <strong>System Service Daemon</strong> (`sbs-browser.service`) ที่ <code className="font-mono">/opt/sbs-browser</code>
                คอยให้บริการเรนเดอร์เว็บ, ข้ามการจำกัด CORS, ค้นหาข้อมูล, และจัดการบัญชี <strong>Shenwang Account</strong> ตลอดเวลา แม้ตัวเครื่อง OS จะไม่มีบราวเซอร์หรือมีสเปกเบามากก็ตาม
              </p>
            </div>

            {/* Installation Command */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
              <div className="px-3.5 py-2 bg-slate-100 dark:bg-[#141414] border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
                <span className="font-mono text-slate-600 dark:text-slate-300">คำสั่งติดตั้งลง OS อัตโนมัติ (One-Liner)</span>
                <button
                  onClick={() => copyCommand('one-liner', osOneLinerCmd)}
                  className="inline-flex items-center gap-1 text-blue-700 dark:text-blue-400 hover:underline font-medium"
                >
                  {copiedCmd === 'one-liner' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>คัดลอก</span>
                </button>
              </div>
              <pre className="p-3.5 text-xs font-mono bg-slate-950 text-slate-100 overflow-x-auto leading-relaxed">
                {osOneLinerCmd}
              </pre>
            </div>

            {/* Prebake ISO Command */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
              <div className="px-3.5 py-2 bg-slate-100 dark:bg-[#141414] border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
                <span className="font-mono text-slate-600 dark:text-slate-300">คำสั่งฝังลงใน Rootfs ก่อนสร้าง ISO ติดตั้งระบบปฏิบัติการ</span>
                <button
                  onClick={() => copyCommand('prebake', osPrebakeCmd)}
                  className="inline-flex items-center gap-1 text-blue-700 dark:text-blue-400 hover:underline font-medium"
                >
                  {copiedCmd === 'prebake' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>คัดลอก</span>
                </button>
              </div>
              <pre className="p-3.5 text-xs font-mono bg-slate-950 text-slate-100 overflow-x-auto leading-relaxed">
                {osPrebakeCmd}
              </pre>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
                <div className="font-semibold text-slate-800 dark:text-slate-200 mb-1">การเรียกใช้งานในระบบ (CLI)</div>
                <ul className="space-y-1 font-mono text-[11px] text-slate-600 dark:text-slate-400">
                  <li>sbs-browser https://github.com</li>
                  <li>sbs-browser -s &quot;ค้นหาข่าว&quot;</li>
                  <li>sbs-browser --kiosk</li>
                </ul>
              </div>
              <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
                <div className="font-semibold text-slate-800 dark:text-slate-200 mb-1">การควบคุม System Daemon</div>
                <ul className="space-y-1 font-mono text-[11px] text-slate-600 dark:text-slate-400">
                  <li>systemctl status sbs-browser</li>
                  <li>systemctl restart sbs-browser</li>
                  <li>journalctl -u sbs-browser -f</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {activePlatform === 'flutter' && (
          <div className="space-y-4 text-xs sm:text-sm">
            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#141414] space-y-2">
              <div className="font-semibold text-slate-900 dark:text-slate-100">
                Flutter All-in-One: โค้ดเดียวออก 6 แพลตฟอร์ม (น้ำหนักเบา ไม่ต้องใช้บราวเซอร์)
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                สร้างไฟล์ <code className="font-mono">flutter-app/lib/main.dart</code> และ <code className="font-mono">pubspec.yaml</code> ไว้แล้ว
                เชื่อมต่อ API ค้นหาเว็บ (<code className="font-mono">/api/v1/search</code>), ตัวอ่านเว็บพร้อมแถบ URL ในตัว (<code className="font-mono">/api/v1/preview</code>) และระบบล็อกอินบัญชี Shenwang Account (<code className="font-mono">/api/v1/auth/*</code>) คอมไพล์เป็น native binary ลง OS คอมพิวเตอร์ที่พัฒนาเองได้โดยไม่ต้องติดตั้งบราวเซอร์หรือ WebView!
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
              <div className="px-3.5 py-2 bg-slate-100 dark:bg-[#141414] border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
                <span className="font-mono text-slate-600 dark:text-slate-300">คำสั่งบิลด์ Flutter (Linux OS / Windows / macOS / iOS / Android / Web)</span>
                <button
                  onClick={() => copyCommand('flutter', flutterBuildCmd)}
                  className="inline-flex items-center gap-1 text-blue-700 dark:text-blue-400 hover:underline font-medium"
                >
                  {copiedCmd === 'flutter' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>คัดลอก</span>
                </button>
              </div>
              <pre className="p-3.5 text-xs font-mono bg-slate-950 text-slate-100 overflow-x-auto leading-relaxed">
                {flutterBuildCmd}
              </pre>
            </div>
          </div>
        )}

        {activePlatform === 'os' && (
          <div className="space-y-4 text-xs sm:text-sm">
            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#141414] space-y-2">
              <div className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Monitor className="w-4 h-4 text-blue-700 dark:text-blue-400" />
                <span>สำหรับฝังเป็นบราวเซอร์เต็มรูปแบบใน OS คอมพิวเตอร์ (Chromium Shell)</span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                ไฟล์ <code className="font-mono">desktop/main.cjs</code> มี Chromium Runtime ในตัว พร้อมโหมด{' '}
                <code className="font-mono">--os-shell</code> และ <code className="font-mono">--kiosk</code> เพื่อเปิดหน้าเว็บจริงและ iframe ได้ครบถ้วนใน OS ที่ไม่มีบราวเซอร์
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
              <div className="px-3.5 py-2 bg-slate-100 dark:bg-[#141414] border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
                <span className="font-mono text-slate-600 dark:text-slate-300">คำสั่งบิลด์ Desktop OS (.AppImage / .tar.gz / .exe)</span>
                <button
                  onClick={() => copyCommand('os', osBuildCmd)}
                  className="inline-flex items-center gap-1 text-blue-700 dark:text-blue-400 hover:underline font-medium"
                >
                  {copiedCmd === 'os' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>คัดลอก</span>
                </button>
              </div>
              <pre className="p-3.5 text-xs font-mono bg-slate-950 text-slate-100 overflow-x-auto leading-relaxed">
                {osBuildCmd}
              </pre>
            </div>
          </div>
        )}

        {activePlatform === 'apple' && (
          <div className="space-y-4 text-xs sm:text-sm">
            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#141414] space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-semibold text-slate-900 dark:text-slate-100">
                  Native Swift (SwiftUI + WKWebView) สำหรับ Apple iOS &amp; macOS
                </div>
                <a
                  href="/api/v1/packages/apple-swift"
                  download="SBSSearchApp.swift"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>โหลด SBSSearchApp.swift</span>
                </a>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                โค้ด Swift แท้ใน <code className="font-mono">apple-swift/Sources/SBSSearchApp.swift</code> สำหรับรันเป็นเนทีฟแอพ iOS/macOS
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
              <div className="px-3.5 py-2 bg-slate-100 dark:bg-[#141414] border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
                <span className="font-mono text-slate-600 dark:text-slate-300">คำสั่งบิลด์ Swift (.app / .ipa)</span>
                <button
                  onClick={() => copyCommand('apple', swiftBuildCmd)}
                  className="inline-flex items-center gap-1 text-blue-700 dark:text-blue-400 hover:underline font-medium"
                >
                  {copiedCmd === 'apple' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>คัดลอก</span>
                </button>
              </div>
              <pre className="p-3.5 text-xs font-mono bg-slate-950 text-slate-100 overflow-x-auto leading-relaxed">
                {swiftBuildCmd}
              </pre>
            </div>
          </div>
        )}

        {activePlatform === 'android' && (
          <div className="space-y-4 text-xs sm:text-sm">
            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#141414] space-y-2">
              <div className="font-semibold text-slate-900 dark:text-slate-100">
                ชุดโปรเจกต์ Android (.APK และ Google Play .AAB)
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                เลือกใช้ได้ทั้ง <strong>Flutter</strong> (<code className="font-mono">flutter build apk / appbundle</code>) หรือ{' '}
                <strong>Capacitor</strong> (<code className="font-mono">capacitor.config.ts</code>)
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
              <div className="px-3.5 py-2 bg-slate-100 dark:bg-[#141414] border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
                <span className="font-mono text-slate-600 dark:text-slate-300">คำสั่งบิลด์ Capacitor .APK และ .AAB</span>
                <button
                  onClick={() => copyCommand('and', androidBuildCmd)}
                  className="inline-flex items-center gap-1 text-blue-700 dark:text-blue-400 hover:underline font-medium"
                >
                  {copiedCmd === 'and' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>คัดลอก</span>
                </button>
              </div>
              <pre className="p-3.5 text-xs font-mono bg-slate-950 text-slate-100 overflow-x-auto leading-relaxed">
                {androidBuildCmd}
              </pre>
            </div>
          </div>
        )}

        {activePlatform === 'pwa' && (
          <div className="space-y-4 text-sm">
            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#141414] space-y-3">
              <div className="font-semibold text-slate-900 dark:text-slate-100">
                ติดตั้งเป็นแอพหน้าต่างเดี่ยว (Windows / macOS / Linux / Android / iOS)
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                ระบบรองรับ Progressive Web App (Manifest + Service Worker + Offline Cache) เต็มรูปแบบ:
              </p>
              {isInstalled ? (
                <div className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-xs font-medium">
                  <Check className="w-4 h-4" />
                  <span>กำลังใช้งานในโหมดแอพที่ติดตั้งแล้ว</span>
                </div>
              ) : isInstallable ? (
                <button
                  onClick={install}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold transition-colors"
                >
                  <Download className="w-4 h-4" />
                  <span>ติดตั้งแอพ SBS Search ทันที</span>
                </button>
              ) : isIOS ? (
                <p className="text-xs text-blue-700 dark:text-blue-300 font-medium">
                  บน iPhone / iPad: กดปุ่ม แชร์ (Share) ใน Safari แล้วเลือก &quot;เพิ่มไปยังหน้าจอโฮม&quot;
                </p>
              ) : (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  บน Chrome / Edge: กดไอคอน &quot;ติดตั้งแอป (Install)&quot; ที่มุมขวาของแถบ URL เบราว์เซอร์
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
