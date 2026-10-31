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
  var WARN_MINUTES = 80;
  var BAD_MINUTES = 180;

  var FILES = {
    weather: "weather_24h.json",
    now: "weather_now.json",
    minutely: "weather_minutely.json",
    aqi: "aqi_waqi.json",
    alerts: "weather_alert.json",
    meta: "meta.json"
  };

  var state = {};
  var hoursCache = [];
  var charts = { hourly: null, minutely: null };
  var lastWeatherKey = "";
  var updatedAt = null;
  var mapInited = false;
  var weatherMap = null;
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
      return;
    }
    var age = Date.now() - updatedAt;
    var tone = age > BAD_MINUTES * 60000 ? "is-bad"
      : age > WARN_MINUTES * 60000 ? "is-warn" : "";
    var note = tone === "is-bad" ? "，更新已中断" : tone === "is-warn" ? "，可能延迟" : "";
    box.className = "freshness " + tone;
    label.textContent = "数据 " + stamp(updatedAt) + " · " + timeAgo(updatedAt) + note;
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

    renderNowLine();
    renderHourly();
    renderMinutely();
    renderAlerts();
    initMap();
  }

  // ---------- 实况（一行小字） ----------

  function renderNowLine() {
    var now = state.now && state.now.now;
    var first = state.weather && state.weather.hourly && state.weather.hourly[0];
    var line = $("now-line");

    if (!now && !first) {
      line.textContent = "实况暂不可用";
      return;
    }

    var icon = iconEmoji((now && now.icon) || (first && first.icon));
    var temp = (now && now.temp) || (first && first.temp) || "--";
    var text = (now && now.text) || (first && first.text) || "";
    var humidity = (now && now.humidity) || (first && first.humidity);
    var windDir = (now && now.windDir) || (first && first.windDir);
    var windScale = (now && now.windScale) || (first && first.windScale);
    var pressure = (now && now.pressure) || (first && first.pressure);

    line.textContent = [icon, temp + "° " + text].join(" ").trim();

    // AQI 数字，颜色跟 WAQI 的等级色一致
    var air = waqiPayload();
    if (air) {
      var level = aqiLevel(air.aqi);
      var value = document.createElement("span");
      value.className = "aqi-value " + level.cls;
      value.textContent = air.aqi;
      value.title = "AQI " + air.aqi + " " + level.name + "（美标，WAQI）";
      line.appendChild(document.createTextNode(" · "));
      line.appendChild(value);
    }

    var tail = [];
    if (humidity) tail.push("湿度 " + humidity + "%");
    if (windDir) tail.push(windDir + " " + windScale + " 级");
    if (pressure) tail.push("气压 " + pressure + " hPa");
    if (now && now.feelsLike) tail.push("体感 " + now.feelsLike + "°");
    if (now && now.vis) tail.push("能见度 " + now.vis + " km");
    if (now && now.obsTime) tail.push("观测 " + clock(now.obsTime));
    if (!now) tail.push("就近小时预报");
    if (tail.length) line.appendChild(document.createTextNode(" · " + tail.join(" · ")));
  }

  // ---------- 24 小时 ----------

  function renderHourly() {
    var data = state.weather;
    if (!data || !data.hourly || !data.hourly.length) {
      return;
    }
    var hours = data.hourly;
    hoursCache = hours;

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
            // 气温和降水两组数据共用一个 tooltip，只保留气温那一组，
            // 否则同样的明细会出现两次，末尾还会多一行「降水 0」。
            filter: function (item) {
              return item.datasetIndex === 0;
            },
            callbacks: {
              title: function (items) {
                var h = hoursCache[items[0].dataIndex];
                return h ? stamp(h.fxTime) : "";
              },
              label: function (item) {
                var h = hoursCache[item.dataIndex];
                if (!h) return undefined;
                return [
                  h.temp + "°C · " + h.text,
                  "降水 " + h.precip + " mm" + (h.pop != null ? " · 概率 " + h.pop + "%" : ""),
                  h.windDir + " " + h.windScale + " 级",
                  "湿度 " + h.humidity + "%"
                ];
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

  // ---------- 空气质量（WAQI / aqicn.org） ----------

  var AQI_LEVELS = [
    { max: 50, name: "优", cls: "aqi-c1" },
    { max: 100, name: "良", cls: "aqi-c2" },
    { max: 150, name: "轻度污染", cls: "aqi-c3" },
    { max: 200, name: "中度污染", cls: "aqi-c4" },
    { max: 300, name: "重度污染", cls: "aqi-c5" },
    { max: Infinity, name: "严重污染", cls: "aqi-c6" }
  ];

  function aqiLevel(value) {
    for (var i = 0; i < AQI_LEVELS.length; i++) {
      if (value <= AQI_LEVELS[i].max) return AQI_LEVELS[i];
    }
    return AQI_LEVELS[AQI_LEVELS.length - 1];
  }

  function waqiPayload() {
    var raw = state.aqi;
    if (raw && raw.status === "ok" && raw.data && typeof raw.data.aqi === "number") {
      return raw.data;
    }
    return null;
  }

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
    weatherMap = map;
    setTimeout(function () { map.invalidateSize(); }, 250);
  }

  // ---------- 板块布局 ----------

  function resizeWidgets() {
    if (charts.hourly) charts.hourly.resize();
    if (charts.minutely) charts.minutely.resize();
    if (weatherMap) weatherMap.invalidateSize();
  }

  function setCols(value) {
    var board = $("board");
    var cols = ["1", "2", "3", "4"].indexOf(String(value)) >= 0 ? String(value) : "2";
    board.className = "board cols-" + cols;
    try {
      localStorage.setItem("weather-cols", cols);
    } catch (err) {
      /* 隐私模式下忽略 */
    }
    setTimeout(resizeWidgets, 220);
  }

  function initBoard() {
    var board = $("board");
    if (!board) return;

    var cols = "2";
    try {
      cols = localStorage.getItem("weather-cols") || "2";
    } catch (err) {
      cols = "2";
    }
    setCols(cols);
    $("cols").value = ["1", "2", "3", "4"].indexOf(String(cols)) >= 0 ? String(cols) : "2";

    try {
      var saved = JSON.parse(localStorage.getItem("weather-order") || "null");
      if (Array.isArray(saved)) {
        saved.forEach(function (id) {
          var card = board.querySelector('.card[data-widget="' + id + '"]');
          if (card) board.appendChild(card);
        });
      }
    } catch (err) {
      /* 数据损坏时保持默认顺序 */
    }

    $("cols").addEventListener("change", function () {
      setCols(this.value);
    });

    if (window.Sortable) {
      Sortable.create(board, {
        animation: 160,
        handle: ".drag",
        draggable: ".card",
        ghostClass: "is-ghost",
        onEnd: function () {
          var order = Array.prototype.map.call(board.children, function (card) {
            return card.getAttribute("data-widget");
          });
          try {
            localStorage.setItem("weather-order", JSON.stringify(order));
          } catch (err) {
            /* 忽略 */
          }
          setTimeout(resizeWidgets, 220);
        }
      });
    }
  }

  // ---------- 启动 ----------

  $("refresh").addEventListener("click", function () {
    var button = this;
    button.disabled = true;
    loadAll().then(function () { button.disabled = false; });
  });

  initBoard();
  loadAll();
  setInterval(updateFreshness, 30 * 1000);
  setInterval(loadAll, REFRESH_MS);
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) loadAll();
  });
})();
