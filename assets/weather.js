/* 衢州天气页：读取 data 分支上的 JSON 并渲染 */

(function () {
  "use strict";

  // ?data=./output/ 可以在本地预览时改用本地数据
  var DATA_BASE = new URLSearchParams(location.search).get("data")
    || "https://raw.githubusercontent.com/liijjj/liijjj.github.io/data/weather/quzhou/";
  var AQICN_TOKEN = "fcb33ba925bd1ca319369d0eb68a0170054b7b05";
  var LOCATION = { lat: 28.98, lon: 118.865 };
  var TZ = "Asia/Shanghai";
  var REFRESH_MS = 5 * 60 * 1000;
  var STALE_MINUTES = 90;

  var FILES = {
    weather: "weather_24h.json",
    now: "weather_now.json",
    minutely: "weather_minutely.json",
    aqiHourly: "aqi_hourly.json",
    aqiNow: "aqi_current.json",
    alerts: "weather_alert.json",
    meta: "meta.json"
  };

  var state = {};
  var hoursCache = [];
  var charts = { hourly: null, aqi: null, minutely: null };
  var lastWeatherKey = "";
  var updatedAt = null;
  var mapInited = false;
  var loading = false;

  // ---------- 时间与格式化 ----------

  var F_TIME = new Intl.DateTimeFormat("zh-CN", {
    timeZone: TZ, hourCycle: "h23",
    month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit"
  });
  var F_HOUR = new Intl.DateTimeFormat("zh-CN", {
    timeZone: TZ, hourCycle: "h23", hour: "2-digit", minute: "2-digit"
  });
  var F_CLOCK = new Intl.DateTimeFormat("zh-CN", {
    timeZone: TZ, hourCycle: "h23", hour: "2-digit", minute: "2-digit"
  });

  function toMs(value) {
    if (value == null) return null;
    var ms = typeof value === "number" ? value : Date.parse(value);
    return isFinite(ms) ? ms : null;
  }

  function stamp(value) {
    var ms = toMs(value);
    if (ms == null) return "";
    return F_TIME.format(new Date(ms)).replace(/\//g, "-");
  }

  function clock(value) {
    var ms = toMs(value);
    if (ms == null) return "";
    return F_CLOCK.format(new Date(ms));
  }

  function timeAgo(ms) {
    var minutes = Math.round((Date.now() - ms) / 60000);
    if (minutes < 1) return "刚刚";
    if (minutes < 60) return minutes + " 分钟前";
    var hours = Math.floor(minutes / 60);
    var rest = minutes % 60;
    if (hours < 24) {
      return rest ? hours + " 小时 " + rest + " 分前" : hours + " 小时前";
    }
    return Math.floor(hours / 24) + " 天前";
  }

  function $(id) {
    return document.getElementById(id);
  }

  function setText(id, value) {
    $(id).textContent = value == null || value === "" ? "—" : value;
  }

  function iconEmoji(code) {
    var n = Number(code);
    if (!n) return "";
    if (n === 100 || n === 150) return "☀️";
    if (n === 104) return "☁️";
    if (n >= 101 && n <= 103) return "⛅";
    if (n >= 151 && n <= 153) return "☁️";
    if (n >= 300 && n < 400) return "🌧️";
    if (n >= 400 && n < 500) return "❄️";
    if (n >= 500 && n < 516) return "🌫️";
    if (n === 900) return "🔥";
    if (n === 901) return "🥶";
    return "🌡️";
  }

  // ---------- 数据读取 ----------

  function getJSON(file) {
    return fetch(DATA_BASE + file + "?_=" + Date.now(), { cache: "no-store" })
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      });
  }

  function loadAll() {
    if (loading) return Promise.resolve();
    loading = true;
    var names = Object.keys(FILES);
    return Promise.all(names.map(function (name) {
      return getJSON(FILES[name])
        .then(function (data) { state[name] = data; })
        .catch(function (err) {
          state[name] = null;
          console.warn("[天气] " + FILES[name] + " 读取失败：" + err.message);
        });
    })).then(function () {
      loading = false;
      renderAll();
    });
  }

  // ---------- 数据新鲜度 ----------

  function updateFreshness() {
    var box = $("freshness");
    var label = $("freshness-text");
    if (!updatedAt) {
      box.className = "freshness is-bad";
      label.textContent = "没有取到数据";
      $("footer-updated").textContent = "数据暂不可用";
      return;
    }
    var age = Date.now() - updatedAt;
    var limit = STALE_MINUTES * 60000;
    var tone = age > limit * 3 ? "is-bad" : age > limit ? "is-warn" : "";
    var note = tone === "is-bad" ? "，更新可能已中断" : tone === "is-warn" ? "，可能延迟" : "";
    box.className = "freshness " + tone;
    label.textContent = "数据 " + stamp(updatedAt) + " · " + timeAgo(updatedAt) + note;
    $("footer-updated").textContent = "数据更新时间 " + stamp(updatedAt) + "（北京时间）";
  }

  // ---------- 渲染入口 ----------

  function renderAll() {
    var at = toMs(state.weather && state.weather.updateTime);
    if (at == null) at = toMs(state.meta && state.meta.generatedAt);
    updatedAt = at;
    updateFreshness();

    var key = (state.weather && state.weather.updateTime) || "";
    if (key && key === lastWeatherKey && charts.hourly) return;
    lastWeatherKey = key;

    renderNow();
    renderHourly();
    renderMinutely();
    renderAqi();
    renderAlerts();
    initMap();
  }

  // ---------- 实况 ----------

  function renderNow() {
    var now = state.now && state.now.now;
    var first = state.weather && state.weather.hourly && state.weather.hourly[0];
    if (!now && !first) {
      $("now-text").textContent = "实况暂不可用";
      $("now-sub").textContent = "等下一次更新";
      return;
    }

    var temp = (now && now.temp) || (first && first.temp);
    var text = (now && now.text) || (first && first.text);
    var icon = (now && now.icon) || (first && first.icon);

    setText("now-temp", temp);
    setText("now-text", text || "—");
    $("now-icon").textContent = iconEmoji(icon);

    var sub = [];
    if (now && now.feelsLike) sub.push("体感 " + now.feelsLike + "°");
    if (now && now.obsTime) sub.push("观测于 " + clock(now.obsTime));
    $("now-sub").textContent = sub.length ? sub.join(" · ") : "就近取一小时预报";

    setText("now-humidity", value(now, first, "humidity", "%"));
    setText("now-wind", now && now.windDir ? now.windDir + " " + now.windScale + " 级" : first ? first.windDir + " " + first.windScale + " 级" : "—");
    setText("now-pressure", value(now, first, "pressure", " hPa"));
    setText("now-vis", now && now.vis ? now.vis + " km" : "—");
  }

  function value(now, first, field, suffix) {
    var raw = (now && now[field]) || (first && first[field]);
    return raw == null || raw === "" ? "—" : raw + suffix;
  }

  // ---------- 24 小时 ----------

  function renderHourly() {
    var data = state.weather;
    if (!data || !data.hourly || !data.hourly.length) {
      $("h24-hint").textContent = "数据不可用";
      return;
    }
    var hours = data.hourly;
    hoursCache = hours;
    $("h24-hint").textContent = "生成于 " + clock(data.updateTime);

    var temps = hours.map(function (h) { return parseFloat(h.temp); });
    var precips = hours.map(function (h) { return parseFloat(h.precip || "0"); });
    var maxPrecip = Math.max.apply(null, precips.concat([0]));

    renderHighlights(hours);

    if (!window.Chart) {
      $("chart-24h").parentNode.textContent = "图表组件没能加载，请刷新页面重试";
      return;
    }

    if (!charts.hourly) {
      charts.hourly = new Chart($("chart-24h"), buildHourlyConfig());
    }

    var chart = charts.hourly;
    chart.data.labels = hours.map(function (h) { return clock(h.fxTime); });
    chart.data.datasets[0].data = temps;
    chart.data.datasets[1].data = precips;
    chart.options.scales.x.ticks.maxTicksLimit = window.innerWidth < 620 ? 6 : 12;
    chart.options.scales.y1.display = maxPrecip > 0;
    chart.options.scales.y1.suggestedMax = Math.max(2, Math.ceil(maxPrecip));
    chart.update("none");
  }

  function buildHourlyConfig() {
    return {
      type: "line",
      data: {
        labels: [],
        datasets: [
          {
            label: "气温",
            data: [],
            borderColor: "#f97316",
            borderWidth: 2,
            tension: 0.35,
            fill: true,
            pointRadius: 0,
            pointHoverRadius: 4,
            pointBackgroundColor: "#f97316",
            backgroundColor: function (context) {
              var area = context.chart.chartArea;
              if (!area) return "rgba(249, 115, 22, .12)";
              var g = context.chart.ctx.createLinearGradient(0, area.top, 0, area.bottom);
              g.addColorStop(0, "rgba(249, 115, 22, .22)");
              g.addColorStop(1, "rgba(249, 115, 22, 0)");
              return g;
            },
            yAxisID: "y"
          },
          {
            label: "降水",
            type: "bar",
            data: [],
            backgroundColor: "rgba(56, 189, 248, .55)",
            borderRadius: 4,
            barPercentage: 0.55,
            categoryPercentage: 0.8,
            yAxisID: "y1"
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: { mode: "index", intersect: false },
        layout: { padding: { top: 6, right: 2 } },
        scales: {
          x: {
            grid: { display: false },
            border: { display: false },
            ticks: { color: "#94a3b8", font: { size: 11 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 12 }
          },
          y: {
            position: "left",
            border: { display: false },
            grid: { color: "rgba(148, 163, 184, .18)" },
            ticks: { color: "#94a3b8", font: { size: 11 }, maxTicksLimit: 5, callback: function (v) { return v + "°"; } }
          },
          y1: {
            position: "right",
            beginAtZero: true,
            suggestedMax: 2,
            border: { display: false },
            grid: { display: false },
            ticks: { color: "#94a3b8", font: { size: 11 }, maxTicksLimit: 3, callback: function (v) { return v + "mm"; } }
          }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: "rgba(15, 23, 42, .94)",
            titleColor: "#f8fafc",
            bodyColor: "#e2e8f0",
            padding: 10,
            cornerRadius: 8,
            displayColors: false,
            callbacks: {
              title: function (items) {
                var h = hoursCache[items[0].dataIndex];
                return h ? stamp(h.fxTime) + " " + h.text : "";
              },
              label: function (item) {
                var h = hoursCache[item.dataIndex];
                if (!h) return "";
                var lines = [
                  h.temp + "°C · " + h.text,
                  "降水 " + h.precip + " mm" + (h.pop != null ? " · 概率 " + h.pop + "%" : ""),
                  h.windDir + " " + h.windScale + " 级",
                  "湿度 " + h.humidity + "%"
                ];
                return lines;
              }
            }
          }
        }
      }
    };
  }

  function renderHighlights(hours) {
    var box = $("highlights");
    box.textContent = "";

    var rainy = hours.filter(function (h) { return parseFloat(h.precip || "0") > 0; });
    if (rainy.length) {
      var peak = Math.max.apply(null, rainy.map(function (h) { return parseFloat(h.precip); }));
      addChip(box, "降水", clock(rainy[0].fxTime) + "–" + clock(rainy[rainy.length - 1].fxTime) + "，最大 " + peak.toFixed(1) + " mm");
    } else {
      addChip(box, "降水", "未来 24 小时无降水");
    }

    var temps = hours
      .map(function (h) { return { t: parseFloat(h.temp), at: h.fxTime }; })
      .filter(function (x) { return isFinite(x.t); });
    if (temps.length) {
      var high = temps[0];
      var low = temps[0];
      temps.forEach(function (x) {
        if (x.t > high.t) high = x;
        if (x.t < low.t) low = x;
      });
      addChip(box, "最高", high.t + "° " + clock(high.at));
      addChip(box, "最低", low.t + "° " + clock(low.at));
    }

    var aqiHours = state.aqiHourly && state.aqiHourly.hours;
    if (aqiHours && aqiHours.length) {
      var worst = null;
      aqiHours.forEach(function (h) {
        var idx = h.indexes && h.indexes[0];
        if (idx && idx.aqi != null && (!worst || idx.aqi > worst.idx.aqi)) {
          worst = { idx: idx, at: h.forecastTime };
        }
      });
      if (worst && worst.idx.aqi >= 100) {
        addChip(box, "空气", "AQI " + worst.idx.aqi + " " + worst.idx.category + " · " + clock(worst.at));
      }
    }
  }

  function addChip(box, label, value) {
    var chip = document.createElement("span");
    chip.className = "chip-line";
    var strong = document.createElement("b");
    strong.textContent = label;
    chip.appendChild(strong);
    chip.appendChild(document.createTextNode(" " + value));
    box.appendChild(chip);
  }

  // ---------- 分钟级降水 ----------

  function renderMinutely() {
    var data = state.minutely;
    var summary = $("minutely-summary");
    var wrap = $("minutely-chart-wrap");

    if (!data || !data.minutely || !data.minutely.length) {
      summary.className = "minutely-summary is-muted";
      summary.textContent = "分钟级数据暂不可用";
      $("minutely-time").textContent = "";
      wrap.hidden = true;
      return;
    }

    var at = toMs(data.updateTime);
    $("minutely-time").textContent = at ? "生成于 " + clock(at) : "";
    var age = at ? Date.now() - at : 0;

    if (at && age > 100 * 60000) {
      summary.className = "minutely-summary is-muted";
      summary.textContent = "这份分钟级预报已过期（" + stamp(at) + " 生成），等下一次更新";
      wrap.hidden = true;
      return;
    }

    var max = Math.max.apply(null, data.minutely.map(function (i) { return parseFloat(i.precip || "0"); }));
    summary.className = "minutely-summary" + (max > 0 ? "" : " is-muted");
    summary.textContent = data.summary || (max > 0 ? "未来两小时有降水" : "未来两小时无降水");

    if (max <= 0) {
      wrap.hidden = true;
      return;
    }
    wrap.hidden = false;

    if (!window.Chart) {
      wrap.textContent = "图表组件没能加载，请刷新页面重试";
      return;
    }

    var labels = data.minutely.map(function (item, index) {
      return index % 4 === 0 ? clock(item.fxTime) : "";
    });
    var values = data.minutely.map(function (item) { return parseFloat(item.precip || "0"); });

    if (!charts.minutely) {
      charts.minutely = new Chart($("chart-minutely"), {
        type: "bar",
        data: {
          labels: [],
          datasets: [{
            data: [],
            backgroundColor: "rgba(56, 189, 248, .6)",
            borderColor: "#0ea5e9",
            borderWidth: 1,
            borderRadius: 3,
            barPercentage: 0.6,
            categoryPercentage: 0.85
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          interaction: { mode: "index", intersect: false },
          scales: {
            x: {
              grid: { display: false },
              border: { display: false },
              ticks: { color: "#94a3b8", font: { size: 10 }, maxRotation: 0, autoSkip: false, maxTicksLimit: 8 }
            },
            y: {
              beginAtZero: true,
              suggestedMax: Math.max(0.5, max),
              border: { display: false },
              grid: { color: "rgba(148, 163, 184, .18)" },
              ticks: { color: "#94a3b8", font: { size: 10 }, maxTicksLimit: 3 }
            }
          },
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: "rgba(15, 23, 42, .94)",
              padding: 8,
              cornerRadius: 6,
              displayColors: false,
              callbacks: {
                title: function (items) {
                  var item = data.minutely[items[0].dataIndex];
                  return item ? stamp(item.fxTime) : "";
                },
                label: function (item) {
                  return "降水 " + item.raw + " mm";
                }
              }
            }
          }
        }
      });
    }

    var chart = charts.minutely;
    chart.data.labels = labels;
    chart.data.datasets[0].data = values;
    chart.options.scales.y.suggestedMax = Math.max(0.5, max);
    chart.update("none");
  }

  // ---------- 空气质量 ----------

  function currentIndex() {
    var now = state.aqiNow;
    if (now && now.indexes && now.indexes.length) return now.indexes[0];
    var hours = state.aqiHourly && state.aqiHourly.hours;
    if (hours && hours.length) {
      var idx = hours[0].indexes && hours[0].indexes[0];
      if (idx) return idx;
    }
    return null;
  }

  function levelClass(index) {
    var level = Number(index && index.level);
    return level >= 1 && level <= 6 ? "aqi-l" + level : "";
  }

  function renderAqi() {
    var idx = currentIndex();
    var pill = $("aqi-pill");
    if (!idx) {
      $("aqi-hint").textContent = "数据不可用";
      return;
    }

    var cls = levelClass(idx);
    pill.className = "aqi-pill " + cls;
    setText("aqi-now", idx.aqiDisplay || idx.aqi);
    setText("aqi-now-cat", idx.category);
    setText("aqi-big", idx.aqiDisplay || idx.aqi);
    setText("aqi-cat", idx.category);
    $("aqi-big").className = "aqi-big " + cls;
    $("aqi-cat").className = "aqi-cat " + cls;

    var pollutant = idx.primaryPollutant && idx.primaryPollutant.name;
    $("aqi-primary").textContent = pollutant ? "主要污染物 " + pollutant : " ";

    var hour = state.aqiHourly && state.aqiHourly.hours && state.aqiHourly.hours[0];
    $("aqi-hint").textContent = hour ? "逐小时 · " + clock(hour.forecastTime) + " 起" : "";

    var hours = state.aqiHourly && state.aqiHourly.hours;
    if (!hours || hours.length < 2) {
      $("aqi-chart-wrap").hidden = true;
      return;
    }

    var labels = [];
    var values = [];
    hours.forEach(function (h) {
      var i = h.indexes && h.indexes[0];
      if (!i) return;
      labels.push(clock(h.forecastTime));
      values.push(i.aqi);
    });

    if (!window.Chart || values.length < 2) {
      $("aqi-chart-wrap").hidden = true;
      return;
    }
    $("aqi-chart-wrap").hidden = false;

    if (!charts.aqi) {
      charts.aqi = new Chart($("chart-aqi"), {
        type: "line",
        data: {
          labels: [],
          datasets: [{
            data: [],
            borderColor: "#10b981",
            borderWidth: 2,
            tension: 0.35,
            fill: true,
            pointRadius: 0,
            pointHoverRadius: 3,
            backgroundColor: "rgba(16, 185, 129, .12)"
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          interaction: { mode: "index", intersect: false },
          scales: {
            x: {
              grid: { display: false },
              border: { display: false },
              ticks: { color: "#94a3b8", font: { size: 10 }, maxRotation: 0, maxTicksLimit: 6 }
            },
            y: {
              beginAtZero: true,
              suggestedMax: 150,
              border: { display: false },
              grid: { color: "rgba(148, 163, 184, .18)" },
              ticks: { color: "#94a3b8", font: { size: 10 }, maxTicksLimit: 3 }
            }
          },
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: "rgba(15, 23, 42, .94)",
              padding: 8,
              cornerRadius: 6,
              displayColors: false,
              callbacks: {
                label: function (item) {
                  var h = hours[item.dataIndex];
                  var i = h && h.indexes && h.indexes[0];
                  return "AQI " + item.raw + (i ? " " + i.category : "");
                }
              }
            }
          }
        }
      });
    }

    var chart = charts.aqi;
    var top = Math.max.apply(null, values.concat([100]));
    chart.data.labels = labels;
    chart.data.datasets[0].data = values;
    var axisMax = Math.ceil((top + 12) / 50) * 50;
    chart.options.scales.y.max = axisMax;
    chart.options.scales.y.ticks.stepSize = axisMax > 200 ? 100 : 50;
    chart.update("none");
  }

  // ---------- 预警 ----------

  var SEVERITY = {
    Minor: ["蓝色", "#3b82f6"],
    Moderate: ["黄色", "#eab308"],
    Severe: ["橙色", "#f97316"],
    Extreme: ["红色", "#dc2626"]
  };

  function renderAlerts() {
    var box = $("alerts");
    box.textContent = "";
    var alerts = (state.alerts && state.alerts.alerts) || [];
    $("alert-hint").textContent = alerts.length ? alerts.length + " 条生效中" : "";

    if (!alerts.length) {
      var empty = document.createElement("p");
      empty.className = "empty";
      empty.textContent = "当前没有生效的气象预警";
      box.appendChild(empty);
      return;
    }

    alerts.forEach(function (alert) {
      var item = document.createElement("details");
      item.className = "alert";

      var summary = document.createElement("summary");
      var sev = document.createElement("span");
      sev.className = "sev";
      var info = SEVERITY[alert.severity] || ["提示", "#64748b"];
      sev.textContent = info[0];
      sev.style.background = info[1];
      if (alert.severity === "Moderate") sev.style.color = "#1f2937";
      summary.appendChild(sev);
      summary.appendChild(document.createTextNode(alert.headline || alert.typeName || "气象预警"));

      var detail = document.createElement("p");
      detail.textContent = alert.description || "暂无详细说明";

      item.appendChild(summary);
      item.appendChild(detail);

      var from = alert.startTime ? stamp(alert.startTime) : "";
      var to = alert.endTime ? stamp(alert.endTime) : "";
      if (from || to) {
        var time = document.createElement("time");
        time.textContent = "生效时间：" + (from || "—") + " 至 " + (to || "—");
        item.appendChild(time);
      }

      box.appendChild(item);
    });
  }

  // ---------- 地图 ----------

  function initMap() {
    if (mapInited || !window.L) return;
    var holder = $("aqi-map");
    if (!holder) return;
    mapInited = true;

    var map = L.map(holder, {
      zoomControl: false,
      scrollWheelZoom: false,
      attributionControl: true
    }).setView([LOCATION.lat, LOCATION.lon], 9);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18,
      attribution: "&copy; OpenStreetMap",
      className: "osm-tiles"
    }).addTo(map);

    L.tileLayer("https://tiles.aqicn.org/tiles/usepa-aqi/{z}/{x}/{y}.png?token=" + AQICN_TOKEN, {
      maxZoom: 18,
      opacity: 0.75,
      attribution: 'AQI &copy; <a href="https://aqicn.org">aqicn.org</a>'
    }).addTo(map);

    L.circleMarker([LOCATION.lat, LOCATION.lon], {
      radius: 5,
      color: "#2563eb",
      weight: 2,
      fillColor: "#ffffff",
      fillOpacity: 1
    }).addTo(map).bindTooltip("衢州");

    L.control.zoom({ position: "bottomright" }).addTo(map);
    setTimeout(function () { map.invalidateSize(); }, 250);
  }

  // ---------- 启动 ----------

  $("refresh").addEventListener("click", function () {
    var button = this;
    button.disabled = true;
    loadAll().then(function () { button.disabled = false; });
  });

  loadAll();
  setInterval(updateFreshness, 30 * 1000);
  setInterval(loadAll, REFRESH_MS);
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) loadAll();
  });
})();
