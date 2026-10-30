/* 首页：列表/卡片切换 + 卡片上的"数据更新时间" */

(function () {
  "use strict";

  var TZ = "Asia/Shanghai";

  // ---------- 列表 / 卡片 ----------

  function initViewSwitch() {
    var pages = document.getElementById("pages");
    var buttons = Array.prototype.slice.call(document.querySelectorAll(".view-switch button"));
    if (!pages || !buttons.length) return;

    function apply(view) {
      pages.className = "page-list is-" + view;
      buttons.forEach(function (button) {
        button.setAttribute("aria-pressed", button.getAttribute("data-view") === view ? "true" : "false");
      });
    }

    var saved = "list";
    try {
      saved = localStorage.getItem("pages-view") || "list";
    } catch (err) {
      saved = "list";
    }
    apply(saved === "grid" ? "grid" : "list");

    buttons.forEach(function (button) {
      button.addEventListener("click", function () {
        var view = button.getAttribute("data-view") === "grid" ? "grid" : "list";
        apply(view);
        try {
          localStorage.setItem("pages-view", view);
        } catch (err) {
          /* 隐私模式下忽略 */
        }
      });
    });
  }

  // ---------- 数据更新时间 ----------

  function initStatus() {
    var nodes = Array.prototype.slice.call(
      document.querySelectorAll(".card-status[data-status]")
    );
    if (!nodes.length) return;

    var states = new WeakMap();

    function stampValue(ms) {
      var parts = new Intl.DateTimeFormat("zh-CN", {
        timeZone: TZ,
        hourCycle: "h23",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
      }).formatToParts(new Date(ms));
      var get = function (type) {
        var part = parts.filter(function (p) { return p.type === type; })[0];
        return part ? part.value : "";
      };
      return get("month") + "-" + get("day") + " " + get("hour") + ":" + get("minute");
    }

    function ago(ms) {
      var minutes = Math.round((Date.now() - ms) / 60000);
      if (minutes < 1) return "刚刚";
      if (minutes < 60) return minutes + " 分钟前";
      var hours = Math.floor(minutes / 60);
      if (hours < 24) {
        var rest = minutes % 60;
        return rest ? hours + " 小时 " + rest + " 分前" : hours + " 小时前";
      }
      return Math.floor(hours / 24) + " 天前";
    }

    function render(node) {
      var state = states.get(node);
      if (!state) return;
      var maxAge = (Number(node.getAttribute("data-max-age")) || 90) * 60000;
      var age = Date.now() - state.at;
      var tone = "is-ok";
      if (age > maxAge * 2) tone = "is-bad";
      else if (age > maxAge) tone = "is-warn";

      node.className = "card-status " + tone;
      node.textContent = "数据 " + stampValue(state.at) + " · " + ago(state.at);
      node.title =
        "数据生成于 " +
        new Date(state.at).toLocaleString("zh-CN", { timeZone: TZ, hour12: false }) +
        "（北京时间）";
    }

    function load(node) {
      var url = node.getAttribute("data-status");
      if (!url) return;
      var field = node.getAttribute("data-field") || "generatedAt";

      fetch(url + "?_=" + Date.now(), { cache: "no-store" })
        .then(function (res) {
          if (!res.ok) throw new Error("HTTP " + res.status);
          return res.json();
        })
        .then(function (data) {
          var iso = data[field] || data.generatedAt || data.updatedAt;
          var at = Date.parse(iso);
          if (!isFinite(at)) throw new Error("没有时间字段");
          states.set(node, { at: at });
          render(node);
        })
        .catch(function () {
          node.className = "card-status is-unknown";
          node.textContent = "更新状态未知";
        });
    }

    function loadAll() {
      nodes.forEach(load);
    }

    function tick() {
      nodes.forEach(function (node) {
        if (states.has(node)) render(node);
      });
    }

    loadAll();
    setInterval(loadAll, 5 * 60 * 1000);
    setInterval(tick, 60 * 1000);
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) loadAll();
    });
  }

  initViewSwitch();
  initStatus();
})();
