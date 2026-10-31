# dsh-gridcraft

[English](README.md)

DeepSeek Harness 的 GridCraft 电子表格插件：把官方
[GridCraft](https://github.com/storytold/gridcraft) web 构建嵌入**右侧边栏**
Tab，打开工作区中的电子表格文件，并通过宿主保存/导出。

## 功能

- **右侧边栏 Tab** —— 右栏引导页的「电子表格」卡片打开空白页 Tab；`keepMounted`
  让 iframe 与工作簿状态在切换 Tab、折叠侧栏、切换会话时保持不变。
  UI 文案（工具条、状态、Tab 标题、引导卡）中英双语，跟随宿主界面语言
  实时切换。iframe 内的 GridCraft 应用本体自带 19 种语言（含中文）：插件
  把宿主语言写入同源 `localStorage['gridcraft.ui'].language`，应用下次
  启动时生效（正在运行的 iframe 不热切换；应用内自改语言在下次 DSH 重载
  时会被宿主语言覆盖）。
- **表格文件默认直达（插件页可关）** —— 插件以 extension 档认领
  `xlsx / xls / csv / tsv / ods` 的 `dsh-resource://file/` 地址：点击对话文件
  卡片、文件提及、@文件引用、Files 侧栏行，都会在右栏 GridCraft Tab 中
  直接打开（同文件重复点击是聚焦已有 Tab；文件重新生成后再次点击会原地
  重载新内容）。**插件页（左侧栏 插件 → dsh-gridcraft-plugin 详情）** 的
  描述下方有「默认用电子表格打开」开关（`plugins.bundle.config` 槽 +
  宿主半 `Config` schema 自动生成表单）：关闭后这些入口回落到内建预览，
  卡片按钮同时隐藏；写入实时下发到客户端路由（插件 fiber 重启一次）。
  卡片上的 WPS 图标 + ▼ 菜单是 OS 级「打开方式」（查询系统注册表，插件
  无法注入），但卡片动作区会多出一个「在电子表格中打开」按钮
  （经 `/api/dsh-gridcraft/resolve` 把卡片坐标解析为声明路径后构造地址）。
- **打开工作区文件** —— 面板通过 `remote.workspaceFiles` 扫描所选会话工作区
  中的 `xlsx / xls / csv / tsv / ods`，经官方 `gridcraft:open` postMessage
  桥送入 GridCraft。
- **通过宿主保存/导出** —— GridCraft 自身的保存、另存为、导出 PDF 以
  `gridcraft:save` 消息回传；面板经插件 HTTP 路由
  （`POST /api/dsh-gridcraft/save`）把字节写回所属会话的工作区：宿主从会话
  实时 header 解析真实工作区根、做路径封堵校验后原子写入（临时文件+改名）。
- **会话范围** —— 工具条默认跟随主视图当前会话；下拉可切换到任意带工作区的
  会话。
- **脏状态与定位** —— 圆点同步应用的 `gridcraft:dirty`；按钮用
  `session.openWorkspacePath` 在系统文件管理器中显示当前文件。

## 安装 / 构建

```sh
# 一次性：把官方 web 构建下载到 static/（不入 git）
npm install
npm run fetch-gridcraft

# 构建两端
npm run build

# 宿主侧单元测试（路径封堵、保存/静态路由）
npm test

# 安装到 profile
dsh plugin --profile web add link:<插件目录>
```

`static/` 存放上游 `gridcraft-web-<v>.zip` 内容（MIT OR Apache-2.0，
© ArtCraft Team）。插件嵌入未修改的官方构建；按上游品牌条款，ArtCraft
商标只保留在应用自身界面内。

## 架构

```
面板（client）                        宿主路由
┌──────────────────────────┐   GET   /api/dsh-gridcraft/app/*   ← static/ 构建
│ SpreadsheetPanel         │   POST  /api/dsh-gridcraft/save    ← 原子写入
│  工具条 + iframe          │
│  bridge.ts (postMessage) │   工作区读取走标准 remote.workspaceFiles
└──────────────────────────┘
```

- 宿主半：`index.ts`（挂载）、`routes.ts`（静态 + 保存 + presented 坐标解析）、`types.ts`。
- 客户端半：`src/client/` —— `index.tsx`（右栏 Tab 两段注册 + 卡片按钮注册）、
  `SpreadsheetPanel.tsx`（工具条 + iframe + 桥）、`TabTitle.tsx`（实时
  Tab 标题）、`OpenInGridcraft.tsx`（文件卡片按钮）、`address.ts`（资源
  地址解析/构造）、`bridge.ts`（消息线形）、`api.ts`（工作区扫描 + 保存请求）、
  `locales.ts`、`gridcraft.css`。
- `scripts/fetch-gridcraft.mjs` —— 下载/解压 release zip（必要时展平一层嵌套
  目录）；幂等（`--force` 重新下载）。

### 保存路径规则

- 与打开文件同扩展名 → 原地覆盖。
- 扩展名不同（如从 `.xlsx` 导出 PDF）→ 落在同目录，用应用回传的文件名。
- 没有打开的文件 → 面板弹出内联「另存为」输入条（工作区相对路径）。

## 已知限制

- 桥是文件级的：上游没有单元格级读写 API。
- 每个已打开的文件各占一个 Tab（各含一份 WASM 实例）；`keepMounted` 使其
  在后台保留。
- `remote.workspaceFiles.readBytes` 完整文件上限 32 MiB。
- web 应用需要 HTML 同源提供 `application/wasm`（本宿主满足），且
  WebGPU/剪贴板需要 HTTPS 或 localhost；iframe URL 强制 WebGL2 后端
  （`?webgl`），因为部分内嵌 webview 无 WebGPU 且应用不会自动回退。
- 插件 HTTP 路由沿用现有 dsh 插件的姿态（自身不加认证层）。
