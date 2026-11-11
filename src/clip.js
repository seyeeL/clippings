// 扩展这一侧：往页面里注入 web-extract（lib/），把结果带回 popup。
// 带样式的 HTML 在 popup 里拼：要 DOMParser，service worker 没有；抓样式表和图片要跨域，
// 靠「下载 HTML」时申请的 <all_urls> 权限（扩展页面拿到 host 权限就不受 CORS 管）。

import { buildStyledHtml, embedStore, uploadStore } from '../lib/styled-core.js';
import { ruleFor } from '../lib/site-rules.js';
import { collectImageUrls, extensionFor, rewriteImageUrls, sha256Hex } from './images.js';
import { buildObjectKey, putObject } from './oss.js';

export const ALL_ORIGINS = { origins: ['<all_urls>'] };
const REFERER_RULE_ID = 1;
// 单张图上限：超过基本是原图大图，转存意义不大，还拖慢
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
// 同时传几张，别一次把带宽打满
const UPLOAD_CONCURRENCY = 4;

/** 在页面里跑 func。函数体会被序列化注入，拿不到这里的作用域，lib 的地址从第一个参数进去。 */
async function inPage(tabId, func, ...args) {
	const [injected] = await chrome.scripting.executeScript({
		target: { tabId },
		args: [chrome.runtime.getURL('lib/'), ...args],
		func,
	});
	if (injected?.result == null) throw new Error('页面没有返回内容');
	return injected.result;
}

/** popup 顶上那张卡片：标题、配图（og:image，没有就空）。 */
export function readCard(tabId) {
	return inPage(tabId, () => {
		const meta = (sel) => document.querySelector(sel)?.getAttribute('content')?.trim() ?? '';
		const image = meta('meta[property="og:image"]') || meta('meta[name="twitter:image"]');
		let abs = '';
		try {
			abs = image ? new URL(image, location.href).href : '';
		} catch {}
		return { title: document.title, image: /^https?:/.test(abs) ? abs : '' };
	});
}

/** 正文 → Markdown，在页面里转好（DOM 节点带不出来）。 */
export function extractMarkdown(tabId, { withReplies = false } = {}) {
	return inPage(
		tabId,
		async (lib, replies) => {
			const { extractArticle } = await import(`${lib}extract.js`);
			const { htmlToMarkdown } = await import(`${lib}html2md.js`);
			const article = extractArticle(document, location.href, { withReplies: replies });
			const { url, title, author, publishedAt, siteName } = article;
			return { url, title, author, publishedAt, siteName, markdown: htmlToMarkdown(article.root) };
		},
		withReplies,
	);
}

/**
 * 带样式 HTML 的页面侧材料。loadComments 时先跑站点规则的 expand（小红书往下翻评论、点开楼中楼），
 * 每步隔几秒、有总时长上限，碰到验证框就停，见 lib/site-rules.js 的 xhsExpandComments。
 */
export function snapshotPage(tabId, { withReplies = false, loadComments = false } = {}) {
	return inPage(
		tabId,
		async (lib, opts) => {
			const { snapExpand, snapshotDocument } = await import(`${lib}snapshot.js`);
			const note = opts.loadComments ? await snapExpand(document, location.href, { budgetMs: 120_000 }) : '';
			const snap = snapshotDocument(document, location.href, { withReplies: opts.withReplies });
			snap.notes = note ? [note] : [];
			return snap;
		},
		{ withReplies, loadComments },
	);
}

/**
 * 抓图期间，扩展自己发的请求都带上原页面的 Referer，抓完撤掉。豆瓣的图不带 Referer 一律 418，
 * 微博要 weibo.com 的；浏览器的 fetch 改不了 Referer（禁止头），只能让 declarativeNetRequest 在路上改。
 * 按发起方认「扩展自己发的」，网页自己的请求碰不到。图床不补：OSS 的防盗链白名单认 Referer，补了反而传不上。
 */
async function withReferer(pageUrl, oss, fn) {
	const referer = ruleFor(pageUrl)?.imageReferer || pageUrl;
	if (!/^https?:\/\//i.test(String(referer))) return fn();
	const excluded = ['aliyuncs.com', hostOf(oss?.customDomain)].filter(Boolean);
	const removeRuleIds = [REFERER_RULE_ID];
	await chrome.declarativeNetRequest.updateSessionRules({
		removeRuleIds,
		addRules: [{
			id: REFERER_RULE_ID,
			priority: 1,
			action: { type: 'modifyHeaders', requestHeaders: [{ header: 'Referer', operation: 'set', value: referer }] },
			condition: {
				resourceTypes: ['xmlhttprequest', 'other', 'image'],
				initiatorDomains: [chrome.runtime.id],
				excludedRequestDomains: excluded,
			},
		}],
	});
	try {
		return await fn();
	} finally {
		await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds });
	}
}

function hostOf(url) {
	const raw = String(url ?? '').trim();
	if (!raw) return '';
	try {
		return new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).hostname;
	} catch {
		return '';
	}
}

/** 传一张图到 OSS：对象名按内容哈希（同一张图只传一份），返回图床地址。 */
export function ossUploader(oss) {
	return async (bytes, { mime, ext }) => {
		const key = buildObjectKey({ prefix: oss.path, hash: await sha256Hex(bytes), ext });
		return putObject({ config: oss, key, body: bytes, contentType: mime });
	};
}

/** 抓一张图，交给 upload，返回新地址。 */
async function mirrorOne(url, upload) {
	const res = await fetch(url);
	if (!res.ok) throw new Error(`抓图失败 HTTP ${res.status}`);
	const bytes = new Uint8Array(await res.arrayBuffer());
	if (!bytes.byteLength) throw new Error('抓图失败：空响应');
	if (bytes.byteLength > MAX_IMAGE_BYTES) throw new Error('超过 10 MB，没传');
	const type = (res.headers.get('Content-Type') ?? '').split(';')[0].trim();
	const ext = extensionFor(type, url);
	// 上游偶尔回 application/octet-stream，按后缀回正，不然图床里点开会变成下载
	return upload(bytes, { mime: type.startsWith('image/') ? type : `image/${ext === 'jpg' ? 'jpeg' : ext}`, ext, url });
}

/** md 里的图转存到图床。单张失败保留原链接，不让这次失败。 */
export async function mirrorMarkdownImages(markdown, pageUrl, oss) {
	const urls = collectImageUrls(markdown);
	const mapping = {};
	const errors = [];
	if (urls.length) {
		const upload = ossUploader(oss);
		await withReferer(pageUrl, oss, async () => {
			for (let i = 0; i < urls.length; i += UPLOAD_CONCURRENCY) {
				await Promise.all(urls.slice(i, i + UPLOAD_CONCURRENCY).map(async (url) => {
					try {
						mapping[url] = await mirrorOne(url, upload);
					} catch (err) {
						errors.push(`图片 ${url}：${err?.message ?? err}`);
					}
				}));
			}
		});
	}
	return { markdown: rewriteImageUrls(markdown, mapping), uploaded: Object.keys(mapping).length, errors };
}

/**
 * 页面材料 → 能单独打开的 HTML 文件。给了 oss 就把图片转存图床（文件小），
 * 不给就塞进文件（断网、原帖删了也能看）。
 */
export function buildHtml(snap, oss = null) {
	return withReferer(snap.url, oss, () =>
		buildStyledHtml(snap, {
			parseDocument: (html) => new DOMParser().parseFromString(html, 'text/html'),
			storeImage: oss ? uploadStore(ossUploader(oss)) : embedStore(),
		}),
	);
}
