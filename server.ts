import express from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import dns from 'dns/promises';
import net from 'net';
import { fileURLToPath } from 'url';
import zlib from 'zlib';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Initialize Gemini API server-side with required User-Agent header
const apiKey = process.env.GEMINI_API_KEY;
const ai = apiKey
  ? new GoogleGenAI({
      apiKey,
      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
    })
  : null;

// Server-side in-memory TTL cache for fast repeat searches & previews
const searchResultCache = new Map<string, { expires: number; data: any }>();
const SEARCH_CACHE_TTL_MS = 5 * 60 * 1000;
const previewResultCache = new Map<string, { expires: number; data: any }>();
const PREVIEW_CACHE_TTL_MS = 3 * 60 * 1000;

async function readTextLimited(resp: Response, maxBytes = 400000): Promise<string> {
  if (!resp.body) return (await resp.text()).slice(0, maxBytes);
  const reader = resp.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: false });
  let total = 0;
  let result = '';
  try {
    while (total < maxBytes) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      total += value.byteLength;
      result += decoder.decode(value, { stream: true });
    }
    result += decoder.decode();
  } catch {
    // Return partial content cleanly if stream aborts early
  } finally {
    try {
      await reader.cancel();
    } catch {
      // Ignore
    }
  }
  return result.slice(0, maxBytes);
}

// Developer API keys store & real request logs
interface ApiKeyRecord {
  name: string;
  created: string;
  lastUsed: string | null;
  requests: number;
  scope: 'read:search' | 'full:access';
  ownerUid?: string;
  ownerIdentifier?: string;
}

interface ApiRequestLog {
  id: string;
  timestamp: string;
  method: string;
  endpoint: string;
  query: string;
  mode: string;
  status: number;
  latencyMs: number;
  keyPrefix: string;
  cached: boolean;
}

const apiKeysDb = new Map<string, ApiKeyRecord>();
apiKeysDb.set('sbs_live_demo12345', {
  name: 'Default Sandbox Key',
  created: new Date().toISOString(),
  lastUsed: null,
  requests: 0,
  scope: 'full:access',
});

const apiRequestLogs: ApiRequestLog[] = [];
function pushApiLog(entry: ApiRequestLog) {
  apiRequestLogs.unshift(entry);
  if (apiRequestLogs.length > 50) {
    apiRequestLogs.length = 50;
  }
}

// Shenwang Account Identity Store (persistent local store with scrypt password hashing)
type AvatarColor = 'cobalt' | 'indigo' | 'emerald' | 'amber' | 'crimson' | 'slate';

interface ShenwangBookmark {
  title: string;
  url: string;
  domain?: string;
  snippet?: string;
}

interface ShenwangConnectedApp {
  clientId: string;
  appName: string;
  scope: string;
  authorizedAt: string;
  lastUsedAt: string;
}

interface ShenwangUserRecord {
  uid: string;
  identifier: string;
  displayName: string;
  avatarColor: AvatarColor;
  passwordHash: string;
  passwordSalt: string;
  createdAt: string;
  lastLoginAt: string;
  bookmarks: ShenwangBookmark[];
  history: string[];
  connectedApps?: ShenwangConnectedApp[];
}

interface ShenwangSession {
  token: string;
  uid: string;
  createdAt: string;
  expiresAt: number;
}

interface ShenwangOAuthCode {
  code: string;
  uid: string;
  clientId: string;
  appName: string;
  redirectUri: string;
  scope: string;
  expiresAt: number;
}

interface ShenwangOAuthToken {
  accessToken: string;
  uid: string;
  clientId: string;
  scope: string;
  expiresAt: number;
}

const SHENWANG_STORE_PATH = path.join(__dirname, '.shenwang-store.json');
const SHENWANG_SESSION_COOKIE = 'sbs_shenwang_session';
const SHENWANG_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const VALID_AVATAR_COLORS: AvatarColor[] = ['cobalt', 'indigo', 'emerald', 'amber', 'crimson', 'slate'];

const shenwangUsersById = new Map<string, ShenwangUserRecord>();
const shenwangUsersByIdentifier = new Map<string, ShenwangUserRecord>();
const shenwangSessions = new Map<string, ShenwangSession>();
const shenwangOAuthCodes = new Map<string, ShenwangOAuthCode>();
const shenwangOAuthTokens = new Map<string, ShenwangOAuthToken>();

function loadShenwangStore() {
  try {
    if (!fs.existsSync(SHENWANG_STORE_PATH)) return;
    const raw = fs.readFileSync(SHENWANG_STORE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed.users)) {
      for (const u of parsed.users) {
        if (u?.uid && u?.identifier) {
          shenwangUsersById.set(u.uid, u);
          shenwangUsersByIdentifier.set(u.identifier.toLowerCase(), u);
        }
      }
    }
    if (Array.isArray(parsed.sessions)) {
      const now = Date.now();
      for (const s of parsed.sessions) {
        if (s?.token && s?.uid && typeof s.expiresAt === 'number' && s.expiresAt > now) {
          shenwangSessions.set(s.token, s);
        }
      }
    }
  } catch {
    // Start with empty store if file is unreadable
  }
}

function saveShenwangStore() {
  try {
    const now = Date.now();
    const activeSessions = Array.from(shenwangSessions.values()).filter((s) => s.expiresAt > now);
    const data = {
      users: Array.from(shenwangUsersById.values()),
      sessions: activeSessions,
    };
    fs.writeFileSync(SHENWANG_STORE_PATH, JSON.stringify(data, null, 2), 'utf8');
  } catch {
    // Ignore disk write failure in read-only environments
  }
}

loadShenwangStore();

function normalizeShenwangIdentifier(raw: string): string {
  const trimmed = raw.trim().toLowerCase().replace(/\s+/g, '');
  if (!trimmed) return '';
  return trimmed.includes('@') ? trimmed : `${trimmed}@shenwang.th`;
}

function isValidShenwangIdentifier(identifier: string): boolean {
  return /^[a-z0-9._+-]{2,64}@[a-z0-9.-]{2,80}\.[a-z]{2,16}$/.test(identifier);
}

function hashPassword(password: string, existingSalt?: string): { salt: string; hash: string } {
  const salt = existingSalt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}

function verifyPassword(password: string, salt: string, storedHash: string): boolean {
  try {
    const derived = crypto.scryptSync(password, salt, 64);
    const storedBuf = Buffer.from(storedHash, 'hex');
    if (derived.length !== storedBuf.length) return false;
    return crypto.timingSafeEqual(derived, storedBuf);
  } catch {
    return false;
  }
}

function parseCookies(req: express.Request): Record<string, string> {
  const header = req.headers.cookie || '';
  const result: Record<string, string> = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    try {
      result[key] = decodeURIComponent(val);
    } catch {
      result[key] = val;
    }
  }
  return result;
}

function extractSessionToken(req: express.Request): string | null {
  const headerToken = (req.headers['x-shenwang-session'] as string) || '';
  if (headerToken.trim()) return headerToken.trim();
  const cookies = parseCookies(req);
  return cookies[SHENWANG_SESSION_COOKIE] || null;
}

function getAuthenticatedUser(req: express.Request): ShenwangUserRecord | null {
  const token = extractSessionToken(req);
  if (!token) return null;
  const session = shenwangSessions.get(token);
  if (!session || session.expiresAt <= Date.now()) {
    if (session) {
      shenwangSessions.delete(token);
      saveShenwangStore();
    }
    return null;
  }
  return shenwangUsersById.get(session.uid) || null;
}

function sanitizePublicUser(user: ShenwangUserRecord) {
  return {
    uid: user.uid,
    identifier: user.identifier,
    displayName: user.displayName,
    avatarColor: user.avatarColor,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
    connectedApps: Array.isArray(user.connectedApps) ? user.connectedApps : [],
  };
}

function setSessionCookie(req: express.Request, res: express.Response, token: string) {
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  const parts = [
    `${SHENWANG_SESSION_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.floor(SHENWANG_SESSION_TTL_MS / 1000)}`,
  ];
  if (isHttps) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

function clearSessionCookie(req: express.Request, res: express.Response) {
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  const parts = [
    `${SHENWANG_SESSION_COOKIE}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
  ];
  if (isHttps) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

// Trending search topics in Thailand
const TRENDING_TOPICS = [
  { query: 'Google', category: 'เว็บไซต์ยอดนิยม', searches: '2.4M' },
  { query: 'YouTube', category: 'วิดีโอและความบันเทิง', searches: '1.9M' },
  { query: 'เทคโนโลยี AI ล่าสุด 2026', category: 'เทคโนโลยี', searches: '128K' },
  { query: 'GitHub', category: 'นักพัฒนา', searches: '840K' },
  { query: 'Wikipedia ประเทศไทย', category: 'ความรู้', searches: '650K' },
];

const AUTOCOMPLETE_DB = [
  'Google',
  'YouTube',
  'GitHub',
  'Pantip',
  'Wikipedia',
  'Wikipedia ประเทศไทย',
  'Facebook',
  'Shopee',
  'Lazada',
  'Gemini AI',
  'เทคโนโลยี AI ล่าสุด 2026',
  'สภาพอากาศ กรุงเทพ วันนี้',
  'ราคาทองคำวันนี้',
  'ข่าวเทคโนโลยีวันนี้',
  'React TypeScript Tutorial',
];

function isPrivateOrBlockedIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const parts = ip.split('.').map(Number);
    const [a, b] = parts;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a >= 224) return true;
    return false;
  }
  if (net.isIPv6(ip)) {
    const normalized = ip.toLowerCase();
    if (normalized === '::1' || normalized === '::') return true;
    if (normalized.startsWith('fe80:') || normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
    if (normalized.startsWith('::ffff:')) {
      return isPrivateOrBlockedIp(normalized.replace('::ffff:', ''));
    }
    return false;
  }
  return true;
}

async function validatePublicUrl(rawUrl: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('URL ไม่ถูกต้อง');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('รองรับเฉพาะโปรโตคอล http และ https เท่านั้น');
  }
  if (parsed.username || parsed.password) {
    throw new Error('ไม่อนุญาตให้ระบุข้อมูลยืนยันตัวตนใน URL');
  }
  const hostname = parsed.hostname.toLowerCase();
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname.endsWith('.localhost')
  ) {
    throw new Error('ไม่อนุญาตให้เข้าถึงที่อยู่ภายในเครือข่าย');
  }
  if (net.isIP(hostname)) {
    if (isPrivateOrBlockedIp(hostname)) {
      throw new Error('ไม่อนุญาตให้เข้าถึง IP ภายในเครือข่าย');
    }
    return parsed;
  }
  const records = await dns.lookup(hostname, { all: true });
  if (!records.length || records.some((r) => isPrivateOrBlockedIp(r.address))) {
    throw new Error('ไม่อนุญาตให้เข้าถึงปลายทางนี้');
  }
  return parsed;
}

function getDomainFromUrl(urlStr: string): string {
  try {
    return new URL(urlStr).hostname.replace(/^www\./, '');
  } catch {
    return urlStr;
  }
}

function getDisplayBreadcrumb(urlStr: string): string {
  try {
    const u = new URL(urlStr);
    const segments = u.pathname.split('/').filter(Boolean).slice(0, 3);
    const origin = `${u.protocol}//${u.hostname}`;
    return segments.length > 0 ? `${origin} › ${segments.join(' › ')}` : origin;
  } catch {
    return urlStr;
  }
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function stripTagsToText(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

function extractXmlTag(block: string, tag: string): string {
  const m = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return m ? decodeHtmlEntities(m[1].trim()) : '';
}

async function fetchLiveAutocomplete(q: string): Promise<string[]> {
  try {
    const resp = await fetch(
      `https://suggestqueries.google.com/complete/search?client=firefox&hl=th&q=${encodeURIComponent(q)}`,
      { signal: AbortSignal.timeout(1500) }
    );
    if (!resp.ok) return [];
    const data: any = await resp.json();
    if (Array.isArray(data?.[1])) {
      return data[1].filter((s: any) => typeof s === 'string');
    }
  } catch {
    // Ignore timeout
  }
  return [];
}

async function fetchWebRssSearch(query: string): Promise<any[]> {
  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const resp = await fetch(url, {
      signal: AbortSignal.timeout(4000),
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept-Language': 'th-TH,th;q=0.9,en;q=0.8',
      },
    });
    if (!resp.ok) return [];
    const html = await resp.text();
    const items: any[] = [];
    const blockRegex = /<div class="result results_links[\s\S]*?<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>)?/gi;
    let m;
    while ((m = blockRegex.exec(html)) !== null && items.length < 12) {
      let rawHref = decodeHtmlEntities(m[1]);
      if (rawHref.startsWith('//')) rawHref = `https:${rawHref}`;
      let targetUrl = rawHref;
      try {
        const parsed = new URL(rawHref);
        const uddg = parsed.searchParams.get('uddg');
        if (uddg) targetUrl = uddg;
      } catch {
        // Keep rawHref
      }
      const title = stripTagsToText(m[2]);
      const snippet = m[3] ? stripTagsToText(m[3]) : '';
      if (
        title &&
        targetUrl &&
        (targetUrl.startsWith('http://') || targetUrl.startsWith('https://')) &&
        !targetUrl.includes('duckduckgo.com/y.js')
      ) {
        const domain = getDomainFromUrl(targetUrl);
        items.push({
          title,
          url: targetUrl,
          snippet: snippet || `เว็บไซต์และข้อมูลจาก ${domain}`,
          domain,
          breadcrumb: getDisplayBreadcrumb(targetUrl),
          publishedDate: '',
        });
      }
    }
    return items;
  } catch {
    return [];
  }
}

async function fetchNewsRssSearch(query: string): Promise<any[]> {
  try {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=th&gl=TH&ceid=TH:th`;
    const resp = await fetch(url, {
      signal: AbortSignal.timeout(3000),
      headers: { 'User-Agent': 'SBSEngine/1.0' },
    });
    if (!resp.ok) return [];
    const xml = await resp.text();
    const items: any[] = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
    let m;
    while ((m = itemRegex.exec(xml)) !== null && items.length < 10) {
      const block = m[1];
      const title = stripTagsToText(extractXmlTag(block, 'title'));
      const link = extractXmlTag(block, 'link');
      const source = stripTagsToText(extractXmlTag(block, 'source')) || getDomainFromUrl(link);
      const pubDate = extractXmlTag(block, 'pubDate');
      const description = stripTagsToText(extractXmlTag(block, 'description'));
      if (title && link) {
        items.push({
          title,
          source,
          time: pubDate ? new Date(pubDate).toLocaleDateString('th-TH') : 'ล่าสุด',
          url: link,
          snippet: description || title,
        });
      }
    }
    return items;
  } catch {
    return [];
  }
}

async function fetchWikipediaSummary(query: string): Promise<any | null> {
  const tryLang = async (langCode: string) => {
    try {
      const apiUrl = `https://${langCode}.wikipedia.org/w/api.php?action=query&prop=extracts|pageimages|info&inprop=url&exintro=1&explaintext=1&exsentences=4&pithumbsize=400&generator=search&gsrsearch=${encodeURIComponent(
        query
      )}&gsrlimit=1&format=json`;
      const resp = await fetch(apiUrl, {
        signal: AbortSignal.timeout(2200),
        headers: { 'User-Agent': 'SBSEngine/1.0 (https://sbs-engine.th)' },
      });
      if (!resp.ok) return null;
      const json: any = await resp.json();
      const pages = json?.query?.pages;
      if (!pages) return null;
      const page: any = Object.values(pages)[0];
      if (!page || !page.extract) return null;

      // Ensure Wikipedia article is actually relevant to the query
      const qLower = query.toLowerCase().trim();
      const titleLower = (page.title || '').toLowerCase();
      const extractLower = (page.extract || '').toLowerCase();
      const tokens = qLower.split(/\s+/).filter((t) => t.length >= 2);
      const matchesAllTokens = tokens.length > 0 && tokens.every((t) => titleLower.includes(t) || extractLower.includes(t));
      const directMatch = titleLower.includes(qLower) || qLower.includes(titleLower);
      if (!directMatch && !matchesAllTokens) return null;

      return {
        title: page.title,
        extract: page.extract,
        url: page.fullurl || `https://${langCode}.wikipedia.org/wiki/${encodeURIComponent(page.title)}`,
        thumbnail: page.thumbnail?.source || null,
        lang: langCode,
      };
    } catch {
      return null;
    }
  };
  return (await tryLang('th')) || (await tryLang('en'));
}

async function resolveRedirectUrl(uri: string): Promise<string> {
  if (!uri.includes('vertexaisearch.cloud.google.com/grounding-api-redirect')) {
    return uri;
  }
  try {
    const resp = await fetch(uri, {
      method: 'HEAD',
      redirect: 'follow',
      signal: AbortSignal.timeout(1800),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36',
      },
    });
    if (resp.url && !resp.url.includes('vertexaisearch.cloud.google.com')) {
      await validatePublicUrl(resp.url);
      return resp.url;
    }
  } catch {
    // Keep original if unresolved
  }
  return uri;
}

function extractMetaImage(html: string, baseUrl: string): string | null {
  const patterns = [
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
    /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) {
      try {
        const resolved = new URL(m[1], baseUrl).toString();
        if (resolved.startsWith('http://') || resolved.startsWith('https://')) {
          return resolved;
        }
      } catch {
        // Ignore
      }
    }
  }
  return null;
}

async function fetchPageMetaPreview(
  urlStr: string
): Promise<{ imageUrl: string | null; title?: string; description?: string }> {
  try {
    const validated = await validatePublicUrl(urlStr);
    const resp = await fetch(validated.toString(), {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(2000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
      },
    });
    if (!resp.ok) return { imageUrl: null };
    const contentType = resp.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) return { imageUrl: null };
    const chunk = (await resp.text()).slice(0, 48000);
    const titleMatch = chunk.match(/<title[^>]*>([^<]+)<\/title>/i);
    const descMatch =
      chunk.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i) ||
      chunk.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i);
    return {
      imageUrl: extractMetaImage(chunk, resp.url || validated.toString()),
      title: titleMatch?.[1]?.trim(),
      description: descMatch?.[1]?.trim(),
    };
  } catch {
    return { imageUrl: null };
  }
}

function parseJsonFromModelText(raw: string): any | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  try {
    return JSON.parse(candidate);
  } catch {
    const firstBrace = candidate.indexOf('{');
    const lastBrace = candidate.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      try {
        return JSON.parse(candidate.slice(firstBrace, lastBrace + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function extractReaderContent(html: string, finalUrl: string) {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch
    ? decodeHtmlEntities(titleMatch[1].replace(/\s+/g, ' ').trim())
    : getDomainFromUrl(finalUrl);
  const descMatch =
    html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i);
  const description = descMatch ? decodeHtmlEntities(descMatch[1].trim()) : '';

  const ogImage = extractMetaImage(html, finalUrl);

  const cleanedHtml = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<svg[\s\S]*?<\/svg>/gi, '');

  const blocks: { tag: string; text: string }[] = [];
  const blockRegex = /<(h1|h2|h3|p|li)[^>]*>([\s\S]*?)<\/\1>/gi;
  let match;
  while ((match = blockRegex.exec(cleanedHtml)) !== null && blocks.length < 40) {
    const text = stripTagsToText(match[2]);
    if (text.length >= 18) {
      blocks.push({ tag: match[1].toLowerCase(), text });
    }
  }

  const links: { label: string; url: string }[] = [];
  const linkRegex = /<a[^>]+href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const seenLinks = new Set<string>();
  while ((match = linkRegex.exec(cleanedHtml)) !== null && links.length < 15) {
    const label = stripTagsToText(match[2]);
    if (label.length >= 3 && label.length <= 90) {
      try {
        const abs = new URL(match[1], finalUrl).toString();
        if ((abs.startsWith('http://') || abs.startsWith('https://')) && !seenLinks.has(abs)) {
          seenLinks.add(abs);
          links.push({ label, url: abs });
        }
      } catch {
        // Ignore invalid URL
      }
    }
  }

  return { title, description, ogImage, blocks, links };
}

function buildIframeHtml(rawHtml: string, finalUrl: string): string {
  // Handle <meta http-equiv="refresh" content="...;url=..."> safely
  const refreshMatch = rawHtml.match(/<meta[^>]+http-equiv=["']?refresh["']?[^>]+content=["'][^"']*url=([^"';\s>]+)/i);
  const refreshTarget = refreshMatch?.[1] || '';

  let html = rawHtml
    .replace(/<meta[^>]+http-equiv=["']?(?:Content-Security-Policy|X-Frame-Options|refresh)["']?[^>]*>/gi, '')
    .replace(/\s+crossorigin(?:=(?:"[^"]*"|'[^']*'|[^\s>]+))?/gi, '')
    .replace(/\s+integrity=(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/if\s*\(\s*(?:window\.)?(?:top|parent)\s*!==?\s*(?:window\.)?self\s*\)/gi, 'if (false)')
    .replace(/if\s*\(\s*(?:window\.)?self\s*!==?\s*(?:window\.)?(?:top|parent)\s*\)/gi, 'if (false)');

  const baseTag = `<base href="${finalUrl.replace(/"/g, '&quot;')}" target="_self">`;
  const headShim = `<script>
(function() {
  function makeStorage() {
    var store = {};
    return {
      getItem: function(k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
      setItem: function(k, v) { store[String(k)] = String(v); },
      removeItem: function(k) { delete store[String(k)]; },
      clear: function() { store = {}; },
      key: function(i) { return Object.keys(store)[i] || null; },
      get length() { return Object.keys(store).length; }
    };
  }
  try { var _ = window.localStorage; } catch (e) {
    try { Object.defineProperty(window, 'localStorage', { value: makeStorage(), configurable: true }); } catch (_) {}
  }
  try { var _2 = window.sessionStorage; } catch (e) {
    try { Object.defineProperty(window, 'sessionStorage', { value: makeStorage(), configurable: true }); } catch (_) {}
  }
  try {
    var origPush = history.pushState.bind(history);
    var origReplace = history.replaceState.bind(history);
    history.pushState = function() { try { return origPush.apply(history, arguments); } catch (_) {} };
    history.replaceState = function() { try { return origReplace.apply(history, arguments); } catch (_) {} };
  } catch (_) {}
  ${refreshTarget ? `try { var nextR = new URL(${JSON.stringify(refreshTarget)}, ${JSON.stringify(finalUrl)}).toString(); window.parent.postMessage({ type: 'sbs-browser-navigate', url: nextR }, '*'); } catch (_) {}` : ''}
})();
</script>`;

  const bridgeScript = `
<script>
(function() {
  document.addEventListener('click', function(e) {
    var el = e.target;
    while (el && el.tagName !== 'A') el = el.parentElement;
    if (!el || !el.getAttribute('href')) return;
    var href = el.getAttribute('href');
    if (href.startsWith('#') || href.startsWith('javascript:')) return;
    try {
      var resolved = new URL(href, ${JSON.stringify(finalUrl)}).toString();
      if (resolved.startsWith('http://') || resolved.startsWith('https://')) {
        e.preventDefault();
        window.parent.postMessage({ type: 'sbs-browser-navigate', url: resolved }, '*');
      }
    } catch (_) {}
  }, true);

  document.addEventListener('submit', function(e) {
    var form = e.target;
    if (!form || form.tagName !== 'FORM') return;
    var method = (form.getAttribute('method') || 'GET').toUpperCase();
    if (method !== 'GET') return;
    try {
      var action = form.getAttribute('action') || ${JSON.stringify(finalUrl)};
      var target = new URL(action, ${JSON.stringify(finalUrl)});
      var fd = new FormData(form);
      fd.forEach(function(val, key) {
        if (typeof val === 'string') target.searchParams.set(key, val);
      });
      e.preventDefault();
      window.parent.postMessage({ type: 'sbs-browser-navigate', url: target.toString() }, '*');
    } catch (_) {}
  }, true);
})();
</script>`;

  if (/<head[^>]*>/i.test(html)) {
    html = html.replace(/<head[^>]*>/i, (m) => `${m}\n${baseTag}\n${headShim}`);
  } else {
    html = `<head>${baseTag}\n${headShim}</head>${html}`;
  }

  if (/<\/body>/i.test(html)) {
    html = html.replace(/<\/body>/i, `${bridgeScript}\n</body>`);
  } else {
    html = `${html}${bridgeScript}`;
  }
  return html;
}

// System Health check endpoint for OS daemons, Docker, and healthcheck probes
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    engine: 'SBS Engine Server Browser',
    version: '1.0.0',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

// Live Autocomplete Endpoint
app.get('/api/v1/autocomplete', async (req, res) => {
  const q = ((req.query.q as string) || '').trim();
  if (!q) {
    return res.json({ suggestions: TRENDING_TOPICS.map((t) => t.query) });
  }
  const live = await fetchLiveAutocomplete(q);
  const local = AUTOCOMPLETE_DB.filter((item) => item.toLowerCase().includes(q.toLowerCase()));
  const merged = Array.from(new Set([...live, ...local])).slice(0, 8);
  res.json({
    suggestions: merged.length > 0 ? merged : [q, `${q} เว็บไซต์ทางการ`, `${q} ข่าวล่าสุด`],
  });
});

app.get('/api/v1/trending', (_req, res) => {
  res.json({ trending: TRENDING_TOPICS });
});

// Shenwang Account Authentication & Sync Endpoints
app.post('/api/v1/auth/check-identifier', (req, res) => {
  const normalized = normalizeShenwangIdentifier(String(req.body?.identifier || ''));
  if (!normalized || !isValidShenwangIdentifier(normalized)) {
    return res.status(400).json({ error: 'กรุณากรอกชื่อผู้ใช้ Shenwang หรืออีเมลให้ถูกต้อง' });
  }
  const user = shenwangUsersByIdentifier.get(normalized);
  if (!user) {
    return res.json({ exists: false, identifier: normalized });
  }
  return res.json({
    exists: true,
    identifier: user.identifier,
    displayName: user.displayName,
    avatarColor: user.avatarColor,
  });
});

app.post('/api/v1/auth/register', (req, res) => {
  const displayName = String(req.body?.displayName || '').trim().slice(0, 80);
  const identifier = normalizeShenwangIdentifier(String(req.body?.identifier || ''));
  const password = String(req.body?.password || '');

  if (displayName.length < 2) {
    return res.status(400).json({ error: 'กรุณากรอกชื่อที่แสดงอย่างน้อย 2 ตัวอักษร' });
  }
  if (!isValidShenwangIdentifier(identifier)) {
    return res.status(400).json({ error: 'รูปแบบชื่อผู้ใช้หรืออีเมลไม่ถูกต้อง (ใช้ตัวอักษรอังกฤษ ตัวเลข . _ -)' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'รหัสผ่านต้องมีความยาวอย่างน้อย 6 ตัวอักษร' });
  }
  if (shenwangUsersByIdentifier.has(identifier)) {
    return res.status(409).json({ error: 'บัญชี Shenwang ID หรืออีเมลนี้ถูกใช้งานแล้ว' });
  }

  const uid = `sw_${crypto.randomBytes(10).toString('hex')}`;
  const { salt, hash } = hashPassword(password);
  const nowIso = new Date().toISOString();
  const requestedColor = req.body?.avatarColor as AvatarColor;
  const avatarColor: AvatarColor = VALID_AVATAR_COLORS.includes(requestedColor) ? requestedColor : 'cobalt';

  const newUser: ShenwangUserRecord = {
    uid,
    identifier,
    displayName,
    avatarColor,
    passwordHash: hash,
    passwordSalt: salt,
    createdAt: nowIso,
    lastLoginAt: nowIso,
    bookmarks: [],
    history: [],
  };

  shenwangUsersById.set(uid, newUser);
  shenwangUsersByIdentifier.set(identifier, newUser);

  const token = crypto.randomBytes(32).toString('hex');
  shenwangSessions.set(token, {
    token,
    uid,
    createdAt: nowIso,
    expiresAt: Date.now() + SHENWANG_SESSION_TTL_MS,
  });
  saveShenwangStore();
  setSessionCookie(req, res, token);

  return res.status(201).json({
    authenticated: true,
    sessionToken: token,
    user: sanitizePublicUser(newUser),
    bookmarks: newUser.bookmarks,
    history: newUser.history,
  });
});

app.post('/api/v1/auth/login', (req, res) => {
  const identifier = normalizeShenwangIdentifier(String(req.body?.identifier || ''));
  const password = String(req.body?.password || '');
  if (!identifier || !password) {
    return res.status(400).json({ error: 'กรุณากรอกชื่อบัญชีและรหัสผ่าน' });
  }

  const user = shenwangUsersByIdentifier.get(identifier);
  if (!user || !verifyPassword(password, user.passwordSalt, user.passwordHash)) {
    return res.status(401).json({ error: 'ชื่อบัญชีหรือรหัสผ่าน Shenwang Account ไม่ถูกต้อง' });
  }

  const nowIso = new Date().toISOString();
  user.lastLoginAt = nowIso;

  const token = crypto.randomBytes(32).toString('hex');
  shenwangSessions.set(token, {
    token,
    uid: user.uid,
    createdAt: nowIso,
    expiresAt: Date.now() + SHENWANG_SESSION_TTL_MS,
  });
  saveShenwangStore();
  setSessionCookie(req, res, token);

  return res.json({
    authenticated: true,
    sessionToken: token,
    user: sanitizePublicUser(user),
    bookmarks: user.bookmarks,
    history: user.history,
  });
});

app.post('/api/v1/auth/logout', (req, res) => {
  const token = extractSessionToken(req);
  if (token && shenwangSessions.has(token)) {
    shenwangSessions.delete(token);
    saveShenwangStore();
  }
  clearSessionCookie(req, res);
  return res.json({ loggedOut: true });
});

app.get('/api/v1/auth/me', (req, res) => {
  const user = getAuthenticatedUser(req);
  if (!user) {
    return res.json({ authenticated: false, user: null, bookmarks: [], history: [] });
  }
  return res.json({
    authenticated: true,
    user: sanitizePublicUser(user),
    bookmarks: user.bookmarks,
    history: user.history,
  });
});

app.patch('/api/v1/auth/profile', (req, res) => {
  const user = getAuthenticatedUser(req);
  if (!user) {
    return res.status(401).json({ error: 'กรุณาลงชื่อเข้าใช้ Shenwang Account ก่อน' });
  }

  if (typeof req.body?.displayName === 'string') {
    const nextName = req.body.displayName.trim().slice(0, 80);
    if (nextName.length < 2) {
      return res.status(400).json({ error: 'ชื่อที่แสดงต้องมีอย่างน้อย 2 ตัวอักษร' });
    }
    user.displayName = nextName;
  }

  if (VALID_AVATAR_COLORS.includes(req.body?.avatarColor)) {
    user.avatarColor = req.body.avatarColor;
  }

  if (typeof req.body?.newPassword === 'string' && req.body.newPassword.length > 0) {
    const currentPassword = String(req.body?.currentPassword || '');
    if (!verifyPassword(currentPassword, user.passwordSalt, user.passwordHash)) {
      return res.status(400).json({ error: 'รหัสผ่านปัจจุบันไม่ถูกต้อง' });
    }
    if (req.body.newPassword.length < 6) {
      return res.status(400).json({ error: 'รหัสผ่านใหม่ต้องมีอย่างน้อย 6 ตัวอักษร' });
    }
    const { salt, hash } = hashPassword(req.body.newPassword);
    user.passwordSalt = salt;
    user.passwordHash = hash;
  }

  saveShenwangStore();
  return res.json({
    updated: true,
    user: sanitizePublicUser(user),
  });
});

app.put('/api/v1/user/sync', (req, res) => {
  const user = getAuthenticatedUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (Array.isArray(req.body?.bookmarks)) {
    user.bookmarks = req.body.bookmarks
      .filter((b: any) => b && typeof b.url === 'string' && typeof b.title === 'string')
      .slice(0, 100)
      .map((b: any) => ({
        title: String(b.title).slice(0, 200),
        url: String(b.url).slice(0, 500),
        domain: b.domain ? String(b.domain).slice(0, 120) : undefined,
        snippet: b.snippet ? String(b.snippet).slice(0, 400) : undefined,
      }));
  }
  if (Array.isArray(req.body?.history)) {
    user.history = req.body.history
      .filter((h: any) => typeof h === 'string' && h.trim().length > 0)
      .slice(0, 50)
      .map((h: string) => h.trim().slice(0, 200));
  }
  saveShenwangStore();
  return res.json({
    synced: true,
    bookmarks: user.bookmarks,
    history: user.history,
  });
});

// Shenwang OAuth 2.0 / SSO Endpoints (allows external apps & standalone /oauth/authorize portal)
app.post('/api/v1/oauth/authorize', (req, res) => {
  const user = getAuthenticatedUser(req);
  if (!user) {
    return res.status(401).json({ error: 'กรุณาลงชื่อเข้าใช้ Shenwang Account ก่อนอนุญาตการเชื่อมต่อ' });
  }

  const clientId = String(req.body?.clientId || 'sbs_search_web').trim().slice(0, 80);
  const appName = String(req.body?.appName || 'SBS Search Client').trim().slice(0, 100);
  const redirectUri = String(req.body?.redirectUri || '/').trim().slice(0, 500);
  const scope = String(req.body?.scope || 'profile').trim().slice(0, 120);

  if (!clientId || !redirectUri) {
    return res.status(400).json({ error: 'กรุณาระบุ clientId และ redirectUri ให้ครบถ้วน' });
  }

  // Allow relative paths or http/https URIs only (prevent javascript: XSS redirects)
  const isSafeRedirect =
    redirectUri.startsWith('/') ||
    /^https?:\/\//i.test(redirectUri);
  if (!isSafeRedirect) {
    return res.status(400).json({ error: 'redirectUri ไม่ปลอดภัยหรือรูปแบบไม่ถูกต้อง' });
  }

  const code = `sw_code_${crypto.randomBytes(20).toString('hex')}`;
  const nowIso = new Date().toISOString();

  shenwangOAuthCodes.set(code, {
    code,
    uid: user.uid,
    clientId,
    appName,
    redirectUri,
    scope,
    expiresAt: Date.now() + 5 * 60 * 1000,
  });

  if (!Array.isArray(user.connectedApps)) {
    user.connectedApps = [];
  }
  const existingIdx = user.connectedApps.findIndex((a) => a.clientId === clientId);
  if (existingIdx >= 0) {
    user.connectedApps[existingIdx] = {
      ...user.connectedApps[existingIdx],
      appName,
      scope,
      lastUsedAt: nowIso,
    };
  } else {
    user.connectedApps.unshift({
      clientId,
      appName,
      scope,
      authorizedAt: nowIso,
      lastUsedAt: nowIso,
    });
  }
  saveShenwangStore();

  return res.json({
    code,
    clientId,
    redirectUri,
    scope,
    user: sanitizePublicUser(user),
  });
});

app.post('/api/v1/oauth/token', (req, res) => {
  const code = String(req.body?.code || '').trim();
  const clientId = String(req.body?.clientId || '').trim();
  const redirectUri = String(req.body?.redirectUri || '').trim();

  if (!code || !shenwangOAuthCodes.has(code)) {
    return res.status(400).json({ error: 'invalid_grant', message: 'Authorization code ไม่ถูกต้องหรือหมดอายุแล้ว' });
  }

  const record = shenwangOAuthCodes.get(code)!;
  shenwangOAuthCodes.delete(code);

  if (record.expiresAt <= Date.now()) {
    return res.status(400).json({ error: 'invalid_grant', message: 'Authorization code หมดอายุแล้ว' });
  }
  if (clientId && record.clientId !== clientId) {
    return res.status(400).json({ error: 'invalid_client', message: 'clientId ไม่ตรงกับคำขอเริ่มต้น' });
  }
  if (redirectUri && record.redirectUri !== redirectUri) {
    return res.status(400).json({ error: 'invalid_redirect_uri', message: 'redirectUri ไม่ตรงกับคำขอเริ่มต้น' });
  }

  const user = shenwangUsersById.get(record.uid);
  if (!user) {
    return res.status(404).json({ error: 'user_not_found' });
  }

  const accessToken = `sw_at_${crypto.randomBytes(24).toString('hex')}`;
  shenwangOAuthTokens.set(accessToken, {
    accessToken,
    uid: user.uid,
    clientId: record.clientId,
    scope: record.scope,
    expiresAt: Date.now() + 24 * 60 * 60 * 1000,
  });

  return res.json({
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: 86400,
    scope: record.scope,
    user: sanitizePublicUser(user),
  });
});

app.get('/api/v1/oauth/userinfo', (req, res) => {
  const auth = req.headers.authorization || '';
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  if (!token || !shenwangOAuthTokens.has(token)) {
    return res.status(401).json({ error: 'invalid_token' });
  }
  const tokenInfo = shenwangOAuthTokens.get(token)!;
  if (tokenInfo.expiresAt <= Date.now()) {
    shenwangOAuthTokens.delete(token);
    return res.status(401).json({ error: 'token_expired' });
  }
  const user = shenwangUsersById.get(tokenInfo.uid);
  if (!user) {
    return res.status(404).json({ error: 'user_not_found' });
  }
  return res.json({
    sub: user.uid,
    identifier: user.identifier,
    name: user.displayName,
    avatarColor: user.avatarColor,
    scope: tokenInfo.scope,
  });
});

app.delete('/api/v1/auth/connected-apps/:clientId', (req, res) => {
  const user = getAuthenticatedUser(req);
  if (!user) {
    return res.status(401).json({ error: 'กรุณาลงชื่อเข้าใช้ Shenwang Account ก่อน' });
  }
  const targetClient = req.params.clientId;
  user.connectedApps = (user.connectedApps || []).filter((a) => a.clientId !== targetClient);
  saveShenwangStore();
  return res.json({
    revoked: true,
    user: sanitizePublicUser(user),
  });
});

app.get('/api/v1/developer/keys', (_req, res) => {
  const keys = Array.from(apiKeysDb.entries()).map(([key, info]) => ({
    key,
    ...info,
  }));
  res.json({ keys });
});

app.post('/api/v1/developer/keys', (req, res) => {
  const user = getAuthenticatedUser(req);
  const name = ((req.body?.name as string) || 'Application Key').trim().slice(0, 60);
  const scope = req.body?.scope === 'read:search' ? 'read:search' : 'full:access';
  const newKey =
    'sbs_live_' +
    Math.random().toString(36).substring(2, 10) +
    Math.random().toString(36).substring(2, 10);
  const record: ApiKeyRecord = {
    name: name || 'Application Key',
    created: new Date().toISOString(),
    lastUsed: null,
    requests: 0,
    scope,
    ...(user ? { ownerUid: user.uid, ownerIdentifier: user.identifier } : {}),
  };
  apiKeysDb.set(newKey, record);
  res.status(201).json({ key: newKey, apiKey: newKey, ...record });
});

app.delete('/api/v1/developer/keys/:key', (req, res) => {
  const targetKey = req.params.key;
  if (!apiKeysDb.has(targetKey)) {
    return res.status(404).json({ error: 'API Key not found' });
  }
  if (apiKeysDb.size <= 1) {
    return res.status(400).json({ error: 'ต้องเหลือ API Key อย่างน้อย 1 คีย์ในระบบ' });
  }
  apiKeysDb.delete(targetKey);
  res.json({ deleted: true, key: targetKey });
});

app.get('/api/v1/developer/logs', (_req, res) => {
  const totalRequests = Array.from(apiKeysDb.values()).reduce((sum, k) => sum + k.requests, 0) + apiRequestLogs.filter((l) => l.keyPrefix === 'Web Client').length;
  const avgLatencyMs =
    apiRequestLogs.length > 0
      ? Math.round(apiRequestLogs.reduce((sum, l) => sum + l.latencyMs, 0) / apiRequestLogs.length)
      : null;
  res.json({
    logs: apiRequestLogs,
    activeKeys: apiKeysDb.size,
    totalRequests,
    avgLatencyMs,
  });
});

app.get('/api/v1/developer/stats', (req, res) => {
  const authHeader = req.headers.authorization;
  const key = authHeader ? authHeader.replace('Bearer ', '').trim() : 'sbs_live_demo12345';
  const info = apiKeysDb.get(key);
  res.json({
    apiKey: key,
    ...(info || { name: 'Unknown Key', created: new Date().toISOString(), lastUsed: null, requests: 0, scope: 'read:search' }),
    totalActiveKeys: apiKeysDb.size,
  });
});

// Hybrid High-Speed Real Web Search API (Gemini Google Search Grounding + Live Web/News/Wiki Engine)
app.all('/api/v1/search', async (req, res) => {
  const startTime = performance.now();
  const query = ((req.method === 'POST' ? req.body.q : req.query.q) as string) || '';
  const lang = ((req.method === 'POST' ? req.body.lang : req.query.lang) as string) || 'th';
  const mode = ((req.method === 'POST' ? req.body.mode : req.query.mode) as string) || 'all';

  const authHeader = req.headers.authorization;
  let keyPrefix = 'Web Client';
  if (authHeader) {
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!apiKeysDb.has(token)) {
      const latencyMs = Math.max(1, Math.round(performance.now() - startTime));
      pushApiLog({
        id: Math.random().toString(36).substring(2, 10),
        timestamp: new Date().toISOString(),
        method: req.method,
        endpoint: '/api/v1/search',
        query: query.trim() || '-',
        mode,
        status: 401,
        latencyMs,
        keyPrefix: token ? `${token.slice(0, 12)}...` : 'missing',
        cached: false,
      });
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid or revoked SBS API Key. Generate or select an active key in Developer Console.',
      });
    }
    const keyInfo = apiKeysDb.get(token)!;
    keyInfo.requests += 1;
    keyInfo.lastUsed = new Date().toISOString();
    keyPrefix = `${token.slice(0, 14)}...`;
  }

  const trimmedQuery = query.trim();
  if (!trimmedQuery) {
    const latencyMs = Math.max(1, Math.round(performance.now() - startTime));
    pushApiLog({
      id: Math.random().toString(36).substring(2, 10),
      timestamp: new Date().toISOString(),
      method: req.method,
      endpoint: '/api/v1/search',
      query: '-',
      mode,
      status: 400,
      latencyMs,
      keyPrefix,
      cached: false,
    });
    return res.status(400).json({ error: 'Query parameter "q" is required.' });
  }

  const cacheKey = `${trimmedQuery.toLowerCase()}__${lang}__${mode}`;
  const cached = searchResultCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    const endTime = performance.now();
    const latencyMs = Math.max(1, Math.round(endTime - startTime));
    pushApiLog({
      id: Math.random().toString(36).substring(2, 10),
      timestamp: new Date().toISOString(),
      method: req.method,
      endpoint: '/api/v1/search',
      query: trimmedQuery,
      mode,
      status: 200,
      latencyMs,
      keyPrefix,
      cached: true,
    });
    return res.json({
      ...cached.data,
      searchTime: ((endTime - startTime) / 1000).toFixed(3),
      cached: true,
    });
  }

  try {
    let aiSummary = '';
    let results: any[] = [];
    let news: any[] = [];
    let videos: any[] = [];
    let images: any[] = [];
    let knowledgePanel: any = null;
    let relatedQueries: string[] = [];
    let peopleAlsoSearch: { title: string; category: string }[] = [];
    let groundedByGemini = false;

    const webQueryForMode =
      mode === 'video' ? `${trimmedQuery} site:youtube.com OR video` : trimmedQuery;

    // Run live web RSS, news RSS, autocomplete, Wikipedia, and optional Gemini Google Search Grounding concurrently
    const geminiPromise = ai
      ? ai.models
          .generateContent({
            model: 'gemini-4-hydrogen',
            contents: `You are SBS Search Engine. Search query: "${trimmedQuery}", mode: "${mode}", lang: "${lang}".
Return ONLY a JSON object with:
{
  "aiSummary": "Concise 1-2 paragraph summary in Thai (or query language)",
  "knowledgePanel": { "title": "...", "subtitle": "...", "description": "...", "officialUrl": "https://...", "facts": [{ "label": "...", "value": "..." }] },
  "results": [{ "title": "...", "url": "https://...", "snippet": "...", "publishedDate": "..." }],
  "relatedQueries": ["...", "..."],
  "peopleAlsoSearch": [{ "title": "...", "category": "..." }]
}`,
            config: { tools: [{ googleSearch: {} }] },
          })
          .catch((err) => {
            console.warn('Gemini grounding fallback triggered:', err?.status || err?.message || err);
            return null;
          })
      : Promise.resolve(null);

    const [webRss, newsRss, liveSuggestions, wikiData, geminiResp] = await Promise.all([
      fetchWebRssSearch(webQueryForMode),
      fetchNewsRssSearch(trimmedQuery),
      fetchLiveAutocomplete(trimmedQuery),
      fetchWikipediaSummary(trimmedQuery),
      geminiPromise,
    ]);

    if (geminiResp) {
      groundedByGemini = true;
      const rawText = geminiResp.text || '';
      const parsed = parseJsonFromModelText(rawText);
      const groundingMeta = geminiResp.candidates?.[0]?.groundingMetadata;
      const chunks = groundingMeta?.groundingChunks || [];
      const supports = groundingMeta?.groundingSupports || [];
      const webSearchQueries = groundingMeta?.webSearchQueries || [];

      const resolvedChunks = await Promise.all(
        chunks
          .filter((c: any) => c?.web?.uri)
          .slice(0, 8)
          .map(async (c: any, idx: number) => {
            const resolvedUri = await resolveRedirectUrl(c.web.uri);
            const supportText = supports
              .filter((s: any) => Array.isArray(s.groundingChunkIndices) && s.groundingChunkIndices.includes(idx))
              .map((s: any) => s.segment?.text)
              .filter(Boolean)
              .join(' ')
              .trim();
            return {
              title: c.web.title || getDomainFromUrl(resolvedUri),
              url: resolvedUri,
              domain: getDomainFromUrl(resolvedUri),
              breadcrumb: getDisplayBreadcrumb(resolvedUri),
              snippet: supportText || '',
              publishedDate: '',
            };
          })
      );

      if (parsed) {
        if (typeof parsed.aiSummary === 'string') aiSummary = parsed.aiSummary;
        if (parsed.knowledgePanel?.title) knowledgePanel = parsed.knowledgePanel;
        if (Array.isArray(parsed.results)) {
          results = parsed.results
            .filter((r: any) => r?.url && (r.url.startsWith('http://') || r.url.startsWith('https://')))
            .map((r: any) => ({
              title: r.title || getDomainFromUrl(r.url),
              url: r.url,
              snippet: r.snippet || '',
              domain: getDomainFromUrl(r.url),
              breadcrumb: getDisplayBreadcrumb(r.url),
              publishedDate: r.publishedDate || '',
            }));
        }
        if (Array.isArray(parsed.relatedQueries)) {
          relatedQueries = parsed.relatedQueries.filter((q: any) => typeof q === 'string');
        }
        if (Array.isArray(parsed.peopleAlsoSearch)) {
          peopleAlsoSearch = parsed.peopleAlsoSearch.filter((p: any) => p?.title);
        }
      } else if (rawText) {
        aiSummary = rawText;
      }

      const seen = new Set(results.map((r) => r.url));
      for (const c of resolvedChunks) {
        if (!seen.has(c.url)) {
          seen.add(c.url);
          results.push(c);
        }
      }
      if (relatedQueries.length === 0 && webSearchQueries.length > 0) {
        relatedQueries = webSearchQueries.slice(0, 5);
      }
    }

    // Merge real-time Web RSS results (ensuring high-quality organic links always appear)
    const seenUrls = new Set(results.map((r) => r.url.replace(/\/$/, '')));
    for (const item of webRss) {
      const normalized = item.url.replace(/\/$/, '');
      if (!seenUrls.has(normalized)) {
        seenUrls.add(normalized);
        results.push(item);
      }
    }

    // Include Wikipedia result if relevant and not already present
    if (wikiData && !seenUrls.has(wikiData.url.replace(/\/$/, ''))) {
      results.splice(Math.min(2, results.length), 0, {
        title: `${wikiData.title} - วิกิพีเดีย`,
        url: wikiData.url,
        snippet: wikiData.extract,
        domain: `${wikiData.lang}.wikipedia.org`,
        breadcrumb: getDisplayBreadcrumb(wikiData.url),
        publishedDate: 'Wikipedia',
      });
    }

    // Populate Knowledge Panel & AI Summary from Wikipedia if Gemini wasn't available
    if (!aiSummary && wikiData?.extract) {
      aiSummary = wikiData.extract;
    }
    if (!knowledgePanel && wikiData) {
      knowledgePanel = {
        title: wikiData.title,
        subtitle: 'ข้อมูลจากสารานุกรมเสรี (Wikipedia)',
        description: wikiData.extract,
        officialUrl: results[0]?.url || wikiData.url,
        thumbnail: wikiData.thumbnail || null,
        facts: [
          { label: 'แหล่งข้อมูล', value: `${wikiData.lang}.wikipedia.org` },
          ...(results[0]?.domain ? [{ label: 'เว็บไซต์ที่เกี่ยวข้อง', value: results[0].domain }] : []),
        ],
      };
    }

    // News mode results
    news = newsRss.length > 0
      ? newsRss
      : results.slice(0, 6).map((r) => ({
          title: r.title,
          source: r.domain,
          time: r.publishedDate || 'ล่าสุด',
          url: r.url,
          snippet: r.snippet,
        }));

    // Video mode results
    const videoCandidates = results.filter(
      (r) =>
        r.domain.includes('youtube') ||
        r.domain.includes('youtu.be') ||
        r.domain.includes('tiktok') ||
        r.domain.includes('vimeo') ||
        r.domain.includes('dailymotion')
    );
    videos = (videoCandidates.length > 0 ? videoCandidates : results.slice(0, 6)).map((r) => ({
      title: r.title,
      channel: r.domain,
      duration: r.domain.includes('youtube') ? 'YouTube' : 'วิดีโอเว็บ',
      views: r.domain,
      url: r.url,
    }));

    // Images mode: fetch genuine og:image metadata from real grounded pages
    if (mode === 'images') {
      const candidatePages = results.slice(0, 6);
      images = await Promise.all(
        candidatePages.map(async (item) => {
          const meta = await fetchPageMetaPreview(item.url);
          return {
            title: meta.title || item.title,
            imageUrl: meta.imageUrl,
            pageUrl: item.url,
            source: item.domain,
            description: meta.description || item.snippet,
          };
        })
      );
    }

    if (relatedQueries.length === 0) {
      relatedQueries =
        liveSuggestions.length > 0
          ? liveSuggestions.filter((s) => s.toLowerCase() !== trimmedQuery.toLowerCase()).slice(0, 6)
          : [`${trimmedQuery} เว็บไซต์ทางการ`, `${trimmedQuery} ล่าสุด`, `${trimmedQuery} รีวิว`];
    }

    if (peopleAlsoSearch.length === 0) {
      peopleAlsoSearch = relatedQueries.slice(0, 4).map((rq) => ({
        title: rq,
        category: 'ผู้คนยังค้นหา',
      }));
    }

    const endTime = performance.now();
    const searchTime = ((endTime - startTime) / 1000).toFixed(3);

    const payload = {
      query: trimmedQuery,
      mode,
      searchTime,
      totalResults: results.length > 0 ? `พบ ${results.length} ผลลัพธ์จากเว็บจริง` : 'ไม่พบผลลัพธ์ที่ตรงกัน',
      aiSummary,
      knowledgePanel,
      results,
      images,
      news,
      videos,
      relatedQueries,
      peopleAlsoSearch,
      grounded: groundedByGemini,
      engine: groundedByGemini ? 'SBS Search (Gemini + Live Web)' : 'SBS Live Web Search',
    };

    if (results.length > 0 || aiSummary) {
      searchResultCache.set(cacheKey, {
        expires: Date.now() + SEARCH_CACHE_TTL_MS,
        data: payload,
      });
    }

    pushApiLog({
      id: Math.random().toString(36).substring(2, 10),
      timestamp: new Date().toISOString(),
      method: req.method,
      endpoint: '/api/v1/search',
      query: trimmedQuery,
      mode,
      status: 200,
      latencyMs: Math.max(1, Math.round(endTime - startTime)),
      keyPrefix,
      cached: false,
    });

    res.json(payload);
  } catch (error: any) {
    console.error('Search error:', error);
    pushApiLog({
      id: Math.random().toString(36).substring(2, 10),
      timestamp: new Date().toISOString(),
      method: req.method,
      endpoint: '/api/v1/search',
      query: trimmedQuery,
      mode,
      status: 500,
      latencyMs: Math.max(1, Math.round(performance.now() - startTime)),
      keyPrefix,
      cached: false,
    });
    res.status(500).json({ error: 'Search failed', details: error.message });
  }
});

// Chrome Web Preview Endpoint (SSRF-protected, fast-cached, 4.5s hard timeout)
app.get('/api/v1/preview', async (req, res) => {
  const rawUrl = ((req.query.url as string) || '').trim();
  if (!rawUrl) {
    return res.status(400).json({ error: 'กรุณาระบุ URL' });
  }

  let normalizedUrl = rawUrl;
  if (!/^https?:\/\//i.test(normalizedUrl)) {
    normalizedUrl = `https://${normalizedUrl}`;
  }

  const cachedPreview = previewResultCache.get(normalizedUrl);
  if (cachedPreview && cachedPreview.expires > Date.now()) {
    return res.json(cachedPreview.data);
  }

  const overallController = new AbortController();
  const overallTimer = setTimeout(() => overallController.abort(), 4500);

  try {
    const validatedUrl = await validatePublicUrl(normalizedUrl);
    let currentUrl = validatedUrl.toString();
    let response: Response | null = null;
    let redirectCount = 0;

    const cookieJar: string[] = [];

    while (redirectCount < 5) {
      response = await fetch(currentUrl, {
        method: 'GET',
        redirect: 'manual',
        signal: overallController.signal,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'th-TH,th;q=0.9,en-US;q=0.8,en;q=0.7',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
          'Upgrade-Insecure-Requests': '1',
          ...(cookieJar.length > 0 ? { Cookie: cookieJar.join('; ') } : {}),
        },
      });

      const setCookies = response.headers.getSetCookie?.() || [];
      for (const sc of setCookies) {
        const pair = sc.split(';')[0]?.trim();
        if (pair) cookieJar.push(pair);
      }

      if (response.status >= 300 && response.status < 400) {
        const loc = response.headers.get('location');
        if (!loc) break;
        const nextUrl = new URL(loc, currentUrl).toString();
        await validatePublicUrl(nextUrl);
        currentUrl = nextUrl;
        redirectCount += 1;
        continue;
      }
      break;
    }

    if (!response) {
      throw new Error('ไม่สามารถเชื่อมต่อเว็บไซต์ปลายทางได้');
    }

    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    const finalUrl = currentUrl;
    const domain = getDomainFromUrl(finalUrl);
    const favicon = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`;

    if (contentType.startsWith('image/')) {
      const html = `<!doctype html><html><body style="margin:0;background:#111;display:flex;align-items:center;justify-content:center;min-height:100vh;"><img src="${finalUrl.replace(/"/g, '&quot;')}" style="max-width:100%;max-height:100vh;object-fit:contain;" /></body></html>`;
      const payload = {
        finalUrl,
        domain,
        favicon,
        title: domain,
        status: response.status,
        canRenderWeb: true,
        preferredMode: 'web',
        html,
        reader: { title: domain, description: '', ogImage: finalUrl, blocks: [], links: [] },
      };
      return res.json(payload);
    }

    if (contentType.includes('application/json') || contentType.includes('text/plain')) {
      const textBody = await readTextLimited(response, 100000);
      const escaped = textBody.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const html = `<!doctype html><html><body style="margin:0;padding:24px;font-family:monospace;font-size:13px;line-height:1.6;background:#f8fafc;color:#0f172a;"><pre style="white-space:pre-wrap;word-break:break-word;">${escaped}</pre></body></html>`;
      return res.json({
        finalUrl,
        domain,
        favicon,
        title: domain,
        status: response.status,
        canRenderWeb: true,
        preferredMode: 'web',
        html,
        reader: {
          title: domain,
          description: '',
          ogImage: null,
          blocks: [{ tag: 'p', text: textBody.slice(0, 3000) }],
          links: [],
        },
      });
    }

    const rawHtml = await readTextLimited(response, 400000);
    const reader = extractReaderContent(rawHtml, finalUrl);

    const isBotChallenge =
      response.status === 403 ||
      response.status === 429 ||
      response.status === 503 ||
      /cf-browser-verification|challenge-platform|just a moment\.\.\.|enable javascript and cookies/i.test(rawHtml);

    const canRenderWeb = response.ok && !isBotChallenge && rawHtml.trim().length > 200;
    const iframeHtml = canRenderWeb ? buildIframeHtml(rawHtml, finalUrl) : '';

    let siteOverview = '';
    if (!canRenderWeb) {
      const rootBrand = domain.split('.').slice(-2, -1)[0] || domain;
      const wiki = await fetchWikipediaSummary(rootBrand);
      if (wiki?.extract) {
        siteOverview = wiki.extract;
      }
    }

    const payload = {
      finalUrl,
      domain,
      favicon,
      title: reader.title || domain,
      status: response.status,
      canRenderWeb,
      preferredMode: canRenderWeb ? 'web' : 'reader',
      blockedReason: isBotChallenge
        ? 'เว็บไซต์นี้จำกัดการเปิดผ่านพรีวิวตัวกลาง สามารถกด "เปิดหน้าเว็บจริง" เพื่อดูในเบราว์เซอร์หลักได้ทันที'
        : !response.ok
          ? `หน้าเว็บนี้ต้องการการเข้าสู่ระบบหรือการยืนยันตัวตนจากเบราว์เซอร์หลัก (HTTP ${response.status})`
          : undefined,
      html: iframeHtml,
      reader: {
        ...reader,
        aiSummary: siteOverview,
      },
    };

    if (canRenderWeb) {
      if (previewResultCache.size >= 50) {
        const firstKey = previewResultCache.keys().next().value;
        if (firstKey) previewResultCache.delete(firstKey);
      }
      previewResultCache.set(normalizedUrl, {
        expires: Date.now() + PREVIEW_CACHE_TTL_MS,
        data: payload,
      });
    }

    return res.json(payload);
  } catch (error: any) {
    const domain = getDomainFromUrl(normalizedUrl);
    const isTimeout = error?.name === 'AbortError' || /abort|timeout/i.test(error?.message || '');
    return res.json({
      finalUrl: normalizedUrl,
      domain,
      favicon: `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`,
      title: domain,
      status: 0,
      canRenderWeb: false,
      preferredMode: 'reader',
      blockedReason: isTimeout
        ? 'เว็บไซต์ปลายทางตอบสนองช้าเกิน 4.5 วินาที สามารถกด "เปิดหน้าเว็บจริง" เพื่อเปิดโดยตรงในเบราว์เซอร์ได้ทันที'
        : error.message || 'ไม่สามารถดึงหน้าเว็บโดยตรงได้',
      html: '',
      reader: {
        title: domain,
        description: '',
        ogImage: null,
        blocks: [],
        links: [],
      },
    });
  } finally {
    clearTimeout(overallTimer);
  }
});

function buildTarGz(entries: Array<{ name: string; content: Buffer; mode?: number }>): Buffer {
  const blocks: Buffer[] = [];
  for (const entry of entries) {
    const cleanName = entry.name.replace(/^\/+/, '').slice(0, 99);
    const header = Buffer.alloc(512, 0);
    header.write(cleanName, 0, 'utf8');
    header.write((entry.mode ?? 0o644).toString(8).padStart(7, '0') + '\0', 100, 'ascii');
    header.write('0000000\0', 108, 'ascii');
    header.write('0000000\0', 116, 'ascii');
    header.write(entry.content.length.toString(8).padStart(11, '0') + '\0', 124, 'ascii');
    const mtime = Math.floor(Date.now() / 1000).toString(8).padStart(11, '0') + '\0';
    header.write(mtime, 136, 'ascii');
    header.fill(0x20, 148, 156); // checksum placeholder
    header.write('0', 156, 'ascii'); // regular file
    header.write('ustar\0', 257, 'ascii');
    header.write('00', 263, 'ascii');
    let sum = 0;
    for (let i = 0; i < 512; i++) sum += header[i];
    header.write(sum.toString(8).padStart(6, '0') + '\0 ', 148, 'ascii');
    blocks.push(header);

    if (entry.content.length > 0) {
      blocks.push(entry.content);
      const remainder = entry.content.length % 512;
      if (remainder !== 0) {
        blocks.push(Buffer.alloc(512 - remainder, 0));
      }
    }
  }
  blocks.push(Buffer.alloc(1024, 0)); // EOF marker
  return zlib.gzipSync(Buffer.concat(blocks));
}

function collectDirEntries(
  dirAbs: string,
  prefix: string,
  entries: Array<{ name: string; content: Buffer; mode?: number }>,
  maxFiles = 400
) {
  if (!fs.existsSync(dirAbs)) return;
  try {
    const list = fs.readdirSync(dirAbs, { withFileTypes: true });
    for (const item of list) {
      if (entries.length >= maxFiles) break;
      const fullPath = path.join(dirAbs, item.name);
      const tarName = path.posix.join(prefix, item.name);
      if (item.isDirectory()) {
        collectDirEntries(fullPath, tarName, entries, maxFiles);
      } else if (item.isFile()) {
        try {
          const content = fs.readFileSync(fullPath);
          const isExec = item.name.endsWith('.sh') || item.name === 'sbs-browser' || item.name.endsWith('.cjs');
          entries.push({ name: tarName, content, mode: isExec ? 0o755 : 0o644 });
        } catch {
          // ignore unreadable file
        }
      }
    }
  } catch {
    // ignore directory error
  }
}

app.get('/api/v1/packages/os-embedded.tar.gz', (_req, res) => {
  const entries: Array<{ name: string; content: Buffer; mode?: number }> = [];

  const rootInstaller = `#!/usr/bin/env bash
set -e
DIR="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
if [ -f "$DIR/os-embedded/install-os.sh" ]; then
  exec bash "$DIR/os-embedded/install-os.sh" "$@"
else
  echo "Error: install-os.sh not found." >&2
  exit 1
fi
`;
  entries.push({
    name: 'sbs-browser-os/install.sh',
    content: Buffer.from(rootInstaller, 'utf8'),
    mode: 0o755,
  });

  // Collect os-embedded folder
  collectDirEntries(path.join(__dirname, 'os-embedded'), 'sbs-browser-os/os-embedded', entries);

  // Collect pre-built dist folder
  collectDirEntries(path.join(__dirname, 'dist'), 'sbs-browser-os/dist', entries);

  // Collect desktop folder
  collectDirEntries(path.join(__dirname, 'desktop'), 'sbs-browser-os/desktop', entries);

  // Collect public folder
  collectDirEntries(path.join(__dirname, 'public'), 'sbs-browser-os/public', entries);

  // Core files
  const coreFiles = ['package.json', 'server.js', 'server.ts'];
  for (const f of coreFiles) {
    const abs = path.join(__dirname, f);
    if (fs.existsSync(abs)) {
      entries.push({
        name: `sbs-browser-os/${f}`,
        content: fs.readFileSync(abs),
        mode: 0o644,
      });
    }
  }

  const tgz = buildTarGz(entries);
  res.setHeader('Content-Type', 'application/gzip');
  res.setHeader('Content-Disposition', 'attachment; filename="sbs-browser-os-embedded.tar.gz"');
  return res.send(tgz);
});

// Direct download endpoints for actual binary application files (.exe and .apk)
app.get('/api/v1/download/windows-exe', (_req, res) => {
  const exePath = path.join(__dirname, 'public', 'downloads', 'SBS-Search.exe');
  if (!fs.existsSync(exePath)) {
    return res.status(404).json({ error: 'Windows .exe file not found' });
  }
  res.setHeader('Content-Type', 'application/vnd.microsoft.portable-executable');
  res.setHeader('Content-Disposition', 'attachment; filename="SBS-Search.exe"');
  return res.sendFile(exePath);
});

app.get('/api/v1/download/windows-full', (_req, res) => {
  const zipPath = path.join(__dirname, 'public', 'downloads', 'SBS-Search-Windows-Full.zip');
  if (!fs.existsSync(zipPath)) {
    return res.status(404).json({ error: 'Windows Full package not found' });
  }
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', 'attachment; filename="SBS-Search-Windows-Full.zip"');
  return res.sendFile(zipPath);
});

app.get('/api/v1/download/android-apk', (_req, res) => {
  const apkPath = path.join(__dirname, 'public', 'downloads', 'SBS-Search.apk');
  if (!fs.existsSync(apkPath)) {
    return res.status(404).json({ error: 'Android .apk file not found' });
  }
  res.setHeader('Content-Type', 'application/vnd.android.package-archive');
  res.setHeader('Content-Disposition', 'attachment; filename="SBS-Search.apk"');
  return res.sendFile(apkPath);
});

app.get('/api/v1/packages/apple-swift', (_req, res) => {
  const swiftPath = path.join(__dirname, 'apple-swift', 'Sources', 'SBSSearchApp.swift');
  if (!fs.existsSync(swiftPath)) {
    return res.status(404).json({ error: 'Swift source not found' });
  }
  res.setHeader('Content-Type', 'text/x-swift; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="SBSSearchApp.swift"');
  return res.send(fs.readFileSync(swiftPath, 'utf8'));
});

app.get('/api/v1/packages/flutter-kit.tar.gz', (_req, res) => {
  const relPaths = [
    'flutter-app/pubspec.yaml',
    'flutter-app/lib/main.dart',
    'flutter-app/README.md',
    '.github/workflows/build-apps.yml',
  ];
  const entries: Array<{ name: string; content: Buffer; mode?: number }> = [];
  for (const rel of relPaths) {
    const abs = path.join(__dirname, rel);
    if (fs.existsSync(abs)) {
      entries.push({
        name: `sbs-search-flutter-kit/${rel}`,
        content: fs.readFileSync(abs),
        mode: 0o644,
      });
    }
  }
  const tgz = buildTarGz(entries);
  res.setHeader('Content-Type', 'application/gzip');
  res.setHeader('Content-Disposition', 'attachment; filename="sbs-search-flutter-kit.tar.gz"');
  return res.send(tgz);
});

app.get('/api/v1/packages/native-kit.tar.gz', (_req, res) => {
  const relPaths = [
    'flutter-app/pubspec.yaml',
    'flutter-app/lib/main.dart',
    'flutter-app/README.md',
    'desktop/main.cjs',
    'desktop/icon.png',
    'desktop/icon.ico',
    'electron-builder.json',
    'capacitor.config.ts',
    'apple-swift/Package.swift',
    'apple-swift/project.yml',
    'apple-swift/Sources/SBSSearchApp.swift',
    '.github/workflows/build-apps.yml',
  ];

  const entries: Array<{ name: string; content: Buffer; mode?: number }> = [];
  for (const rel of relPaths) {
    const abs = path.join(__dirname, rel);
    if (fs.existsSync(abs)) {
      entries.push({
        name: `sbs-search-native-kit/${rel}`,
        content: fs.readFileSync(abs),
        mode: rel.endsWith('.cjs') ? 0o755 : 0o644,
      });
    }
  }

  const readme = [
    'SBS Engine / Shenwang Search - Multi-Platform Flutter & Native OS Kit',
    '=====================================================================',
    '',
    '0. Flutter All-in-One (Linux Custom OS, Windows, macOS, Android, iOS, Web)',
    '   cd flutter-app',
    '   flutter create . --platforms=android,ios,linux,macos,windows,web --org th.shenwang --project-name sbs_search',
    '   flutter pub get',
    '   flutter build linux --release     # Native Custom OS binary (no browser needed!)',
    '   flutter build windows --release   # Windows .exe',
    '   flutter build macos --release     # Apple macOS .app',
    '   flutter build ios --release --no-codesign',
    '   flutter build apk --release && flutter build appbundle --release',
    '   flutter build web --release',
    '',
    '1. Chromium Desktop Shell (without external browser) / Windows (.exe) / Linux (.AppImage/.deb/.tar.gz)',
    '   npm install && npm run build',
    '   npx electron@33 desktop/main.cjs --os-shell',
    '',
    '2. Apple Native Swift (iOS .ipa & macOS .app)',
    '   cd apple-swift && swift build -c release && brew install xcodegen && xcodegen generate',
    '',
  ].join('\n');

  entries.push({
    name: 'sbs-search-native-kit/README_BUILD_OS_APPS.txt',
    content: Buffer.from(readme, 'utf8'),
  });

  const tgz = buildTarGz(entries);
  res.setHeader('Content-Type', 'application/gzip');
  res.setHeader('Content-Disposition', 'attachment; filename="sbs-search-native-kit.tar.gz"');
  return res.send(tgz);
});

if (process.env.NODE_ENV !== 'production') {
  const { createServer: createViteServer } = await import('vite');
  const vite = await createViteServer({
    server: { middlewareMode: true, hmr: false, ws: false },
  });

  // In AI Studio / Cloud Run dev proxy, HMR WebSockets are disabled.
  // Vite 8's built-in /@vite/client still attempts a WebSocket connection to :24678
  // even with hmr: false, so serve a WebSocket-free client shim preserving style/HMR exports.
  app.get('/@vite/client', (_req, res) => {
    res.type('application/javascript').send(`
const sheetsMap = new Map();
const linkSheetsMap = new Map();
if ("document" in globalThis) {
  document.querySelectorAll("style[data-vite-dev-id]").forEach((el) => {
    sheetsMap.set(el.getAttribute("data-vite-dev-id"), el);
  });
  document.querySelectorAll('link[rel="stylesheet"][data-vite-dev-id]').forEach((el) => {
    linkSheetsMap.set(el.getAttribute("data-vite-dev-id"), el);
  });
}
let lastInsertedStyle;
export function updateStyle(id, content) {
  if (linkSheetsMap.has(id)) return;
  let style = sheetsMap.get(id);
  if (!style) {
    style = document.createElement("style");
    style.setAttribute("type", "text/css");
    style.setAttribute("data-vite-dev-id", id);
    style.textContent = content;
    if (!lastInsertedStyle) {
      document.head.appendChild(style);
      setTimeout(() => { lastInsertedStyle = undefined; }, 0);
    } else {
      lastInsertedStyle.insertAdjacentElement("afterend", style);
    }
    lastInsertedStyle = style;
  } else if (style.textContent !== content) {
    style.textContent = content;
  }
  sheetsMap.set(id, style);
}
export function removeStyle(id) {
  if (linkSheetsMap.has(id)) {
    document
      .querySelectorAll('link[rel="stylesheet"][data-vite-dev-id="' + CSS.escape(id) + '"]')
      .forEach((el) => el.remove());
    linkSheetsMap.delete(id);
  }
  const style = sheetsMap.get(id);
  if (style) {
    document.head.removeChild(style);
    sheetsMap.delete(id);
  }
}
export function createHotContext() {
  return {
    data: {},
    accept() {},
    acceptExports() {},
    dispose() {},
    prune() {},
    decline() {},
    invalidate() {},
    on() {},
    off() {},
    send() {},
  };
}
export function injectQuery(url, queryToInject) {
  if (url[0] !== "." && url[0] !== "/") return url;
  const pathname = url.replace(/[?#].*$/, "");
  const { search, hash } = new URL(url, "http://vite.dev");
  return pathname + "?" + queryToInject + (search ? "&" + search.slice(1) : "") + (hash || "");
}
export class ErrorOverlay extends HTMLElement {
  constructor(err) {
    super();
    this.err = err;
  }
  close() {
    this.parentNode?.removeChild(this);
  }
}
if (globalThis.customElements && !globalThis.customElements.get("vite-error-overlay")) {
  globalThis.customElements.define("vite-error-overlay", ErrorOverlay);
}
`);
  });

  app.use(vite.middlewares);
} else {
  app.use(express.static(path.join(__dirname, 'dist')));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
  });
}

app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`SBS Engine server running on port ${PORT}`);
});
