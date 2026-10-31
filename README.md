# liijjj.github.io

个人静态站点，内容和数据都由 GitHub Actions 更新，托管在 GitHub Pages 上。

- 站点首页：<https://liijjj.github.io/>
- 天气页：<https://liijjj.github.io/monitor/weather/quzhou/>
- 可转债页：<https://liijjj.github.io/monitor/finance/cn/kzz/>

## 页面

| 页面 | 更新方式 | 数据来源 |
| --- | --- | --- |
| 衢州天气 | 每小时第 7 分钟 | 和风天气（实况、24 小时预报、分钟级降水、预警）+ WAQI（空气质量） |
| 可转债 | 页面直接 iframe 嵌入 | 东方财富；每天 07:33 检查申购日并推送钉钉 |
| 阮一峰博客 | 每周一 03:17 抓取一次索引 | 阮一峰博客（只存标题、日期、原文链接） |

天气页会显示**真实的数据时间**：超过 90 分钟标黄、超过 270 分钟标红，不会假装数据是新的。

## 目录结构

```
build.py                    生成首页与 404（读 sites.json）
sites.json                  页面清单：标题、描述、分类、更新频率
assets/
  site.css                  全站共享样式（浅色/深色）
  home.js                   首页链接后面的实况 / 新债信息
  weather.css weather.js    天气页
  blog.css                  阮一峰博客索引页
  favicon.svg
monitor/weather/quzhou/     天气页 + 抓取脚本 + requirements.txt
monitor/finance/cn/kzz/     可转债页（iframe）+ 钉钉提醒脚本
monitor/blog/               博客索引页 + 抓取脚本 + posts.json
index.html 404.html         由 build.py 生成，不要手改
.github/workflows/
  fetch_weather.yml         每小时抓数据 → 推送到 data 分支
  build-pages.yml           push 后重新生成首页
  blog-index.yml            每周一更新博客索引
  monitor-finance-cn-kzz-update.yml
```

## 数据放在哪

天气 JSON **不写入 main**，而是写在一个只有单个提交的 `data` 分支：

```
weather/quzhou/weather_24h.json   24 小时预报
weather/quzhou/weather_now.json   实况
weather/quzhou/weather_minutely.json
weather/quzhou/aqi_waqi.json       空气质量（WAQI / aqicn.org）
weather/quzhou/weather_alert.json
weather/quzhou/meta.json          本次抓取时间、各接口成功/失败
```

页面通过 `https://raw.githubusercontent.com/liijjj/liijjj.github.io/data/...` 读取，
所以每次更新不会产生提交、也不会触发 Pages 重新构建。`data` 分支每次运行都被
`--amend` + 强制推送覆盖，历史永远只有一个提交。

天气页的更新时间直接取 `weather_24h.json` 里的 `updateTime`，也就是数据本身的时间，
抓取失败时不会假装更新过。`meta.json` 只用来排错。

可转债页面目前直接 iframe 嵌入东方财富的「新股申购 - 可转债」页面，
所以永远是最新的；Actions 里只保留每天 07:33 的新债提醒。

## 新增一个页面

1. 新建目录 `monitor/<分类>/<名称>/index.html`，可以直接引用 `/assets/site.css`。
2. 在 `sites.json` 的 `pages` 里加一条 `path` 和 `title`：

```json
{
  "path": "monitor/weather/quzhou/",
  "title": "衢州天气"
}
```

3. push 到 main，`build-pages.yml` 会自动重新生成首页的链接列表。

如果新页面需要定时抓数据，复制 `fetch_weather.yml` 改一下脚本名和输出目录即可；
抓取脚本请把数据写到 `$RUNNER_TEMP` 再发布到 `data` 分支，不要提交到 main。

## 博客已读状态同步

已读状态默认存在浏览器 localStorage 里，每台设备各一份。要让手机沿用电脑的记录：

1. 创建一个 fine-grained PAT：只选 `liijjj/liijjj.github.io` 仓库，权限只给 **Contents: Read and write**。
2. 在电脑上打开博客页，点「同步」，粘贴 PAT，点「保存并同步」。
3. 之后电脑上点开文章会合并写回 `state` 分支的 `monitor/blog/read.json`；手机打开页面会自动读取这份记录上色，不需要 PAT。

`state` 分支只放这一个文件，不会触发 Pages 构建。PAT 只保存在电脑浏览器的 localStorage 里，不会提交到仓库。

## 本地预览

```powershell
python build.py
python -m http.server 8000
```

天气页默认从 `data` 分支读取线上数据。要离线调试，把 JSON 放到
`monitor/weather/quzhou/output/`（该目录已在 .gitignore 中），然后打开
`/monitor/weather/quzhou/?data=./output/` 即可改用本地数据。

## Secrets

仓库 Settings → Secrets and variables → Actions：

| 名称 | 用途 |
| --- | --- |
| `QWEATHER_KEY` | 和风天气 API Key |
| `QWEATHER_DOMAIN` | 和风天气的 API 域名 |
| `AQICN_TOKEN` | WAQI / aqicn.org 的 API token（未配置时用页面里那个公开 token） |
| `DINGTALK_WEBHOOK` | 可转债申购提醒的钉钉机器人地址 |

空气质量的全部内容（AQI、污染物分指数、未来三天预报、地图瓦片）都来自 WAQI，
采用美国 EPA 口径。地图瓦片 token 是公开的，写在 `assets/weather.js` 里（瓦片服务要求把 token 放在 URL 中）。

## 技术说明

- 纯静态页面，没有构建工具、没有框架。
- CSS 只保留颜色、网格布局、图表/地图的必要尺寸和板块的 1px 边框；不设置字号、行高、字重、字距、字体、margin/padding、gap、圆角、阴影，排版交给浏览器原生样式。
- 首页是标题 + 带序号的链接列表，链接后面会自动补上当前天气和新债日历，内容铺满整个宽度。
- 阮一峰博客页只存标题、日期和原文链接，正文一律跳回原站；索引每周一自动刷新。
- 配色使用 GitHub Primer 的浅色 / 深色变量。
- Chart.js 4.5.0、Leaflet 1.9.4 走 cdnjs，锁定版本并带 SRI 校验。
- `.nojekyll` 让 GitHub Pages 跳过 Jekyll 处理。
- 首页和 404 由 `build.py` 生成，提交回 main。
