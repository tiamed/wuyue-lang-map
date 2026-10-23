# 吴越语言变迁地图

吴越地区语言变迁示意地图（静态演示）。

**在线访问：** [https://tiamed.github.io/wuyue-lang-map/](https://tiamed.github.io/wuyue-lang-map/)

![六片分支预览](preview.png)

数据与图层为示意行政区聚合，非精确同言线。今界方言面不是历代府界。

## 本地历史府界对照（调试，默认关）

这不是产品几何。正常打开页面不会画出历史府界，发布包里也没有这些面。

1. 把对照包解压到 `local/jiangshan-overlay/`（GeoJSON 已 gitignore，说明见该目录 README）。
2. 本地静态服务器打开 `?overlay=jiangshan`。关掉用 `?overlay=off`，或用出现的「府界对照」开关。
3. 开关写入 `localStorage` 键 `wuyue.jiangshanOverlay`。没有这个参数、也没有这份本地存储时，对照层保持关闭，并且不会去请求那些文件。

对照年：−100／440／741／1200／1415／1820。近代不叠。先秦只有政区「越」，没有府级面。第一批是扬／广陵、宣／宁国、金衢（不含处州）。不要把汉扬州部、会稽、丹阳郡、宁镇／昌北残岛画进这一层。

府级面来自 CHGIS，仅学术、非商用，不能随本仓库或 GitHub Pages 发布。
