/* 可转债页：读取东方财富「新股申购 - 可转债」的同一个数据接口 */

(function () {
  "use strict";

  var API = "https://datacenter-web.eastmoney.com/api/data/v1/get";
  var TZ = "Asia/Shanghai";
  var DEFAULT_SIZE = 50;

  var COLUMNS = [
    "SECURITY_CODE", "SECURITY_NAME_ABBR", "PUBLIC_START_DATE", "CORRECODE",
    "ONLINE_GENERAL_AAU", "CONVERT_STOCK_CODE", "SECURITY_SHORT_NAME",
    "CONVERT_STOCK_PRICE", "TRANSFER_PRICE", "TRANSFER_VALUE",
    "CURRENT_BOND_PRICE", "TRANSFER_PREMIUM_RATIO", "SECURITY_START_DATE",
    "FIRST_PER_PREPLACING", "ACTUAL_ISSUE_SCALE", "BOND_START_DATE",
    "ONLINE_GENERAL_LWR", "FIRST_PROFIT", "LISTING_DATE", "RATING"
  ].join(",");

  var QUOTES = [
    "f2~01~CONVERT_STOCK_CODE~CONVERT_STOCK_PRICE",
    "f235~10~SECURITY_CODE~TRANSFER_PRICE",
    "f236~10~SECURITY_CODE~TRANSFER_VALUE",
    "f2~10~SECURITY_CODE~CURRENT_BOND_PRICE",
    "f237~10~SECURITY_CODE~TRANSFER_PREMIUM_RATIO"
  ].join(",");

  // 字段与东方财富的表格一致（去掉了「相关」链接列）
  var COLS = [
    { key: "SECURITY_CODE", label: "债券代码", mono: true },
    { key: "SECURITY_NAME_ABBR", label: "债券简称" },
    { key: "PUBLIC_START_DATE", label: "申购日期", type: "date" },
    { key: "CORRECODE", label: "申购代码", mono: true },
    { key: "ONLINE_GENERAL_AAU", label: "申购上限(万元)", type: "num", digits: 0, align: "right" },
    { key: "CONVERT_STOCK_CODE", label: "正股代码", mono: true },
    { key: "SECURITY_SHORT_NAME", label: "正股简称" },
    { key: "CONVERT_STOCK_PRICE", label: "正股价", type: "num", digits: 2, align: "right" },
    { key: "TRANSFER_PRICE", label: "转股价", type: "num", digits: 2, align: "right" },
    { key: "TRANSFER_VALUE", label: "转股价值", type: "num", digits: 2, align: "right" },
    { key: "CURRENT_BOND_PRICE", label: "债现价", type: "num", digits: 2, align: "right" },
    { key: "TRANSFER_PREMIUM_RATIO", label: "转股溢价率", type: "pct", digits: 2, align: "right" },
    { key: "SECURITY_START_DATE", label: "股权登记日", type: "date" },
    { key: "FIRST_PER_PREPLACING", label: "每股配售额", type: "num", digits: 4, align: "right" },
    { key: "ACTUAL_ISSUE_SCALE", label: "发行规模(亿元)", type: "num", digits: 2, align: "right" },
    { key: "BOND_START_DATE", label: "中签号发布日", type: "date" },
    { key: "ONLINE_GENERAL_LWR", label: "中签率", type: "pct", digits: 4, align: "right" },
    { key: "FIRST_PROFIT", label: "每中一签获利(元)", type: "num", digits: 0, align: "right" },
    { key: "LISTING_DATE", label: "上市时间", type: "date" },
    { key: "RATING", label: "信用评级" }
  ];

  var state = { page: 1, size: DEFAULT_SIZE, total: 0, pages: 0 };

  function $(id) {
    return document.getElementById(id);
  }

  function buildUrl(params) {
    var url = new URL(API);
    Object.keys(params).forEach(function (key) {
      url.searchParams.set(key, params[key]);
    });
    return url.toString();
  }

  function pageUrl(page, size) {
    return buildUrl({
      reportName: "RPT_BOND_CB_LIST",
      columns: COLUMNS,
      quoteColumns: QUOTES,
      quoteType: "0",
      source: "WEB",
      client: "WEB",
      pageNumber: String(page),
      pageSize: String(size),
      sortColumns: "PUBLIC_START_DATE,SECURITY_CODE",
      sortTypes: "-1,-1"
    });
  }

  function todayUrl(day) {
    return buildUrl({
      reportName: "RPT_BOND_CB_LIST",
      columns: "SECURITY_CODE,SECURITY_NAME_ABBR,CORRECODE,PUBLIC_START_DATE",
      filter: "(PUBLIC_START_DATE='" + day + "')",
      pageNumber: "1",
      pageSize: "50",
      source: "WEB",
      client: "WEB"
    });
  }

  function getJSON(url) {
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, 15000);
    return fetch(url, { signal: controller.signal, headers: { Accept: "application/json" } })
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .finally(function () { clearTimeout(timer); });
  }

  function todayKey() {
    return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
  }

  function clockNow() {
    return new Intl.DateTimeFormat("zh-CN", {
      timeZone: TZ, hourCycle: "h23", hour: "2-digit", minute: "2-digit"
    }).format(new Date());
  }

  function datePart(value) {
    return value ? String(value).slice(0, 10) : "";
  }

  function formatCell(row, col) {
    var value = row[col.key];
    if (value === null || value === undefined || value === "" || value === "-") return "—";
    if (col.key === "RATING") return String(value).replace(/sti$/i, "");
    if (col.type === "date") return datePart(value);
    if (col.type === "pct" || col.type === "num") {
      var n = Number(value);
      if (!isFinite(n)) return String(value);
      return col.type === "pct" ? n.toFixed(col.digits) + "%" : n.toFixed(col.digits);
    }
    return String(value);
  }

  function renderHead() {
    var tr = $("kzz-head");
    tr.textContent = "";
    COLS.forEach(function (col) {
      var th = document.createElement("th");
      th.textContent = col.label;
      if (col.align === "right") th.className = "num";
      tr.appendChild(th);
    });
  }

  function renderRows(rows) {
    var body = $("kzz-body");
    body.textContent = "";
    var today = todayKey();

    rows.forEach(function (row) {
      var tr = document.createElement("tr");
      if (datePart(row.PUBLIC_START_DATE) === today) tr.className = "is-today";

      COLS.forEach(function (col) {
        var td = document.createElement("td");
        td.textContent = formatCell(row, col);
        if (col.align === "right") td.className = "num";
        if (col.mono) td.className = (td.className ? td.className + " " : "") + "mono";
        tr.appendChild(td);
      });

      body.appendChild(tr);
    });
  }

  function renderPager() {
    $("pager").hidden = state.pages <= 1;
    $("page-info").textContent = "第 " + state.page + " / " + state.pages + " 页";
    $("prev").disabled = state.page <= 1;
    $("next").disabled = state.page >= state.pages;
    $("kzz-total").textContent = "共 " + state.total + " 条";
  }

  function syncUrl() {
    var query = state.page > 1 ? "?page=" + state.page : "";
    try {
      history.replaceState(null, "", location.pathname + query);
    } catch (err) {
      /* file:// 下忽略 */
    }
  }

  function load(page) {
    state.page = Math.max(1, page);
    $("kzz-status").textContent = "正在加载…";

    getJSON(pageUrl(state.page, state.size))
      .then(function (json) {
        if (json.code !== 0 || !json.result) {
          throw new Error(json.message || ("接口返回 " + json.code));
        }
        state.total = json.result.count;
        state.pages = json.result.pages || 0;

        if (state.pages && state.page > state.pages) {
          load(state.pages);
          return;
        }

        renderRows(json.result.data || []);
        renderPager();
        $("kzz-status").textContent = "更新于 " + clockNow();
        syncUrl();
      })
      .catch(function (err) {
        console.warn("[可转债] 加载失败", err);
        $("kzz-status").textContent = "加载失败，点「刷新」重试";
        $("kzz-total").textContent = "—";
        $("kzz-body").innerHTML =
          '<tr><td colspan="' + COLS.length + '" style="padding:24px;text-align:center;color:var(--fg-muted)">' +
          "数据加载失败，请稍后重试</td></tr>";
      });
  }

  function loadNotice() {
    var notice = $("notice");
    getJSON(todayUrl(todayKey()))
      .then(function (json) {
        if (json.code !== 0 || !json.result || !json.result.data || !json.result.data.length) {
          notice.hidden = true;
          return;
        }
        var items = json.result.data.map(function (row) {
          var name = row.SECURITY_NAME_ABBR || row.SECURITY_CODE;
          var apply = row.CORRECODE ? "（申购代码 " + row.CORRECODE + "）" : "";
          return name + apply;
        });
        notice.textContent = "今日可申购：" + items.join("；");
        notice.hidden = false;
      })
      .catch(function () {
        notice.hidden = true;
      });
  }

  function init() {
    renderHead();

    var params = new URLSearchParams(location.search);
    var page = parseInt(params.get("page"), 10);
    if (isFinite(page) && page > 0) state.page = page;

    try {
      var saved = parseInt(localStorage.getItem("kzz-size"), 10);
      if ([50, 100, 200].indexOf(saved) >= 0) {
        state.size = saved;
        $("page-size").value = String(saved);
      }
    } catch (err) {
      /* 忽略 */
    }

    $("prev").addEventListener("click", function () {
      if (state.page > 1) load(state.page - 1);
    });

    $("next").addEventListener("click", function () {
      if (state.page < state.pages) load(state.page + 1);
    });

    $("page-size").addEventListener("change", function () {
      state.size = parseInt(this.value, 10) || DEFAULT_SIZE;
      try {
        localStorage.setItem("kzz-size", String(state.size));
      } catch (err) {
        /* 忽略 */
      }
      load(1);
    });

    $("reload").addEventListener("click", function () {
      load(state.page);
      loadNotice();
    });

    load(state.page);
    loadNotice();
  }

  init();
})();
