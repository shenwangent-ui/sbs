import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Search, Sparkles, Code2, Globe, Image as ImageIcon, Newspaper, Video, Bookmark, History, Terminal, Copy, Check, ExternalLink, ChevronRight, Sun, Moon, Menu, X, Play, Layers, Cpu, Database, AlertCircle, KeyRound, Eye, EyeOff, Trash2, Plus, RefreshCw, Activity, FileCode2, ShieldCheck, LogOut, UserCog, UserPlus, ArrowLeft, ArrowRight, RotateCw, Lock, Home, BookOpen, Download, Settings, CheckCircle2 } from 'lucide-react';
import ShenwangAccountPortal, {
  AVATAR_COLOR_MAP,
  ShenwangEmblem,
  type ShenwangUser,
  type ShenwangOAuthRequest,
} from './components/ShenwangAccountPortal';
import {
  PWAInstallButton,
  OfflineIndicator,
  AppPackagingModal,
} from './components/PWAInstallControls';

type ActiveTab = 'home' | 'search' | 'preview' | 'architecture' | 'developer' | 'account';
type SearchMode = 'all' | 'web' | 'images' | 'news' | 'video';

interface SearchResultItem {
  title: string;
  url: string;
  snippet: string;
  domain: string;
  breadcrumb?: string;
  publishedDate?: string;
}

interface PreviewData {
  finalUrl: string;
  domain: string;
  favicon: string;
  title: string;
  status: number;
  canRenderWeb: boolean;
  preferredMode: 'web' | 'reader';
  blockedReason?: string;
  html: string;
  reader: {
    title: string;
    description: string;
    ogImage: string | null;
    blocks: { tag: string; text: string }[];
    links: { label: string; url: string }[];
    aiSummary?: string;
  };
}

const searchCache = new Map<string, any>();
const clientPreviewCache = new Map<string, PreviewData>();
const prefetchedPreviewUrls = new Set<string>();

function looksLikeUrl(input: string): boolean {
  const trimmed = input.trim();
  if (!trimmed || /\s/.test(trimmed)) return false;
  if (/^https?:\/\//i.test(trimmed)) return true;
  return /^[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)+([/?#].*)?$/.test(trimmed);
}

function normalizeUrlInput(input: string): string {
  const trimmed = input.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function getFaviconUrl(domain: string): string {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`;
}

function parseAccountRouteFromWindow(): {
  isAccountRoute: boolean;
  mode: 'signin' | 'register' | 'manage';
  oauth: ShenwangOAuthRequest | null;
} {
  if (typeof window === 'undefined') {
    return { isAccountRoute: false, mode: 'signin', oauth: null };
  }
  const path = window.location.pathname;
  const params = new URLSearchParams(window.location.search);
  if (path === '/oauth/authorize') {
    const clientId = params.get('client_id') || 'sbs_search_web';
    const appName = params.get('app_name') || 'SBS Search & Platform';
    const redirectUri = params.get('redirect_uri') || '/';
    const scope = params.get('scope') || 'profile openid';
    const state = params.get('state') || undefined;
    return {
      isAccountRoute: true,
      mode: 'manage',
      oauth: { clientId, appName, redirectUri, scope, state },
    };
  }
  if (path === '/account/register') {
    return { isAccountRoute: true, mode: 'register', oauth: null };
  }
  if (path === '/account/manage') {
    return { isAccountRoute: true, mode: 'manage', oauth: null };
  }
  if (path === '/account') {
    return { isAccountRoute: true, mode: 'signin', oauth: null };
  }
  return { isAccountRoute: false, mode: 'signin', oauth: null };
}

export default function App() {
  const initialRoute = parseAccountRouteFromWindow();
  const [activeTab, setActiveTab] = useState<ActiveTab>(initialRoute.isAccountRoute ? 'account' : 'home');
  const [returnTab, setReturnTab] = useState<'home' | 'search'>('home');
  const [query, setQuery] = useState('');
  const [searchMode, setSearchMode] = useState<SearchMode>('all');
  const [searchResult, setSearchResult] = useState<any>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [autocomplete, setAutocomplete] = useState<string[]>([]);
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [trending, setTrending] = useState<any[]>([]);
  const [history, setHistory] = useState<string[]>([]);
  const [bookmarks, setBookmarks] = useState<any[]>([]);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('sbs_theme') === 'dark' ? 'dark' : 'light';
    }
    return 'light';
  });

  // Neutral URL-Bar Web Preview state (no member profile attached to the viewer)
  const [previewHistory, setPreviewHistory] = useState<string[]>([]);
  const [previewHistoryIdx, setPreviewHistoryIdx] = useState<number>(-1);
  const [omniboxInput, setOmniboxInput] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [previewViewMode, setPreviewViewMode] = useState<'web' | 'reader'>('web');
  const [previewReloadKey, setPreviewReloadKey] = useState(0);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [settingsSubView, setSettingsSubView] = useState<'main' | 'perception'>('main');
  const [allowWebReaderToggle, setAllowWebReaderToggle] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('sbs_allow_web_reader') === 'true';
    }
    return false;
  });
  const [pendingWebReaderConsent, setPendingWebReaderConsent] = useState<boolean>(false);

  // Shenwang Account Identity State (browser stays guest/clean until signed in)
  const [currentUser, setCurrentUser] = useState<ShenwangUser | null>(null);
  const [authMode, setAuthMode] = useState<'signin' | 'register' | 'manage'>(initialRoute.mode);
  const [oauthRequest, setOauthRequest] = useState<ShenwangOAuthRequest | null>(initialRoute.oauth);
  const [sessionToken, setSessionToken] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem('shenwang_session_token');
    }
    return null;
  });
  const [showAccountMenu, setShowAccountMenu] = useState(false);

  // Navigation & Drawers
  const [showBurgerMenu, setShowBurgerMenu] = useState(false);
  const [showHistoryDrawer, setShowHistoryDrawer] = useState(false);
  const [showBookmarksDrawer, setShowBookmarksDrawer] = useState(false);
  const [showPackagingModal, setShowPackagingModal] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Architecture interactive demo state
  const [activeArchTab, setActiveArchTab] = useState<'crawler' | 'indexer' | 'ranking' | 'rendering' | 'ui'>('crawler');
  const [crawlerUrl, setCrawlerUrl] = useState('https://th.wikipedia.org');
  const [crawlerLog, setCrawlerLog] = useState<string[]>([]);
  const [crawling, setCrawling] = useState(false);

  // Developer Platform Console state
  const [devSubTab, setDevSubTab] = useState<'explorer' | 'keys' | 'logs' | 'docs'>('explorer');
  const [apiKey, setApiKey] = useState('sbs_live_demo12345');
  const [devKeys, setDevKeys] = useState<any[]>([]);
  const [revealedKeys, setRevealedKeys] = useState<Record<string, boolean>>({});
  const [apiKeyName, setApiKeyName] = useState('');
  const [apiKeyScope, setApiKeyScope] = useState<'full:access' | 'read:search'>('full:access');
  const [devLogs, setDevLogs] = useState<any[]>([]);
  const [devSummary, setDevSummary] = useState<{ activeKeys: number; totalRequests: number; avgLatencyMs: number | null }>({
    activeKeys: 1,
    totalRequests: 0,
    avgLatencyMs: null,
  });
  const [devLoadingMeta, setDevLoadingMeta] = useState(false);

  // API Explorer state
  const [explorerEndpoint, setExplorerEndpoint] = useState<'search' | 'autocomplete' | 'trending'>('search');
  const [testQuery, setTestQuery] = useState('เทคโนโลยี AI ในประเทศไทย');
  const [testMode, setTestMode] = useState<SearchMode>('all');
  const [testLang, setTestLang] = useState<'th' | 'en'>('th');
  const [testApiResponse, setTestApiResponse] = useState<any>(null);
  const [testApiStatus, setTestApiStatus] = useState<number | null>(null);
  const [testApiLatencyMs, setTestApiLatencyMs] = useState<number | null>(null);
  const [testApiLoading, setTestApiLoading] = useState(false);
  const [explorerResultTab, setExplorerResultTab] = useState<'json' | 'preview' | 'sdk'>('json');
  const [activeCodeLang, setActiveCodeLang] = useState<'curl' | 'ts' | 'js' | 'python'>('ts');
  const [copiedCode, setCopiedCode] = useState(false);

  const searchContainerRef = useRef<HTMLDivElement>(null);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const previewAbortRef = useRef<AbortController | null>(null);

  // Sync Tailwind v4 .dark class on <html>
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('sbs_theme', theme);
  }, [theme]);

  useEffect(() => {
    fetch(`https://sbs-ape1.onrender.com/api/v1/trending`)
      .then((res) => res.json())
      .then((data) => {
        if (data.trending) setTrending(data.trending);
      })
      .catch(() => {});

    // Clear legacy browser-bound local storage so shared browsers remain neutral
    try {
      localStorage.removeItem('sbs_history');
      localStorage.removeItem('sbs_bookmarks');
    } catch {
      // Ignore storage error
    }

    const storedToken = sessionStorage.getItem('shenwang_session_token');
    fetch(`https://sbs-ape1.onrender.com/api/v1/auth/me`, {
      credentials: 'include',
      headers: storedToken ? { 'X-Shenwang-Session': storedToken } : undefined,
    })
      .then((res) => res.json())
      .then((data) => {
        if (data?.authenticated && data.user) {
          setCurrentUser(data.user);
          if (Array.isArray(data.bookmarks)) setBookmarks(data.bookmarks);
          if (Array.isArray(data.history)) setHistory(data.history);
        } else {
          sessionStorage.removeItem('shenwang_session_token');
          setSessionToken(null);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setShowAutocomplete(false);
      }
      if (accountMenuRef.current && !accountMenuRef.current.contains(e.target as Node)) {
        setShowAccountMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    const handlePopState = () => {
      const route = parseAccountRouteFromWindow();
      if (route.isAccountRoute) {
        setAuthMode(route.mode);
        setOauthRequest(route.oauth);
        setActiveTab('account');
      } else {
        setOauthRequest(null);
        setActiveTab((prev) => (prev === 'account' ? 'home' : prev));
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  useEffect(() => {
    if (query.trim().length > 0) {
      const controller = new AbortController();
      fetch(`https://sbs-ape1.onrender.com/api/v1/autocomplete?q=${encodeURIComponent(query)}`, { signal: controller.signal })
        .then((res) => res.json())
        .then((data) => {
          if (data.suggestions) setAutocomplete(data.suggestions);
        })
        .catch(() => {});
      return () => controller.abort();
    } else {
      setAutocomplete([]);
    }
  }, [query]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2800);
  };

  const syncUserAccountData = useCallback(
    async (nextBookmarks: any[], nextHistory: string[]) => {
      if (!currentUser) return;
      try {
        await fetch(`https://sbs-ape1.onrender.com/api/v1/user/sync`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            ...(sessionToken ? { 'X-Shenwang-Session': sessionToken } : {}),
          },
          credentials: 'include',
          body: JSON.stringify({ bookmarks: nextBookmarks, history: nextHistory }),
        });
      } catch {
        // Ignore transient sync error
      }
    },
    [currentUser, sessionToken]
  );

  const pushBrowserPath = useCallback((nextPath: string) => {
    if (typeof window !== 'undefined' && window.location.pathname + window.location.search !== nextPath) {
      window.history.pushState({}, '', nextPath);
    }
  }, []);

  const exitAccountPortalTo = useCallback(
    (targetTab: ActiveTab) => {
      setOauthRequest(null);
      setActiveTab(targetTab);
      pushBrowserPath('/');
    },
    [pushBrowserPath]
  );

  const handleShenwangAuthenticated = (payload: {
    user: ShenwangUser;
    sessionToken?: string;
    bookmarks?: any[];
    history?: string[];
  }) => {
    setCurrentUser(payload.user);
    if (payload.sessionToken) {
      setSessionToken(payload.sessionToken);
      sessionStorage.setItem('shenwang_session_token', payload.sessionToken);
    }
    setBookmarks(Array.isArray(payload.bookmarks) ? payload.bookmarks : []);
    setHistory(Array.isArray(payload.history) ? payload.history : []);
    setAuthMode('manage');
    if (oauthRequest) {
      // Keep user on /oauth/authorize consent screen to approve sharing with client app
      return;
    }
    exitAccountPortalTo('home');
  };

  const handleShenwangSignOut = async () => {
    try {
      await fetch(`https://sbs-ape1.onrender.com/api/v1/auth/logout`, {
        method: 'POST',
        credentials: 'include',
        headers: sessionToken ? { 'X-Shenwang-Session': sessionToken } : undefined,
      });
    } catch {
      // Proceed with local cleanup
    }
    sessionStorage.removeItem('shenwang_session_token');
    setSessionToken(null);
    setCurrentUser(null);
    setBookmarks([]);
    setHistory([]);
    setShowAccountMenu(false);
    setShowBookmarksDrawer(false);
    setShowHistoryDrawer(false);
    if (activeTab === 'account') {
      exitAccountPortalTo('home');
    }
    showToast('ออกจากระบบ Shenwang Account และล้างข้อมูลในเบราว์เซอร์แล้ว');
  };

  const openAccountPortal = (mode: 'signin' | 'register' | 'manage') => {
    setOauthRequest(null);
    setAuthMode(mode);
    setShowAccountMenu(false);
    setShowBurgerMenu(false);
    setActiveTab('account');
    const targetPath = mode === 'register' ? '/account/register' : mode === 'manage' ? '/account/manage' : '/account';
    pushBrowserPath(targetPath);
  };

  const startDemoSsoFlow = () => {
    const req: ShenwangOAuthRequest = {
      clientId: 'sbs_search_web',
      appName: 'SBS Search & Platform',
      redirectUri: '/',
      scope: 'profile openid',
      state: Math.random().toString(36).slice(2, 10),
    };
    setOauthRequest(req);
    setAuthMode('manage');
    setActiveTab('account');
    pushBrowserPath(
      `/oauth/authorize?client_id=${encodeURIComponent(req.clientId)}&app_name=${encodeURIComponent(req.appName)}&redirect_uri=${encodeURIComponent(req.redirectUri)}&scope=${encodeURIComponent(req.scope)}`
    );
  };

  const handleOAuthComplete = async (result: {
    code: string;
    redirectUri: string;
    state?: string;
    user: ShenwangUser;
  }) => {
    const isExternalRedirect =
      /^https?:\/\//i.test(result.redirectUri) &&
      typeof window !== 'undefined' &&
      !result.redirectUri.startsWith(window.location.origin);

    if (isExternalRedirect) {
      const sep = result.redirectUri.includes('?') ? '&' : '?';
      const url = `${result.redirectUri}${sep}code=${encodeURIComponent(result.code)}${
        result.state ? `&state=${encodeURIComponent(result.state)}` : ''
      }`;
      window.location.href = url;
      return;
    }

    try {
      await fetch(`https://sbs-ape1.onrender.com/api/v1/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: result.code,
          clientId: oauthRequest?.clientId || 'sbs_search_web',
          redirectUri: result.redirectUri,
        }),
      });
    } catch {
      // Proceed cleanly back to app
    }

    exitAccountPortalTo('home');
    showToast(`ยืนยันตัวตนด้วย Shenwang SSO (${result.user.identifier}) เรียบร้อยแล้ว`);
  };

  const prefetchPreview = useCallback((rawUrl: string) => {
    if (!rawUrl) return;
    const url = normalizeUrlInput(rawUrl);
    if (clientPreviewCache.has(url) || prefetchedPreviewUrls.has(url)) return;
    prefetchedPreviewUrls.add(url);
    fetch(`https://sbs-ape1.onrender.com/api/v1/preview?url=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(4500) })
      .then((res) => res.json())
      .then((data: PreviewData) => {
        if (data && data.finalUrl) {
          clientPreviewCache.set(url, data);
          clientPreviewCache.set(data.finalUrl, data);
        }
      })
      .catch(() => {
        prefetchedPreviewUrls.delete(url);
      });
  }, []);

  const loadPreviewUrl = useCallback(async (targetUrl: string, forceReload = false) => {
    previewAbortRef.current?.abort();

    if (!forceReload && clientPreviewCache.has(targetUrl)) {
      const cached = clientPreviewCache.get(targetUrl)!;
      setPreviewData(cached);
      setOmniboxInput(cached.finalUrl || targetUrl);
      setPreviewViewMode('web');
      setPreviewLoading(false);
      return;
    }

    const controller = new AbortController();
    previewAbortRef.current = controller;
    const timeoutId = setTimeout(() => controller.abort(), 5500);

    setPreviewLoading(true);
    setPreviewData(null);
    setOmniboxInput(targetUrl);

    try {
      const res = await fetch(`https://sbs-ape1.onrender.com/api/v1/preview?url=${encodeURIComponent(targetUrl)}`, {
        signal: controller.signal,
      });
      const data: PreviewData = await res.json();
      if (controller.signal.aborted) return;
      clientPreviewCache.set(targetUrl, data);
      if (data.finalUrl) clientPreviewCache.set(data.finalUrl, data);
      setPreviewData(data);
      setOmniboxInput(data.finalUrl || targetUrl);
      setPreviewViewMode('web');
    } catch (err: any) {
      if (err?.name === 'AbortError' && previewAbortRef.current !== controller) {
        return;
      }
      const isTimeout = err?.name === 'AbortError';
      setPreviewData({
        finalUrl: targetUrl,
        domain: targetUrl.replace(/^https?:\/\//, '').split('/')[0],
        favicon: getFaviconUrl(targetUrl),
        title: targetUrl,
        status: 0,
        canRenderWeb: false,
        preferredMode: 'reader',
        blockedReason: isTimeout
          ? 'หน้าเว็บปลายทางใช้เวลาตอบสนองนานเกิน 5 วินาที สามารถกด "เปิดในเบราว์เซอร์" เพื่อเปิดดูโดยตรงได้ทันที'
          : 'ไม่สามารถเชื่อมต่อระบบพรีวิวเว็บได้ในขณะนี้',
        html: '',
        reader: {
          title: targetUrl,
          description: '',
          ogImage: null,
          blocks: [],
          links: [],
        },
      });
      setPreviewViewMode('web');
    } finally {
      clearTimeout(timeoutId);
      if (previewAbortRef.current === controller) {
        setPreviewLoading(false);
      }
    }
  }, []);

  const openUrlPreview = useCallback(
    (rawUrl: string, pushHistory = true) => {
      const url = normalizeUrlInput(rawUrl);
      if (activeTab === 'home' || activeTab === 'search') {
        setReturnTab(activeTab);
      }
      setActiveTab('preview');
      if (pushHistory) {
        setPreviewHistory((prev) => {
          const sliced = prev.slice(0, previewHistoryIdx + 1);
          if (sliced[sliced.length - 1] === url) return sliced;
          const next = [...sliced, url];
          setPreviewHistoryIdx(next.length - 1);
          return next;
        });
      }
      loadPreviewUrl(url);
    },
    [activeTab, previewHistoryIdx, loadPreviewUrl]
  );

  // Intercept link clicks inside the rendered webpage preview iframe
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === 'sbs-browser-navigate' && typeof event.data.url === 'string') {
        openUrlPreview(event.data.url, true);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [openUrlPreview]);

  const handlePreviewBack = () => {
    if (previewHistoryIdx > 0) {
      const prevIdx = previewHistoryIdx - 1;
      const target = previewHistory[prevIdx];
      setPreviewHistoryIdx(prevIdx);
      loadPreviewUrl(target);
    } else {
      setActiveTab(searchResult ? 'search' : returnTab);
    }
  };

  const handlePreviewForward = () => {
    if (previewHistoryIdx < previewHistory.length - 1) {
      const nextIdx = previewHistoryIdx + 1;
      const target = previewHistory[nextIdx];
      setPreviewHistoryIdx(nextIdx);
      loadPreviewUrl(target);
    }
  };

  const handlePreviewReload = () => {
    if (omniboxInput.trim()) {
      setPreviewReloadKey((k) => k + 1);
      loadPreviewUrl(normalizeUrlInput(omniboxInput), true);
    }
  };

  const executeSearch = async (rawInput: string, mode: SearchMode = searchMode) => {
    const trimmed = rawInput.trim();
    if (!trimmed) return;

    if (looksLikeUrl(trimmed)) {
      setShowAutocomplete(false);
      openUrlPreview(trimmed, true);
      return;
    }

    setQuery(trimmed);
    setSearchMode(mode);
    setActiveTab('search');
    setShowAutocomplete(false);
    setSearchError(null);

    const cacheKey = `${trimmed.toLowerCase()}__${mode}`;
    if (searchCache.has(cacheKey)) {
      setSearchResult(searchCache.get(cacheKey));
      setLoading(false);
      return;
    }

    setLoading(true);

    const newHist = [trimmed, ...history.filter((h) => h !== trimmed)].slice(0, 20);
    setHistory(newHist);
    syncUserAccountData(bookmarks, newHist);

    try {
      const res = await fetch(`https://sbs-ape1.onrender.com/api/v1/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: trimmed, lang: 'th', mode }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.details || data.error || 'เกิดข้อผิดพลาดในการค้นหา');
      }
      searchCache.set(cacheKey, data);
      setSearchResult(data);
    } catch (e: any) {
      setSearchError(e.message || 'ไม่สามารถเชื่อมต่อระบบค้นหาได้ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setLoading(false);
    }
  };

  const handleOmniboxSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const val = omniboxInput.trim();
    if (!val) return;
    if (looksLikeUrl(val)) {
      openUrlPreview(val, true);
    } else {
      executeSearch(val, 'all');
    }
  };

  // Support direct URL opening / search from OS CLI or browser launch (e.g. sbs-browser https://... or ?q=...)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const urlParams = new URLSearchParams(window.location.search);
    const targetUrl = urlParams.get('url') || urlParams.get('openUrl');
    const targetQuery = urlParams.get('q') || urlParams.get('search');
    if (targetUrl) {
      openUrlPreview(targetUrl, true);
    } else if (targetQuery) {
      executeSearch(targetQuery, 'all');
    }
  }, [openUrlPreview]);


  const toggleBookmark = (item: { title: string; url: string; domain?: string; snippet?: string }) => {
    const exists = bookmarks.some((b) => b.url === item.url);
    let updated;
    if (exists) {
      updated = bookmarks.filter((b) => b.url !== item.url);
      showToast('ลบออกจากรายการที่บันทึกแล้ว');
    } else {
      const domain = item.domain || item.url.replace(/^https?:\/\//, '').split('/')[0];
      updated = [{ ...item, domain }, ...bookmarks];
      showToast(currentUser ? 'บันทึกลงบัญชี Shenwang เรียบร้อย' : 'บันทึกชั่วคราวในเซสชันนี้แล้ว');
    }
    setBookmarks(updated);
    syncUserAccountData(updated, history);
  };

  const runCrawlerSim = () => {
    setCrawling(true);
    setCrawlerLog([`[INIT] Connecting to seed URL: ${crawlerUrl}`]);
    setTimeout(() => {
      setCrawlerLog((prev) => [...prev, `[ROBOTS.TXT] Checking ${crawlerUrl}/robots.txt -> Allowed`]);
    }, 350);
    setTimeout(() => {
      setCrawlerLog((prev) => [...prev, `[FETCH] Downloading HTML document (200 OK)`]);
    }, 700);
    setTimeout(() => {
      setCrawlerLog((prev) => [...prev, `[PARSER] Extracting DOM tree, meta tags, and canonical links`]);
    }, 1050);
    setTimeout(() => {
      setCrawlerLog((prev) => [...prev, `[INDEX] Tokenizing Thai text & updating inverted index... Done`]);
      setCrawling(false);
    }, 1400);
  };

  const refreshDeveloperConsole = useCallback(async () => {
    setDevLoadingMeta(true);
    try {
      const [keysRes, logsRes] = await Promise.all([
        fetch(`https://sbs-ape1.onrender.com/api/v1/developer/keys`),
        fetch(`https://sbs-ape1.onrender.com/api/v1/developer/logs`),
      ]);
      const keysData = await keysRes.json();
      const logsData = await logsRes.json();
      if (Array.isArray(keysData.keys)) {
        setDevKeys(keysData.keys);
        if (keysData.keys.length > 0 && !keysData.keys.some((k: any) => k.key === apiKey)) {
          setApiKey(keysData.keys[0].key);
        }
      }
      if (Array.isArray(logsData.logs)) {
        setDevLogs(logsData.logs);
        setDevSummary({
          activeKeys: logsData.activeKeys ?? keysData.keys?.length ?? 1,
          totalRequests: logsData.totalRequests ?? 0,
          avgLatencyMs: logsData.avgLatencyMs ?? null,
        });
      }
    } catch {
      // Ignore transient error
    } finally {
      setDevLoadingMeta(false);
    }
  }, [apiKey]);

  useEffect(() => {
    if (activeTab === 'developer') {
      refreshDeveloperConsole();
    }
  }, [activeTab, refreshDeveloperConsole]);

  const generateNewKey = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    try {
      const res = await fetch(`https://sbs-ape1.onrender.com/api/v1/developer/keys`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(sessionToken ? { 'X-Shenwang-Session': sessionToken } : {}),
        },
        credentials: 'include',
        body: JSON.stringify({
          name: apiKeyName.trim() || `Project Key ${devKeys.length + 1}`,
          scope: apiKeyScope,
        }),
      });
      const data = await res.json();
      if (data.key) {
        setApiKey(data.key);
        setApiKeyName('');
        setRevealedKeys((prev) => ({ ...prev, [data.key]: true }));
        showToast('สร้าง API Key ใหม่สำเร็จ');
        refreshDeveloperConsole();
      }
    } catch {
      showToast('เกิดข้อผิดพลาดในการสร้าง API Key');
    }
  };

  const revokeApiKey = async (targetKey: string) => {
    try {
      const res = await fetch(`https://sbs-ape1.onrender.com/api/v1/developer/keys/${encodeURIComponent(targetKey)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || 'ไม่สามารถลบคีย์ได้');
        return;
      }
      showToast('เพิกถอน API Key เรียบร้อยแล้ว');
      refreshDeveloperConsole();
    } catch {
      showToast('เกิดข้อผิดพลาดในการลบคีย์');
    }
  };

  const testApiLive = async () => {
    setTestApiLoading(true);
    const t0 = performance.now();
    try {
      let res: Response;
      if (explorerEndpoint === 'search') {
        res = await fetch(`https://sbs-ape1.onrender.com/api/v1/search`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({ q: testQuery, lang: testLang, mode: testMode }),
        });
      } else if (explorerEndpoint === 'autocomplete') {
        res = await fetch(`https://sbs-ape1.onrender.com/api/v1/autocomplete?q=${encodeURIComponent(testQuery)}`, {
          headers: { Authorization: `Bearer ${apiKey}` },
        });
      } else {
        res = await fetch(`https://sbs-ape1.onrender.com/api/v1/trending`, {
          headers: { Authorization: `Bearer ${apiKey}` },
        });
      }
      const latency = Math.max(1, Math.round(performance.now() - t0));
      const data = await res.json();
      setTestApiStatus(res.status);
      setTestApiLatencyMs(latency);
      setTestApiResponse(data);
      refreshDeveloperConsole();
    } catch {
      setTestApiStatus(0);
      setTestApiLatencyMs(Math.max(1, Math.round(performance.now() - t0)));
      setTestApiResponse({ error: 'Network request failed' });
    } finally {
      setTestApiLoading(false);
    }
  };

  const copyToClipboard = (text: string, type: 'key' | 'code' | 'base' | 'json') => {
    navigator.clipboard.writeText(text);
    if (type === 'code') {
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
      showToast('คัดลอกโค้ดตัวอย่างแล้ว');
    } else if (type === 'base') {
      showToast('คัดลอก Base Endpoint แล้ว');
    } else if (type === 'json') {
      showToast('คัดลอก Response JSON แล้ว');
    } else {
      showToast('คัดลอก API Key แล้ว');
    }
  };

  const apiOrigin = typeof window !== 'undefined' ? window.location.origin : 'https://api.sbs-search.th';

  const codeSnippets = {
    curl:
      explorerEndpoint === 'search'
        ? `curl -X POST "${apiOrigin}/api/v1/search" \\
  -H "Authorization: Bearer ${apiKey}" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify({ q: testQuery, lang: testLang, mode: testMode })}'`
        : explorerEndpoint === 'autocomplete'
          ? `curl -X GET "${apiOrigin}/api/v1/autocomplete?q=${encodeURIComponent(testQuery)}" \\
  -H "Authorization: Bearer ${apiKey}"`
          : `curl -X GET "${apiOrigin}/api/v1/trending" \\
  -H "Authorization: Bearer ${apiKey}"`,
    ts:
      explorerEndpoint === 'search'
        ? `interface SbsSearchResponse {
  query: string;
  searchTime: string;
  totalResults: string;
  aiSummary: string;
  results: Array<{ title: string; url: string; domain: string; snippet: string }>;
}

const res = await fetch("${apiOrigin}/api/v1/search", {
  method: "POST",
  headers: {
    "Authorization": "Bearer ${apiKey}",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    q: ${JSON.stringify(testQuery)},
    lang: "${testLang}",
    mode: "${testMode}",
  }),
});

if (!res.ok) throw new Error(\`HTTP \${res.status}\`);
const data: SbsSearchResponse = await res.json();
console.log(data.results);`
        : `const res = await fetch("${apiOrigin}/api/v1/${explorerEndpoint}${explorerEndpoint === 'autocomplete' ? `?q=${encodeURIComponent(testQuery)}` : ''}", {
  headers: { "Authorization": "Bearer ${apiKey}" },
});
const data = await res.json();
console.log(data);`,
    js:
      explorerEndpoint === 'search'
        ? `const response = await fetch("${apiOrigin}/api/v1/search", {
  method: "POST",
  headers: {
    "Authorization": "Bearer ${apiKey}",
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    q: ${JSON.stringify(testQuery)},
    lang: "${testLang}",
    mode: "${testMode}"
  })
});
const data = await response.json();
console.log(data.results);`
        : `const response = await fetch("${apiOrigin}/api/v1/${explorerEndpoint}${explorerEndpoint === 'autocomplete' ? `?q=${encodeURIComponent(testQuery)}` : ''}");
const data = await response.json();
console.log(data);`,
    python:
      explorerEndpoint === 'search'
        ? `import requests

url = "${apiOrigin}/api/v1/search"
headers = {
    "Authorization": "Bearer ${apiKey}",
    "Content-Type": "application/json",
}
payload = {
    "q": ${JSON.stringify(testQuery)},
    "lang": "${testLang}",
    "mode": "${testMode}",
}

response = requests.post(url, json=payload, headers=headers, timeout=10)
response.raise_for_status()
print(response.json())`
        : `import requests

url = "${apiOrigin}/api/v1/${explorerEndpoint}"
headers = {"Authorization": "Bearer ${apiKey}"}
response = requests.get(url${explorerEndpoint === 'autocomplete' ? `, params={"q": ${JSON.stringify(testQuery)}}` : ''}, headers=headers, timeout=10)
print(response.json())`,
  };

  const activeUserColor = currentUser
    ? AVATAR_COLOR_MAP[currentUser.avatarColor] || AVATAR_COLOR_MAP.cobalt
    : AVATAR_COLOR_MAP.cobalt;
  const activeUserInitial = currentUser?.displayName?.trim().charAt(0).toUpperCase() || 'S';

  const currentUrlBookmarked = previewData ? bookmarks.some((b) => b.url === previewData.finalUrl) : false;

  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-[#141414] text-slate-900 dark:text-slate-100 transition-colors duration-200 selection:bg-blue-600 selection:text-white">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-2.5 border border-slate-700 dark:border-slate-300">
          <Check className="w-4 h-4 text-emerald-400 dark:text-emerald-600 shrink-0" />
          <span className="font-medium text-sm">{toastMessage}</span>
        </div>
      )}

      {/* UNIFIED TOP BAR — Hidden when on standalone Shenwang Account Portal (/account or /oauth/authorize) */}
      {activeTab === 'account' ? null : activeTab === 'preview' ? (
        <header className="sticky top-0 z-40 bg-[#dfe3e7] dark:bg-[#202124] border-b border-slate-300 dark:border-slate-800">
          <div className="px-2 sm:px-4 py-2 flex items-center gap-1.5 sm:gap-2">
            {/* Navigation controls */}
            <div className="flex items-center gap-0.5 shrink-0">
              <button
                onClick={handlePreviewBack}
                className="min-h-[40px] min-w-[36px] sm:min-w-[40px] flex items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10 text-slate-700 dark:text-slate-200 transition-colors"
                title="ย้อนกลับ"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <button
                onClick={handlePreviewForward}
                disabled={previewHistoryIdx >= previewHistory.length - 1}
                className="hidden sm:flex min-h-[40px] min-w-[40px] items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10 text-slate-700 dark:text-slate-200 disabled:opacity-30 transition-colors"
                title="ไปข้างหน้า"
              >
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                onClick={handlePreviewReload}
                className="min-h-[40px] min-w-[36px] sm:min-w-[40px] flex items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10 text-slate-700 dark:text-slate-200 transition-colors"
                title="โหลดใหม่"
              >
                <RotateCw className={`w-4 h-4 ${previewLoading ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={() => setActiveTab(searchResult ? 'search' : 'home')}
                className="hidden sm:flex min-h-[40px] min-w-[40px] items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10 text-slate-700 dark:text-slate-200 transition-colors"
                title="กลับไปหน้าค้นหา"
              >
                <Home className="w-4 h-4" />
              </button>
            </div>

            {/* Top URL Address Bar */}
            <form onSubmit={handleOmniboxSubmit} className="flex-1 min-w-0">
              <div className="flex items-center gap-2 bg-white dark:bg-[#2b2d30] rounded-full px-3 py-1.5 border border-slate-300/80 dark:border-slate-700 focus-within:ring-2 focus-within:ring-blue-500/60 shadow-xs">
                {omniboxInput.startsWith('https://') ? (
                  <Lock className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                ) : (
                  <Globe className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                )}
                <input
                  type="text"
                  value={omniboxInput}
                  onChange={(e) => setOmniboxInput(e.target.value)}
                  onFocus={(e) => e.target.select()}
                  placeholder="พิมพ์ URL หรือคำค้นหา..."
                  aria-label="แถบ URL"
                  className="w-full bg-transparent text-xs sm:text-sm text-slate-800 dark:text-slate-100 focus:outline-none font-mono truncate"
                />
                {previewData && (
                  <button
                    type="button"
                    onClick={() =>
                      toggleBookmark({
                        title: previewData.title,
                        url: previewData.finalUrl,
                        domain: previewData.domain,
                        snippet: previewData.reader.description,
                      })
                    }
                    className={`p-1 rounded-full transition-colors shrink-0 ${
                      currentUrlBookmarked ? 'text-amber-500' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'
                    }`}
                    title="บุ๊กมาร์กหน้านี้"
                  >
                    <Bookmark className="w-3.5 h-3.5" fill={currentUrlBookmarked ? 'currentColor' : 'none'} />
                  </button>
                )}
              </div>
            </form>

            {/* Right URL Viewer Actions (no Chrome member profile) */}
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setSettingsSubView('main');
                  setPendingWebReaderConsent(allowWebReaderToggle);
                  setShowSettingsModal(true);
                }}
                className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10 text-slate-700 dark:text-slate-200 transition-colors"
                title="ตั้งค่า"
              >
                <Settings className="w-4 h-4" />
              </button>
              <div className={`${allowWebReaderToggle ? 'hidden md:flex' : 'hidden'} items-center bg-black/5 dark:bg-white/10 rounded-full p-0.5 text-xs`}>
                <button
                  onClick={() => setPreviewViewMode('web')}
                  
                  className={`px-2.5 py-1 rounded-full font-medium whitespace-nowrap transition-colors ${
                    previewViewMode === 'web'
                      ? 'bg-white dark:bg-[#3c4043] text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-300 disabled:opacity-40'
                  }`}
                >
                  หน้าเว็บ
                </button>
                <button
                  onClick={() => setPreviewViewMode('reader')}
                  className={`px-2.5 py-1 rounded-full font-medium whitespace-nowrap transition-colors ${
                    previewViewMode === 'reader'
                      ? 'bg-white dark:bg-[#3c4043] text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  โหมดอ่าน
                </button>
              </div>

              {previewData && (
                <a
                  href={previewData.finalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-h-[40px] min-w-[36px] sm:min-w-[40px] flex items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10 text-slate-700 dark:text-slate-200 transition-colors"
                  title="เปิดในเบราว์เซอร์ของคุณ"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
              )}

              <button
                onClick={() => setActiveTab(searchResult ? 'search' : 'home')}
                className="min-h-[40px] min-w-[36px] sm:min-w-[40px] flex items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10 text-slate-700 dark:text-slate-200 transition-colors"
                title="ปิดพรีวิวกลับไปค้นหา"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {previewLoading && (
            <div className="h-0.5 w-full bg-blue-500/20 overflow-hidden">
              <div className="h-full w-1/2 bg-blue-600 animate-pulse" />
            </div>
          )}
        </header>
      ) : (
        <header
          className={`${
            activeTab === 'search' ? '' : 'sticky top-0'
          } z-40 px-4 sm:px-6 h-14 flex items-center justify-between border-b border-slate-100 dark:border-slate-800/80 bg-white/95 dark:bg-[#141414]/95 backdrop-blur-md`}
        >
          <div className="flex items-center gap-4">
            <button
              onClick={() => setActiveTab('home')}
              className="flex items-center gap-2 text-xl font-bold tracking-tight cursor-pointer whitespace-nowrap shrink-0"
            >
              <ShenwangEmblem className="w-6 h-6 shrink-0" />
              <span className="text-slate-900 dark:text-slate-100 font-bold text-base sm:text-lg">
                SBS Search
              </span>
            </button>
          </div>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <button
            onClick={() => setActiveTab('architecture')}
            className={`hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
              activeTab === 'architecture'
                ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>สถาปัตยกรรม</span>
          </button>

          <button
            onClick={() => setActiveTab('developer')}
            className={`hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
              activeTab === 'developer'
                ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Code2 className="w-3.5 h-3.5" />
            <span>Developer API</span>
          </button>

          <button
            onClick={() => setShowBookmarksDrawer(true)}
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors relative"
            title="รายการที่บันทึก"
          >
            <Bookmark className="w-4 h-4" />
            {bookmarks.length > 0 && (
              <span className="absolute top-2 right-2 w-2 h-2 bg-blue-600 rounded-full" />
            )}
          </button>

          <button
            onClick={() => setShowHistoryDrawer(true)}
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors"
            title="ประวัติการค้นหา"
          >
            <History className="w-4 h-4" />
          </button>

          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors"
            title="เปลี่ยนธีม"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
          </button>

          <PWAInstallButton compact onOpenPackagingModal={() => setShowPackagingModal(true)} />

          {/* Shenwang Account Trigger / Avatar Menu */}
          <div ref={accountMenuRef} className="relative">
            {currentUser ? (
              <button
                onClick={() => setShowAccountMenu((v) => !v)}
                className="flex items-center gap-2 pl-1 pr-2.5 py-1 rounded-full border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                title={`บัญชี Shenwang: ${currentUser.identifier}`}
              >
                <span
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${activeUserColor.bg}`}
                >
                  {activeUserInitial}
                </span>
                <span className="hidden sm:inline text-xs font-medium text-slate-700 dark:text-slate-200 max-w-[110px] truncate">
                  {currentUser.displayName}
                </span>
              </button>
            ) : (
              <button
                onClick={() => openAccountPortal('signin')}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs font-medium whitespace-nowrap transition-colors"
              >
                <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                <span>ลงชื่อเข้าใช้</span>
              </button>
            )}

            {/* Shenwang Account Popover Card */}
            {currentUser && showAccountMenu && (
              <div className="absolute right-0 mt-2 w-80 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#1c1c1e] shadow-xl p-4 z-50">
                <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 pb-3 border-b border-slate-200 dark:border-slate-800">
                  <div className="flex items-center gap-1.5 font-medium">
                    <ShenwangEmblem className="w-4 h-4" />
                    <span>Shenwang Account</span>
                  </div>
                  <button
                    onClick={() => setShowAccountMenu(false)}
                    className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="py-4 flex items-center gap-3">
                  <div
                    className={`w-12 h-12 rounded-2xl flex items-center justify-center text-lg font-bold shrink-0 ${activeUserColor.bg}`}
                  >
                    {activeUserInitial}
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold text-sm text-slate-900 dark:text-slate-100 truncate">
                      {currentUser.displayName}
                    </div>
                    <div className="text-xs font-mono text-slate-500 dark:text-slate-400 truncate">
                      {currentUser.identifier}
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5 pt-2 border-t border-slate-200 dark:border-slate-800">
                  <button
                    onClick={() => openAccountPortal('manage')}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-left text-xs font-medium transition-colors"
                  >
                    <UserCog className="w-4 h-4 text-blue-700 dark:text-blue-400" />
                    <span>จัดการบัญชี Shenwang ของคุณ</span>
                  </button>

                  <button
                    onClick={() => openAccountPortal('signin')}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-left text-xs font-medium transition-colors"
                  >
                    <UserPlus className="w-4 h-4 text-slate-500" />
                    <span>สลับบัญชี / เข้าสู่ระบบบัญชีอื่น</span>
                  </button>

                  <button
                    onClick={handleShenwangSignOut}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-red-50 dark:hover:bg-red-950/30 text-left text-xs font-medium text-red-600 dark:text-red-400 transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>ออกจากระบบ</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          <button
            onClick={() => setShowBurgerMenu(true)}
            className="md:hidden min-h-[40px] min-w-[40px] flex items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 transition-colors"
            title="เมนู"
          >
            <Menu className="w-5 h-5" />
          </button>
        </div>
      </header>
      )}

      {/* Burger Menu Drawer */}
      {showBurgerMenu && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex justify-end" onClick={() => setShowBurgerMenu(false)}>
          <div
            className="w-80 h-full p-6 flex flex-col shadow-2xl bg-white dark:bg-[#1c1c1e] border-l border-slate-200 dark:border-slate-800"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-200 dark:border-slate-800">
              <span className="font-bold text-base">SBS Search Menu</span>
              <button
                onClick={() => setShowBurgerMenu(false)}
                className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-1">
              <button
                onClick={() => {
                  window.open(window.location.href, "_blank");
                  setShowBurgerMenu(false);
                }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-left font-medium text-sm transition-colors"
              >
                <span className="text-sky-600 font-bold">+</span>
                <span>แท็บใหม่ (เปิดหน้าต่างใหม่)</span>
              </button>
              <button
                onClick={() => {
                  localStorage.removeItem("sbs_search_history");
                  setShowBurgerMenu(false);
                  alert("ลบข้อมูลประวัติการท่องเว็บในเบราว์เซอร์เรียบร้อยแล้ว");
                }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-left font-medium text-sm text-rose-600 transition-colors"
              >
                <span>🗑</span>
                <span>ลบข้อมูลการท่องเว็บ</span>
              </button>
              <button
                onClick={() => {
                  setActiveTab('home');
                  setShowBurgerMenu(false);
                }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-left font-medium text-sm transition-colors"
              >
                <Search className="w-4 h-4 text-blue-600" />
                <span>หน้าแรก</span>
              </button>

              <button
                onClick={() => openAccountPortal(currentUser ? 'manage' : 'signin')}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-left font-medium text-sm transition-colors"
              >
                <ShieldCheck className="w-4 h-4 text-blue-700" />
                <span>{currentUser ? `บัญชี: ${currentUser.displayName}` : 'ลงชื่อเข้าใช้ Shenwang Account'}</span>
              </button>

              <button
                onClick={() => {
                  setActiveTab('architecture');
                  setShowBurgerMenu(false);
                }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-left font-medium text-sm transition-colors"
              >
                <Layers className="w-4 h-4 text-indigo-500" />
                <span>สถาปัตยกรรมระบบ 5 ส่วน</span>
              </button>

              <button
                onClick={() => {
                  setActiveTab('developer');
                  setShowBurgerMenu(false);
                }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-left font-medium text-sm transition-colors"
              >
                <Code2 className="w-4 h-4 text-blue-500" />
                <span>Developer API & Playground</span>
              </button>

              <button
                onClick={() => {
                  setShowBookmarksDrawer(true);
                  setShowBurgerMenu(false);
                }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-left font-medium text-sm transition-colors"
              >
                <Bookmark className="w-4 h-4 text-pink-500" />
                <span>หน้าที่บันทึกไว้ ({bookmarks.length})</span>
              </button>

              <button
                onClick={() => {
                  setShowHistoryDrawer(true);
                  setShowBurgerMenu(false);
                }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-left font-medium text-sm transition-colors"
              >
                <History className="w-4 h-4 text-amber-500" />
                <span>ประวัติการค้นหา</span>
              </button>

              <button
                onClick={() => {
                  setShowPackagingModal(true);
                  setShowBurgerMenu(false);
                }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-left font-medium text-sm transition-colors"
              >
                <Download className="w-4 h-4 text-emerald-600" />
                <span>โหลดแอพ (.EXE / .APK / .AAB)</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MAIN CONTENT */}
      <main className="flex-1 flex flex-col">
      <div className="w-full max-w-4xl mx-auto px-4 pt-4 pb-2">
        <div className="gcse-searchresults-only" data-queryParameterName="q"></div>
      </div>
        {/* URL BAR + WEBPAGE RENDER PREVIEW VIEWPORT */}
        {activeTab === 'preview' && (
          <div className="flex-1 flex flex-col min-h-0 bg-white dark:bg-[#141414]">
            {previewData && (
              <div className="md:hidden px-3 py-1.5 bg-slate-100 dark:bg-[#1e1f22] border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <img src={previewData.favicon} alt="" className="w-4 h-4 rounded-xs shrink-0" />
                  <span className="font-medium truncate text-slate-700 dark:text-slate-200">
                    {previewData.title}
                  </span>
                </div>
                <div className={`${allowWebReaderToggle ? 'flex' : 'hidden'} items-center gap-1 shrink-0 ml-2`}>
                  <button
                    onClick={() => setPreviewViewMode('web')}
                    
                    className={`px-2 py-0.5 rounded font-medium ${
                      previewViewMode === 'web'
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-600 dark:text-slate-400 disabled:opacity-40'
                    }`}
                  >
                    เว็บ
                  </button>
                  <button
                    onClick={() => setPreviewViewMode('reader')}
                    className={`px-2 py-0.5 rounded font-medium ${
                      previewViewMode === 'reader'
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    อ่าน
                  </button>
                </div>
              </div>
            )}

            {previewLoading && !previewData ? (
              <div className="flex-1 flex flex-col items-center justify-center p-6 sm:p-10 text-center max-w-md mx-auto">
                <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mb-3" />
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
                  กำลังเปิดหน้าเว็บ...
                </p>
                <p className="text-xs font-mono text-slate-400 truncate max-w-full mb-4">{omniboxInput}</p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handlePreviewBack}
                    className="px-3.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    ย้อนกลับ
                  </button>
                  {omniboxInput && (
                    <a
                      href={normalizeUrlInput(omniboxInput)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium inline-flex items-center gap-1.5"
                    >
                      <span>เปิดในเบราว์เซอร์ทันที</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              </div>
            ) : previewData ? (
              previewViewMode === 'web' ? (
                <div className="flex-1 relative min-h-[calc(100vh-3.5rem)] bg-white">
                  {typeof window !== "undefined" && (navigator.userAgent.includes("SBSDesktop") || navigator.userAgent.toLowerCase().includes("electron")) ? (
  // @ts-ignore
  <webview
    key={`${previewData.finalUrl}_${previewReloadKey}`}
    src={previewData.finalUrl}
    className="w-full h-[calc(100vh-3.5rem)] border-0 bg-white block"
    allowpopups="true"
  />
) : /youtube\.com|youtu\.be|google\.com|github\.com|facebook\.com|instagram\.com|tiktok\.com|twitter\.com|x\.com/i.test(previewData.finalUrl) ? (
  <iframe
    key={`proxy_${previewData.finalUrl}_${previewReloadKey}`}
    title={previewData.title}
    src={`https://sbs-ape1.onrender.com/api/v1/proxy?url=${encodeURIComponent(previewData.finalUrl)}`}
    className="w-full h-[calc(100vh-3.5rem)] border-0 bg-white block"
  />
) : (
  <iframe
    key={`${previewData.finalUrl}_${previewReloadKey}`}
    title={previewData.title}
    src={previewData.finalUrl}
    className="w-full h-[calc(100vh-3.5rem)] border-0 bg-white block"
  />
)}
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-8 max-w-3xl w-full mx-auto">
                  {previewData.blockedReason && (
                    <div className="mb-6 p-3.5 rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50/70 dark:bg-amber-950/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-start gap-2.5 text-xs text-amber-800 dark:text-amber-200">
                        <BookOpen className="w-4 h-4 shrink-0 mt-0.5" />
                        <span>{previewData.blockedReason}</span>
                      </div>
                      <a
                        href={previewData.finalUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium whitespace-nowrap inline-flex items-center gap-1.5 self-start sm:self-auto"
                      >
                        <span>เปิดหน้าเว็บจริง</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  )}

                  <div className="flex items-center gap-2.5 mb-3">
                    <img src={previewData.favicon} alt="" className="w-5 h-5 rounded-sm" />
                    <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      {previewData.domain}
                    </span>
                  </div>

                  <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100 mb-3 leading-snug">
                    {previewData.reader.title || previewData.title}
                  </h1>

                  {previewData.reader.description && (
                    <p className="text-base text-slate-600 dark:text-slate-300 mb-6 leading-relaxed">
                      {previewData.reader.description}
                    </p>
                  )}

                  {previewData.reader.ogImage && (
                    <div className="mb-6 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 max-h-80">
                      <img
                        src={previewData.reader.ogImage}
                        alt={previewData.title}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}

                  {previewData.reader.aiSummary && (
                    <div className="mb-6 p-5 rounded-2xl border border-blue-200 dark:border-blue-900/40 bg-blue-50/50 dark:bg-blue-950/20">
                      <div className="flex items-center gap-2 text-xs font-semibold text-blue-600 dark:text-blue-400 mb-2">
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>สรุปเนื้อหาจากหน้าเว็บ</span>
                      </div>
                      <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed whitespace-pre-line">
                        {previewData.reader.aiSummary}
                      </p>
                    </div>
                  )}

                  {previewData.reader.blocks.length > 0 && (
                    <div className="space-y-4 mb-8">
                      {previewData.reader.blocks.map((block, idx) =>
                        block.tag.startsWith('h') ? (
                          <h2 key={idx} className="text-lg font-semibold text-slate-900 dark:text-slate-100 pt-2">
                            {block.text}
                          </h2>
                        ) : (
                          <p key={idx} className="text-sm sm:text-base text-slate-700 dark:text-slate-300 leading-relaxed">
                            {block.text}
                          </p>
                        )
                      )}
                    </div>
                  )}

                  {previewData.reader.links.length > 0 && (
                    <div className="border-t border-slate-200 dark:border-slate-800 pt-6">
                      <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-3">
                        ลิงก์ภายในหน้าเว็บนี้
                      </h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {previewData.reader.links.map((lnk, i) => (
                          <button
                            key={i}
                            onClick={() => openUrlPreview(lnk.url, true)}
                            className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-blue-500/50 text-left text-xs text-blue-600 dark:text-blue-400 hover:underline truncate"
                          >
                            {lnk.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            ) : null}
          </div>
        )}
        {/* STANDALONE SHENWANG ACCOUNT PORTAL VIEW (/account, /account/register, /oauth/authorize) */}
        {activeTab === 'account' && (
          <ShenwangAccountPortal
            currentUser={currentUser}
            authMode={authMode}
            setAuthMode={(nextMode) => {
              setAuthMode(nextMode);
              if (!oauthRequest) {
                const nextPath =
                  nextMode === 'register'
                    ? '/account/register'
                    : nextMode === 'manage'
                      ? '/account/manage'
                      : '/account';
                pushBrowserPath(nextPath);
              }
            }}
            sessionToken={sessionToken}
            bookmarksCount={bookmarks.length}
            historyCount={history.length}
            oauthRequest={oauthRequest}
            onOAuthComplete={handleOAuthComplete}
            onOAuthCancel={() => exitAccountPortalTo(searchResult ? 'search' : 'home')}
            onStartDemoSso={startDemoSsoFlow}
            onAuthenticated={handleShenwangAuthenticated}
            onProfileUpdated={(updatedUser) => setCurrentUser(updatedUser)}
            onSignOut={handleShenwangSignOut}
            onOpenBookmarks={() => {
              exitAccountPortalTo('home');
              setShowBookmarksDrawer(true);
            }}
            onOpenHistory={() => {
              exitAccountPortalTo('home');
              setShowHistoryDrawer(true);
            }}
            onOpenDeveloper={() => exitAccountPortalTo('developer')}
            onBackToSearch={() => exitAccountPortalTo(searchResult ? 'search' : 'home')}
            showToast={showToast}
          />
        )}

        {/* HOME VIEW */}
        {activeTab === 'home' && (
          <div className="flex-1 flex flex-col justify-center max-w-2xl w-full mx-auto px-4 py-12 sm:py-20">
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center mb-3">
                <ShenwangEmblem className="w-11 h-11" />
              </div>
              <h1 className="text-5xl sm:text-6xl font-bold tracking-tight select-none">
                <span className="text-blue-700 dark:text-blue-400">SBS</span>
                <span className="text-slate-800 dark:text-slate-100 ml-2.5 font-semibold">Search</span>
              </h1>
              <p className="text-slate-500 dark:text-slate-400 text-sm mt-2.5">
                เอนจินค้นหาข้อมูลจริงจากเว็บทั่วโลก พร้อมระบบบัญชีอิสระ Shenwang Account
              </p>
            </div>

            {/* Google-style Omnibox Search Input */}
            <div ref={searchContainerRef} className="relative w-full mb-7">
              <div className="flex items-center rounded-full px-4 py-3 bg-white dark:bg-[#1e1f22] border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md focus-within:shadow-md focus-within:border-blue-500 transition-all">
                <Search className="w-5 h-5 text-slate-400 mr-3 shrink-0" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setShowAutocomplete(true);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && query.trim()) {
                      executeSearch(query, 'all');
                    }
                  }}
                  onFocus={() => setShowAutocomplete(true)}
                  placeholder="ค้นหาบนเว็บ ข่าวสาร รูปภาพ หรือหัวข้อที่สนใจ..."
                  className="w-full bg-transparent text-base focus:outline-none placeholder-slate-400"
                />
                {query && (
                  <button
                    onClick={() => setQuery('')}
                    className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 mr-1"
                    title="ล้างข้อความ"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={() => executeSearch(query || 'Google', 'all')}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-full font-medium text-sm transition-colors shrink-0 ml-1 whitespace-nowrap"
                >
                  ค้นหา
                </button>
              </div>

              {/* Autocomplete Dropdown */}
              {showAutocomplete && autocomplete.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-2 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1e1f22] overflow-hidden z-30">
                  {autocomplete.map((item, idx) => (
                    <button
                      key={idx}
                      onClick={() => executeSearch(item, 'all')}
                      className="w-full px-5 py-2.5 flex items-center gap-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/80 transition-colors"
                    >
                      <Search className="w-4 h-4 text-slate-400 shrink-0" />
                      <span className="text-sm text-slate-700 dark:text-slate-200 truncate">{item}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Trending Searches */}
            {trending.length > 0 && (
              <div className="flex flex-wrap items-center justify-center gap-2">
                {trending.map((t, idx) => (
                  <button
                    key={idx}
                    onClick={() => executeSearch(t.query, 'all')}
                    className="px-3.5 py-1.5 rounded-lg text-xs font-medium bg-slate-50 dark:bg-[#1e1f22] border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-blue-500/50 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                  >
                    {t.query}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* SEARCH RESULTS VIEW (Google-like SERP) */}
        {activeTab === 'search' && (
          <div className="max-w-6xl w-full mx-auto px-4 sm:px-6 pb-16">
            {/* Search Top Bar & Horizontal Mode Tabs */}
            <div className="sticky top-0 z-30 pt-3 pb-2 bg-white/95 dark:bg-[#141414]/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 mb-5">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-3">
                <div ref={searchContainerRef} className="relative flex-1 max-w-2xl">
                  <div className="flex items-center rounded-full px-4 py-2 bg-white dark:bg-[#1e1f22] border border-slate-300 dark:border-slate-700 shadow-xs focus-within:border-blue-500">
                    <Search className="w-4 h-4 text-slate-400 mr-2.5 shrink-0" />
                    <input
                      type="text"
                      value={query}
                      onChange={(e) => {
                        setQuery(e.target.value);
                        setShowAutocomplete(true);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') executeSearch(query, searchMode);
                      }}
                      placeholder="ค้นหา หรือพิมพ์ URL..."
                      className="w-full bg-transparent text-sm focus:outline-none"
                    />
                    {query && (
                      <button
                        onClick={() => setQuery('')}
                        className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={() => executeSearch(query, searchMode)}
                      className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 shrink-0 ml-2 px-2 py-1"
                    >
                      ค้นหา
                    </button>
                  </div>

                  {showAutocomplete && autocomplete.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1.5 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1e1f22] overflow-hidden z-40">
                      {autocomplete.map((item, idx) => (
                        <button
                          key={idx}
                          onClick={() => executeSearch(item, searchMode)}
                          className="w-full px-4 py-2 flex items-center gap-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800 text-sm"
                        >
                          <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="truncate">{item}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Single-row Google-like Filter Tabs */}
              <div className="flex items-center gap-4 sm:gap-6 overflow-x-auto no-scrollbar">
                {[
                  { id: 'all', label: 'ทั้งหมด', icon: Globe },
                  { id: 'web', label: 'เว็บ', icon: Search },
                  { id: 'images', label: 'รูปภาพ', icon: ImageIcon },
                  { id: 'news', label: 'ข่าวสาร', icon: Newspaper },
                  { id: 'video', label: 'วิดีโอ', icon: Video },
                ].map((tab) => {
                  const Icon = tab.icon;
                  const active = searchMode === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => executeSearch(query, tab.id as SearchMode)}
                      className={`flex items-center gap-1.5 pb-2 border-b-2 text-xs sm:text-sm font-medium whitespace-nowrap transition-colors ${
                        active
                          ? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
                          : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span>{tab.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {loading ? (
              <div className="space-y-5 max-w-2xl py-4">
                {[1, 2, 3, 4].map((n) => (
                  <div key={n} className="animate-pulse space-y-2">
                    <div className="h-3 w-44 bg-slate-200 dark:bg-slate-800 rounded" />
                    <div className="h-5 w-3/4 bg-slate-200 dark:bg-slate-800 rounded" />
                    <div className="h-3.5 w-full bg-slate-100 dark:bg-slate-800/70 rounded" />
                    <div className="h-3.5 w-5/6 bg-slate-100 dark:bg-slate-800/70 rounded" />
                  </div>
                ))}
              </div>
            ) : searchError ? (
              <div className="max-w-xl p-6 rounded-2xl border border-red-200 dark:border-red-900/50 bg-red-50/50 dark:bg-red-950/20">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-semibold text-sm text-red-900 dark:text-red-200">ไม่สามารถค้นหาได้</h3>
                    <p className="text-sm text-red-700 dark:text-red-300 mt-1">{searchError}</p>
                    <button
                      onClick={() => executeSearch(query, searchMode)}
                      className="mt-3 px-4 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-medium"
                    >
                      ลองค้นหาอีกครั้ง
                    </button>
                  </div>
                </div>
              </div>
            ) : searchResult ? (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* Main Organic Results Column */}
                <div className="lg:col-span-8 space-y-6">
                  <div className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                    {searchResult.totalResults} ({searchResult.searchTime} วินาที)
                  </div>

                  {/* AI Overview (Compact, collapsible feel) */}
                  {searchResult.aiSummary && (searchMode === 'all' || searchMode === 'web') && (
                    <div className="p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#1a1b1e]">
                      <div className="flex items-center gap-2 mb-2 text-blue-600 dark:text-blue-400 font-semibold text-xs uppercase tracking-wide">
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>สรุปข้อมูลจากผลการค้นหา</span>
                      </div>
                      <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed whitespace-pre-line">
                        {searchResult.aiSummary}
                      </p>
                    </div>
                  )}

                  {/* Mode-specific Rendering (Opens with Top URL Bar + Webpage Render Below) */}
                  {searchMode === 'images' ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                      {(searchResult.images || []).map((img: any, idx: number) => (
                        <button
                          key={idx}
                          onClick={() => openUrlPreview(img.pageUrl || img.imageUrl, true)}
                          className="group text-left rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#1a1b1e] hover:shadow-md transition-all"
                        >
                          <div className="aspect-video bg-slate-100 dark:bg-slate-900 overflow-hidden flex items-center justify-center">
                            {img.imageUrl ? (
                              <img
                                src={img.imageUrl}
                                alt={img.title}
                                referrerPolicy="no-referrer"
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                              />
                            ) : (
                              <div className="flex flex-col items-center gap-1.5 text-slate-400 p-4">
                                <img
                                  src={getFaviconUrl(img.source || 'google.com')}
                                  alt=""
                                  className="w-8 h-8 rounded"
                                />
                                <span className="text-xs font-medium truncate max-w-full">{img.source}</span>
                              </div>
                            )}
                          </div>
                          <div className="p-3">
                            <p className="text-xs font-medium text-slate-800 dark:text-slate-100 line-clamp-1 group-hover:text-blue-600 dark:group-hover:text-blue-400">
                              {img.title}
                            </p>
                            <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate block mt-0.5">
                              {img.source}
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : searchMode === 'news' ? (
                    <div className="divide-y divide-slate-200 dark:divide-slate-800 border-t border-b border-slate-200 dark:border-slate-800">
                      {(searchResult.news || []).map((item: any, idx: number) => (
                        <div key={idx} className="py-4">
                          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mb-1">
                            <img
                              src={getFaviconUrl(item.source || item.url)}
                              alt=""
                              className="w-4 h-4 rounded-sm"
                            />
                            <span className="font-medium text-slate-700 dark:text-slate-300">{item.source}</span>
                            <span>•</span>
                            <span>{item.time}</span>
                          </div>
                          <button
                            onMouseEnter={() => prefetchPreview(item.url)}
                            onTouchStart={() => prefetchPreview(item.url)}
                            onClick={() => openUrlPreview(item.url, true)}
                            className="text-left block group"
                          >
                            <h3 className="text-base sm:text-lg font-medium text-[#1a0dab] dark:text-[#8ab4f8] group-hover:underline">
                              {item.title}
                            </h3>
                          </button>
                          <p className="text-sm text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                            {item.snippet}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : searchMode === 'video' ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {(searchResult.videos || []).map((vid: any, idx: number) => (
                        <button
                          key={idx}
                          onClick={() => openUrlPreview(vid.url, true)}
                          className="text-left rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#1a1b1e] hover:border-blue-500/50 transition-all group"
                        >
                          <div className="aspect-video bg-slate-900 relative flex items-center justify-center">
                            <div className="w-12 h-12 rounded-full bg-white/15 backdrop-blur-xs flex items-center justify-center group-hover:scale-110 transition-transform">
                              <Play className="w-5 h-5 text-white ml-0.5" fill="currentColor" />
                            </div>
                            {vid.duration && (
                              <span className="absolute bottom-2 right-2 bg-black/80 text-white text-[11px] px-2 py-0.5 rounded font-mono">
                                {vid.duration}
                              </span>
                            )}
                          </div>
                          <div className="p-3.5">
                            <h4 className="font-medium text-sm text-slate-900 dark:text-slate-100 line-clamp-2 group-hover:text-blue-600 dark:group-hover:text-blue-400">
                              {vid.title}
                            </h4>
                            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mt-1.5">
                              <span>{vid.channel}</span>
                              <span>{vid.views}</span>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    /* Standard Google-Style Organic Results */
                    <div className="space-y-6">
                      {(searchResult.results || []).map((item: SearchResultItem, idx: number) => {
                        const isBookmarked = bookmarks.some((b) => b.url === item.url);
                        return (
                          <article key={idx} className="group">
                            {/* Site Favicon + Name + Breadcrumb URL */}
                            <div className="flex items-center gap-2.5 mb-1">
                              <div className="w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center overflow-hidden shrink-0">
                                <img
                                  src={getFaviconUrl(item.domain)}
                                  alt=""
                                  className="w-4 h-4 object-contain"
                                />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="text-xs font-medium text-slate-800 dark:text-slate-200 truncate">
                                  {item.domain}
                                </div>
                                <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                                  {item.breadcrumb || item.url}
                                </div>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  onClick={() => toggleBookmark(item)}
                                  className={`p-1.5 rounded-full transition-colors ${
                                    isBookmarked
                                      ? 'text-blue-600 dark:text-blue-400'
                                      : 'text-slate-400 opacity-0 group-hover:opacity-100 hover:bg-slate-100 dark:hover:bg-slate-800'
                                  }`}
                                  title="บันทึกหน้านี้"
                                >
                                  <Bookmark className="w-4 h-4" fill={isBookmarked ? 'currentColor' : 'none'} />
                                </button>
                                <a
                                  href={item.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="p-1.5 rounded-full text-slate-400 opacity-0 group-hover:opacity-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                  title="เปิดในเบราว์เซอร์ภายนอก"
                                >
                                  <ExternalLink className="w-3.5 h-3.5" />
                                </a>
                              </div>
                            </div>

                            {/* Blue Clickable Headline -> Opens Top URL Bar + Bottom Webpage Preview */}
                            <button
                              onMouseEnter={() => prefetchPreview(item.url)}
                              onTouchStart={() => prefetchPreview(item.url)}
                              onClick={() => openUrlPreview(item.url, true)}
                              className="text-left block group/link"
                            >
                              <h3 className="text-lg sm:text-xl font-medium text-[#1a0dab] dark:text-[#8ab4f8] group-hover/link:underline leading-snug">
                                {item.title}
                              </h3>
                            </button>

                            {/* Snippet */}
                            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed mt-1">
                              {item.publishedDate && (
                                <span className="text-slate-500 dark:text-slate-400 mr-1.5">
                                  {item.publishedDate} —
                                </span>
                              )}
                              {item.snippet}
                            </p>
                          </article>
                        );
                      })}
                    </div>
                  )}

                  {/* People Also Search For (Google-style clean cards + hover thumbnails/icons) */}
                  {searchResult.peopleAlsoSearch && searchResult.peopleAlsoSearch.length > 0 && (
                    <section className="pt-4 border-t border-slate-200 dark:border-slate-800">
                      <h4 className="font-semibold text-base mb-3 text-slate-900 dark:text-slate-100">
                        ผู้คนยังค้นหา (People also search for)
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {searchResult.peopleAlsoSearch.map((card: any, idx: number) => (
                          <button
                            key={idx}
                            onClick={() => executeSearch(card.title, 'all')}
                            className="group flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#1a1b1e] hover:bg-slate-100 dark:hover:bg-slate-800/80 hover:border-blue-500/40 transition-all text-left"
                          >
                            <div className="min-w-0">
                              <span className="text-sm font-medium text-slate-800 dark:text-slate-200 group-hover:text-blue-600 dark:group-hover:text-blue-400 block truncate">
                                {card.title}
                              </span>
                              {card.category && (
                                <span className="text-[11px] text-slate-500 dark:text-slate-400 block truncate">
                                  {card.category}
                                </span>
                              )}
                            </div>
                            <Search className="w-4 h-4 text-slate-400 group-hover:text-blue-500 group-hover:translate-x-0.5 transition-all shrink-0" />
                          </button>
                        ))}
                      </div>
                    </section>
                  )}
                </div>

                {/* Right Sidebar: Knowledge Panel & Related Queries */}
                <aside className="lg:col-span-4 space-y-5">
                  {searchResult.knowledgePanel && searchResult.knowledgePanel.title && (
                    <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#1a1b1e]">
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div>
                          <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                            {searchResult.knowledgePanel.title}
                          </h3>
                          {searchResult.knowledgePanel.subtitle && (
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                              {searchResult.knowledgePanel.subtitle}
                            </p>
                          )}
                        </div>
                        {searchResult.knowledgePanel.officialUrl && (
                          <img
                            src={getFaviconUrl(searchResult.knowledgePanel.officialUrl)}
                            alt=""
                            className="w-8 h-8 rounded-lg border border-slate-200 dark:border-slate-700 p-1 bg-white shrink-0"
                          />
                        )}
                      </div>

                      {searchResult.knowledgePanel.description && (
                        <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed mb-4">
                          {searchResult.knowledgePanel.description}
                        </p>
                      )}

                      {Array.isArray(searchResult.knowledgePanel.facts) &&
                        searchResult.knowledgePanel.facts.length > 0 && (
                          <dl className="space-y-2 border-t border-slate-200 dark:border-slate-800 pt-3 text-xs">
                            {searchResult.knowledgePanel.facts.map((fact: any, i: number) => (
                              <div key={i} className="flex justify-between gap-3">
                                <dt className="font-semibold text-slate-700 dark:text-slate-300 shrink-0">
                                  {fact.label}:
                                </dt>
                                <dd className="text-slate-600 dark:text-slate-400 text-right">{fact.value}</dd>
                              </div>
                            ))}
                          </dl>
                        )}

                      {searchResult.knowledgePanel.officialUrl && (
                        <button
                          onClick={() => openUrlPreview(searchResult.knowledgePanel.officialUrl, true)}
                          className="mt-4 w-full py-2 px-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium text-blue-600 dark:text-blue-400 flex items-center justify-center gap-1.5 transition-colors"
                        >
                          <Globe className="w-3.5 h-3.5" />
                          <span>เปิดเว็บไซต์ทางการ</span>
                        </button>
                      )}
                    </div>
                  )}

                  {searchResult.relatedQueries && searchResult.relatedQueries.length > 0 && (
                    <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#1a1b1e]">
                      <h4 className="font-semibold text-sm mb-3">คำค้นหาที่เกี่ยวข้อง</h4>
                      <div className="space-y-1">
                        {searchResult.relatedQueries.map((rq: string, idx: number) => (
                          <button
                            key={idx}
                            onClick={() => executeSearch(rq, 'all')}
                            className="w-full text-left text-sm text-blue-600 dark:text-blue-400 hover:underline py-1.5 flex items-center justify-between gap-2"
                          >
                            <span className="truncate">{rq}</span>
                            <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </aside>
              </div>
            ) : null}
          </div>
        )}

        {/* ARCHITECTURE & 5 CORE SYSTEMS VIEW */}
        {activeTab === 'architecture' && (
          <div className="max-w-5xl w-full mx-auto px-4 sm:px-8 py-10">
            <div className="mb-8">
              <h1 className="text-2xl sm:text-3xl font-bold mb-2">
                โครงสร้างและสถาปัตยกรรมระบบ Search Engine & Shenwang Identity 5 ส่วน
              </h1>
              <p className="text-slate-500 dark:text-slate-400 text-sm max-w-3xl">
                อธิบายหน้าที่ของเอนจินค้นหาและระบบบัญชีอิสระ Shenwang Account โดยปล่อยให้การเปิดหน้าเว็บเป็นหน้าที่ของเบราว์เซอร์หลักของผู้ใช้
              </p>
            </div>

            <div className="flex flex-wrap gap-2 mb-6 border-b pb-4 border-slate-200 dark:border-slate-800">
              {[
                { id: 'crawler', label: '1. Crawler/Spider', icon: Globe },
                { id: 'indexer', label: '2. Indexer & Tokenizer', icon: Database },
                { id: 'ranking', label: '3. Ranking Algorithm', icon: Cpu },
                { id: 'rendering', label: '4. Shenwang Identity', icon: ShieldCheck },
                { id: 'ui', label: '5. Search UI & REST API', icon: Terminal },
              ].map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveArchTab(tab.id as any)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-medium transition-colors ${
                      activeArchTab === tab.id
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-100 dark:bg-[#1e1f22] text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#1a1b1e]">
              {activeArchTab === 'crawler' && (
                <div className="space-y-5">
                  <div>
                    <h2 className="text-xl font-bold mb-2">1. ระบบรวบรวมข้อมูล (Crawler / Spider)</h2>
                    <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                      ทำหน้าที่ท่องไปในอินเทอร์เน็ตผ่านลิงก์เพื่อดาวน์โหลดหน้าเว็บ ตรวจสอบกฎ Robots.txt และจัดคิว URL Frontier (นิยมใช้ Go, Rust หรือ Scrapy + Redis)
                    </p>
                  </div>
                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#141414] border border-slate-200 dark:border-slate-800 space-y-3">
                    <h4 className="font-semibold text-sm">จำลองการทำงาน Crawler</h4>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        type="text"
                        value={crawlerUrl}
                        onChange={(e) => setCrawlerUrl(e.target.value)}
                        className="flex-1 px-3 py-2 rounded-lg text-xs font-mono border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#1e1f22]"
                      />
                      <button
                        onClick={runCrawlerSim}
                        disabled={crawling}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-xs font-medium whitespace-nowrap"
                      >
                        {crawling ? 'กำลังทำงาน...' : 'เริ่มจำลอง Crawl'}
                      </button>
                    </div>
                    {crawlerLog.length > 0 && (
                      <pre className="p-3 rounded-lg bg-slate-950 text-emerald-400 font-mono text-[11px] overflow-x-auto">
                        {crawlerLog.join('\n')}
                      </pre>
                    )}
                  </div>
                </div>
              )}
              {activeArchTab === 'indexer' && (
                <div className="space-y-3">
                  <h2 className="text-xl font-bold">2. ระบบจัดทำดัชนี (Indexer & Thai Tokenizer)</h2>
                  <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                    แยกวิเคราะห์ HTML ตัดคำภาษาไทย (เช่น PyThaiNLP / NewMM / ICU) และจัดเก็บลงโครงสร้าง Inverted Index เพื่อค้นหาคำสำคัญได้ในระดับมิลลิวินาที (นิยมใช้ Elasticsearch, Meilisearch, Tantivy)
                  </p>
                </div>
              )}
              {activeArchTab === 'ranking' && (
                <div className="space-y-3">
                  <h2 className="text-xl font-bold">3. อัลกอริทึมการจัดอันดับ (Ranking Algorithm)</h2>
                  <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                    ประเมินความเกี่ยวข้องด้วย BM25, PageRank และ Semantic Vector Embeddings ผสานสัญญาณความสดใหม่ของข้อมูลเพื่อเรียงลำดับผลลัพธ์ที่ตรงใจผู้ใช้ที่สุด
                  </p>
                </div>
              )}
              {activeArchTab === 'rendering' && (
                <div className="space-y-3">
                  <h2 className="text-xl font-bold">4. ระบบยืนยันตัวตนอิสระ (Shenwang Account & Sync)</h2>
                  <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                    แยกบัญชีผู้ใช้ออกจากเบราว์เซอร์ภายนอกโดยสมบูรณ์ ใช้การเข้ารหัสรหัสผ่านด้วย Scrypt และ Session Token เพื่อซิงค์ประวัติการค้นหา บุ๊กมาร์ก และสิทธิ์ API Key บนเบราว์เซอร์ใดก็ได้โดยไม่ทิ้งข้อมูลสมาชิกไว้บนเครื่อง
                  </p>
                </div>
              )}
              {activeArchTab === 'ui' && (
                <div className="space-y-3">
                  <h2 className="text-xl font-bold">5. ส่วนติดต่อผู้ใช้ (Search UI & REST API)</h2>
                  <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                    อินเทอร์เฟซค้นหาที่เปิดผลลัพธ์ไปยังเบราว์เซอร์หลักของผู้ใช้โดยตรง พร้อมแพลตฟอร์ม Developer REST API ความหน่วงต่ำ
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* DEVELOPER API PLATFORM CONSOLE */}
        {activeTab === 'developer' && (
          <div className="max-w-7xl w-full mx-auto px-4 sm:px-6 py-8">
            {/* Workspace Header with Breadcrumb & Base Endpoint */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-6 border-b border-slate-200 dark:border-slate-800 mb-6">
              <div>
                <div className="text-xs text-slate-500 dark:text-slate-400 font-medium mb-1">
                  SBS Platform / Search API / Developer Console
                </div>
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                  SBS Search API Platform
                </h1>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                  แพลตฟอร์ม REST API สำหรับค้นหาข้อมูลเว็บแบบเรียลไทม์ จัดการคีย์ยืนยันตัวตน และตรวจสอบ Request Logs
                </p>
              </div>

              <div className="flex items-center gap-2 bg-slate-50 dark:bg-[#1a1b1e] border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5 self-start lg:self-auto max-w-full">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 shrink-0">
                  Base URL
                </span>
                <code className="text-xs font-mono text-slate-800 dark:text-slate-200 truncate">
                  {apiOrigin}/api/v1
                </code>
                <button
                  onClick={() => copyToClipboard(`${apiOrigin}/api/v1`, 'base')}
                  className="p-1.5 rounded-lg hover:bg-slate-200/70 dark:hover:bg-slate-800 text-slate-500 shrink-0"
                  title="คัดลอก Base URL"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Real Telemetry Summary Strip (Flat hairline cards + tabular numerals) */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#1a1b1e]">
                <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-1.5">
                  <span>Active API Keys</span>
                  <KeyRound className="w-4 h-4 text-slate-400" />
                </div>
                <div className="text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-100">
                  {devSummary.activeKeys}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  ยืนยันสิทธิ์ด้วย Bearer Token
                </div>
              </div>

              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#1a1b1e]">
                <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-1.5">
                  <span>Total Requests</span>
                  <Activity className="w-4 h-4 text-slate-400" />
                </div>
                <div className="text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-100">
                  {devSummary.totalRequests.toLocaleString()}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  จำนวนคำขอที่เซิร์ฟเวอร์ประมวลผลจริง
                </div>
              </div>

              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#1a1b1e]">
                <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-1.5">
                  <span>Avg Response Latency</span>
                  <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div className="text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-100">
                  {devSummary.avgLatencyMs !== null ? `${devSummary.avgLatencyMs} ms` : '—'}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  คำนวณจาก Request Logs ล่าสุด
                </div>
              </div>
            </div>

            {/* Console Sub-Navigation */}
            <div className="flex items-center gap-2 overflow-x-auto border-b border-slate-200 dark:border-slate-800 mb-6">
              {[
                { id: 'explorer', label: 'API Explorer', icon: Play },
                { id: 'keys', label: 'API Keys & Auth', icon: KeyRound },
                { id: 'logs', label: `Request Logs (${devLogs.length})`, icon: Activity },
                { id: 'docs', label: 'API Reference', icon: FileCode2 },
              ].map((tab) => {
                const Icon = tab.icon;
                const active = devSubTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setDevSubTab(tab.id as any)}
                    className={`flex items-center gap-2 px-4 py-2.5 border-b-2 text-xs sm:text-sm font-medium whitespace-nowrap transition-colors ${
                      active
                        ? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
                        : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>

            {/* SUB-TAB 1: INTERACTIVE API EXPLORER */}
            {devSubTab === 'explorer' && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Left: Request Configuration */}
                <div className="lg:col-span-5 p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#1a1b1e] space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
                    <h3 className="font-semibold text-sm flex items-center gap-2">
                      <Terminal className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                      <span>Request Builder</span>
                    </h3>
                    <span className="text-[11px] font-mono text-slate-500">REST JSON</span>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                      Endpoint
                    </label>
                    <select
                      value={explorerEndpoint}
                      onChange={(e) => setExplorerEndpoint(e.target.value as any)}
                      className="w-full px-3 py-2 rounded-lg text-sm font-mono border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#141414]"
                    >
                      <option value="search">POST /api/v1/search</option>
                      <option value="autocomplete">GET /api/v1/autocomplete</option>
                      <option value="trending">GET /api/v1/trending</option>
                    </select>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                        Authorization (Bearer Token)
                      </label>
                      <button
                        type="button"
                        onClick={() => setDevSubTab('keys')}
                        className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        จัดการคีย์
                      </button>
                    </div>
                    <input
                      type="text"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="sbs_live_..."
                      className="w-full px-3 py-2 rounded-lg text-xs font-mono border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#141414]"
                    />
                  </div>

                  {explorerEndpoint !== 'trending' && (
                    <div>
                      <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                        Parameter <code className="font-mono text-blue-600 dark:text-blue-400">q</code> (คำค้นหา)
                      </label>
                      <input
                        type="text"
                        value={testQuery}
                        onChange={(e) => setTestQuery(e.target.value)}
                        placeholder="กรอกคำค้นหา..."
                        className="w-full px-3 py-2 rounded-lg text-sm border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#141414]"
                      />
                    </div>
                  )}

                  {explorerEndpoint === 'search' && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                          <code className="font-mono">mode</code>
                        </label>
                        <select
                          value={testMode}
                          onChange={(e) => setTestMode(e.target.value as SearchMode)}
                          className="w-full px-3 py-2 rounded-lg text-sm border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#141414]"
                        >
                          <option value="all">all (ทั้งหมด)</option>
                          <option value="web">web (เว็บ)</option>
                          <option value="news">news (ข่าวสาร)</option>
                          <option value="images">images (รูปภาพ)</option>
                          <option value="video">video (วิดีโอ)</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                          <code className="font-mono">lang</code>
                        </label>
                        <select
                          value={testLang}
                          onChange={(e) => setTestLang(e.target.value as 'th' | 'en')}
                          className="w-full px-3 py-2 rounded-lg text-sm border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#141414]"
                        >
                          <option value="th">th (ภาษาไทย)</option>
                          <option value="en">en (English)</option>
                        </select>
                      </div>
                    </div>
                  )}

                  <button
                    onClick={testApiLive}
                    disabled={testApiLoading}
                    className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white py-2.5 px-4 rounded-lg font-medium text-sm transition-colors flex items-center justify-center gap-2"
                  >
                    <Play className="w-4 h-4" />
                    <span>{testApiLoading ? 'กำลังส่งคำขอ...' : 'Send Request'}</span>
                  </button>
                </div>

                {/* Right: Response Inspector & SDK Code */}
                <div className="lg:col-span-7 p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#1a1b1e] flex flex-col">
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-800 mb-4">
                    <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-lg text-xs">
                      {[
                        { id: 'json', label: 'Response JSON' },
                        { id: 'preview', label: 'Parsed Preview' },
                        { id: 'sdk', label: 'Code Snippets' },
                      ].map((t) => (
                        <button
                          key={t.id}
                          onClick={() => setExplorerResultTab(t.id as any)}
                          className={`px-3 py-1 rounded-md font-medium whitespace-nowrap transition-colors ${
                            explorerResultTab === t.id
                              ? 'bg-white dark:bg-[#2b2d30] text-slate-900 dark:text-white shadow-xs'
                              : 'text-slate-600 dark:text-slate-400'
                          }`}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>

                    {testApiStatus !== null && (
                      <div className="flex items-center gap-3 text-xs font-mono tabular-nums">
                        <span
                          className={`font-semibold ${
                            testApiStatus >= 200 && testApiStatus < 300
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : testApiStatus >= 400
                                ? 'text-red-600 dark:text-red-400'
                                : 'text-amber-600 dark:text-amber-400'
                          }`}
                        >
                          HTTP {testApiStatus}
                        </span>
                        {testApiLatencyMs !== null && (
                          <span className="text-slate-500 dark:text-slate-400">{testApiLatencyMs} ms</span>
                        )}
                        {testApiResponse && (
                          <button
                            onClick={() => copyToClipboard(JSON.stringify(testApiResponse, null, 2), 'json')}
                            className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"
                            title="คัดลอก JSON"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {explorerResultTab === 'sdk' ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
                          {(['ts', 'js', 'python', 'curl'] as const).map((lang) => (
                            <button
                              key={lang}
                              onClick={() => setActiveCodeLang(lang)}
                              className={`px-2.5 py-1 rounded-md text-xs font-medium uppercase ${
                                activeCodeLang === lang ? 'bg-blue-600 text-white' : 'text-slate-500'
                              }`}
                            >
                              {lang}
                            </button>
                          ))}
                        </div>
                        <button
                          onClick={() => copyToClipboard(codeSnippets[activeCodeLang], 'code')}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
                        >
                          {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                          <span>{copiedCode ? 'คัดลอกแล้ว' : 'คัดลอกโค้ด'}</span>
                        </button>
                      </div>
                      <pre className="p-4 rounded-xl bg-slate-950 text-slate-200 font-mono text-xs overflow-x-auto border border-slate-800 leading-relaxed max-h-[380px]">
                        {codeSnippets[activeCodeLang]}
                      </pre>
                    </div>
                  ) : explorerResultTab === 'preview' ? (
                    testApiResponse ? (
                      <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
                        {testApiResponse.aiSummary && (
                          <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-[#141414] border border-slate-200 dark:border-slate-800 text-xs leading-relaxed">
                            <div className="font-semibold text-blue-600 dark:text-blue-400 mb-1">aiSummary</div>
                            {testApiResponse.aiSummary}
                          </div>
                        )}
                        {Array.isArray(testApiResponse.results) &&
                          testApiResponse.results.slice(0, 6).map((item: any, idx: number) => (
                            <div
                              key={idx}
                              className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 flex items-start justify-between gap-3"
                            >
                              <div className="min-w-0">
                                <div className="text-xs font-mono text-slate-400 truncate">{item.domain}</div>
                                <div className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                                  {item.title}
                                </div>
                                <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mt-0.5">
                                  {item.snippet}
                                </p>
                              </div>
                              <button
                                onClick={() => openUrlPreview(item.url, true)}
                                className="text-xs text-blue-600 dark:text-blue-400 hover:underline shrink-0 whitespace-nowrap"
                              >
                                พรีวิว URL
                              </button>
                            </div>
                          ))}
                        {!testApiResponse.results && (
                          <pre className="p-4 rounded-xl bg-slate-950 text-emerald-400 font-mono text-xs overflow-x-auto">
                            {JSON.stringify(testApiResponse, null, 2)}
                          </pre>
                        )}
                      </div>
                    ) : (
                      <div className="flex-1 flex flex-col items-center justify-center py-16 text-center text-slate-400 text-sm">
                        กดปุ่ม Send Request เพื่อดูผลลัพธ์จาก API จริง
                      </div>
                    )
                  ) : testApiResponse ? (
                    <pre className="p-4 rounded-xl bg-slate-950 text-emerald-400 font-mono text-xs overflow-auto max-h-[380px] border border-slate-800 leading-relaxed">
                      {JSON.stringify(testApiResponse, null, 2)}
                    </pre>
                  ) : (
                    <div className="flex-1 flex flex-col items-center justify-center py-16 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                      <Terminal className="w-8 h-8 text-slate-300 dark:text-slate-700 mb-2" />
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        พร้อมทดสอบคำขอจริง — กด <span className="font-semibold">Send Request</span> ทางซ้ายมือ
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* SUB-TAB 2: API KEYS & AUTHENTICATION */}
            {devSubTab === 'keys' && (
              <div className="space-y-6">
                {/* Create New Key Form */}
                <form
                  onSubmit={generateNewKey}
                  className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#1a1b1e]"
                >
                  <h3 className="font-semibold text-sm mb-3">สร้าง Secret API Key ใหม่</h3>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <input
                      type="text"
                      value={apiKeyName}
                      onChange={(e) => setApiKeyName(e.target.value)}
                      placeholder="ชื่อแอปพลิเคชันหรือโปรเจกต์ (เช่น Production Backend)"
                      className="flex-1 px-3.5 py-2 rounded-lg text-sm border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#141414]"
                    />
                    <select
                      value={apiKeyScope}
                      onChange={(e) => setApiKeyScope(e.target.value as any)}
                      className="px-3.5 py-2 rounded-lg text-sm border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#141414]"
                    >
                      <option value="full:access">full:access</option>
                      <option value="read:search">read:search</option>
                    </select>
                    <button
                      type="submit"
                      className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap inline-flex items-center justify-center gap-1.5"
                    >
                      <Plus className="w-4 h-4" />
                      <span>สร้างคีย์ใหม่</span>
                    </button>
                  </div>
                </form>

                {/* Keys Table */}
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#1a1b1e] overflow-hidden">
                  <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                    <h3 className="font-semibold text-sm">รายการ API Keys ({devKeys.length})</h3>
                    <button
                      onClick={refreshDeveloperConsole}
                      className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 inline-flex items-center gap-1"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${devLoadingMeta ? 'animate-spin' : ''}`} />
                      <span>รีเฟรช</span>
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 bg-slate-50/70 dark:bg-[#141414]">
                          <th className="py-2.5 px-4 font-medium">ชื่อคีย์</th>
                          <th className="py-2.5 px-4 font-medium">Secret Key</th>
                          <th className="py-2.5 px-4 font-medium">Scope</th>
                          <th className="py-2.5 px-4 font-medium text-right">Requests</th>
                          <th className="py-2.5 px-4 font-medium text-right">จัดการ</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                        {devKeys.map((item) => {
                          const isVisible = !!revealedKeys[item.key];
                          const isSelected = apiKey === item.key;
                          const masked = `${item.key.slice(0, 12)}••••••••${item.key.slice(-4)}`;
                          return (
                            <tr key={item.key} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30">
                              <td className="py-3 px-4 font-medium text-slate-800 dark:text-slate-200">
                                {item.name}
                                {isSelected && (
                                  <span className="ml-2 text-[11px] font-normal text-blue-600 dark:text-blue-400">
                                    (กำลังใช้งาน)
                                  </span>
                                )}
                              </td>
                              <td className="py-3 px-4 font-mono text-xs text-slate-600 dark:text-slate-300">
                                <div className="flex items-center gap-2">
                                  <span>{isVisible ? item.key : masked}</span>
                                  <button
                                    onClick={() =>
                                      setRevealedKeys((prev) => ({ ...prev, [item.key]: !prev[item.key] }))
                                    }
                                    className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                                    title={isVisible ? 'ซ่อนคีย์' : 'แสดงคีย์'}
                                  >
                                    {isVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                  </button>
                                  <button
                                    onClick={() => copyToClipboard(item.key, 'key')}
                                    className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                                    title="คัดลอกคีย์"
                                  >
                                    <Copy className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </td>
                              <td className="py-3 px-4 font-mono text-xs text-slate-500 dark:text-slate-400">
                                {item.scope}
                              </td>
                              <td className="py-3 px-4 text-right font-mono text-xs tabular-nums">
                                {item.requests}
                              </td>
                              <td className="py-3 px-4 text-right">
                                <div className="inline-flex items-center gap-2">
                                  {!isSelected && (
                                    <button
                                      onClick={() => {
                                        setApiKey(item.key);
                                        showToast(`เลือกใช้คีย์ ${item.name} แล้ว`);
                                      }}
                                      className="text-xs text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap"
                                    >
                                      ใช้ทดสอบ
                                    </button>
                                  )}
                                  <button
                                    onClick={() => revokeApiKey(item.key)}
                                    disabled={devKeys.length <= 1}
                                    className="p-1 text-slate-400 hover:text-red-600 disabled:opacity-30"
                                    title="เพิกถอนคีย์"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* SUB-TAB 3: LIVE REQUEST LOGS */}
            {devSubTab === 'logs' && (
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#1a1b1e] overflow-hidden">
                <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-sm">Real-Time Request Logs</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      บันทึกคำขอค้นหาที่ส่งเข้ามาที่เซิร์ฟเวอร์จริงล่าสุด 50 รายการ
                    </p>
                  </div>
                  <button
                    onClick={refreshDeveloperConsole}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center gap-1.5"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${devLoadingMeta ? 'animate-spin' : ''}`} />
                    <span>รีเฟรช</span>
                  </button>
                </div>

                {devLogs.length === 0 ? (
                  <div className="py-16 px-4 text-center">
                    <Activity className="w-8 h-8 text-slate-300 dark:text-slate-700 mx-auto mb-2" />
                    <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">
                      ยังไม่มีประวัติคำขอ API ในรอบนี้
                    </p>
                    <button
                      onClick={() => setDevSubTab('explorer')}
                      className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium"
                    >
                      ไปที่ API Explorer เพื่อทดสอบส่งคำขอ
                    </button>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 bg-slate-50/70 dark:bg-[#141414]">
                          <th className="py-2.5 px-4 font-medium">เวลา</th>
                          <th className="py-2.5 px-4 font-medium">Endpoint</th>
                          <th className="py-2.5 px-4 font-medium">Query</th>
                          <th className="py-2.5 px-4 font-medium">Mode</th>
                          <th className="py-2.5 px-4 font-medium">Key</th>
                          <th className="py-2.5 px-4 font-medium text-right">Status</th>
                          <th className="py-2.5 px-4 font-medium text-right">Latency</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-mono">
                        {devLogs.map((log) => (
                          <tr key={log.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30">
                            <td className="py-2.5 px-4 text-slate-500 whitespace-nowrap tabular-nums">
                              {new Date(log.timestamp).toLocaleTimeString('th-TH')}
                            </td>
                            <td className="py-2.5 px-4 text-slate-800 dark:text-slate-200 whitespace-nowrap">
                              <span className="font-semibold mr-1.5">{log.method}</span>
                              {log.endpoint}
                            </td>
                            <td className="py-2.5 px-4 font-sans text-slate-700 dark:text-slate-300 max-w-[200px] truncate">
                              {log.query}
                            </td>
                            <td className="py-2.5 px-4 text-slate-500">{log.mode}</td>
                            <td className="py-2.5 px-4 text-slate-500">{log.keyPrefix}</td>
                            <td
                              className={`py-2.5 px-4 text-right font-semibold tabular-nums ${
                                log.status >= 200 && log.status < 300
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : log.status >= 400
                                    ? 'text-red-600 dark:text-red-400'
                                    : 'text-amber-600'
                              }`}
                            >
                              {log.status}
                            </td>
                            <td className="py-2.5 px-4 text-right text-slate-600 dark:text-slate-300 tabular-nums whitespace-nowrap">
                              {log.latencyMs} ms{log.cached ? ' (cache)' : ''}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* SUB-TAB 4: FORMAL API REFERENCE */}
            {devSubTab === 'docs' && (
              <div className="space-y-6">
                <div className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#1a1b1e]">
                  <div className="flex flex-wrap items-center gap-3 mb-3">
                    <span className="font-mono text-xs font-bold px-2.5 py-1 rounded bg-blue-600 text-white">
                      POST / GET
                    </span>
                    <code className="text-base font-mono font-semibold text-slate-900 dark:text-slate-100">
                      /api/v1/search
                    </code>
                  </div>
                  <p className="text-sm text-slate-600 dark:text-slate-300 mb-5">
                    ค้นหาข้อมูลจากเว็บจริงแบบเรียลไทม์ พร้อมสรุปข้อมูล ข่าวสาร วิดีโอ รูปภาพ และ Knowledge Panel
                  </p>

                  <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
                    Request Parameters
                  </h4>
                  <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-lg mb-5">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-50 dark:bg-[#141414] border-b border-slate-200 dark:border-slate-800 text-slate-500">
                          <th className="py-2.5 px-4 font-medium">Parameter</th>
                          <th className="py-2.5 px-4 font-medium">Type</th>
                          <th className="py-2.5 px-4 font-medium">Required</th>
                          <th className="py-2.5 px-4 font-medium">Description</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                        <tr>
                          <td className="py-2.5 px-4 font-mono font-semibold">q</td>
                          <td className="py-2.5 px-4 font-mono text-slate-500">string</td>
                          <td className="py-2.5 px-4 text-red-600 dark:text-red-400 font-medium">Required</td>
                          <td className="py-2.5 px-4 text-slate-600 dark:text-slate-300">คำค้นหาหรือประโยคภาษาธรรมชาติ</td>
                        </tr>
                        <tr>
                          <td className="py-2.5 px-4 font-mono font-semibold">mode</td>
                          <td className="py-2.5 px-4 font-mono text-slate-500">string</td>
                          <td className="py-2.5 px-4 text-slate-500">Optional</td>
                          <td className="py-2.5 px-4 text-slate-600 dark:text-slate-300">
                            all | web | images | news | video (ค่าเริ่มต้น: all)
                          </td>
                        </tr>
                        <tr>
                          <td className="py-2.5 px-4 font-mono font-semibold">lang</td>
                          <td className="py-2.5 px-4 font-mono text-slate-500">string</td>
                          <td className="py-2.5 px-4 text-slate-500">Optional</td>
                          <td className="py-2.5 px-4 text-slate-600 dark:text-slate-300">รหัสภาษา เช่น th, en (ค่าเริ่มต้น: th)</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
                    Other Endpoints & Status Codes
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                    <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 space-y-2">
                      <div>
                        <code className="font-mono font-semibold text-blue-600 dark:text-blue-400">
                          GET /api/v1/autocomplete?q=...
                        </code>
                        <p className="text-slate-500 mt-0.5">คืนค่ารายการคำแนะนำค้นหาแบบเรียลไทม์</p>
                      </div>
                      <div>
                        <code className="font-mono font-semibold text-blue-600 dark:text-blue-400">
                          GET /api/v1/trending
                        </code>
                        <p className="text-slate-500 mt-0.5">คืนค่ารายการคำค้นหายอดนิยม</p>
                      </div>
                      <div>
                        <code className="font-mono font-semibold text-blue-600 dark:text-blue-400">
                          GET /api/v1/preview?url=...
                        </code>
                        <p className="text-slate-500 mt-0.5">ดึงข้อมูลหน้าเว็บและ Reader Metadata แบบปลอดภัย</p>
                      </div>
                    </div>

                    <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 space-y-1.5 font-mono">
                      <div className="flex justify-between">
                        <span className="text-emerald-600 dark:text-emerald-400 font-semibold">200 OK</span>
                        <span className="font-sans text-slate-500">ประมวลผลคำขอสำเร็จ</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-amber-600 font-semibold">400 Bad Request</span>
                        <span className="font-sans text-slate-500">พารามิเตอร์ q ไม่ถูกต้องหรือว่างเปล่า</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-red-600 dark:text-red-400 font-semibold">401 Unauthorized</span>
                        <span className="font-sans text-slate-500">Bearer API Key ไม่ถูกต้องหรือถูกเพิกถอน</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-red-600 dark:text-red-400 font-semibold">500 Server Error</span>
                        <span className="font-sans text-slate-500">เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Shenwang Account SSO / OAuth 2.0 Reference */}
                <div className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#1a1b1e]">
                  <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-xs font-bold px-2.5 py-1 rounded bg-emerald-600 text-white">
                        OAUTH 2.0 / SSO
                      </span>
                      <code className="text-base font-mono font-semibold text-slate-900 dark:text-slate-100">
                        /oauth/authorize &amp; /api/v1/oauth/token
                      </code>
                    </div>
                    <button
                      onClick={startDemoSsoFlow}
                      className="px-3.5 py-1.5 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-medium transition-colors"
                    >
                      เปิดหน้าทดสอบ Shenwang SSO
                    </button>
                  </div>
                  <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">
                    ใช้พอร์ทัล Shenwang Account แบบแยกอิสระสำหรับยืนยันตัวตน Single Sign-On (SSO) จากแอปพลิเคชันหรือเว็บไซต์อื่น
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs font-mono">
                    <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800">
                      <div className="font-semibold text-blue-600 dark:text-blue-400 mb-1">GET /oauth/authorize</div>
                      <div className="font-sans text-slate-500">หน้าขออนุญาตผู้ใช้พร้อมพารามิเตอร์ client_id, redirect_uri, scope</div>
                    </div>
                    <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800">
                      <div className="font-semibold text-blue-600 dark:text-blue-400 mb-1">POST /api/v1/oauth/token</div>
                      <div className="font-sans text-slate-500">แลก Authorization Code เป็น Bearer Access Token</div>
                    </div>
                    <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800">
                      <div className="font-semibold text-blue-600 dark:text-blue-400 mb-1">GET /api/v1/oauth/userinfo</div>
                      <div className="font-sans text-slate-500">ดึงข้อมูลโปรไฟล์ผู้ใช้ Shenwang จาก Access Token</div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* History Drawer */}
      {showHistoryDrawer && (
        <div
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex justify-end"
          onClick={() => setShowHistoryDrawer(false)}
        >
          <div
            className="w-full max-w-md h-full p-6 flex flex-col shadow-2xl bg-white dark:bg-[#1c1c1e] border-l border-slate-200 dark:border-slate-800"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-200 dark:border-slate-800">
              <h3 className="font-bold text-lg">ประวัติการค้นหา</h3>
              <button onClick={() => setShowHistoryDrawer(false)} className="text-sm text-slate-500 hover:text-slate-700">
                ปิด
              </button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-1">
              {history.length === 0 ? (
                <p className="text-slate-400 text-sm text-center py-12">ยังไม่มีประวัติการค้นหา</p>
              ) : (
                history.map((item, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      setShowHistoryDrawer(false);
                      executeSearch(item, 'all');
                    }}
                    className="w-full p-3 rounded-xl text-sm font-medium text-left hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-between"
                  >
                    <span className="truncate">{item}</span>
                    <Search className="w-4 h-4 text-slate-400 shrink-0" />
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Bookmarks Drawer */}
      {showBookmarksDrawer && (
        <div
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex justify-end"
          onClick={() => setShowBookmarksDrawer(false)}
        >
          <div
            className="w-full max-w-md h-full p-6 flex flex-col shadow-2xl bg-white dark:bg-[#1c1c1e] border-l border-slate-200 dark:border-slate-800"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-200 dark:border-slate-800">
              <h3 className="font-bold text-lg">หน้าที่บันทึกไว้ ({bookmarks.length})</h3>
              <button onClick={() => setShowBookmarksDrawer(false)} className="text-sm text-slate-500 hover:text-slate-700">
                ปิด
              </button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-3">
              {bookmarks.length === 0 ? (
                <p className="text-slate-400 text-sm text-center py-12">ยังไม่มีรายการที่บันทึก</p>
              ) : (
                bookmarks.map((item, idx) => (
                  <div key={idx} className="p-4 rounded-xl border border-slate-200 dark:border-slate-800">
                    <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                      <span className="text-blue-600 dark:text-blue-400 font-medium">{item.domain}</span>
                      <button onClick={() => toggleBookmark(item)} className="text-red-500 text-xs font-medium">
                        ลบ
                      </button>
                    </div>
                    <button
                      onClick={() => {
                        setShowBookmarksDrawer(false);
                        openUrlPreview(item.url, true);
                      }}
                      className="text-left font-semibold text-sm text-[#1a0dab] dark:text-[#8ab4f8] hover:underline block mb-1"
                    >
                      {item.title}
                    </button>
                    {item.snippet && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">{item.snippet}</p>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      <OfflineIndicator />
      <AppPackagingModal
        open={showPackagingModal}
        onClose={() => setShowPackagingModal(false)}
        showToast={showToast}
      />

      {/* Settings & Perception Mode Modal */}
      {showSettingsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-[#1e1f22] border border-slate-200 dark:border-slate-700 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                {settingsSubView === 'perception' && (
                  <button
                    type="button"
                    onClick={() => setSettingsSubView('main')}
                    className="text-xs px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200"
                  >
                    ← กลับ
                  </button>
                )}
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                  {settingsSubView === 'main' ? 'ตั้งค่าระบบ SBS Search' : 'เลือกประเภทการรับรู้'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowSettingsModal(false)}
                className="p-1.5 rounded-full text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {settingsSubView === 'main' ? (
              <div className="p-5 space-y-3">
                <button
                  type="button"
                  onClick={() => {
                    setPendingWebReaderConsent(allowWebReaderToggle);
                    setSettingsSubView('perception');
                  }}
                  className="w-full flex items-center justify-between p-4 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-blue-500 dark:hover:border-blue-500 bg-slate-50/70 dark:bg-[#26282c] transition-all text-left"
                >
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-blue-600/10 text-blue-600 dark:text-blue-400 mt-0.5">
                      <Eye className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="font-semibold text-sm text-slate-900 dark:text-white">
                        เลือกประเภทการรับรู้
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        จัดการสิทธิ์การแสดงผลหน้าเว็บและโหมดอ่านบทความ
                      </div>
                    </div>
                  </div>
                  <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-blue-600/10 text-blue-600 dark:text-blue-400 shrink-0">
                    {allowWebReaderToggle ? 'เปิดใช้งานแล้ว' : 'ค่าเริ่มต้น'}
                  </span>
                </button>
              </div>
            ) : (
              <div className="p-5 space-y-4">
                <label className="flex items-start gap-3 p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#26282c] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={pendingWebReaderConsent}
                    onChange={(e) => setPendingWebReaderConsent(e.target.checked)}
                    className="mt-1 w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <div className="space-y-1.5">
                    <div className="font-semibold text-sm text-slate-900 dark:text-white">
                      อนุญาตการเข้าถึงเว็บไซต์แบบเว็บและอ่านบทความ
                    </div>
                    <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                      เมื่อเปิดใช้งาน ระบบจะปลดล็อกแถบเครื่องมือสลับมุมมองระหว่าง <strong>"หน้าเว็บเต็มรูปแบบ"</strong> และ <strong>"โหมดอ่านบทความ"</strong> (สกัดเฉพาะเนื้อหาหลัก ตัดโฆษณา และสรุปใจความสำคัญให้อ่านง่ายขึ้น) บนแถบควบคุมด้านบน
                    </p>
                  </div>
                </label>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowSettingsModal(false)}
                    className="px-4 py-2 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAllowWebReaderToggle(pendingWebReaderConsent);
                      if (typeof window !== 'undefined') {
                        localStorage.setItem('sbs_allow_web_reader', String(pendingWebReaderConsent));
                      }
                      if (!pendingWebReaderConsent) {
                        setPreviewViewMode('web');
                      }
                      setShowSettingsModal(false);
                    }}
                    className="px-4 py-2 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white inline-flex items-center gap-1.5 shadow-sm"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>ยืนยันการตั้งค่า</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
