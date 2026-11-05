// 把 web-extract 的页面解析模块同步成 lib/ 下的副本。
//
// lib/*.js 是 https://github.com/seyeeL/web-extract 的 src/ 下同名文件的副本，别在这里直接改：
// 改 web-extract、跑那边的测试、提交，再回来跑这个脚本。tests/vendor.test.mjs 会拦住直接改副本。
//
//   node scripts/sync-web-extract.mjs [web-extract 目录，默认 ../web-extract]

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const FILES = ['extract.js', 'html2md.js', 'site-rules.js', 'snapshot.js', 'css.js', 'styled-core.js'];

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const MANIFEST = join(ROOT, 'lib', 'web-extract.json');

/** 换行统一成 LF 再算：Windows 上 git 的 autocrlf 会把工作区文件换成 CRLF。 */
export const contentHash = (text) => createHash('sha256').update(text.replace(/\r\n/g, '\n')).digest('hex');

function main(source) {
	if (!existsSync(join(source, 'src', 'extract.js'))) {
		console.error(`${source} 不像 web-extract 仓库（没有 src/extract.js），把目录作为参数传进来`);
		process.exit(1);
	}
	const git = (...args) => execFileSync('git', ['-C', source, ...args], { encoding: 'utf8' }).trim();
	const dirty = git('status', '--porcelain', '--', ...FILES.map((f) => `src/${f}`));
	if (dirty) {
		console.error(`web-extract 里这几个文件还有没提交的改动，先在那边提交：\n${dirty}`);
		process.exit(1);
	}
	const files = {};
	for (const name of FILES) {
		const text = readFileSync(join(source, 'src', name), 'utf8').replace(/\r\n/g, '\n');
		writeFileSync(join(ROOT, 'lib', name), text);
		files[name] = contentHash(text);
	}
	const commit = git('rev-parse', 'HEAD');
	writeFileSync(MANIFEST, `${JSON.stringify({ source: 'https://github.com/seyeeL/web-extract', commit, files }, null, 2)}\n`);
	console.log(`已同步 web-extract@${commit.slice(0, 12)}：${FILES.join('、')}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main(resolve(process.argv[2] ?? join(ROOT, '..', 'web-extract')));
