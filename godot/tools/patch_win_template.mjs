// Windows 版：把 Godot 官方的导出模板（windows_release_x86_64.exe）换上墨斗的图标和版本信息，当「自定义模板」用
// （Godot 自己改 exe 的图标要 rcedit，Linux 上没有；这里用 resedit（纯 JS）先把模板改好，导出时 Godot 只往后面接游戏数据）
// 用法：node tools/patch_win_template.mjs 官方模板.exe 图标.ico 版本号 输出.exe   （要先 npm install resedit@2 pe-library@1）
import * as ResEdit from 'resedit';
import * as PE from 'pe-library';
import fs from 'fs';

const [, , src, icoPath, ver, out] = process.argv;
const exe = PE.NtExecutable.from(fs.readFileSync(src), { ignoreCert: true });
const res = PE.NtExecutableResource.from(exe);
// 图标：换掉 GODOT_ICON 那一组
const ico = ResEdit.Data.IconFile.from(fs.readFileSync(icoPath));
ResEdit.Resource.IconGroupEntry.replaceIconsForResource(res.entries, 'GODOT_ICON', 1033, ico.icons.map(i => i.data));
// 版本信息
const vi = ResEdit.Resource.VersionInfo.fromEntries(res.entries)[0];
const nums = (ver.match(/\d+/g) || []).map(Number).concat([0, 0, 0, 0]).slice(0, 4);
vi.setFileVersion(nums[0], nums[1], nums[2], nums[3], 1033);
vi.setProductVersion(nums[0], nums[1], nums[2], nums[3], 1033);
vi.setStringValues({ lang: 1033, codepage: 1200 }, {
  CompanyName: 'JaX1ng', FileDescription: '墨斗', ProductName: '墨斗', InternalName: 'Modou', OriginalFilename: 'Modou.exe',
  FileVersion: ver, ProductVersion: ver, LegalCopyright: '© 2026 JaX1ng',
});
vi.outputToResourceEntries(res.entries);
res.outputResource(exe);
fs.writeFileSync(out, Buffer.from(exe.generate()));
console.log('ok', out);
