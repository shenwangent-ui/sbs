import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  ChevronDown,
  Eye,
  EyeOff,
  KeyRound,
  LogOut,
  ShieldCheck,
  UserCheck,
  Bookmark,
  History,
  Check,
  Code2,
  Wand2,
  Link2,
  Trash2,
} from 'lucide-react';

export type ShenwangAvatarColor = 'cobalt' | 'indigo' | 'emerald' | 'amber' | 'crimson' | 'slate';

export interface ShenwangConnectedApp {
  clientId: string;
  appName: string;
  scope: string;
  authorizedAt: string;
  lastUsedAt: string;
}

export interface ShenwangUser {
  uid: string;
  identifier: string;
  displayName: string;
  avatarColor: ShenwangAvatarColor;
  createdAt: string;
  lastLoginAt: string;
  connectedApps?: ShenwangConnectedApp[];
}

export interface ShenwangOAuthRequest {
  clientId: string;
  appName: string;
  redirectUri: string;
  scope: string;
  state?: string;
}

export const AVATAR_COLOR_MAP: Record<ShenwangAvatarColor, { bg: string; ring: string; label: string }> = {
  cobalt: { bg: 'bg-blue-700 text-white', ring: 'ring-blue-600/25', label: 'Cobalt Blue' },
  indigo: { bg: 'bg-indigo-700 text-white', ring: 'ring-indigo-600/25', label: 'Deep Indigo' },
  emerald: { bg: 'bg-emerald-700 text-white', ring: 'ring-emerald-600/25', label: 'Emerald' },
  amber: { bg: 'bg-amber-600 text-white', ring: 'ring-amber-500/25', label: 'Warm Gold' },
  crimson: { bg: 'bg-rose-700 text-white', ring: 'ring-rose-600/25', label: 'Crimson' },
  slate: { bg: 'bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900', ring: 'ring-slate-500/25', label: 'Graphite' },
};

/**
 * Original Shenwang Identity Emblem — Faceted geometric diamond-seal crest
 * visually distinct from Google or third-party identity marks.
 */
export function ShenwangEmblem({ className = 'w-9 h-9' }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" className={className} aria-hidden="true">
      <path
        d="M20 3L34.5 11.5V28.5L20 37L5.5 28.5V11.5L20 3Z"
        className="fill-blue-700 dark:fill-blue-600"
      />
      <path
        d="M20 3L34.5 11.5L20 20L5.5 11.5L20 3Z"
        className="fill-blue-500/40"
      />
      <path
        d="M20 10.5L27.5 15V25L20 29.5L12.5 25V15L20 10.5Z"
        className="stroke-white/95"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M20 14.5L24 20L20 25.5L16 20L20 14.5Z"
        className="fill-amber-400"
      />
    </svg>
  );
}

interface ShenwangAccountPortalProps {
  currentUser: ShenwangUser | null;
  authMode: 'signin' | 'register' | 'manage';
  setAuthMode: (mode: 'signin' | 'register' | 'manage') => void;
  sessionToken: string | null;
  bookmarksCount: number;
  historyCount: number;
  oauthRequest?: ShenwangOAuthRequest | null;
  onOAuthComplete?: (result: { code: string; redirectUri: string; state?: string; user: ShenwangUser }) => void;
  onOAuthCancel?: () => void;
  onStartDemoSso?: () => void;
  onAuthenticated: (payload: {
    user: ShenwangUser;
    sessionToken?: string;
    bookmarks?: any[];
    history?: string[];
  }) => void;
  onProfileUpdated: (user: ShenwangUser) => void;
  onSignOut: () => void;
  onOpenBookmarks: () => void;
  onOpenHistory: () => void;
  onOpenDeveloper: () => void;
  onBackToSearch: () => void;
  showToast: (msg: string) => void;
}

function generateStrongPassword(length = 14): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const digits = '23456789';
  const symbols = '!@#$%&*-_';
  const all = upper + lower + digits + symbols;
  const pick = (pool: string) => {
    const arr = new Uint32Array(1);
    window.crypto.getRandomValues(arr);
    return pool[arr[0] % pool.length];
  };
  const chars = [pick(upper), pick(lower), pick(digits), pick(symbols)];
  while (chars.length < length) {
    chars.push(pick(all));
  }
  for (let i = chars.length - 1; i > 0; i--) {
    const arr = new Uint32Array(1);
    window.crypto.getRandomValues(arr);
    const j = arr[0] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

export default function ShenwangAccountPortal({
  currentUser,
  authMode,
  setAuthMode,
  sessionToken,
  bookmarksCount,
  historyCount,
  oauthRequest,
  onOAuthComplete,
  onOAuthCancel,
  onStartDemoSso,
  onAuthenticated,
  onProfileUpdated,
  onSignOut,
  onOpenBookmarks,
  onOpenHistory,
  onOpenDeveloper,
  onBackToSearch,
  showToast,
}: ShenwangAccountPortalProps) {
  // 2-step Sign-In State
  const [signInStep, setSignInStep] = useState<'identifier' | 'password'>('identifier');
  const [identifierInput, setIdentifierInput] = useState('');
  const [checkedAccount, setCheckedAccount] = useState<{
    identifier: string;
    displayName: string;
    avatarColor: ShenwangAvatarColor;
  } | null>(null);
  const [passwordInput, setPasswordInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Register State
  const [regName, setRegName] = useState('');
  const [regIdentifier, setRegIdentifier] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [regColor, setRegColor] = useState<ShenwangAvatarColor>('cobalt');

  // Manage Profile State
  const [editName, setEditName] = useState(currentUser?.displayName || '');
  const [editColor, setEditColor] = useState<ShenwangAvatarColor>(currentUser?.avatarColor || 'cobalt');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [notFoundIdentifier, setNotFoundIdentifier] = useState<string | null>(null);

  useEffect(() => {
    if (currentUser) {
      setEditName(currentUser.displayName);
      setEditColor(currentUser.avatarColor);
    }
  }, [currentUser]);

  const handleCheckIdentifier = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setNotFoundIdentifier(null);
    const trimmed = identifierInput.trim();
    if (!trimmed) {
      setErrorMsg('กรุณากรอกชื่อผู้ใช้ Shenwang หรืออีเมลของคุณ');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`https://sbs-ape1.onrender.com/api/v1/auth/check-identifier`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ identifier: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'รูปแบบชื่อผู้ใช้หรืออีเมลไม่ถูกต้อง');
        return;
      }
      if (!data.exists) {
        setNotFoundIdentifier(data.identifier);
        setErrorMsg(`ไม่พบบัญชี "${data.identifier}" ในระบบ Shenwang Account`);
        return;
      }
      setCheckedAccount({
        identifier: data.identifier,
        displayName: data.displayName,
        avatarColor: data.avatarColor || 'cobalt',
      });
      setSignInStep('password');
      setPasswordInput('');
    } catch {
      setErrorMsg('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ยืนยันตัวตนได้');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignInSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!checkedAccount || !passwordInput) {
      setErrorMsg('กรุณากรอกรหัสผ่าน');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`https://sbs-ape1.onrender.com/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          identifier: checkedAccount.identifier,
          password: passwordInput,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'รหัสผ่านไม่ถูกต้อง');
        return;
      }
      onAuthenticated({
        user: data.user,
        sessionToken: data.sessionToken,
        bookmarks: data.bookmarks,
        history: data.history,
      });
      setPasswordInput('');
      setSignInStep('identifier');
      setCheckedAccount(null);
      showToast(`ลงชื่อเข้าใช้ด้วย ${data.user.displayName} แล้ว`);
    } catch {
      setErrorMsg('เกิดข้อผิดพลาดในการลงชื่อเข้าใช้');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (regName.trim().length < 2) {
      setErrorMsg('กรุณากรอกชื่อที่แสดงอย่างน้อย 2 ตัวอักษร');
      return;
    }
    if (!regIdentifier.trim()) {
      setErrorMsg('กรุณากำหนดชื่อผู้ใช้ Shenwang ID หรืออีเมล');
      return;
    }
    if (regPassword.length < 6) {
      setErrorMsg('รหัสผ่านต้องมีความยาวอย่างน้อย 6 ตัวอักษร');
      return;
    }
    if (regPassword !== regConfirmPassword) {
      setErrorMsg('รหัสผ่านและยืนยันรหัสผ่านไม่ตรงกัน');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`https://sbs-ape1.onrender.com/api/v1/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          displayName: regName.trim(),
          identifier: regIdentifier.trim(),
          password: regPassword,
          avatarColor: regColor,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'ไม่สามารถสร้างบัญชีได้');
        return;
      }
      onAuthenticated({
        user: data.user,
        sessionToken: data.sessionToken,
        bookmarks: data.bookmarks,
        history: data.history,
      });
      setRegPassword('');
      setRegConfirmPassword('');
      showToast(`สร้างบัญชี ${data.user.identifier} สำเร็จ`);
    } catch {
      setErrorMsg('เกิดข้อผิดพลาดในการสร้างบัญชี Shenwang');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSubmitting(true);
    try {
      const res = await fetch(`https://sbs-ape1.onrender.com/api/v1/auth/profile`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(sessionToken ? { 'X-Shenwang-Session': sessionToken } : {}),
        },
        credentials: 'include',
        body: JSON.stringify({
          displayName: editName.trim(),
          avatarColor: editColor,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'ไม่สามารถอัปเดตโปรไฟล์ได้');
        return;
      }
      onProfileUpdated(data.user);
      showToast('บันทึกข้อมูลบัญชี Shenwang แล้ว');
    } catch {
      setErrorMsg('เกิดข้อผิดพลาดในการบันทึกข้อมูล');
    } finally {
      setSubmitting(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!currentPassword || newPassword.length < 6) {
      setErrorMsg('กรุณากรอกรหัสผ่านเดิม และตั้งรหัสผ่านใหม่อย่างน้อย 6 ตัวอักษร');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`https://sbs-ape1.onrender.com/api/v1/auth/profile`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(sessionToken ? { 'X-Shenwang-Session': sessionToken } : {}),
        },
        credentials: 'include',
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'เปลี่ยนรหัสผ่านไม่สำเร็จ');
        return;
      }
      setCurrentPassword('');
      setNewPassword('');
      showToast('อัปเดตรหัสผ่านใหม่เรียบร้อยแล้ว');
    } catch {
      setErrorMsg('เกิดข้อผิดพลาดในการเปลี่ยนรหัสผ่าน');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSuggestPassword = () => {
    const generated = generateStrongPassword(14);
    setRegPassword(generated);
    setRegConfirmPassword(generated);
    setShowPassword(true);
    showToast('สร้างรหัสผ่านความปลอดภัยสูงแล้ว — เบราว์เซอร์สามารถบันทึกอัตโนมัติเมื่อกดสร้างบัญชี');
  };

  const handleApproveOAuth = async () => {
    if (!oauthRequest) return;
    setErrorMsg(null);
    setSubmitting(true);
    try {
      const res = await fetch(`https://sbs-ape1.onrender.com/api/v1/oauth/authorize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(sessionToken ? { 'X-Shenwang-Session': sessionToken } : {}),
        },
        credentials: 'include',
        body: JSON.stringify({
          clientId: oauthRequest.clientId,
          appName: oauthRequest.appName,
          redirectUri: oauthRequest.redirectUri,
          scope: oauthRequest.scope,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'ไม่สามารถออกรหัสยืนยันตัวตน SSO ได้');
        return;
      }
      if (data.user) {
        onProfileUpdated(data.user);
      }
      if (onOAuthComplete) {
        onOAuthComplete({
          code: data.code,
          redirectUri: oauthRequest.redirectUri,
          state: oauthRequest.state,
          user: data.user || currentUser!,
        });
      }
    } catch {
      setErrorMsg('เกิดข้อผิดพลาดในการเชื่อมต่อ SSO');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRevokeApp = async (clientId: string) => {
    try {
      const res = await fetch(`https://sbs-ape1.onrender.com/api/v1/auth/connected-apps/${encodeURIComponent(clientId)}`, {
        method: 'DELETE',
        headers: sessionToken ? { 'X-Shenwang-Session': sessionToken } : undefined,
        credentials: 'include',
      });
      const data = await res.json();
      if (res.ok && data.user) {
        onProfileUpdated(data.user);
        showToast('ยกเลิกสิทธิ์การเชื่อมต่อแอปเรียบร้อยแล้ว');
      }
    } catch {
      showToast('ไม่สามารถยกเลิกสิทธิ์ได้');
    }
  };

  // Standalone Shenwang Account Header Bar (visually separate from SBS Search / Neutral Browser)
  const portalTopBar = (
    <header className="sticky top-0 z-30 h-14 px-4 sm:px-6 flex items-center justify-between border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-[#16171a]/95 backdrop-blur-md">
      <div className="flex items-center gap-2.5 min-w-0">
        <ShenwangEmblem className="w-7 h-7 shrink-0" />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm sm:text-base text-slate-900 dark:text-slate-100 truncate">
              Shenwang Account
            </span>
            <span className="hidden sm:inline-block text-[11px] font-mono px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border border-blue-200/80 dark:border-blue-800/60">
              Identity & SSO Portal
            </span>
          </div>
        </div>
      </div>

      <button
        onClick={onBackToSearch}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 transition-colors shrink-0 whitespace-nowrap"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        <span>กลับสู่ SBS Search</span>
      </button>
    </header>
  );

  // OAUTH / SSO CONSENT VIEW (When already signed in & an app requests Shenwang Login)
  if (currentUser && oauthRequest && authMode !== 'signin' && authMode !== 'register') {
    const colorCfg = AVATAR_COLOR_MAP[currentUser.avatarColor] || AVATAR_COLOR_MAP.cobalt;
    const initial = currentUser.displayName.trim().charAt(0).toUpperCase() || 'S';

    return (
      <div className="flex-1 flex flex-col bg-slate-50/90 dark:bg-[#111214]">
        {portalTopBar}
        <div className="flex-1 flex flex-col justify-center py-10 px-4 sm:px-6">
          <div className="max-w-lg w-full mx-auto rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#1a1b1e] p-6 sm:p-8 space-y-6">
            <div className="flex items-center gap-3">
              <ShenwangEmblem className="w-10 h-10 shrink-0" />
              <div>
                <div className="text-xs font-medium text-blue-700 dark:text-blue-400">
                  Shenwang Single Sign-On (OAuth 2.0)
                </div>
                <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                  อนุญาตให้ {oauthRequest.appName} เข้าถึงบัญชีของคุณ
                </h1>
              </div>
            </div>

            <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#141414] flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold shrink-0 ${colorCfg.bg}`}>
                  {initial}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                    {currentUser.displayName}
                  </div>
                  <div className="text-xs font-mono text-slate-500 dark:text-slate-400 truncate">
                    {currentUser.identifier}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setAuthMode('signin');
                  setSignInStep('identifier');
                }}
                className="text-xs font-medium text-blue-700 dark:text-blue-400 hover:underline whitespace-nowrap shrink-0"
              >
                สลับบัญชี
              </button>
            </div>

            <div className="space-y-2.5 text-xs sm:text-sm text-slate-600 dark:text-slate-300">
              <div className="font-semibold text-slate-800 dark:text-slate-200">
                ข้อมูลที่จะแชร์กับแอปพลิเคชันนี้:
              </div>
              <div className="flex items-start gap-2.5 p-3 rounded-xl border border-slate-200/80 dark:border-slate-800">
                <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <div className="font-medium text-slate-800 dark:text-slate-200">ข้อมูลโปรไฟล์ Shenwang พื้นฐาน</div>
                  <div className="text-xs text-slate-500">ชื่อที่แสดง, Shenwang ID ({oauthRequest.scope})</div>
                </div>
              </div>
              <div className="text-[11px] font-mono text-slate-400 truncate">
                Client: {oauthRequest.clientId} → Callback: {oauthRequest.redirectUri}
              </div>
            </div>

            {errorMsg && (
              <div className="p-3 rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50/70 dark:bg-red-950/20 text-xs text-red-700 dark:text-red-300">
                {errorMsg}
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onOAuthCancel || onBackToSearch}
                className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm font-medium transition-colors"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={handleApproveOAuth}
                className="px-5 py-2.5 rounded-xl bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white text-sm font-medium transition-colors"
              >
                {submitting ? 'กำลังอนุญาต...' : 'อนุญาตและเข้าสู่ระบบต่อ'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // SIGNED-IN ACCOUNT MANAGEMENT VIEW
  if (currentUser && authMode === 'manage') {
    const colorCfg = AVATAR_COLOR_MAP[currentUser.avatarColor] || AVATAR_COLOR_MAP.cobalt;
    const initial = currentUser.displayName.trim().charAt(0).toUpperCase() || 'S';

    return (
      <div className="flex-1 flex flex-col bg-slate-50/80 dark:bg-[#111214]">
        {portalTopBar}
        <div className="py-8 px-4 sm:px-6">
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
              <div className="text-xs font-mono text-slate-500 dark:text-slate-400">
                /account/manage · บัญชีอิสระแยกจากเบราว์เซอร์
              </div>

              <button
                onClick={() => {
                  setAuthMode('signin');
                  setSignInStep('identifier');
                  setErrorMsg(null);
                }}
                className="text-xs font-medium text-blue-700 dark:text-blue-400 hover:underline whitespace-nowrap"
              >
                สลับไปยังบัญชีอื่น
              </button>
            </div>

          {/* Account Hero Header Card */}
          <div className="p-6 sm:p-8 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#1a1b1e] flex flex-col sm:flex-row sm:items-center justify-between gap-6">
            <div className="flex items-center gap-4 min-w-0">
              <div
                className={`w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-bold shrink-0 ring-4 ${colorCfg.bg} ${colorCfg.ring}`}
              >
                {initial}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mb-0.5">
                  <ShenwangEmblem className="w-4 h-4 shrink-0" />
                  <span>Shenwang Account</span>
                  <span aria-hidden="true">·</span>
                  <span>ยืนยันตัวตนแล้ว</span>
                </div>
                <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100 truncate">
                  {currentUser.displayName}
                </h1>
                <p className="text-sm font-mono text-slate-600 dark:text-slate-300 truncate">
                  {currentUser.identifier}
                </p>
              </div>
            </div>

            <button
              onClick={onSignOut}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-red-50 hover:text-red-700 hover:border-red-200 dark:hover:bg-red-950/30 dark:hover:text-red-300 dark:hover:border-red-900/50 text-sm font-medium transition-colors whitespace-nowrap shrink-0"
            >
              <LogOut className="w-4 h-4" />
              <span>ออกจากระบบ</span>
            </button>
          </div>

          {/* Synced Workspace Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <button
              onClick={onOpenBookmarks}
              className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#1a1b1e] text-left hover:border-blue-500/40 transition-colors"
            >
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-2">
                <span>บุ๊กมาร์กที่ซิงค์</span>
                <Bookmark className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-100">
                {bookmarksCount}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                ผูกกับบัญชี Shenwang นี้เท่านั้น
              </div>
            </button>

            <button
              onClick={onOpenHistory}
              className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#1a1b1e] text-left hover:border-blue-500/40 transition-colors"
            >
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-2">
                <span>ประวัติการค้นหา</span>
                <History className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              </div>
              <div className="text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-100">
                {historyCount}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                ล้างอัตโนมัติเมื่อออกจากระบบ
              </div>
            </button>

            <button
              onClick={onOpenDeveloper}
              className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#1a1b1e] text-left hover:border-blue-500/40 transition-colors"
            >
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-2">
                <span>SBS Developer Platform</span>
                <Code2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div className="text-base font-semibold text-slate-900 dark:text-slate-100 mt-1">
                จัดการ API Keys
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                ใช้งานร่วมกับบัญชีนี้
              </div>
            </button>
          </div>

          {errorMsg && (
            <div className="p-3.5 rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50/70 dark:bg-red-950/20 text-sm text-red-700 dark:text-red-300">
              {errorMsg}
            </div>
          )}

          {/* Profile & Security Settings */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <form
              onSubmit={handleSaveProfile}
              className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#1a1b1e] space-y-4"
            >
              <div className="flex items-center gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
                <UserCheck className="w-4 h-4 text-blue-700 dark:text-blue-400" />
                <h2 className="font-semibold text-base">ข้อมูลโปรไฟล์ Shenwang</h2>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                  ชื่อที่แสดง
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl text-sm border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#141414] focus:outline-none focus:ring-2 focus:ring-blue-600/40"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">
                  สีประจำตัว Shenwang Avatar
                </label>
                <div className="flex flex-wrap gap-2.5">
                  {(Object.keys(AVATAR_COLOR_MAP) as ShenwangAvatarColor[]).map((c) => (
                    <button
                      type="button"
                      key={c}
                      onClick={() => setEditColor(c)}
                      className={`w-9 h-9 rounded-xl flex items-center justify-center transition-transform ${
                        AVATAR_COLOR_MAP[c].bg
                      } ${editColor === c ? 'ring-2 ring-offset-2 ring-blue-600 scale-105' : 'opacity-80 hover:opacity-100'}`}
                      title={AVATAR_COLOR_MAP[c].label}
                    >
                      {editColor === c && <Check className="w-4 h-4" />}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white py-2.5 px-4 rounded-xl text-sm font-medium transition-colors"
              >
                {submitting ? 'กำลังบันทึก...' : 'บันทึกโปรไฟล์'}
              </button>
            </form>

            <form
              method="post"
              action="/api/v1/auth/profile"
              onSubmit={handleChangePassword}
              className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#1a1b1e] space-y-4"
            >
              <div className="flex items-center gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
                <KeyRound className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                <h2 className="font-semibold text-base">ความปลอดภัยและรหัสผ่าน</h2>
              </div>

              <input
                type="text"
                name="username"
                autoComplete="username"
                value={currentUser.identifier}
                readOnly
                tabIndex={-1}
                aria-hidden="true"
                className="sr-only"
              />

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                  รหัสผ่านปัจจุบัน
                </label>
                <input
                  type="password"
                  name="current-password"
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3.5 py-2.5 rounded-xl text-sm border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#141414] focus:outline-none focus:ring-2 focus:ring-blue-600/40"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                  รหัสผ่านใหม่ (อย่างน้อย 6 ตัวอักษร)
                </label>
                <input
                  type="password"
                  name="new-password"
                  autoComplete="new-password"
                  minLength={6}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3.5 py-2.5 rounded-xl text-sm border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#141414] focus:outline-none focus:ring-2 focus:ring-blue-600/40"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 py-2.5 px-4 rounded-xl text-sm font-medium transition-colors"
              >
                อัปเดตรหัสผ่าน
              </button>
            </form>
          </div>

          {/* Connected Apps & Shenwang SSO */}
          <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#1a1b1e] space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Link2 className="w-4 h-4 text-blue-700 dark:text-blue-400" />
                <div>
                  <h2 className="font-semibold text-base">การเชื่อมต่อบัญชีกลาง (Shenwang SSO / OAuth)</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    ใช้บัญชี Shenwang นี้ลงชื่อเข้าใช้แอปหรือเว็บไซต์อื่นได้โดยไม่ผูกติดกับเบราว์เซอร์
                  </p>
                </div>
              </div>
              {onStartDemoSso && (
                <button
                  type="button"
                  onClick={onStartDemoSso}
                  className="px-3.5 py-2 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50/70 dark:bg-blue-950/30 hover:bg-blue-100/70 dark:hover:bg-blue-950/50 text-xs font-medium text-blue-700 dark:text-blue-300 whitespace-nowrap self-start sm:self-auto"
                >
                  ทดสอบ SSO /oauth/authorize
                </button>
              )}
            </div>

            {currentUser.connectedApps && currentUser.connectedApps.length > 0 ? (
              <div className="divide-y divide-slate-200 dark:divide-slate-800">
                {currentUser.connectedApps.map((app) => (
                  <div key={app.clientId} className="py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                        {app.appName}
                      </div>
                      <div className="text-xs font-mono text-slate-500 truncate">
                        {app.clientId} · scope: {app.scope}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRevokeApp(app.clientId)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>ยกเลิกสิทธิ์</span>
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                ยังไม่มีแอปพลิเคชันภายนอกเชื่อมต่อผ่าน Shenwang OAuth 2.0
              </p>
            )}
          </div>
          </div>
        </div>
      </div>
    );
  }

  // SIGN-IN / REGISTER PORTAL (2-step Shenwang Identity Flow with Browser Password Manager Support)
  return (
    <div className="flex-1 flex flex-col bg-slate-50/90 dark:bg-[#111214]">
      {portalTopBar}
      <div className="flex-1 flex flex-col justify-center py-10 px-4 sm:px-6">
      <div className="max-w-4xl w-full mx-auto">
        {oauthRequest && (
          <div className="mb-4 px-4 py-3 rounded-2xl border border-blue-200 dark:border-blue-800/70 bg-blue-50/80 dark:bg-blue-950/30 flex items-center justify-between gap-3 text-xs sm:text-sm text-blue-900 dark:text-blue-200">
            <span>
              ลงชื่อเข้าใช้ด้วย Shenwang Account เพื่อดำเนินการต่อยัง <strong>{oauthRequest.appName}</strong>
            </span>
            <button
              type="button"
              onClick={onOAuthCancel || onBackToSearch}
              className="text-xs font-semibold hover:underline shrink-0"
            >
              ยกเลิก
            </button>
          </div>
        )}

        <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#1a1b1e] p-6 sm:p-10">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-8 md:gap-10 items-start">
            {/* Left Identity Column */}
            <div className="md:col-span-5 space-y-4">
              <div className="flex items-center gap-3">
                <ShenwangEmblem className="w-10 h-10 shrink-0" />
                <div>
                  <div className="text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100">
                    Shenwang Account
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    Unified Identity Portal
                  </div>
                </div>
              </div>

              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                {authMode === 'register'
                  ? 'สร้างบัญชี Shenwang'
                  : signInStep === 'password'
                    ? 'ยินดีต้อนรับกลับ'
                    : 'ลงชื่อเข้าใช้'}
              </h1>

              <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                {authMode === 'register'
                  ? 'สร้างบัญชี Shenwang ID ของคุณเอง เพื่อบันทึกประวัติการค้นหา บุ๊กมาร์ก และใช้งาน SBS Developer API บนเบราว์เซอร์ใดก็ได้'
                  : 'ใช้บัญชี Shenwang Account เพื่อซิงค์ข้อมูลส่วนตัวของ SBS Search แยกออกจากเบราว์เซอร์สาธารณะอย่างปลอดภัย'}
              </p>

              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2 text-xs text-slate-500 dark:text-slate-400">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-blue-700 dark:text-blue-400 shrink-0" />
                  <span>ระบบบัญชีอิสระของ Shenwang (Scrypt Password Security)</span>
                </div>
                <p>
                  ทำงานแยกจากบัญชีของเบราว์เซอร์ภายนอก ข้อมูลของคุณจะถูกเคลียร์เมื่อออกจากระบบ
                </p>
              </div>
            </div>

            {/* Right Interactive Auth Form Column */}
            <div className="md:col-span-7">
              {errorMsg && (
                <div className="mb-4 p-3.5 rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50/70 dark:bg-red-950/20 text-xs sm:text-sm text-red-700 dark:text-red-300 flex flex-col gap-2">
                  <span>{errorMsg}</span>
                  {notFoundIdentifier && (
                    <button
                      type="button"
                      onClick={() => {
                        setAuthMode('register');
                        setRegIdentifier(notFoundIdentifier);
                        setErrorMsg(null);
                        setNotFoundIdentifier(null);
                      }}
                      className="self-start text-xs font-semibold text-blue-700 dark:text-blue-400 hover:underline"
                    >
                      สร้างบัญชีด้วยชื่อ {notFoundIdentifier} ทันที →
                    </button>
                  )}
                </div>
              )}

              {authMode === 'register' ? (
                <form
                  method="post"
                  action="/api/v1/auth/register"
                  onSubmit={handleRegisterSubmit}
                  className="space-y-4"
                >
                  <div>
                    <label htmlFor="sw-reg-name" className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                      ชื่อที่แสดง (Display Name)
                    </label>
                    <input
                      id="sw-reg-name"
                      name="name"
                      type="text"
                      autoComplete="name"
                      value={regName}
                      onChange={(e) => setRegName(e.target.value)}
                      placeholder="เช่น สมชาย ใจดี"
                      required
                      className="w-full px-4 py-3 rounded-xl text-sm border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#141414] focus:outline-none focus:ring-2 focus:ring-blue-600/40"
                    />
                  </div>

                  <div>
                    <label htmlFor="sw-reg-identifier" className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                      ชื่อผู้ใช้ Shenwang ID หรืออีเมล
                    </label>
                    <input
                      id="sw-reg-identifier"
                      name="username"
                      type="text"
                      autoComplete="username"
                      value={regIdentifier}
                      onChange={(e) => setRegIdentifier(e.target.value)}
                      placeholder="somchai หรือ somchai@example.com"
                      required
                      className="w-full px-4 py-3 rounded-xl text-sm border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#141414] focus:outline-none focus:ring-2 focus:ring-blue-600/40"
                    />
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                      หากกรอกเฉพาะชื่อผู้ใช้ ระบบจะสร้างเป็น <code className="font-mono">@shenwang.th</code> ให้อัตโนมัติ
                    </p>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                        รหัสผ่าน (รองรับ Password Manager ของเบราว์เซอร์)
                      </span>
                      <button
                        type="button"
                        onClick={handleSuggestPassword}
                        className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 dark:text-blue-400 hover:underline"
                      >
                        <Wand2 className="w-3.5 h-3.5" />
                        <span>สุ่มรหัสผ่านปลอดภัย</span>
                      </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="relative">
                        <input
                          id="sw-reg-password"
                          name="new-password"
                          type={showPassword ? 'text' : 'password'}
                          autoComplete="new-password"
                          minLength={6}
                          value={regPassword}
                          onChange={(e) => setRegPassword(e.target.value)}
                          placeholder="อย่างน้อย 6 ตัวอักษร"
                          required
                          className="w-full pl-4 pr-10 py-3 rounded-xl text-sm border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#141414] focus:outline-none focus:ring-2 focus:ring-blue-600/40"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((v) => !v)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                          title={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>

                      <input
                        id="sw-reg-confirm-password"
                        name="confirm-password"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="new-password"
                        minLength={6}
                        value={regConfirmPassword}
                        onChange={(e) => setRegConfirmPassword(e.target.value)}
                        placeholder="ยืนยันรหัสผ่านอีกครั้ง"
                        required
                        className="w-full px-4 py-3 rounded-xl text-sm border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#141414] focus:outline-none focus:ring-2 focus:ring-blue-600/40"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">
                      สีประจำตัว Avatar
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {(Object.keys(AVATAR_COLOR_MAP) as ShenwangAvatarColor[]).map((c) => (
                        <button
                          type="button"
                          key={c}
                          onClick={() => setRegColor(c)}
                          className={`w-8 h-8 rounded-lg flex items-center justify-center ${AVATAR_COLOR_MAP[c].bg} ${
                            regColor === c ? 'ring-2 ring-offset-2 ring-blue-600' : 'opacity-75 hover:opacity-100'
                          }`}
                          title={AVATAR_COLOR_MAP[c].label}
                        >
                          {regColor === c && <Check className="w-3.5 h-3.5" />}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="pt-2 flex flex-col-reverse sm:flex-row sm:items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setAuthMode('signin');
                        setSignInStep('identifier');
                        setErrorMsg(null);
                        setNotFoundIdentifier(null);
                      }}
                      className="text-sm font-medium text-blue-700 dark:text-blue-400 hover:underline py-2 text-left"
                    >
                      มีบัญชีอยู่แล้ว? ลงชื่อเข้าใช้
                    </button>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white px-6 py-2.5 rounded-xl text-sm font-medium transition-colors whitespace-nowrap"
                    >
                      {submitting ? 'กำลังสร้างบัญชี...' : 'สร้างบัญชี Shenwang'}
                    </button>
                  </div>
                </form>
              ) : signInStep === 'identifier' ? (
                <form
                  method="post"
                  action="/api/v1/auth/login"
                  onSubmit={handleCheckIdentifier}
                  className="space-y-5"
                >
                  <div>
                    <label htmlFor="sw-signin-identifier" className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                      ชื่อผู้ใช้ Shenwang หรืออีเมล
                    </label>
                    <input
                      id="sw-signin-identifier"
                      name="username"
                      type="text"
                      autoComplete="username"
                      value={identifierInput}
                      onChange={(e) => setIdentifierInput(e.target.value)}
                      placeholder="เช่น somchai หรือ somchai@shenwang.th"
                      autoFocus
                      className="w-full px-4 py-3.5 rounded-xl text-sm border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#141414] focus:outline-none focus:ring-2 focus:ring-blue-600/40"
                    />
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                      หากพิมพ์เฉพาะชื่อผู้ใช้ ระบบจะค้นหาภายใต้โดเมน <code className="font-mono">@shenwang.th</code>
                    </p>
                  </div>

                  <div className="pt-2 flex flex-col-reverse sm:flex-row sm:items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setAuthMode('register');
                        setErrorMsg(null);
                        setNotFoundIdentifier(null);
                      }}
                      className="text-sm font-medium text-blue-700 dark:text-blue-400 hover:underline py-2 text-left"
                    >
                      สร้างบัญชี Shenwang ใหม่
                    </button>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white px-6 py-2.5 rounded-xl text-sm font-medium transition-colors whitespace-nowrap"
                    >
                      {submitting ? 'กำลังตรวจสอบ...' : 'ถัดไป'}
                    </button>
                  </div>
                </form>
              ) : (
                <form
                  method="post"
                  action="/api/v1/auth/login"
                  onSubmit={handleSignInSubmit}
                  className="space-y-5"
                >
                  {checkedAccount && (
                    <>
                      <input
                        type="text"
                        name="username"
                        autoComplete="username"
                        value={checkedAccount.identifier}
                        readOnly
                        tabIndex={-1}
                        aria-hidden="true"
                        className="sr-only"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setSignInStep('identifier');
                          setErrorMsg(null);
                          setPasswordInput('');
                        }}
                        className="inline-flex items-center gap-2.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm transition-colors max-w-full"
                      >
                        <span
                          className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${
                            (AVATAR_COLOR_MAP[checkedAccount.avatarColor] || AVATAR_COLOR_MAP.cobalt).bg
                          }`}
                        >
                          {checkedAccount.displayName.charAt(0).toUpperCase()}
                        </span>
                        <span className="font-mono text-xs text-slate-700 dark:text-slate-200 truncate">
                          {checkedAccount.identifier}
                        </span>
                        <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      </button>
                    </>
                  )}

                  <div>
                    <label htmlFor="sw-signin-password" className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                      ป้อนรหัสผ่านของคุณ
                    </label>
                    <div className="relative">
                      <input
                        id="sw-signin-password"
                        name="password"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="current-password"
                        value={passwordInput}
                        onChange={(e) => setPasswordInput(e.target.value)}
                        placeholder="กรอกรหัสผ่าน Shenwang Account"
                        autoFocus
                        className="w-full pl-4 pr-10 py-3.5 rounded-xl text-sm border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#141414] focus:outline-none focus:ring-2 focus:ring-blue-600/40"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        title={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">
                      รองรับการดึงรหัสผ่านอัตโนมัติ (Autofill) จาก Password Manager ของเบราว์เซอร์
                    </p>
                  </div>

                  <div className="pt-2 flex items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setSignInStep('identifier');
                        setErrorMsg(null);
                      }}
                      className="text-sm font-medium text-slate-600 dark:text-slate-300 hover:underline py-2"
                    >
                      ใช้บัญชีอื่น
                    </button>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white px-6 py-2.5 rounded-xl text-sm font-medium transition-colors whitespace-nowrap"
                    >
                      {submitting ? 'กำลังลงชื่อเข้าใช้...' : 'ลงชื่อเข้าใช้'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
