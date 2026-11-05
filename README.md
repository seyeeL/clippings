# clippings

一个浏览器扩展，把正在看的网页存下来：

- **复制 md / 下载 md**：只留正文，转成 Markdown，标题、作者、发布日期写在开头的 front-matter 里
- **下载 HTML**：整页存成一个能单独打开的 HTML 文件，保留原站样式，去掉广告和脚本。多图轮播存下来照样能左右翻，图片塞进文件里，断网、原帖删了也照样能看

小红书、微博、公众号、X、知识星球、GitHub Gist、豆瓣有专门的站点规则，其他文章页用通用规则。

A browser extension that saves the page you're reading as **Markdown** (main content only; copy or download) or as a **single-file HTML** that keeps the site's own styles, with ads and scripts removed, image carousels still working and images embedded, so it opens offline.

## 安装

还没上架商店，先手动装：

1. 下载这个仓库（右上角 Code → Download ZIP）并解压
2. Chrome / Edge 打开 `chrome://extensions`，打开右上角「开发者模式」
3. 点「加载已解压的扩展程序」，选解压出来的文件夹

## 用法

点工具栏上的 clippings 图标，选格式：

| 格式 | 按钮 | 得到什么 |
|------|------|---------|
| Markdown | 复制 md、下载 md | `<标题>-<日期>.md`，只有正文 |
| HTML | 下载 HTML | `<标题>-<日期>.html`，整页带样式 |

「同时存评论」只在支持的站点上出现：

- X、豆瓣：把页面上已经加载出来的回复一起收进来（Markdown 和 HTML 都有）
- 小红书（只有 HTML）：存之前在页面上往下翻评论、点开楼中楼，最多两分钟。小红书有风控，翻得太快会弹验证，所以每一步都隔几秒，碰到验证框立刻停，存下已经翻出来的那些。这期间别关弹窗。不开这个开关时，HTML 里照样有页面上已经显示的评论

## 权限

| 权限 | 用来做什么 |
|------|-----------|
| `activeTab`、`scripting` | 你点图标时读取当前页的正文 |
| 读取所有网站的数据（可选，第一次点「下载 HTML」时询问） | 抓这一页的样式表和图片，拼进 HTML 文件 |
| `declarativeNetRequestWithHostAccess` | 抓图片时带上原页面的 Referer（豆瓣、微博的图片不带就拿不到），存完立刻撤掉 |

扩展不收集任何数据，也没有服务器：所有处理都在你的浏览器里完成，只会向当前网页自己的站点请求样式表和图片。

## 开发

正文提取、Markdown 转换、带样式 HTML 的拼装来自 [web-extract](https://github.com/seyeeL/web-extract)，`lib/` 下是它 `src/` 里几个文件的副本。别直接改副本：改 web-extract，再同步过来：

```bash
node scripts/sync-web-extract.mjs ../web-extract   # 同步 lib/，记下来源 commit
npm test                                           # 单元测试，顺便检查 lib/ 没被直接改过
npm run pack                                       # 打包成 clippings.zip，上传商店用
```

没有构建步骤，改完在 `chrome://extensions` 里点刷新就生效。

## 许可

[PolyForm Noncommercial 1.0.0](LICENSE)，和 web-extract 一样：个人和非商业用途随便用。
