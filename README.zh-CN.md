# t3-latex

<p align="center"><img src="docs/hero.webp" alt="T3 Code 聊天里渲染好的公式：行内公式、独立公式和 aligned 环境" width="100%"></p>

让 Windows 上的 [T3 Code](https://github.com/pingdotgg/t3code) 桌面版在聊天里渲染 LaTeX。从「T3 Code (LaTeX)」
快捷方式打开 T3，聊天里的 `$…$`、`$$…$$`、`\(…\)`、`\[…\]` 和单独成行的 `\begin{align}` 都会用 KaTeX 排版。

它还能在聊天里显示**交互式可视化**：Claude 或 Codex 放进回复的模拟、带滑块的函数图、3D 场景，直接在聊天里运行，
就像 OpenAI 的 Codex 客户端那样。

它不是 fork，也不改 T3 的安装目录：运行的是官方的 T3，自动更新照常进行；从 T3 自己的图标打开就是原版。
这些功能只在从这个快捷方式启动时加载进 T3。上游把 LaTeX 渲染标为 not planned（pingdotgg/t3code#1784）。

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

## 交互式可视化

<p align="center"><img src="docs/visualize.webp" alt="T3 Code 里 Claude 的回复中嵌着一个可交互的阻尼振子可视化：阻尼比和时间的滑块、实时数值、弹簧和位移曲线" width="100%"></p>

Claude 可以在回复里放一个能动手操作的可视化：模拟、带滑块的函数图、3D 场景、几何作图。它把可视化写成一个
```` ```visualize ```` 的 HTML 代码块，t3-latex 就地运行它。

- 可以直接要（「画个能拖动的图给我看看」），也可以让 Claude 在「拧一个参数就能看明白」的时候主动给。安装程序会把
  `t3-visualize` 这个 skill 放进 Claude Code 的 skills 文件夹，它告诉在 T3 里运行的 Claude 什么时候值得画、怎么写。
- 每个可视化都在沙箱 iframe 里运行，碰不到 T3、你的文件和网络；跟随 T3 的浅色/深色主题，高度随内容自适应。
- 内置 d3、three.js（含 addons）和 KaTeX，离线也能用；也能从 jsDelivr、unpkg、esm.sh、cdnjs 加载脚本。
- 每个可视化的滑块和输入值都会记住：滚走再滚回来、重新打开对话，都还是原来的值。
- 鼠标悬停时，可视化下方出现几个按钮：引用当前状态、放大到几乎整个窗口（不会重新开始），以及重置。
- 可视化是模型写的，但你在里面怎么调，模型看不到。「引用当前状态」把每个控件的名称和值、可视化里的读数整理成一行
  填进输入框，比如「（可视化「…」的当前状态：阻尼比 ζ = 2.32；状态 过阻尼）」，你补上问题再发送。
  可视化里有可引用的内容时才显示这个按钮。
- 可视化的代码出错时，错误显示在可视化里，附一个按钮把修复请求填进输入框；可视化也可以用同样的方式提供追问。
  两者都只是填进输入框等你发送，而且只在你刚点过这个可视化之后才生效。
- 代码块还在流式输出时显示占位框和已生成的大小，代码块完整后可视化才开始运行。
- 复制消息时，可视化复制出来的是代码块源码。

### Codex 的可视化

<p align="center"><img src="docs/visualize-codex.webp" alt="T3 Code 里 Codex 的回复：方波的傅里叶级数，一个调项数的滑块，上图是最新加入的一项，下图是部分和与理想方波的对比，能看到吉布斯现象的过冲" width="100%"></p>

Codex 有自己的 visualize 插件（随 Codex 客户端安装，T3 里的 Codex 也会加载它）：它把可视化写成一个 HTML 文件，
再在回复里放一行 `visualize{"path": …}`。原版 T3 只把这一行当文字显示；有了 t3-latex，这一行的位置就显示出可视化，
同样在沙箱里运行，主题、引用、放大和重置也和上面一样。

- 不用任何设置：在 T3 里让 Codex 画给你看，或者等它主动给。
- Codex 的可视化需要宿主提供的东西都有：`window.openai`（可视化保存的状态、追问、链接）、Lucide 图标、标签页、
  方案轮播，以及 Codex 样式表里的那些 class。
- 每次显示这条消息都会重新读文件，所以 Codex 之后更新过的可视化显示的是新版本。

## 安装

需要 Windows 10 或 11，以及 [T3 Code 桌面版](https://github.com/pingdotgg/t3code/releases)（Stable 或 Nightly 都可以）。

1. 从 [Releases](https://github.com/Zane-0x5a/t3-latex/releases/latest) 下载 `t3-latex-<版本>.zip`，解压到一个以后不会挪动的文件夹，
   比如 `%LOCALAPPDATA%\t3-latex`。快捷方式指向这个文件夹。
2. 双击 `install.cmd`。如果 SmartScreen 提示这是下载来的脚本，点「更多信息 → 仍要运行」；也可以在解压前到 zip 的「属性」里勾选「解除锁定」。
3. 完全退出 T3（包括托盘图标），再从开始菜单或桌面的「T3 Code (LaTeX)」打开。

安装会在开始菜单和桌面各放一个快捷方式，并把 `t3-visualize` skill 复制到 `%USERPROFILE%\.claude\skills`
（设置了 `CLAUDE_CONFIG_DIR` 时是它下面的 `skills`），别的什么都不动。快捷方式有自己的任务栏身份
（AppUserModelID `com.t3tools.t3code.latex`），启动器把同一个 ID 交给 T3，所以可以把它固定到任务栏代替原来的 T3 图标，
打开的 T3 窗口会归到这个固定图标下。

- T3 已经开着（从普通图标打开的）时点这个快捷方式，会弹框提示先完全退出 T3：T3 是单实例的，已经在运行的那个进程无法再加载公式渲染。
- 已经是从这里打开的 T3，再点一次只会把窗口切到前台。
- 每次打开都从 T3 安装程序写在注册表里的记录找 T3（`launcher\find-t3.cmd`）。所以不管 T3 装在哪个文件夹
  （较早的安装在 `Programs\t3-code-desktop`，现在新装的在 `Programs\t3code`），也不管是 Stable 还是 Nightly
  （exe 分别叫 `T3 Code (Alpha).exe`、`T3 Code (Nightly).exe`），都不用改设置。要用别的 T3 exe，把环境变量 `T3LATEX_T3_EXE` 设为它。
- 快捷方式的图标是安装时从 T3 复制出来的 `launcher\t3.ico`，T3 的 exe 改名后也不会坏。

**更新 t3-latex：** 退出 T3，把新的 zip 解压覆盖到原来的文件夹，再运行一次 `install.cmd`。

**卸载：** 双击 `uninstall.cmd`（删除快捷方式、它们的图标、skill 和 `%TEMP%\t3-latex` 下的日志），再删掉这个文件夹。
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
   （KaTeX 样式与字体、渲染模块、可视化运行的 iframe 页面，见 `mod/serve.cjs`），并在窗口的 `index.html` 里加上前两样；
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

### 可视化

- `src/visualize.js` 把 ```` ```visualize ```` 代码块换成 `<t3latex-viz>` 元素；还在流式输出的代码块换成占位框。
- `src/viz-element.js` 定义这个元素：里面是一个沙箱 iframe（只有 `allow-scripts`，所以是不透明源），指向
  `t3code://app/__t3latex/frame/frame.html`。`mod/serve.cjs` 给这个页面单独的 Content-Security-Policy：
  脚本只能来自内置的库和那四个 CDN，不能从任何地方拉取数据。
- 代码块的 HTML、T3 的主题和记住的输入值通过 iframe 的 `window.name` 传进去。`frame/runtime.js` 在页面还在解析时
  就把 HTML 写进去，所以其中的脚本像普通网页一样按顺序执行。
- iframe 通过 `postMessage` 报告高度、输入值和用户的请求（填进输入框的问题、要在浏览器打开的链接）。页面把这些都当作
  不可信的：填输入框和开浏览器都要求用户刚刚点过这个 iframe。
- 「引用当前状态」向 iframe 要那一行：iframe 根据控件的标签、`<output>`、`.viz-stat` 和 `aria-live` 读数，以及选中的标签页、
  方案或卡片拼出这一行；Codex 的可视化如果自己保存了 `modelContent`，就直接用它。只有对这次点击的回答会填进输入框。
- 高度和输入值按代码块的哈希存在 T3 的 `localStorage` 里，保留最近 300 个可视化。
- Codex 的那一行（Codex 用私用区字符把它包起来：U+E200 `visualize` U+E202 `{…}` U+E201）换成同一个元素，带上文件路径。
  元素通过加载器的 `t3code://app/__t3latex/file?path=…`（`mod/serve.cjs`）读文件：只给 `.html` 文件，也只给 T3
  自己的页面——不带 CORS 头，来自不透明源（比如可视化的 iframe）的请求直接拒绝。`frame/runtime.js` 给 Codex 的 HTML
  提供 `window.openai`、Lucide、标签页和轮播；它保存的状态和输入值一样记下来。

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
- skill 是给 Claude Code 的；Codex 用它自己的插件（见上）。T3 里的其他模型只有明确要求写 ```` ```visualize ````
  HTML 代码块时才会画，也不知道这些约定。
- Codex 的可视化在 T3 里有几处做不到：Codex 的日程组件（`<viz-calendar>`）和界面原型的设计控件面板（`Tweak`）没有，
  用到它们的可视化只显示其余部分；可视化保存的状态只留在可视化里，Codex 客户端会自动把它传回给模型，
  T3 要你点「引用当前状态」才会带上；文件必须在这台电脑上，在 WSL 或远程机器上运行的 Codex 写出的文件 t3-latex 读不到。
- 从 CDN 加载的脚本需要联网，而且有些网络下 CDN 很慢或连不上；内置的库没有这个问题。
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

`npm test` 覆盖：定界符统一和完整渲染管线（含可视化代码块）；可视化 iframe 的运行时（jsdom，含 Codex 的接口）和加载器提供的文件（iframe 的策略、CORS、路径不越界、Codex 的文件只给 T3 的页面）；react-markdown 的修改和带公式的 Cite（这两项直接用本机已装 T3 的代码，
`T3LATEX_T3_DIR` 指向另一个含 `resources\server.asar` 的目录就检查那个版本）；启动器环境；批处理（会临时写入并删掉 `HKCU\Software\t3latex-test`）。

在隔离的 T3 里看效果（独立的 APPDATA、T3CODE_HOME、TEMP 和任务栏身份，关掉自动更新，碰不到正在用的 T3；
被别的窗口挡住时也照常渲染，截图和模拟输入才可靠）：

```sh
node dev/t3.cjs start                 # 启动，主进程调试口保持打开供下列命令使用
node dev/t3.cjs shot out.png          # 窗口截图
node dev/t3.cjs js "<表达式>|@文件"    # 在窗口里执行
node dev/t3.cjs main "<表达式>|@文件"  # 在主进程里执行
node dev/t3.cjs frame "<表达式>|@文件" # 在每个可视化 iframe 里执行（它们是独立进程的沙箱页面）
node dev/t3.cjs click X Y             # 在窗口的 CSS 像素坐标处真实点击，能点进这些 iframe
node dev/t3.cjs stop
powershell -File dev/iso-launch.ps1 [-Plain] [-Dialog]   # 按快捷方式的命令行启动隔离 T3
node dev/t3.cjs main @dev/simulate-update.js            # 模拟「重启以更新」
node dev/t3.cjs js @dev/copy-selection.js               # 看复制最后一条消息会得到什么（不碰系统剪贴板）
```

```
src/normalize.js        定界符统一（$$…$$、\[…\]、\(…\)、裸环境、价格、流式未闭合）
src/katex.js            带缓存的 rehype-katex，附 data-markdown-copy（T3 复制用）和隐藏的源码文字（T3 引用用）
src/selection.js        选区整体吸附到公式，从公式上开始的拖动
src/plugins.js          追加给 T3 的 remark / rehype 插件，以及它们之前的 markdown 预处理
src/visualize.js        ```visualize 代码块和 Codex 的 visualize{"path"} 行 → <t3latex-viz>；流式输出中的 → 占位框
src/viz-element.js      <t3latex-viz>：沙箱 iframe、主题、高度、记住的状态、引用、放大和重置；读取 Codex 的文件
src/boot.js             渲染进程入口，挂到 globalThis.__t3latex
src/t3-latex.css        聊天栏里的 KaTeX 排版修正（横向滚动、每条消息的编号）
mod/loader.cjs          T3 主进程里的加载器
mod/patch.cjs           react-markdown 的三处修改
mod/serve.cjs           提供 mod/assets（给 iframe 的 CORS、iframe 的安全策略）和 Codex 的可视化文件
mod/after-update.js     更新安装结束后经启动器重开 T3
mod/assets/             build.mjs 的产物（含 THIRD-PARTY-NOTICES.txt）
frame/                  可视化的 iframe 页面：frame.html、runtime.js、frame.css、各个库的入口
skill/t3-visualize/     install.ps1 复制的 Claude Code skill
launcher/launch.cjs     启动器
launcher/t3-latex.cmd   快捷方式调用的脚本
launcher/find-t3.cmd    从注册表找 T3 的 exe
install.ps1 / uninstall.ps1、install.cmd / uninstall.cmd
dev/                    隔离 T3 的开发工具
test/                   node --test
```

## 许可证

[MIT](LICENSE)。发布包里打包了 KaTeX、remark-math、d3、three.js、Lucide 及其依赖，它们的许可证见 `mod/assets/THIRD-PARTY-NOTICES.txt`。
