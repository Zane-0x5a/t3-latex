# t3-latex

<p align="center"><img src="docs/hero.webp" alt="T3 Code 聊天里渲染好的公式：行内公式、独立公式和 aligned 环境" width="100%"></p>

让 Windows 上的 [T3 Code](https://github.com/pingdotgg/t3code) 桌面版在聊天里渲染 LaTeX。从「T3 Code (LaTeX)」
快捷方式打开 T3，聊天里的 `$…$`、`$$…$$`、`\(…\)`、`\[…\]` 和单独成行的 `\begin{align}` 都会用 KaTeX 排版。

它不是 fork，也不改 T3 的安装目录：运行的是官方的 T3，自动更新照常进行；从 T3 自己的图标打开就是原版。
公式渲染只在从这个快捷方式启动时加载进 T3。上游把这个需求标为 not planned（pingdotgg/t3code#1784）。

<sub>非官方项目，与 T3 Tools 无关。遇到问题请在[这里](https://github.com/Zane-0x5a/t3-latex/issues)反馈，不要报到 T3 Code 的 issue。 · [English →](README.md)</sub>

<p align="center"><img src="docs/before-after.webp" alt="同一条回复：原版 T3 Code 显示 TeX 原文，反斜杠还被 Markdown 吃掉；用 t3-latex 打开则渲染成公式" width="100%"></p>
<p align="center"><sub>同一条回复：原版 T3 Code（上）和经 t3-latex 打开的 T3（下）。</sub></p>

## 渲染效果

- 行内 `$…$`、`\(…\)`；独立 `$$…$$`（单行或多行）、`\[…\]`、单独成行的 `align`、`equation` 等环境、```` ```math ```` 代码块。
- 列表项、引用块里的独立公式留在原来的列表项或引用里；表格单元格里的 `|x|`、`\|v\|` 不会把表格拆开。
- 不会误判：`$5，那本 $10` 这类价格、`$HOME`、代码块和行内代码里的 `$`、已转义的 `\$`。规则沿用 pandoc：
  左 `$` 后面不能是空格，右 `$` 前面不能是空格、后面不能紧跟数字；另外在中文里，以数字开头又夹着中文标点的不算公式。
- 生成到一半的回复里还没闭合的 `$$`、`\[` 按原文显示，不会吞掉后面的内容，也不会闪出红色错误。
- 公式编号在每条消息内从 (1) 编起；`\label` 会被去掉（KaTeX 不支持）；支持 `\ce{H2O}`（mhchem）。
- 比聊天栏宽的独立公式可以横向滚动。
- 选中文字复制时，公式复制出来的是 `$…$` / `$$…$$` 源码（走 T3 自己的复制逻辑）。
- 选中带公式的文字可以用 T3 的「Cite」引用，引用里的公式也是 TeX 源码。选区只要碰到公式，
  就会把整个公式选进来；从公式上开始拖、双击公式也都可以。
- 屏幕阅读器读到的是公式的 TeX 源码。
- 每个公式的排版结果按源码缓存，流式输出时不会每个 token 都重跑 KaTeX。

## 安装

需要 Windows 10 或 11，以及 [T3 Code 桌面版](https://github.com/pingdotgg/t3code/releases)（Stable 或 Nightly 都可以）。

1. 从 [Releases](https://github.com/Zane-0x5a/t3-latex/releases/latest) 下载 `t3-latex-<版本>.zip`，解压到一个以后不会挪动的文件夹，
   比如 `%LOCALAPPDATA%\t3-latex`。快捷方式指向这个文件夹。
2. 双击 `install.cmd`。如果 SmartScreen 提示这是下载来的脚本，点「更多信息 → 仍要运行」；也可以在解压前到 zip 的「属性」里勾选「解除锁定」。
3. 完全退出 T3（包括托盘图标），再从开始菜单或桌面的「T3 Code (LaTeX)」打开。

安装只会在开始菜单和桌面各放一个快捷方式，别的什么都不动。快捷方式有自己的任务栏身份
（AppUserModelID `com.t3tools.t3code.latex`），启动器把同一个 ID 交给 T3，所以可以把它固定到任务栏代替原来的 T3 图标，
打开的 T3 窗口会归到这个固定图标下。

- T3 已经开着（从普通图标打开的）时点这个快捷方式，会弹框提示先完全退出 T3：T3 是单实例的，已经在运行的那个进程无法再加载公式渲染。
- 已经是从这里打开的 T3，再点一次只会把窗口切到前台。
- 每次打开都从 T3 安装程序写在注册表里的记录找 T3（`launcher\find-t3.cmd`）。所以不管 T3 装在哪个文件夹
  （较早的安装在 `Programs\t3-code-desktop`，现在新装的在 `Programs\t3code`），也不管是 Stable 还是 Nightly
  （exe 分别叫 `T3 Code (Alpha).exe`、`T3 Code (Nightly).exe`），都不用改设置。要用别的 T3 exe，把环境变量 `T3LATEX_T3_EXE` 设为它。
- 快捷方式的图标是安装时从 T3 复制出来的 `launcher\t3.ico`，T3 的 exe 改名后也不会坏。

**更新 t3-latex：** 退出 T3，把新的 zip 解压覆盖到原来的文件夹，再运行一次 `install.cmd`。

**卸载：** 双击 `uninstall.cmd`（删除快捷方式、它们的图标和 `%TEMP%\t3-latex` 下的日志），再删掉这个文件夹。
T3 本身从没被改过，所以没有别的需要还原。

在 Windows 11 上用 T3 Code 0.0.45 测试过；测试套件在 0.0.46 nightly（「orchestrator v2」大改版）的代码上也全部通过。

## 工作原理

```
快捷方式 → conhost --headless → launcher\t3-latex.cmd → find-t3.cmd 找到 T3 的 exe
          → 在这个 exe 上以 Node 方式跑 launch.cjs（ELECTRON_RUN_AS_NODE）
          → 启动 T3，带 --inspect-brk：T3 主进程停在第一行
          → 连上这个本机调试口，让主进程加载 mod\loader.cjs，放行，再关掉调试口
```

`mod/loader.cjs` 在 T3 主进程里做三件事：

1. 包一层 T3 为 `t3code://` 注册的协议处理函数：在 `t3code://app/__t3latex/` 下提供 `mod/assets/`
   （KaTeX 样式与字体、渲染模块），并在窗口的 `index.html` 里加上它们；
2. 修改含 react-markdown 的那个脚本（`mod/patch.cjs`）：给 `remarkPlugins` 追加 remark-math，
   给 `rehypePlugins` 追加 KaTeX（排在 T3 的 sanitize 之后，否则 KaTeX 的标签会被清掉），
   并在解析前让 markdown 经过 `src/normalize.js` 统一定界符。这三处靠 react-markdown 自己的选项名
   定位，压缩不会改掉这些名字，所以不依赖 T3 的具体版本；
3. 照顾 T3 自己发起的重启，都经 `t3-latex.cmd` 重新找 T3（更新可能改了 exe 的名字，切到 Nightly 就会）：
   - 改某些设置后 T3 会自行重启，加载器让它经启动器重启，新窗口照样有公式；
   - 「重启以更新」时，去掉安装程序的 `--force-run`，由 `mod/after-update.js`（Windows Script Host）
     等安装结束后经启动器打开新版 T3；
   - 去掉 T3 子进程会继承到的 `--inspect-brk`，否则子进程会停下来等调试器。

任何一步失败，T3 都按原样运行，只是没有公式：

- 找不到 T3：弹框说明；
- 加载器没能加载：启动器照常打开 T3，并弹框说明原因和日志位置；
- T3 将来改了 react-markdown 的写法、三处修改对不上：T3 收到原版脚本，同时弹一个系统通知「T3 LaTeX 未启用」。

弹框和通知在区域格式为中文时用中文，否则用英文。日志：`%TEMP%\t3-latex\launcher.log`、`%TEMP%\t3-latex\loader.log`。

### 公式和「Cite」

T3 的「Cite」从消息的文字节点拼出引用文本，跳过 `aria-hidden` 的部分；选区的首尾只要落在 `aria-hidden`
里，它就不给 Cite。KaTeX 画出来的字形正好是 `aria-hidden` 的，所以：

- `src/katex.js` 在每个公式的字形前后各放一段看不见的源码文字（`$x^2` 和 `$`），T3 拼出来就是 `$x^2$`；
- `src/selection.js` 在松开鼠标后、T3 读选区之前，把落在公式里的选区端点挪到公式两侧这两段源码上。
  Chromium 从 KaTeX 字形上开始拖时选不出东西（普通网页上的 KaTeX 也一样），这种拖动由它来完成。

## 已知限制

- 必须从这个快捷方式打开。T3 的普通图标、开机自启、`t3code://` 链接拉起的 T3 都是原版。
- T3 启动后的约 0.2 秒内，主进程的调试口在 `127.0.0.1` 的随机端口上开着（加载器载入后立即关闭），
  这段时间内本机其他程序理论上可以连上去。
- 依赖 T3 的 exe 允许 `--inspect-brk` 和 `ELECTRON_RUN_AS_NODE`（Electron 的两个 fuse，T3 目前都开着，
  它自己的 Windows 服务端也要用后者）。T3 哪天关掉其中一个，这种加载方式就走不通了。
- 只支持 Windows。

## 开发

```sh
git clone https://github.com/Zane-0x5a/t3-latex && cd t3-latex
npm install
npm run build       # 打包 mod/assets
npm test
npm run package     # dist/t3-latex-<版本>.zip
powershell -ExecutionPolicy Bypass -File install.ps1   # 快捷方式指向这个仓库
```

`npm test` 覆盖：定界符统一和完整渲染管线；react-markdown 的修改和带公式的 Cite（这两项直接用本机已装 T3 的代码，
`T3LATEX_T3_DIR` 指向另一个含 `resources\server.asar` 的目录就检查那个版本）；启动器环境；批处理（会临时写入并删掉 `HKCU\Software\t3latex-test`）。

在隔离的 T3 里看效果（独立的 APPDATA、T3CODE_HOME、TEMP 和任务栏身份，关掉自动更新，碰不到正在用的 T3；
被别的窗口挡住时也照常渲染，截图和模拟输入才可靠）：

```sh
node dev/t3.cjs start                 # 启动，主进程调试口保持打开供下列命令使用
node dev/t3.cjs shot out.png          # 窗口截图
node dev/t3.cjs js "<表达式>|@文件"    # 在窗口里执行
node dev/t3.cjs main "<表达式>|@文件"  # 在主进程里执行
node dev/t3.cjs stop
powershell -File dev/iso-launch.ps1 [-Plain] [-Dialog]   # 按快捷方式的命令行启动隔离 T3
node dev/t3.cjs main @dev/simulate-update.js            # 模拟「重启以更新」
node dev/t3.cjs js @dev/copy-selection.js               # 看复制最后一条消息会得到什么（不碰系统剪贴板）
```

```
src/normalize.js        定界符统一（$$…$$、\[…\]、\(…\)、裸环境、价格、流式未闭合）
src/katex.js            带缓存的 rehype-katex，附 data-markdown-copy（T3 复制用）和隐藏的源码文字（T3 引用用）
src/selection.js        选区整体吸附到公式，从公式上开始的拖动
src/plugins.js          追加给 T3 的 remark / rehype 插件
src/boot.js             渲染进程入口，挂到 globalThis.__t3latex
src/t3-latex.css        聊天栏里的 KaTeX 排版修正（横向滚动、每条消息的编号）
mod/loader.cjs          T3 主进程里的加载器
mod/patch.cjs           react-markdown 的三处修改
mod/after-update.js     更新安装结束后经启动器重开 T3
mod/assets/             build.mjs 的产物（含 THIRD-PARTY-NOTICES.txt）
launcher/launch.cjs     启动器
launcher/t3-latex.cmd   快捷方式调用的脚本
launcher/find-t3.cmd    从注册表找 T3 的 exe
install.ps1 / uninstall.ps1、install.cmd / uninstall.cmd
dev/                    隔离 T3 的开发工具
test/                   node --test
```

## 许可证

[MIT](LICENSE)。发布包里打包了 KaTeX、remark-math 及其依赖，它们的许可证见 `mod/assets/THIRD-PARTY-NOTICES.txt`。
