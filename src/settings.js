// 图床设置。存 chrome.storage.local：只在这台电脑的这个浏览器里，不随账号同步（里面有 AccessKey）。

const KEY = 'imageHost';

export const DEFAULT_IMAGE_HOST = {
	enabled: false,
	accessKeyId: '',
	accessKeySecret: '',
	bucket: '',
	region: '',
	path: 'clippings/',
	customDomain: '',
	// 「下载 HTML」的图片：upload 转存图床，base64 塞进文件
	htmlImages: 'upload',
};

export async function getImageHost() {
	const { [KEY]: saved } = await chrome.storage.local.get(KEY);
	return { ...DEFAULT_IMAGE_HOST, ...saved };
}

export async function saveImageHost(config) {
	const clean = { ...DEFAULT_IMAGE_HOST };
	for (const key of Object.keys(clean)) {
		if (key in config) clean[key] = typeof clean[key] === 'string' ? String(config[key] ?? '').trim() : Boolean(config[key]);
	}
	clean.htmlImages = clean.htmlImages === 'base64' ? 'base64' : 'upload';
	await chrome.storage.local.set({ [KEY]: clean });
	return clean;
}
