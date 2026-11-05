import assert from 'node:assert/strict';
import { test } from 'node:test';

import { fileName, markdownFile, pageDay } from '../src/files.js';

const now = new Date(2026, 10, 5, 9, 30);

test('md 全文：front-matter + 标题 + 正文', () => {
	const { markdown, filename } = markdownFile(
		{ url: 'https://example.com/a', title: '标题: 带冒号', author: '作者', siteName: '示例', publishedAt: '2024年10月7日', markdown: '正文\n' },
		{ now },
	);
	assert.equal(markdown, [
		'---', 'title: "标题: 带冒号"', 'url: https://example.com/a', 'author: "作者"', 'site: "示例"',
		'published: 2024-10-07', 'clipped: 2026-11-05', '---', '', '# 标题: 带冒号', '', '正文', '',
	].join('\n'));
	assert.equal(filename, '标题 带冒号-2026-11-05.md');
});

test('没标题取正文第一行', () => {
	const { markdown } = markdownFile({ url: 'https://example.com/a', markdown: '> 第一行\n第二行' }, { now });
	assert.match(markdown, /^# 第一行$/m);
});

test('文件名：去非法字符和 @，标题带日期不再加今天，没标题用域名', () => {
	assert.equal(fileName('@某人的微博：a/b?', '', 'html', { now }), '某人的微博：ab-2026-11-05.html');
	assert.equal(fileName('2026-10-27 - WakaTime', '', 'html', { now }), '2026-10-27 - WakaTime.html');
	assert.equal(fileName('', 'https://www.example.com/x', 'md', { now }), 'example.com-2026-11-05.md');
	assert.equal(fileName('', '', 'md', { now }), 'clip-2026-11-05.md');
});

test('发布时间认不出就空', () => {
	assert.equal(pageDay('2026-02-30'), '');
	assert.equal(pageDay('昨天'), '');
	assert.equal(pageDay('2026-08-13 12:19'), '2026-08-13');
});

test('正文以一级标题开头就不再补标题', () => {
	const { markdown } = markdownFile({ url: 'https://example.com/a', title: 'T', markdown: '# T\n\n正文' }, { now });
	assert.equal(markdown.match(/^# /gm).length, 1);
});
