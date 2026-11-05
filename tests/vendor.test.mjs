// lib/ 下是 web-extract 的副本，只能用 scripts/sync-web-extract.mjs 同步，不在这里直接改。
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { contentHash, FILES, MANIFEST } from '../scripts/sync-web-extract.mjs';

test('lib/ 的副本和同步时记下的一致', () => {
	const { files } = JSON.parse(readFileSync(MANIFEST, 'utf8'));
	assert.deepEqual(Object.keys(files).sort(), [...FILES].sort());
	for (const name of FILES) {
		const text = readFileSync(new URL(`../lib/${name}`, import.meta.url), 'utf8');
		assert.equal(contentHash(text), files[name], `lib/${name} 被直接改过：改 web-extract 再同步`);
	}
});
