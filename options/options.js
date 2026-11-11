// 设置页：图床。改了就存，不用点保存。
import { ALL_ORIGINS } from '../src/clip.js';
import { isOssConfigured, probeUpload } from '../src/oss.js';
import { getImageHost, saveImageHost } from '../src/settings.js';

const $ = (id) => document.getElementById(id);
const TEXT_FIELDS = ['accessKeyId', 'accessKeySecret', 'bucket', 'region', 'path', 'customDomain'];

function say(text, kind = '') {
	$('status').textContent = text;
	$('status').className = `status ${kind}`.trim();
}

function read() {
	const config = { enabled: $('enabled').checked };
	for (const id of TEXT_FIELDS) config[id] = $(id).value;
	config.htmlImages = document.querySelector('input[name="htmlImages"]:checked')?.value ?? 'upload';
	return config;
}

async function save() {
	const config = await saveImageHost(read());
	$('fields').hidden = !config.enabled;
	return config;
}

async function init() {
	const config = await getImageHost();
	$('enabled').checked = config.enabled;
	for (const id of TEXT_FIELDS) $(id).value = config[id];
	document.querySelector(`input[name="htmlImages"][value="${config.htmlImages}"]`).checked = true;
	$('fields').hidden = !config.enabled;

	// 打开时就要跨域权限：抓各个网站的图、传到 OSS 都要。必须在这次点击里问
	$('enabled').addEventListener('change', async () => {
		if ($('enabled').checked && !(await chrome.permissions.request(ALL_ORIGINS).catch(() => false))) {
			$('enabled').checked = false;
			say('要允许读取网站数据，才抓得到各个网站的图', 'bad');
		}
		await save();
	});
	for (const id of TEXT_FIELDS) $(id).addEventListener('change', save);
	for (const radio of document.querySelectorAll('input[name="htmlImages"]')) radio.addEventListener('change', save);

	$('probe').addEventListener('click', async () => {
		const config = await save();
		if (!isOssConfigured(config)) {
			say('AccessKey ID、Secret、Bucket、Region 都要填', 'bad');
			return;
		}
		$('probe').disabled = true;
		say('上传一张 1×1 的测试图…');
		try {
			const { url } = await probeUpload(config);
			say(`传上去了：${url}`, 'ok');
		} catch (err) {
			say(String(err?.message ?? err), 'bad');
		} finally {
			$('probe').disabled = false;
		}
	});
}

init().catch((err) => say(String(err?.message ?? err), 'bad'));
