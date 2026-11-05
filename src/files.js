// 拼要交出去的文件：md 全文、文件名。不碰 chrome / DOM，Node 里能直接测。

// 文件名里不能出现的字符（Windows 最严，按它来）
const FS_ILLEGAL_RE = /[\\/:*?"<>|\x00-\x1f]/g;
const DATE_PARTS_RE = /(\d{4})\s*[年\-/.]\s*(\d{1,2})\s*[月\-/.]\s*(\d{1,2})/;
// 标题里已经有的日期：2026-10-27、2026/10/27、2026.10.27、2026年10月27日
const TITLE_DATE_RE = /(^|\D)(19|20)\d{2}(-|\/|\.)\d{1,2}\3\d{1,2}(?!\d)|(19|20)\d{2}年\d{1,2}月\d{1,2}日/;

export function localDay(date) {
	const pad = (n) => String(n).padStart(2, '0');
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * 发布时间 → 本机时区的 YYYY-MM-DD；认不出就空串。
 * 带时区的 ISO 换算成本机日期，其余（`2026-08-13 12:19`、`2024年10月7日`）只取年月日。
 */
export function pageDay(value) {
	const raw = String(value ?? '').trim();
	if (!raw) return '';
	if (/^\d{4}-\d{2}-\d{2}T.*(Z|[+-]\d{2}:?\d{2})$/i.test(raw)) {
		const parsed = new Date(raw);
		if (!Number.isNaN(parsed.getTime())) return localDay(parsed);
	}
	const match = raw.match(DATE_PARTS_RE);
	if (!match) return '';
	const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
	const date = new Date(y, m - 1, d);
	if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return '';
	return localDay(date);
}

const oneLine = (value, max) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

export function hostOf(url) {
	try {
		return new URL(url).hostname.replace(/^www\./, '');
	} catch {
		return '';
	}
}

/** 标题 → 文件名主干：去掉文件系统不认的字符和 @（微博标题是「@作者的微博：…」），最多 60 字。 */
function fileStem(title) {
	const trim = (s) => s.replace(/^[.\s]+|[.\s]+$/g, '');
	return trim(trim(String(title).replace(FS_ILLEGAL_RE, '').replace(/@/g, '').replace(/\s+/g, ' ')).slice(0, 60));
}

/**
 * 文件名：`<标题>-<今天>.<ext>`，没标题用域名。标题里已经带日期的不再加今天
 * （WakaTime 是「2026-10-27 - WakaTime」，再加一个就分不清哪个是哪个）。
 */
export function fileName(title, url, ext, { now = new Date() } = {}) {
	const stem = fileStem(oneLine(title, 200)) || fileStem(hostOf(url)) || 'clip';
	return TITLE_DATE_RE.test(stem) ? `${stem}.${ext}` : `${stem}-${localDay(now)}.${ext}`;
}

/** front-matter 里的字符串写成 JSON 双引号形式（合法 YAML），冒号、井号都安全。 */
const yamlStr = (value) => JSON.stringify(value);

/**
 * 「复制 md」「下载 md」的整篇：front-matter + 标题 + 正文。
 * @param {{url?: string, title?: string, author?: string, publishedAt?: string, siteName?: string, markdown?: string}} article
 */
export function markdownFile(article, { now = new Date() } = {}) {
	const url = String(article.url ?? '');
	const body = String(article.markdown ?? '').trim();
	let title = oneLine(article.title, 200);
	if (!title) {
		const first = body.split('\n').find((line) => line.trim()) ?? '';
		title = first.replace(/^[#>*\-\s]+/, '').trim().slice(0, 60) || hostOf(url) || url;
	}
	const author = oneLine(article.author, 120);
	const site = oneLine(article.siteName, 120);
	const published = pageDay(article.publishedAt);

	const front = ['---', `title: ${yamlStr(title)}`, `url: ${url}`];
	if (author) front.push(`author: ${yamlStr(author)}`);
	if (site) front.push(`site: ${yamlStr(site)}`);
	if (published) front.push(`published: ${published}`);
	front.push(`clipped: ${localDay(now)}`, '---');
	// 正文自己以一级标题开头（多数文章页）就不再补一个，免得标题出现两遍
	const heading = /^# /.test(body) ? [] : [`# ${title}`, ''];
	return {
		markdown: [...front, '', ...heading, body, ''].join('\n'),
		filename: fileName(title, url, 'md', { now }),
	};
}

export function formatBytes(bytes) {
	return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
