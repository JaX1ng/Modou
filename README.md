# 墨斗

水墨火柴人格斗。

- **网页版**（在线玩）：https://jax1ng.github.io/Modou/
- **软件版**（Windows，准备上 Steam）：在 [Releases](https://github.com/JaX1ng/Modou/releases) 下载 `Modou-版本号-win-x64.zip`，解压后双击 `Modou.exe`。还没做代码签名，Windows 可能弹 SmartScreen 提示，点「更多信息 → 仍要运行」。

网页版和软件版是同一份游戏，版本号一样就能一起联机（输入同一个房间码）。

## 仓库结构

- `index.html`：打包好的网页版（GitHub Pages 发布的就是它）。
- `src/`：全部源码，网页版和软件版共用一份。改代码、测试、打包的说明在 `src/NOTES.md`；软件版和上 Steam 的步骤在 `src/desktop/STEAM.md`。
- `.github/workflows/desktop.yml`：推一个 `v` 开头、和版本号一样的 tag（比如 `v2.1.0`），GitHub 自动打包软件版并发 Release。
