// 扩展这一侧：往页面里注入 web-extract（lib/），把结果带回 popup。
// 带样式的 HTML 在 popup 里拼：要 DOMParser，service worker 没有；抓样式表和图片要跨域，
// 靠「下载 HTML」时申请的 <all_urls> 权限（扩展页面拿到 host 权限就不受 CORS 管）。

import { buildStyledHtml, embedStore } from '../lib/styled-core.js';
import { ruleFor } from '../lib/site-rules.js';

export const ALL_ORIGINS = { origins: ['<all_urls>'] };
const REFERER_RULE_ID = 1;

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
 * 拼文件期间，扩展自己发的请求都带上原页面的 Referer，拼完撤掉。豆瓣的图不带 Referer 一律 418，
 * 微博要 weibo.com 的；浏览器的 fetch 改不了 Referer（禁止头），只能让 declarativeNetRequest 在路上改。
 * 按发起方认「扩展自己发的」，网页自己的请求碰不到。
 */
async function withReferer(referer, fn) {
	if (!/^https?:\/\//i.test(String(referer))) return fn();
	const removeRuleIds = [REFERER_RULE_ID];
	await chrome.declarativeNetRequest.updateSessionRules({
		removeRuleIds,
		addRules: [{
			id: REFERER_RULE_ID,
			priority: 1,
			action: { type: 'modifyHeaders', requestHeaders: [{ header: 'Referer', operation: 'set', value: referer }] },
			condition: { resourceTypes: ['xmlhttprequest', 'other', 'image'], initiatorDomains: [chrome.runtime.id] },
		}],
	});
	try {
		return await fn();
	} finally {
		await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds });
	}
}

/** 页面材料 → 能单独打开的 HTML 文件，图片塞进文件（断网、原帖删了也能看）。 */
export function buildHtml(snap) {
	const referer = ruleFor(snap.url)?.imageReferer || snap.url;
	return withReferer(referer, () =>
		buildStyledHtml(snap, {
			parseDocument: (html) => new DOMParser().parseFromString(html, 'text/html'),
			storeImage: embedStore(),
		}),
	);
}
