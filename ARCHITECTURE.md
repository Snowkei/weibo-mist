# 架构

Mist 的体积小（content 120 kB，含 Preact 与全部样式）来自一个决定：**不去重写微博**。

[xb](https://github.com/nnecec/xb) 的做法是接管整个站点——把页面清空、用微博内部接口取数据、再用自己
的组件重画整站。这条路能做得更漂亮，但代价是：每一个微博的新功能（投票、直播、长文编辑器、@ 列表、
消息中心）都要重写一遍，而且登录态、埋点、风控都在和你作对。

Mist 走中间那条路：**微博的 DOM 是事实来源，Mist 重新组织它的版式。**

具体做法是「结构式接管」而不是「逐类名改皮肤」：先按结构找到时间线容器（不依赖它的 id 或 class），
把它搬进 Mist 自己的列，再把页面其余部分隐藏。这样即使微博换了一套类名，接管依旧成立——而只改皮肤的
方案会在微博改版的那天静默失效，变成一个浮在原生页面上的壳。

```
                       ┌───────────────────────────────┐
   weibo.com 文档 ─────▶│ content.js（孤立世界）         │
                       │  ├─ Shell（Shadow DOM 外壳）   │
                       │  ├─ enhancer（观察 + 打标 + 过滤）│
                       │  ├─ 命令面板 / 设置抽屉 / 阅读器 │
                       │  └─ 键盘、快捷键、滚动记忆      │
                       └───────────┬───────────────────┘
                                   │ window.postMessage
                       ┌───────────▼───────────────────┐
                       │ main-world.js（页面主世界）     │
                       │  ├─ /ajax/side/hotSearch       │
                       │  ├─ /ajax/profile/info         │
                       │  └─ 自动播放兜底                │
                       └───────────────────────────────┘
                       ┌───────────────────────────────┐
                       │ background.js（service worker）│
                       │  工具栏按钮 / ⌘⇧K → 当前标签页  │
                       └───────────────────────────────┘
```

## 五层职责

### 1. `src/content/index.ts` — 装配

- 只在 `weibo.com` / `*.weibo.com` 的**顶层文档**启动（`window.top === window.self`）。
- 读设置 → 写 `html[data-mist-*]` 属性 → 等 `body` → 挂 Shadow 外壳 → 起 enhancer → 装键盘。
- Shadow 外壳是一个 `position: fixed; inset: 0; pointer-events: none` 的宿主；里面有 pointer-events 的
  元素才接收点击。这样它既能盖住整页，又不会挡住微博自己的卡片。
- `pagehide` 时彻底拆除（`destroy()`），避免 SPA 导航堆叠多份外壳。

### 2. `src/content/stage.ts` — 接管层

这段是 v0.2 的核心，只做三件事：

1. **找到时间线**：`findFeedRoot()` 先用已知容器列表（`#pl_feedlist_index` 等）按「卡片最多、同数最深」
   选一个；全部落空时退化为结构搜索——从第一张卡片向上走，取覆盖 ≥80% 卡片的祖先。不写入任何类名假设。
2. **搬进自己的列**：`#mist-stage > #mist-feed` 是普通 DOM（不是 Shadow DOM，所以微博的事件委托、
   `closest()`、无限滚动都不受影响），时间线容器被 `append` 进去，列宽与偏移由 `--mist-feed-*` 决定。
3. **清扫其余部分**：`sweep()` 递归遍历 `body` 的子树，给每个与时间线无关的子树打 `data-mist-swept`
   （CSS `display: none`）。`role="dialog"` / `.woo-layer` / `#wbox` 这类浮层例外，保留可交互；
   含浮层的子树不下钻隐藏，而是继续递归，只隐藏它的兄弟。

`MutationObserver` 负责长期正确性：时间线被换掉就重新接管；连续两次（≈1.5s）找不到时间线就
`unstage()`——移除全部标记、把列表还回原父节点、给页面让路。所以「消息」「设置」这类没有时间线的路由
不会变成空白页，只是没有中央列（`data-mist-feedless`）。

### 3. `src/content/enhance.ts` — 增强层

不做渲染，只做三件事：

1. **发现**：`MutationObserver`（180ms 防抖）找出时间线里的每张 `.card-wrap`，去嵌套后逐个标注：
   `data-mist-item` / `data-mist-kind` / `data-mist-ad` / `data-mist-suggested` / `data-mist-tags`。
2. **判断**：广告靠 `adid` 与「广告」小标签；推荐靠「推荐」标签；内容类型靠选择器 + 正文关键词
   （超话、投票、抽奖、直播、任务）。所有判定集中在文件顶部的一张常量表里。
3. **处置**：命中过滤规则的卡片打 `data-mist-hidden="true"`，由 CSS `display: none`——**不删节点**，
   所以关掉开关后立刻恢复，微博自己的 Infinite scroll 也不会错位。

统计（总数 / 可见 / 已过滤 / 重复）随扫描写进 `ui.stats`，右栏那块面板就是它的投影。

### 4. `src/main-world/index.ts` — 页面主世界

有些事孤立世界做不到：读 `weibo.com` 的私有接口要带页面 cookie 与同源 `fetch`。所以这个脚本以
`world: "MAIN"` 注入，只服务两个 `postMessage` 请求（热搜、账号），外加一个 MutationObserver 用来兜底
暂停自动播放的视频。**它不碰 DOM 结构，也不改页面数据。**

### 5. `src/background/index.ts` — 44 行

工具栏按钮与 `⌘⇧K` 都只是 `sendToActiveTab({type:'mist:toggle-palette'})`。没有常驻状态，
没有网络请求，service worker 随时可以被回收。

## 设置是唯一的数据契约

```
Settings ──settingsToAttributes()──▶ html[data-mist-theme] html[data-mist-glass] ... 14 个属性
         └─settingsToVariables()───▶ --mist-reading-size / --mist-reading-leading
```

CSS 里没有任何 JS 逻辑的镜像：`html[data-mist][data-mist-hide-ads='true'] [data-mist-ad='true']`
这一行就是「隐藏广告」的全部实现。好处是：调试时只要改一个属性就能验证，类型检查也能覆盖这个契约
（`scripts/test.mjs` 里有专门的 15 键断言）。

设置存 `chrome.storage.sync`（键 `mist.settings`），失败时回落到 `localStorage`；`normalizeSettings()`
对每个字段做白名单与钳位，所以旧版本、被手改过的、类型错的值都不会污染界面。

## 外壳的样式隔离

Shadow DOM 里的样式表拿不到 `:root`，而设计令牌全部定义在 `:root` 上。解决办法是把令牌表里的
`:root` 改写成 `:host(...)` 之后注入（`toHostSelectors()`），宿主元素上镜像一份 `data-mist-*` 属性：

```css
:host([data-mist-theme='dark']) { --mist-canvas: oklch(0.175 0.004 265); }
```

`:host[x]` 不是合法选择器，必须写成 `:host([x])`——这是本项目踩过的一个坑，也是为什么外壳和页面
能同时、同规则地换主题。

## 构建

`scripts/build.mjs` 四路 esbuild，全部同步完成（约 10ms）：

| 产物 | 入口 | 说明 |
|---|---|---|
| `dist/content.js` | `src/content/index.ts` | ESM 打包成单文件；CSS 以文本形式内联进外壳 |
| `dist/weibo.css` | `src/styles/weibo.css` | 页面皮肤，作为 content script 的 `css` 注入 |
| `dist/main-world.js` / `dist/background.js` | 各自入口 | 极小，无依赖 |
| `dist/manifest.json` | `scripts/build.mjs` 内联生成 | 版本号从 `package.json` 推导，文案走 `_locales` |
| `dist-demo/*` | `src/demo/main.tsx` | 原型页：同一个 `Shell` + 同一份 CSS，喂仿真数据 |

没有 bundler 配置地狱：一个 `esbuild.build()` 调用 + 一个 `cp` 循环。`manifest.json` 由脚本生成是
刻意的——版本漂移是这类项目最常见的低级错误。

## 测试

`scripts/test.mjs` 用 esbuild 把三个模块（settings / utils / commands）编译到临时目录后直接 import，
断言 18 条契约：默认值、枚举白名单、钳位范围、关键词去重、15 个属性键、阅读变量、`万/亿` 格式化、
`debounce` 合并、模糊搜索排序、命令 id 唯一。没有测试框架，跑完即退。

`scripts/smoke.mjs` 补上单测够不到的那一半：它在临时目录里起一个静态服务器，喂
`tests/fixture/timeline.html`（复刻 `.WB_frame > #pl_feedlist_index > .card-wrap` 的嵌套结构，含一条
`adid` 广告与一条「推荐」），用无头 Chrome 跑**构建产物** `dist/content.js`，再从 dump 出来的 DOM 上
断言十件事：脚本启动、`<html data-mist>` 门控、外壳挂载、布局偏移只加一次、广告与推荐卡被隐藏、
普通卡保留、标签写入。没有浏览器时它打印一行提示后安静退出，所以 CI 不必装 Chrome。

## 失败姿态

- 微博改版导致找不到 `.card-wrap`：9 秒后浮出一条 `.mist-compat-note`（6 秒后自动消失），
  外壳仍在，但不清空页面。
- 热搜接口失败：右栏显示「热搜暂时取不到」，不重试、不报错、不阻塞。
- `chrome.storage` 不可用（隐私模式）：回落到 `localStorage`；两者都不可用时用内存值，界面照常响应。
