# dsh-pm-plugin

托管在 GitHub Pages 上的 **DeepSeek Harness 插件市场索引**（[`format: 1`](https://deepseek-harness.github.io/deepseek-harness/guide/plugin-market)）。

- 索引地址：<https://comeonzhj.github.io/dsh-pm-plugin/index.json>
- 索引站：<https://comeonzhj.github.io/dsh-pm-plugin/>
- 格式文档：[DSH 插件市场](https://deepseek-harness.github.io/deepseek-harness/guide/plugin-market) · 校验器 [`@deepseek-ai/dsh-plugin-market-index`](https://www.npmjs.com/package/@deepseek-ai/dsh-plugin-market-index)

## 使用

1. 打开 DSH **插件**页，点击**实验性插件**旁的**更多**，开启**自定义插件市场**。
2. 进入**发现** → **添加索引源**，粘贴上面的索引 URL。
3. 浏览卡片并安装；安装前在确认框中核对来源（npm 包，或 Git 仓库 + 提交 + 目录）。

在 Web UI 中，索引由宿主侧读取，不需要 CORS 配置；GitHub Pages 同时会给静态资源返回 CORS 头。

## 首期收录

| 插件 | 包名 | 收录版本 | 来源 | 作者 |
| --- | --- | --- | --- | --- |
| [SuperAgent 通用智能体](https://github.com/comeonzhj/SuperAgent-General) | `dsh-superagent-general` | 0.2.0 / 0.2.1 / 0.2.2 | Git 标签 | comeonzhj |
| [提示词打砖块](https://github.com/comeonzhj/dsh-prompt-breaker) | `dsh-prompt-breaker` | 1.1.0 | Git 标签 | comeonzhj |
| [GenUI 生成式界面](https://github.com/lhuans/dsh-genui) | `dsh-genui` | 0.3.1 / 0.3.2 / 0.3.3 | npm | lhuans |
| [上下文 Context](https://github.com/bowenliang123/dsh-context) | `dsh-context` | 0.82.0 / 0.82.1 / 0.82.2 / 0.83.0 | npm | bowenliang123 |

版本列表按需精选，均为声明了 DSH 兼容范围（`engines.dsh`）的稳定版本；索引读取器会从中挑选与当前 DSH 兼容的最高版本作为推荐版本。

## 数据来源与校验

`index.json` 由 [`scripts/build-index.mjs`](scripts/build-index.mjs) 生成：

- **Git 来源**：从发布标签解析提交 SHA 与提交时间，并读取该提交的 `package.json` 得到版本号、`dsh.bundle` 与 `engines.dsh`。
- **npm 来源**：读取公共 registry 文档中的版本、发布时间与 manifest。
- 展示字段（标题、描述、图标、作者、链接）在 [`scripts/plugins.json`](scripts/plugins.json) 中人工维护。
- 生成后先用官方校验器 `parseMarketIndex` 校验，再对每个版本生成安装 spec（`marketInstallTarget`），校验通过才写入文件。

CI 在每次推送时用同一个校验器检查已提交的 `index.json`（[`.github/workflows/validate.yml`](.github/workflows/validate.yml)）。

```sh
npm install
npm run build     # 重新生成 index.json
npm run validate  # 校验 index.json 与图标
npm run check     # build + validate
```

## 维护：新增一个插件

1. 在 `scripts/plugins.json` 的 `plugins` 数组中追加一项：`name`（npm 包名）、展示字段、`category`、`labels`、`keywords`、`source` 与要收录的 `versions`（Git 源写标签名，npm 源写精确版本）。
2. 把图标放到 `icons/`（SVG/PNG/JPEG/WebP，≤ 256 KiB），并在条目里写相对路径 `icons/<name>.svg`。
3. 运行 `npm run check`，提交生成的 `index.json` 与图标。
4. 推送到 `main` 后 GitHub Pages 会从仓库根目录自动发布。

分类与标签在 `scripts/plugins.json` 的 `market.metadata` 中声明，新增 id 前先在这里登记。

## 已知事项

- **SuperAgent 的安装方式**：该项目目前以 GitHub Release 预编译 `.tgz` 包分发，源码标签中没有构建产物 `lib/`。索引中按 Git 标签收录（便于检索与溯源），但通过源码直接安装会触发构建、可能失败或卡住。推荐从 [Releases](https://github.com/comeonzhj/SuperAgent-General/releases) 下载安装包后在插件页手动安装。
- **`dsh-prompt-breaker` 的兼容范围**：其 manifest 未声明 `engines.dsh`，也没有 `@deepseek-ai/dsh*` peer 依赖，因此索引中显式声明为 `*`（任意 DSH 版本），与安装时的回退检查一致。
- **版本精选**：`dsh-context` 在 registry 上有 160+ 个历史版本，本索引只收录近期稳定版本，避免版本列表过长；需要更早版本时可从 npm 直接安装。

## 声明

索引是第三方内容：插件的标题、描述、图标、作者与来源均由本索引维护者整理，DSH 只校验索引格式，不验证这些声明。安装前请核对确认框中的来源，并只添加你信任的索引源。

## License

[MIT](LICENSE)
