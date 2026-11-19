# 架构

[xb](https://github.com/nnecec/xb) 的做法是接管整个站点——把页面清空、用微博内部接口取数据、再用自己
的组件重画整站。0.3 之后 Mist 在首页走的正是这条路：**数据来自微博，页面由我们画**。

区别在于范围。整站重写的代价是：每一个微博的新功能（投票、直播、长文编辑器、@ 列表、消息中心）都要
重写一遍，而且登录态、埋点、风控都在和你作对。所以 Mist 只把这条路用在**有数据模型的地方**——首页
时间线、热搜、发微博、点赞——其余路由仍然用 0.2 的结构式接管：把原生列表搬进 Mist 的列，页面其余部分
按结构隐藏。两层叠起来，才不会在微博改版的第二天变成一张白纸。

一句话：**首页是 Mist 的应用，其他页面是 Mist 接管后的微博。**

```
                       ┌───────────────────────────────┐
   weibo.com 文档 ─────▶│ content.js（孤立世界）         │
                       │  ├─ Shell（Shadow DOM 外壳）   │
                       │  ├─ timeline.tsx（自绘时间线） │
                       │  ├─ feed.ts / api.ts（数据层） │
                       │  ├─ enhancer（原生卡片打标）   │
                       │  ├─ 命令面板 / 设置抽屉 / 阅读器 │
                       │  └─ 键盘、快捷键、滚动记忆      │
                       └───────────┬───────────────────┘
                                   │ window.postMessage
                       ┌───────────▼───────────────────┐
                       │ main-world.js（页面主世界）     │
                       │  ├─ /ajax/feed/*（时间线）      │
                       │  ├─ /ajax/statuses/*（赞/发博） │
                       │  ├─ /ajax/side/hotSearch       │
                       │  ├─ /ajax/profile/info         │
                       │  └─ 自动播放兜底                │
                       └───────────────────────────────┘
                       ┌───────────────────────────────┐
                       │ background.js（service worker）│
                       │  工具栏按钮 / ⌘⇧K → 当前标签页  │
                       └───────────────────────────────┘
```

### 数据通路（0.3）

```
content script (isolated)            page (MAIN world)
────────────────────────             ─────────────────
timeline.tsx  组件与交互
   ↓
feed.ts       适配 + 端点常量
   ↓
api.ts        postMessage  {kind:'api', method, path, params|body, id}
   ↓                                   ↓
                    main-world/index.ts  fetch(credentials:'include',
                                         X-XSRF-TOKEN from cookie)
   ↓                                   ↓
            {kind:'reply', id, ok, payload}
```

- **唯一契约是 `Settings`**：数据模式的渲染只读组件状态，不读 `data-mist-*`；属性只用于页面级开关
  （主题、专注模式、接管开关），因此两套渲染路径不会互相污染。
- **降级顺序**：接口失败 → 卡片区显示「重新读取」；首页之外的路由 → 原生列表接管（0.2 的 `stage.ts`）；
  没有时间线且没有数据 → 只留左侧导航（`data-mist-feedless`）。
- **不做的事**：不缓存微博数据到扩展存储、不把微博的 JSON 转存到第三方、不在后台页面发请求
  （后台脚本只负责转发快捷键，没有网络权限）。

## 六层职责

### 1. `src/content/index.ts` — 装配

- 只在 `weibo.com` / `*.weibo.com` 的**顶层文档**启动（`window.top === window.self`）。
- 读设置 → 写 `html[data-mist-*]` 属性 → 等 `body` → 挂 Shadow 外壳 → 起 enhancer → 装键盘。
- Shadow 外壳是一个 `position: fixed; inset: 0; pointer-events: none` 的宿主；里面有 pointer-events 的
  元素才接收点击。这样它既能盖住整页，又不会挡住微博自己的卡片。
- `pagehide` 时彻底拆除（`destroy()`），避免 SPA 导航堆叠多份外壳。

### 2. `src/content/timeline.tsx` + `feed.ts` + `api.ts` — 首页的数据模式

- `timeline.tsx`：`mountFeed(container)` 把组件树渲染进 `#mist-feed`；`createFeedApi()` 把键盘与命令面板
  接到数据上（`focusRelative` / `readerFromFocus` / `saveFocused` / `compose`）。
- `feed.ts`：端点常量、`adaptStatus()`（把 `/ajax/feed/*` 的原始 status 归一成 `Post`）、`sanitize()`
  （正文只留 `a` / `img` / `br`，其余标签退化成文本）、`loadFeed()` 翻页、`setLike()`、`publish()`。
- `api.ts`：`postMessage` 请求与 12s 超时；`main-world/index.ts` 在页面世界 `fetch`，带 cookie 与
  `X-XSRF-TOKEN`，所以请求就是微博自己会发的那个请求。

### 3. `src/content/stage.ts` — 接管层

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

### 4. `src/content/enhance.ts` — 增强层

不做渲染，只做三件事：

1. **发现**：`MutationObserver`（180ms 防抖）找出时间线里的每张 `.card-wrap`，去嵌套后逐个标注：
   `data-mist-item` / `data-mist-kind` / `data-mist-ad` / `data-mist-suggested` / `data-mist-tags`。
2. **判断**：广告靠 `adid` 与「广告」小标签；推荐靠「推荐」标签；内容类型靠选择器 + 正文关键词
   （超话、投票、抽奖、直播、任务）。所有判定集中在文件顶部的一张常量表里。
3. **处置**：命中过滤规则的卡片打 `data-mist-hidden="true"`，由 CSS `display: none`——**不删节点**，
   所以关掉开关后立刻恢复，微博自己的 Infinite scroll 也不会错位。

统计（总数 / 可见 / 已过滤 / 重复）随扫描写进 `ui.stats`，右栏那块面板就是它的投影。

### 5. `src/main-world/index.ts` — 页面主世界

有些事孤立世界做不到：读 `weibo.com` 的私有接口要带页面 cookie 与同源 `fetch`。所以这个脚本以
`world: "MAIN"` 注入，只做两件事：执行 `{kind:'api'}` 请求（GET/POST，POST 带 `XSRF-TOKEN`），以及
一个 MutationObserver 兜底暂停自动播放的视频。**它不碰 DOM 结构，也不改页面数据。**

### 6. `src/background/index.ts` — 44 行

工具栏按钮与 `⌘⇧K` 都只是 `sendToActiveTab({type:'mist:toggle-palette'})`。没有常驻状态，
没有网络请求，service worker 随时可以被回收。

## 设置是唯一的数据契约

```
Settings ──settingsToAttributes()──▶ html[data-mist-theme] html[data-mist-glass] ... 15 个属性
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
