# 本地历史府界对照

调试用。默认关闭。**不要**把本目录里的 GeoJSON 提交进仓库，也**不要**放进 GitHub Pages。

本仓库以静态文件发布。GeoJSON 一旦 commit，Pages 就会把它公开。`.gitignore` 忽略本目录里除本 README 以外的文件。

## 怎么放进来

对照包解压后应有 `jiangshan-overlay/`（`era-*.geojson`、`manifest.json`）。在仓库根目录执行：

```bash
mkdir -p local
tar -xzf /path/to/jiangshan-overlay-pack.tgz -C local
```

如果这步盖掉了本 README，从 git 再 checkout 回来即可。完成后这些文件在本地、但不在 git 里：

- `era-01-xianqin-y-403.geojson`
- `era-02-qinhan-y-100.geojson`
- `era-03-weijin-y440.geojson`
- `era-04-suibeisong-y741.geojson`
- `era-05-nansongyuan-y1200.geojson`
- `era-06a-ming-y1415.geojson`
- `era-06b-qing-y1820.geojson`

文件名必须与上表一致，放在 `local/jiangshan-overlay/`。应用只在对照层打开时用相对路径读取。没有文件就留空，不会改去请求线上地址。

## 怎么打开

用本地静态服务器（不要用 `file://`，浏览器会拦截 `fetch`）：

```bash
python3 -m http.server 8765
```

- 打开：`http://127.0.0.1:8765/?overlay=jiangshan`
- 关闭：`http://127.0.0.1:8765/?overlay=off`，或页面上的「府界对照」
- 记住开：`localStorage` 键 `wuyue.jiangshanOverlay` = `jiangshan`
- 普通访问（没有参数、也没有这份本地存储）不显示开关，也不请求这些文件

长时段切到哪一段，就叠哪一年的第一批府界。六片分支仍是今界方言面，对照线叠在上面。明清是同一长时段，开关里可在 **1415 明** / **1820 清** 之间换，不改叙述文案。

有对照包时可以跑：

```bash
node scripts/check-jiangshan-overlay.mjs
```

没有 GeoJSON 时，脚本仍检查过滤规则，并跳过文件对照。

## 第一批（易骗人）

| 年 | 文件 | 只画这些 |
|---|---|---|
| −403 | `era-01-xianqin-y-403.geojson` | 政区「越」（polity，**不是**府级面） |
| −100 | `era-02-qinhan-y-100.geojson` | 广陵国 |
| 440 | `era-03-weijin-y440.geojson` | 广陵郡、宣城郡、东阳郡 |
| 741 | `era-04-suibeisong-y741.geojson` | 扬州、宣州、婺州、衢州 |
| 1200 | `era-05-nansongyuan-y1200.geojson` | 扬州；旁看泰州、高邮军；宁国府；婺州、衢州 |
| 1415 | `era-06a-ming-y1415.geojson` | 扬州府、宁国府、金华府、衢州府 |
| 1820 | `era-06b-qing-y1820.geojson` | 扬州府、宁国府、金华府、衢州府 |

近代不叠。

## 不要画进去

- 汉「扬州」**刺史部**（`layer=region`）。−100 的府级焦点是广陵国。
- 用会稽（或后来的绍兴）充当金衢。
- 把丹阳郡／丹阳尹标成宣城。440 的宣城是宣城郡。
- 处州、处州府、唐括州。金衢不含处州。
- 宁镇、昌北等**今**残点岛。那些仍在方言岛图层里，不属于本对照层。

## 许可

来源是 [DeanChensj/jiangshan-map](https://github.com/DeanChensj/jiangshan-map) 的时序导出，府级面与战国疆域出自 **CHGIS V6 / Hartwell**。

- 上游仓库常标 GPL-3.0。**府级面不能**按 GPL 再分发。
- 仅学术、非商用。
- 界线是示意，不是测绘边界。
- 只用于本地看「扬州／宣城／金衢今界是否骗人」。不得进入本站 public / Pages，不得打进 npm 或商用产品。
