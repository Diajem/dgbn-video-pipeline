// Source handling for the Video Studio: safe URL fetching, article import, Wikimedia Commons search.
import dns from 'node:dns/promises';
import net from 'node:net';

// Problems the editor can fix (bad link, private address, wrong file type) are 400s, not server crashes.
export const userError = (message, status = 400) => Object.assign(new Error(message), {status});

const UA = `DiajemVideoStudio/0.1 (local newsroom tool; ${process.env.STUDIO_CONTACT || 'contact not set'})`;

function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  const l = ip.toLowerCase();
  return l === '::1' || l === '::' || l.startsWith('fc') || l.startsWith('fd') || l.startsWith('fe80') ||
    l.startsWith('::ffff:127.') || l.startsWith('::ffff:10.') || l.startsWith('::ffff:192.168.') || l.startsWith('::ffff:169.254.');
}

export async function assertPublicUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw userError('That is not a valid URL'); }
  if (!['http:', 'https:'].includes(url.protocol)) throw userError('Only http and https URLs are allowed');
  if (url.username || url.password) throw userError('URLs containing credentials are not allowed');
  const addresses = await dns.lookup(url.hostname, {all: true});
  if (!addresses.length || addresses.some(a => isPrivateIp(a.address))) throw userError('That address is not a public website');
  return url;
}

// Fetch with redirect re-checking, size cap and timeout. Refuses private/internal addresses.
export async function safeFetch(value, {maxBytes = 3_000_000, timeoutMs = 20_000, accept} = {}) {
  let current = value;
  for (let hop = 0; hop < 4; hop++) {
    const url = await assertPublicUrl(current);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {redirect: 'manual', signal: controller.signal, headers: {'User-Agent': UA, ...(accept ? {Accept: accept} : {})}});
      if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
        current = new URL(res.headers.get('location'), url).toString();
        continue;
      }
      if (!res.ok) throw userError('Download failed: HTTP ' + res.status);
      if (Number(res.headers.get('content-length') || 0) > maxBytes) throw userError('File is too large');
      const chunks = [];
      let size = 0;
      for await (const chunk of res.body) {
        size += chunk.length;
        if (size > maxBytes) throw userError('File is too large');
        chunks.push(chunk);
      }
      return {buffer: Buffer.concat(chunks), contentType: res.headers.get('content-type') || '', url: url.toString()};
    } finally {
      clearTimeout(timer);
    }
  }
  throw userError('Too many redirects');
}

const decode = s => String(s || '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
  .replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&#(\d+);/g, (_, n) => { try { return String.fromCodePoint(Number(n)); } catch { return ' '; } });
const strip = s => decode(String(s || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// Import an article page: title, plain text (as SOURCE MATERIAL only) and candidate images (rights unknown).
// Pasted text can be a markdown link, have spaces/newlines, or lack https:// - pull out the real address.
export function cleanUrl(raw) {
  const text = String(raw || '').trim();
  const found = text.match(/https?:\/\/[^\s)\]>"'<]+/i) || text.match(/\bwww\.[^\s)\]>"'<]+/i);
  return found ? (/^www\./i.test(found[0]) ? 'https://' + found[0] : found[0]) : text;
}

export async function importUrl(value) {
  value = cleanUrl(value);
  const {buffer, contentType, url} = await safeFetch(value, {accept: 'text/html'});
  if (!/html|xml/i.test(contentType)) throw userError('That URL is not a web page');
  const html = buffer.toString('utf8');
  const meta = name => {
    const a = html.match(new RegExp('<meta[^>]+(?:property|name)=["\']' + name + '["\'][^>]*content=["\']([^"\']*)["\']', 'i'));
    const b = html.match(new RegExp('<meta[^>]+content=["\']([^"\']*)["\'][^>]+(?:property|name)=["\']' + name + '["\']', 'i'));
    return decode((a || b || [])[1] || '');
  };
  const title = meta('og:title') || strip((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]);
  const cleaned = html.replace(/<(script|style|noscript|svg|nav|footer|header|aside)\b[\s\S]*?<\/\1>/gi, ' ');
  const paragraphs = [...cleaned.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)].map(m => strip(m[1])).filter(p => p.length > 40);
  const images = [];
  const seen = new Set();
  const add = src => {
    try {
      const abs = new URL(decode(src), url).toString();
      if (/^https?:/i.test(abs) && !seen.has(abs) && !/\.(svg|gif)(\?|$)/i.test(abs) && !/sprite|logo|icon|avatar|pixel|tracking/i.test(abs)) {
        seen.add(abs);
        images.push(abs);
      }
    } catch { /* ignore bad src */ }
  };
  const og = meta('og:image');
  if (og) add(og);
  for (const m of cleaned.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)) {
    add(m[1]);
    if (images.length >= 12) break;
  }
  let text = paragraphs.join('\n\n');
  if (text.length < 300) {
    // Some sites keep the article in structured data rather than <p> tags.
    for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
      try {
        const walk = n => Array.isArray(n) ? n.flatMap(walk) : n && typeof n === 'object' ? [n, ...Object.values(n).flatMap(walk)] : [];
        const body = walk(JSON.parse(m[1])).map(n => n.articleBody).find(b => typeof b === 'string' && b.length > text.length);
        if (body) text = strip(body);
      } catch { /* ignore bad JSON-LD */ }
    }
  }
  if (text.length < 300) {
    const host = new URL(url).hostname.replace(/^www\./, '');
    const err = new Error(`Could not read the article text from ${host}. This page probably loads its text with JavaScript` + (/msn\.com$/.test(host) ? ' (MSN only republishes stories - open it and use the original publisher link at the top)' : '') + '. Use the publisher link instead, or paste the article text into the script box.');
    err.status = 422;
    throw err;
  }
  return {sourceUrl: url, title, text, images, siteName: meta('og:site_name')};
}

// Licences we treat as usable with credit. NC / ND / fair use / unknown need permission.
export function licenceRights(licence) {
  const text = String(licence || '');
  const bad = /(^|[\s-])(nc|nd)([\s-]|$)|non-?commercial|no ?derivatives|fair use/i.test(text);
  const good = /^(cc0|cc[- ]by|public domain|pd\b|attribution)/i.test(text.trim());
  return good && !bad ? 'cleared' : 'needs_permission';
}

export async function searchCommons(query, limit = 12) {
  const params = new URLSearchParams({
    action: 'query', format: 'json', generator: 'search', gsrnamespace: '6',
    gsrsearch: query + ' filetype:bitmap', gsrlimit: String(limit),
    prop: 'imageinfo', iiprop: 'url|extmetadata|mime|size', iiurlwidth: '1600', origin: '*',
  });
  let res;
  try { res = await fetch('https://commons.wikimedia.org/w/api.php?' + params, {headers: {'User-Agent': UA}, signal: AbortSignal.timeout(20_000)}); }
  catch { throw Object.assign(new Error('Could not reach Wikimedia Commons. Check the internet connection and try again.'), {status: 502}); }
  if (!res.ok) throw userError('Commons search failed: HTTP ' + res.status);
  const data = await res.json();
  const pages = Object.values(data.query?.pages || {}).sort((a, b) => (a.index || 0) - (b.index || 0));
  return pages.map(page => {
    const info = page.imageinfo?.[0];
    if (!info || !/^image\/(jpeg|png|webp)$/.test(info.mime)) return null;
    const meta = info.extmetadata || {};
    const val = key => strip(meta[key]?.value || '');
    const licence = val('LicenseShortName') || val('UsageTerms');
    const author = val('Artist') || val('Credit') || 'Unknown author';
    return {
      title: page.title.replace(/^File:/, ''),
      pageUrl: info.descriptionurl,
      thumbUrl: info.thumburl || info.url,
      width: info.thumbwidth || info.width,
      height: info.thumbheight || info.height,
      licence,
      credit: `${author} / ${licence || 'licence not stated'} / Wikimedia Commons`,
      rights: licenceRights(licence),
    };
  }).filter(Boolean);
}

const IMAGE_TYPES = {'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp'};
export async function downloadImage(value) {
  const {buffer, contentType, url} = await safeFetch(value, {maxBytes: 30_000_000, accept: 'image/*'});
  const ext = IMAGE_TYPES[contentType.split(';')[0].trim().toLowerCase()];
  if (!ext) throw userError('That URL is not a JPEG, PNG or WebP image');
  return {buffer, ext, url};
}
