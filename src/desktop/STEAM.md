# 墨斗桌面版 / 上 Steam

## 这是什么

桌面版就是把网页版的墨斗装进一个 Electron 窗口，打成 Windows 能直接双击的 Modou.exe。
游戏代码还是那一份（js/、css/、index.html），网页版和桌面版一起改、一起更新。

和网页版的区别只有这些：

- 字体打包进去了，没网也能显示毛笔字。`python build.py --desktop` 会把字体裁成只含用到的字。
- 默认全屏，F11 或 Alt+Enter 切换，会记住上次的选择。
- 游戏代码里能用 `window.modouDesktop`（全屏、退出、Steam 成就等），网页版没有这个对象。用到它的地方在 `js/ui.js`「软件版」那一段：
  窗口里一直是全屏的样子（只有游戏画面）；网页版下面的教程换成菜单和暂停里的「教程」面板（2.2：单独一套文字 + 表格，左边章节、右边内容，`js/guide.js` 的 Manual）；
  菜单多一个「退出游戏」；Esc 只暂停、不退出全屏；邀请链接用网页版的网址（对方点开在浏览器里进同一个房间，网页版、软件版能一起玩，版本号要一样）。
- 能接 Steam（成就、昵称、Shift+Tab 界面）。没 Steam 也照常玩。
- 存档（键位、颜色、音量）在 `%APPDATA%\Modou` 里，和浏览器里的网页版是分开的。

## 在自己电脑上打包（Windows）

先装好：

- Node.js 22
- Python 3（3.10 以上都行），再装两个库：`pip install fonttools brotli`
- Git

第一次（或者 package-lock.json 变了以后）：

```
cd src\desktop
npm ci
```

每次改完游戏：

```
cd src
python build.py --desktop
cd desktop
npm start
```

`npm start` 是直接开起来试玩，不打包。第一次会下载 Electron，要等一会儿。

要打成安装包：

```
npm run dist:win
```

结果在 `src\desktop\dist\`：

- `Modou-2.1.0-win-x64.zip`：整个游戏，发给别人或者传 Steam 用这个。
- `win-unpacked\Modou.exe`：解压好的，双击就能玩。

想开开发者工具调试：PowerShell 里 `$env:MODOU_DEBUG=1; npm start`（cmd 里是 `set "MODOU_DEBUG=1" && npm start`，引号别省，不然会多一个空格）。这时 F12 开工具、Ctrl+R 刷新。平时玩家那边没有这些。

版本号不用手动改：`build.py --desktop` 会把 `js/config.js` 里的 `VERSION` 写进 `desktop/package.json`。

## 用 GitHub 自动打包

工作流在 `.github/workflows/desktop.yml`。

- 推一个 tag，比如 `git tag v2.1.0` 然后 `git push origin v2.1.0`。
- GitHub 会在 Windows、Linux、macOS 上各打一次包（Linux、macOS 失败了不影响）。
- 打完自动建一个 Release，附上 `Modou-2.1.0-win-x64.zip`（还有 Linux 的 AppImage、macOS 的 zip）。
- tag 必须和 `js/config.js` 的 `VERSION` 一样（`v` + 版本号），不一样会直接报错，提醒你先改版本号。
- 不想发 Release、只想试试打包：Actions 页面选 desktop，点 Run workflow。包在那次运行的 Artifacts 里下载。

## 上 Steam，一步步来

Steam 的规则会变。下面的时间、价格、尺寸都以 Steamworks 后台和文档为准，动手前再核对一遍。

### 1. 注册 Steamworks，交上架费

去 partner.steamgames.com 注册（Join Steamworks），签发行协议。
每个游戏要交 100 美元（Steam Direct 费）。游戏卖到 1000 美元以后，这 100 美元会退回到你的收入里。

### 2. 身份、税务、银行信息

后台会让你做身份验证、填税务问卷（tax interview）、填收款银行。
这几样都要审核，可能要几天。全部通过了才能交费、拿 App ID。

### 2.5 中国大陆的个人开发者

流程和别人一样，区别在这几处：

- 以「个人」（Sole Proprietorship）注册，名字填身份证上的拼音全名（大写），地址填身份证地址的英文。
- 税务问卷选非美国人，填的是 W-8BEN；国家选中国，纳税人识别号（TIN）填身份证号。中美有税收协定，填对了预扣税是 10%（不填 TIN 会按 30% 扣）。人在美国长期生活或读书的，税务身份可能不一样，先问清楚再填。
- 收款用国内银行卡就行（人民币卡也能收，银行会给外币户），需要银行的英文名、SWIFT 代码、开户支行地址。外汇进来银行可能要你出示收入证明（Steamworks 的发行协议），个人每年结汇额度 5 万美元。
- 身份核验要身份证正反面、手持身份证照片，可能让你补材料。
- 这些都是面向全球 Steam。国内的「蒸汽平台」（Steam China）是另一回事，要版号。

### 3. 拿到 App ID，写进项目

交完费会给你一个 App ID（一串数字）。打开 `desktop/steam.json`，改成：

```
{
  "appId": 1234560
}
```

提交这个改动。以后打的包就会自动连 Steam。
没填（`null`）也能玩，只是成就那些不工作。

### 4. 时间线（先算好）

- 交费以后至少等 21 天才能正式发售（前几款游戏都这样；以 Steamworks 文档为准）。
- 税务审核最长要 30 天，审核完之前税务信息改不了。
- 商店页要先以「即将推出」（Coming Soon）公开至少 2 周。
- 商店页、游戏本体上线前都要 Valve 审核，各要几个工作日。
- 所以最早也是交费后一个多月才能卖。建议一交完费就先做商店页。

### 5. 设置 depot 和启动项

后台 App Admin 里：

- SteamPipe → Depots：用默认那个 depot（一般是 App ID + 1），系统选 Windows。
- Installation → General Installation：安装目录名填 `Modou`；启动项（Launch Options）加一条，可执行文件填 `Modou.exe`，系统 Windows，参数留空。
- 改完记得点 Publish，后台改动发布了才生效。

### 6. 准备上传工具

- 后台下载 Steamworks SDK，解压。用的是里面的 `tools\ContentBuilder\`。
- 把 `desktop\steam\app_build.vdf` 和 `depot_build_win.vdf` 复制到 `ContentBuilder\scripts\`。
- 打开这两个文件，把 `<APP_ID>` 换成你的 App ID，`<WIN_DEPOT_ID>` 换成 Windows depot 的 ID。

### 7. 上传一个版本

- 把 Release 里的 `Modou-2.1.0-win-x64.zip` 解压到 `ContentBuilder\content\windows\`（这个文件夹里直接就是 Modou.exe）。
- 改 `app_build.vdf` 里的 `Desc`，写上这次的版本号。
- 在 `ContentBuilder` 目录里运行：

```
builder\steamcmd.exe +login 你的Steam账号 +run_app_build ..\scripts\app_build.vdf +quit
```

- 第一次会要 Steam 令牌验证码。Valve 建议专门开一个只有上传权限的账号来传。
- 传完去 SteamPipe → Builds，把这个 build 设到 default 分支（想先自己测就设到 beta 分支），再 Publish。

### 8. 商店页素材

要准备这些图（常见尺寸，以后台「商店资源」页写的为准）：

- 页眉胶囊图 920×430
- 小胶囊图 462×174
- 主胶囊图 1232×706
- 竖版胶囊图 748×896
- 库胶囊图 600×900
- 库主视觉 3840×1240，库标志（透明 PNG）
- 截图至少 5 张，1920×1080
- 社区图标 184×184
- 最好再有一段预告片
- 成就图标，每个 64×64，要「已解锁」和「未解锁」（灰色）两张

### 9. 建成就

后台 Stats & Achievements → Achievements，一个个新建。
API Name 必须和下面一模一样，游戏代码就是用这些名字解锁的。Set by 选 Client。名称、说明填中文（想加英文就再加一种语言）。

| API Name | 名称 | 说明 |
|---|---|---|
| ACH_FIRST_WIN | 初战告捷 | 人机第一次获胜 |
| ACH_BEAT_EASY | 小试牛刀 | 战胜「简单」 |
| ACH_BEAT_NORMAL | 渐入佳境 | 战胜「中等」 |
| ACH_BEAT_HARD | 登堂入室 | 战胜「困难」 |
| ACH_BEAT_EXTREME | 出神入化 | 战胜「终极」 |
| ACH_COMBO_5 | 行云流水 | 人机或联机里一套连击打满 5 下 |
| ACH_SUPER | 泼墨挥毫 | 用泼墨打中对手 |
| ACH_DRILL_MASTER | 拆招大师 | 破招练习一共过关 20 次（哪几课都行；2.2 起不记哪一课「已完成」） |
| ACH_ONLINE_WIN | 以武会友 | 赢一场联机对战 |

建完也要 Publish。

### 10. 没拿到 App ID 前，用 480 在本地测

480 是 Valve 给所有人测试用的 App（叫 Spacewar）。

- 打开 Steam 客户端并登录，别关。
- 在 `dist\win-unpacked\`（Modou.exe 旁边）新建 `steam_appid.txt`，里面只写 `480`。用 `npm start` 测的话，放在 `src\desktop\` 里。
- 打开游戏。Steam 好友列表会显示你在玩 Spacewar，`modouDesktop.steam.ok()` 是 true，`personaName()` 是你的 Steam 昵称。
- 480 里没有我们那 9 个成就。测成就流程可以用它自带的：PowerShell 里 `$env:MODOU_DEBUG=1; .\Modou.exe` 打开，F12 控制台里运行 `await modouDesktop.steam.achieve('ACH_WIN_ONE_GAME')`，返回 true 就是解锁成功（Steam 里 Spacewar 的成就页能看到）。
- 清掉测试成就：浏览器地址栏打开 `steam://open/console`，输入 `achievement_clear 480 ACH_WIN_ONE_GAME`。
- 想测 Shift+Tab 的 Steam 界面：在 Steam 里「添加非 Steam 游戏」，把 Modou.exe 加进去，从 Steam 里启动。直接双击 exe 是没有这个界面的。
- 测完删掉 `steam_appid.txt`。（上传脚本也会把它排除掉，不会发给玩家。）

游戏不强制从 Steam 启动，直接双击 Modou.exe 也能玩，只是没成就。

### 11. Steam Deck

- 画面已经能缩放到 1280×800，Deck 上用 Windows 版（Proton）就能跑。
- 想拿「已验证」（Verified）还差：完整手柄支持、默认手柄配置、输入房间码时弹出屏幕键盘、字够大。
- 现在只有键盘鼠标，最多算「可游玩」。Steam 输入能把手柄映射成键盘先凑合用。

### 12. 名字、商标、身份

- 名字：在 Steam 上搜「墨斗」「Modou」，看有没有重名的游戏。再查一下商标：中国商标网（sbj.cnipa.gov.cn）和美国 USPTO，主要看软件、游戏、娱乐相关的类别（第 9、28、41 类）。
- 收入和税务：卖游戏的钱一般算个人收入（自雇）。开始收钱之前，先弄清楚你所在的国家、你的身份对这类收入有没有限制、要怎么报税；拿不准就问学校或专业人士。Steamworks 的税务问卷也按这个填。

## 以后每次更新

1. 改游戏，`js/config.js` 里把 `VERSION` 改大。
2. 网页版照旧更新（`python build.py` 那套），提交、推送。
3. `git tag v版本号`，`git push origin v版本号`，等 Release 出来。
4. 下载 win zip，解压到 `ContentBuilder\content\windows\`（先清空旧的），改 `Desc`，上传，后台设 live。

## 文件说明

- `main.js`：窗口、全屏、快捷键，只许页面待在 app/ 里，外部链接用系统浏览器开。
- `preload.js`：给游戏的 `window.modouDesktop` 接口。名字定了别改。
- `steam.js`、`steam.json`：Steam 部分（可选）。
- `build/icon.png`、`build/icon.ico`：图标，用 `python scripts/make_icon.py` 生成（要先 npm ci，需要 Pillow）。
- `build/OFL-1.1.txt`：字体许可证原文，万一字体包里没带许可证就用它。
- `steam/*.vdf`：上传 Steam 的脚本模板。
- `app/`、`dist/`：生成出来的，不提交。

Windows 的 exe 没做代码签名。从 Steam 装没问题；从 GitHub 下 zip 的话 Windows 可能弹 SmartScreen 提示，点「仍要运行」。以后买了签名证书，再把 package.json 里的 `win.signExecutable: false` 去掉、配 `CSC_LINK`。
