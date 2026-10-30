# liijjj.github.io

个人静态站点，内容和数据都由 GitHub Actions 更新，托管在 GitHub Pages 上。

- 站点首页：<https://liijjj.github.io/>
- 天气页：<https://liijjj.github.io/monitor/weather/quzhou/>
- 可转债页：<https://liijjj.github.io/monitor/finance/cn/kzz/>

## 页面

| 页面 | 更新方式 | 数据来源 |
| --- | --- | --- |
| 衢州天气 | 每小时第 7 分钟 | 和风天气（实况、24 小时预报、分钟级降水、AQI、预警） |
| 可转债日历 | 每天 07:33 | AkShare，申购日推送钉钉 |

天气页会显示**真实的数据时间**：超过 90 分钟标黄、超过 270 分钟标红，不会假装数据是新的。

## 目录结构

```
build.py                    生成首页与 404（读 sites.json）
sites.json                  页面清单：标题、描述、分类、更新频率
assets/
  site.css                  全站共享样式（浅色/深色）
  portal.js                 首页卡片上的"数据更新时间"
  weather.css weather.js    天气页
  favicon.svg
monitor/weather/quzhou/     天气页 + 抓取脚本 + requirements.txt
monitor/finance/cn/kzz/     可转债页 + 生成脚本
index.html 404.html         由 build.py 生成，不要手改
.github/workflows/
  fetch_weather.yml         每小时抓数据 → 推送到 data 分支
  build-pages.yml           push 后重新生成首页
  monitor-finance-cn-kzz-update.yml
```

## 数据放在哪

天气 JSON **不写入 main**，而是写在一个只有单个提交的 `data` 分支：

```
weather/quzhou/weather_24h.json   24 小时预报
weather/quzhou/weather_now.json   实况
weather/quzhou/weather_minutely.json
weather/quzhou/aqi_hourly.json
weather/quzhou/aqi_current.json
weather/quzhou/weather_alert.json
weather/quzhou/meta.json          本次抓取时间、各接口成功/失败
```

页面通过 `https://raw.githubusercontent.com/liijjj/liijjj.github.io/data/...` 读取，
所以每次更新不会产生提交、也不会触发 Pages 重新构建。`data` 分支每次运行都被
`--amend` + 强制推送覆盖，历史永远只有一个提交。

首页卡片上的更新时间直接取 `weather_24h.json` 里的 `updateTime`，也就是数据本身的时间，
抓取失败时不会假装更新过。`meta.json` 只用来排错。

## 新增一个页面

1. 新建目录 `monitor/<分类>/<名称>/index.html`，可以直接引用 `/assets/site.css`。
2. 在 `sites.json` 的 `pages` 里加一条：

```json
{
  "path": "monitor/weather/quzhou/",
  "title": "衢州天气",
  "description": "一句话介绍",
  "category": "天气",
  "cadence": "每小时",
  "status": "https://raw.githubusercontent.com/liijjj/liijjj.github.io/data/weather/quzhou/weather_24h.json",
  "updatedField": "updateTime",
  "accent": "sky"
}
```

`status` 可选，填了首页会显示"数据 10-31 14:07 · 12 分钟前"并自动变色。
3. push 到 main，`build-pages.yml` 会自动重新生成首页。

如果新页面需要定时抓数据，复制 `fetch_weather.yml` 改一下脚本名和输出目录即可；
抓取脚本请把数据写到 `$RUNNER_TEMP` 再发布到 `data` 分支，不要提交到 main。

## 本地预览

```powershell
python build.py
python -m http.server 8000
```

天气页默认从 `data` 分支读取线上数据。要离线调试，把 JSON 放到
`monitor/weather/quzhou/output/`（该目录已在 .gitignore 中）后，临时把
`assets/weather.js` 里的 `DATA_BASE` 改成 `./output/`。

## Secrets

仓库 Settings → Secrets and variables → Actions：

| 名称 | 用途 |
| --- | --- |
| `QWEATHER_KEY` | 和风天气 API Key |
| `QWEATHER_DOMAIN` | 和风天气的 API 域名 |
| `DINGTALK_WEBHOOK` | 可转债申购提醒的钉钉机器人地址 |

AQI 地图瓦片的 token 是公开的，写在 `assets/weather.js` 里（瓦片服务要求把 token 放在 URL 中）。

## 技术说明

- 纯静态页面，没有构建工具、没有框架。
- Chart.js 4.5.0、Leaflet 1.9.4 走 cdnjs，锁定版本并带 SRI 校验。
- `.nojekyll` 让 GitHub Pages 跳过 Jekyll 处理。
- 首页和 404 由 `build.py` 生成，提交回 main。
