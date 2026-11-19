# 隐私

Mist 不采集任何数据。以下是完整清单，可以直接对照源码验证。

## 它读了什么

只有两样：

1. **你正在看的 `weibo.com` 页面**——为了给时间线卡片打标签、计算列宽对齐、读取热搜条目的文字。
   这些处理全部发生在你的浏览器里，结果不离开本机。
2. **你自己的设置**——存在 `chrome.storage.sync`（键名 `mist.settings`）。若浏览器账号同步开着，
   这份设置会随你的 Chrome/Edge 账号同步到其他设备；这是浏览器的行为，Mist 不参与。

## 它发了什么请求

**没有。** 扩展自身不连接任何服务器，没有分析 SDK，没有崩溃上报，没有 A/B 开关，没有远程配置。

界面上出现的两类外部数据都由 `main-world.js` 用**页面自己的登录态**去请求 `weibo.com` 自己的接口：

| 数据 | 接口 | 由谁发起 |
|---|---|---|
| 右侧热搜 | `/ajax/side/hotSearch` | `main-world.js`（页面上下文，同源） |
| 账号卡片 | `/ajax/profile/info` | 同上 |

这些请求与微博网页自己发的请求没有区别，`Host`、cookie、目的域都还是 `weibo.com`。Mist 不把它们
转发到任何第三方，也不缓存到磁盘。

## 权限说明

| 权限 | 为什么需要 | 能不能去掉 |
|---|---|---|
| `storage` | 保存设置 | 不能，去掉就无法记住你的偏好 |
| `activeTab` | 工具栏按钮 / `⌘⇧K` 通知当前标签页打开命令面板 | 可以去掉，代价是按钮失效 |
| 主机权限 `weibo.com` / `*.weibo.com` | 注入增强层与页面皮肤 | 不能 |
| 主机权限 `*.sinaimg.cn` | 头像与图片域（仅在需要判定图片时使用） | 可以收窄，但会削弱部分判定 |

Mist **不申请** `tabs`、`webRequest`、`cookies`、`history`、`downloads`、`clipboardRead`。

## 本地数据

- 设置：`chrome.storage.sync` → `mist.settings`。
- 过滤词（关键词、作者名单）：同上，属于设置的一部分，不上传。
- 滚动位置：`sessionStorage`，键 `mist.scroll:<path>`，关掉标签页即消失。
- **没有**任何日志文件、数据库或缓存目录。

## 卸载

删掉扩展或在 `chrome://extensions` 里移除，所有设置随之清除；`sessionStorage` 会在标签页关闭时
自然失效。没有残留。

## 联系

发现问题请开 issue：<https://github.com/Snowkei/weibo-mist/issues>
