import { ALL_ORIGINS, buildHtml, extractMarkdown, readCard, snapshotPage } from '../src/clip.js';
import { fileName, formatBytes, hostOf, markdownFile } from '../src/files.js';
import { ruleFor } from '../lib/site-rules.js';

const $ = (id) => document.getElementById(id);
const buttons = ['copy-md', 'download-md', 'download-html'].map($);

// 上次选的格式、评论开关，下次打开还是它（只是界面偏好，读写失败就用默认）
const prefs = {
	get(key, fallback) {
		try {
			return localStorage.getItem(key) ?? fallback;
		} catch {
			return fallback;
		}
	},
	set(key, value) {
		try {
			localStorage.setItem(key, value);
		} catch {}
	},
};

function showResult(k, f = '', error = false) {
	$('result').hidden = false;
	$('result').classList.toggle('error', error);
	$('result-k').textContent = k;
	$('result-f').textContent = f;
}

function friendly(err) {
	const message = String(err?.message ?? err);
	if (/cannot be scripted|Cannot access|chrome:\/\/|extensions gallery|webstore/i.test(message)) {
		return '这个页面浏览器不让扩展读取，换个普通网页试试';
	}
	return message;
}

function download(text, type, filename) {
	const href = URL.createObjectURL(new Blob([text], { type }));
	const link = document.createElement('a');
	link.href = href;
	link.download = filename;
	link.click();
	setTimeout(() => URL.revokeObjectURL(href), 60_000);
}

/** 同一时间只跑一个；按钮上换成进行中的字，跑完换回来。 */
async function busy(button, label, fn) {
	const original = button.textContent;
	buttons.forEach((b) => (b.disabled = true));
	button.textContent = label;
	$('result').hidden = true;
	try {
		await fn();
	} catch (err) {
		showResult('没存成', friendly(err), true);
	} finally {
		button.textContent = original;
		buttons.forEach((b) => (b.disabled = false));
	}
}

async function init() {
	const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
	if (!tab?.id) {
		showResult('读不到当前标签页', '', true);
		buttons.forEach((b) => (b.disabled = true));
		return;
	}
	const rule = ruleFor(tab.url) ?? {};
	$('title').textContent = tab.title || tab.url || '';
	$('domain').textContent = hostOf(tab.url);
	if (tab.favIconUrl) {
		$('thumb').style.backgroundImage = `url(${JSON.stringify(tab.favIconUrl)})`;
		$('thumb').classList.add('icon');
	}
	readCard(tab.id)
		.then((card) => {
			if (!card.image) return;
			$('thumb').style.backgroundImage = `url(${JSON.stringify(card.image)})`;
			$('thumb').classList.remove('icon');
		})
		.catch((err) => {
			showResult('没存成', friendly(err), true);
			buttons.forEach((b) => (b.disabled = true));
		});

	// 评论开关只在收得了评论的站点上露面：Markdown 要规则写了 replies（X、豆瓣），
	// HTML 另外认 expand（小红书：在页面上往下翻评论、点开楼中楼）
	const commentsFor = (format) =>
		typeof rule.replies === 'function' || (format === 'html' && typeof rule.expand === 'function');

	function setFormat(format) {
		$('fmt-md').setAttribute('aria-checked', String(format === 'md'));
		$('fmt-html').setAttribute('aria-checked', String(format === 'html'));
		$('md-actions').hidden = format !== 'md';
		$('html-actions').hidden = format !== 'html';
		$('comments-row').hidden = !commentsFor(format);
		prefs.set('format', format);
	}
	$('fmt-md').addEventListener('click', () => setFormat('md'));
	$('fmt-html').addEventListener('click', () => setFormat('html'));
	setFormat(prefs.get('format', 'md') === 'html' ? 'html' : 'md');

	$('comments').checked = prefs.get('comments', '0') === '1';
	$('comments').addEventListener('change', () => prefs.set('comments', $('comments').checked ? '1' : '0'));
	const withComments = () => !$('comments-row').hidden && $('comments').checked;

	const markdown = async () =>
		markdownFile(await extractMarkdown(tab.id, { withReplies: withComments() && typeof rule.replies === 'function' }));

	$('copy-md').addEventListener('click', (event) =>
		busy(event.currentTarget, '复制中…', async () => {
			const file = await markdown();
			await navigator.clipboard.writeText(file.markdown);
			showResult('已复制到剪贴板', `${file.markdown.length} 字`);
		}),
	);

	$('download-md').addEventListener('click', (event) =>
		busy(event.currentTarget, '下载中…', async () => {
			const file = await markdown();
			download(file.markdown, 'text/markdown;charset=utf-8', file.filename);
			showResult('已下载', file.filename);
		}),
	);

	$('download-html').addEventListener('click', async (event) => {
		const button = event.currentTarget;
		// 抓样式表和图片要跨域权限。第一次在这里问，要趁这次点击的手势还在
		const granted =
			(await chrome.permissions.contains(ALL_ORIGINS)) || (await chrome.permissions.request(ALL_ORIGINS).catch(() => false));
		if (!granted) {
			showResult('没存成', '要允许读取网站数据，才抓得到样式表和图片', true);
			return;
		}
		const loadComments = withComments() && typeof rule.expand === 'function';
		await busy(button, loadComments ? '正在加载评论，别关这个窗口…' : '正在保存…', async () => {
			const snap = await snapshotPage(tab.id, { withReplies: withComments(), loadComments });
			if (/^chrome-error:/.test(String(snap.url))) throw new Error('页面没加载成功');
			button.textContent = '正在保存…';
			const { html, stats, warnings } = await buildHtml(snap);
			if (warnings.length) console.warn('[clippings]', warnings);
			const filename = fileName(snap.title, snap.url, 'html');
			download(html, 'text/html;charset=utf-8', filename);
			const missed = warnings.filter((w) => /^图片 /.test(w)).length;
			const notes = [formatBytes(stats.bytes ?? 0), missed ? `${missed} 张图没存下来，留了原链接` : '', ...(snap.notes ?? [])];
			showResult(`已下载　${notes.filter(Boolean).join('，')}`, filename);
		});
	});
}

init().catch((err) => showResult('出错了', friendly(err), true));
