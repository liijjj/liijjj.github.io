/* 首页：在链接后面补一行实况 / 新债信息 */

(function () {
  "use strict";

  var DATA_BASE = "https://raw.githubusercontent.com/liijjj/liijjj.github.io/data/weather/quzhou/";
  var KZZ_API = "https://datacenter-web.eastmoney.com/api/data/v1/get";
  var TZ = "Asia/Shanghai";

  var AQI_LEVELS = [
    { max: 50, cls: "aqi-c1" },
    { max: 100, cls: "aqi-c2" },
    { max: 150, cls: "aqi-c3" },
    { max: 200, cls: "aqi-c4" },
    { max: 300, cls: "aqi-c5" },
    { max: Infinity, cls: "aqi-c6" }
  ];

  function $(id) {
    return document.getElementById(id);
  }

  function fetchJSON(url) {
    var sep = url.indexOf("?") >= 0 ? "&" : "?";
    return fetch(url + sep + "_=" + Date.now(), { cache: "no-store" }).then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    });
  }

  function clock(iso) {
    return new Intl.DateTimeFormat("zh-CN", {
      timeZone: TZ, hourCycle: "h23", hour: "2-digit", minute: "2-digit"
    }).format(new Date(iso));
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

  function aqiClass(value) {
    for (var i = 0; i < AQI_LEVELS.length; i++) {
      if (value <= AQI_LEVELS[i].max) return AQI_LEVELS[i].cls;
    }
    return AQI_LEVELS[AQI_LEVELS.length - 1].cls;
  }

  // ---------- 天气 ----------

  function loadWeather() {
    var el = $("weather-meta");
    if (!el) return;

    Promise.all([
      fetchJSON(DATA_BASE + "weather_24h.json").catch(function () { return null; }),
      fetchJSON(DATA_BASE + "weather_now.json").catch(function () { return null; }),
      fetchJSON(DATA_BASE + "aqi_waqi.json").catch(function () { return null; })
    ]).then(function (result) {
      var weather = result[0];
      var now = result[1] && result[1].now;
      var aqi = result[2] && result[2].status === "ok" ? result[2].data : null;
      var first = weather && weather.hourly && weather.hourly[0];

      if (!now && !first) return;

      var temp = (now && now.temp) || first.temp;
      var text = (now && now.text) || first.text;
      var icon = iconEmoji((now && now.icon) || first.icon);
      var humidity = (now && now.humidity) || first.humidity;
      var windDir = (now && now.windDir) || first.windDir;
      var windScale = (now && now.windScale) || first.windScale;
      var pressure = (now && now.pressure) || first.pressure;

      el.textContent = "";
      el.appendChild(document.createTextNode([icon, temp + "° " + text].join(" ").trim()));

      if (aqi) {
        var value = document.createElement("span");
        value.className = "aqi-value " + aqiClass(aqi.aqi);
        value.textContent = aqi.aqi;
        value.title = "AQI " + aqi.aqi + "（美标，WAQI）";
        el.appendChild(document.createTextNode(" · "));
        el.appendChild(value);
      }

      var tail = [];
      if (humidity) tail.push("湿度 " + humidity + "%");
      if (windDir) tail.push(windDir + " " + windScale + " 级");
      if (pressure) tail.push("气压 " + pressure + " hPa");
      if (now && now.feelsLike) tail.push("体感 " + now.feelsLike + "°");
      if (now && now.vis) tail.push("能见度 " + now.vis + " km");
      if (now && now.obsTime) tail.push("观测 " + clock(now.obsTime));

      if (tail.length) {
        el.appendChild(document.createTextNode(" · " + tail.join(" · ")));
      }
      el.hidden = false;
    }).catch(function () {
      /* 保持隐藏 */
    });
  }

  // ---------- 可转债 ----------

  function todayKey() {
    return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
  }

  function datePart(value) {
    return value ? String(value).slice(0, 10) : "";
  }

  function weekday(date) {
    var parts = date.split("-").map(Number);
    var index = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2])).getUTCDay();
    return "周" + "日一二三四五六".charAt(index);
  }

  function loadKzz() {
    var el = $("kzz-meta");
    if (!el) return;

    var url = new URL(KZZ_API);
    url.searchParams.set("reportName", "RPT_BOND_CB_LIST");
    url.searchParams.set("columns", "SECURITY_CODE,SECURITY_NAME_ABBR,PUBLIC_START_DATE");
    url.searchParams.set("pageNumber", "1");
    url.searchParams.set("pageSize", "100");
    url.searchParams.set("sortColumns", "PUBLIC_START_DATE,SECURITY_CODE");
    url.searchParams.set("sortTypes", "-1,-1");
    url.searchParams.set("source", "WEB");
    url.searchParams.set("client", "WEB");

    fetchJSON(url.toString()).then(function (json) {
      if (json.code !== 0 || !json.result) return;

      var today = todayKey();
      var rows = (json.result.data || []).filter(function (row) {
        return datePart(row.PUBLIC_START_DATE) >= today;
      });
      if (!rows.length) return;

      var groups = {};
      rows.forEach(function (row) {
        var day = datePart(row.PUBLIC_START_DATE);
        if (!groups[day]) groups[day] = [];
        if (row.SECURITY_NAME_ABBR) groups[day].push(row.SECURITY_NAME_ABBR);
      });

      var days = Object.keys(groups).sort();
      el.textContent = "";

      days.slice(0, 3).forEach(function (day, index) {
        if (index > 0) el.appendChild(document.createTextNode("；"));

        var segment = document.createElement("span");
        segment.className = "kzz-day" + (day === today ? " is-today" : "");
        segment.textContent = day + " " + weekday(day) + " " + groups[day].join("、");
        el.appendChild(segment);
      });

      if (days.length > 3) {
        el.appendChild(document.createTextNode("；…"));
      }

      el.hidden = false;
    }).catch(function () {
      /* 保持隐藏 */
    });
  }

  loadWeather();
  loadKzz();
})();
