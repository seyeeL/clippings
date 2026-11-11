// npm run pack 打的是手写的目录清单，新加目录忘了写进去，商店包里就缺文件（0.2.0 的 options/、styles/ 差点漏掉）。
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';

const ROOT = new URL('../', import.meta.url);
// 只在开发时用、不进扩展包的目录
const DEV_ONLY = new Set(['docs', 'scripts', 'tests', 'node_modules']);

test('扩展用到的目录都在 pack 清单里', () => {
	const pack = JSON.parse(readFileSync(new URL('package.json', ROOT), 'utf8')).scripts.pack.split(/\s+/);
	const dirs = readdirSync(ROOT, { withFileTypes: true })
		.filter((e) => e.isDirectory() && !e.name.startsWith('.') && !DEV_ONLY.has(e.name))
		.map((e) => e.name);
	assert.deepEqual(dirs.filter((d) => !pack.includes(d)), []);
});
