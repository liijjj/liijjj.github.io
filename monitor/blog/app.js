/* 阮一峰博客索引：分页与标题搜索 */

(function () {
  "use strict";

  var DATA_URL = "./posts.json";
  var DEFAULT_SIZE = 50;

  var STATE_API = "https://api.github.com/repos/liijjj/liijjj.github.io/contents/monitor/blog/read.json";
  var STATE_RAW = "https://raw.githubusercontent.com/liijjj/liijjj.github.io/state/monitor/blog/read.json";
  var TOKEN_KEY = "blog-sync-token";
  var SYNC_DELAY = 4000;

  var state = {
    posts: [],
    filtered: [],
    page: 1,
    size: DEFAULT_SIZE,
    query: ""
  };

  // 点击过的文章（预览过），用来模拟 :visited 的颜色
  var read = {};

  function saveRead() {
    try {
      localStorage.setItem("blog-read", JSON.stringify(read));
    } catch (err) {
      /* 忽略 */
    }
  }

  function mergeRead(source) {
    var changed = false;
    Object.keys(source || {}).forEach(function (url) {
      if (!read[url]) {
        read[url] = 1;
        changed = true;
      }
    });
    if (changed) saveRead();
  }

  function markRead(url) {
    if (!url) return;
    read[url] = 1;
    saveRead();
  }

  // ---------- 跨设备同步 ----------

  var syncing = false;
  var syncTimer = null;

  function getToken() {
    try {
      return localStorage.getItem(TOKEN_KEY) || "";
    } catch (err) {
      return "";
    }
  }

  function setToken(value) {
    try {
      if (value) localStorage.setItem(TOKEN_KEY, value);
      else localStorage.removeItem(TOKEN_KEY);
    } catch (err) {
      /* 忽略 */
    }
  }

  function base64(text) {
    return btoa(unescape(encodeURIComponent(text)));
  }

  function setSyncStatus(text) {
    if (els.syncStatus) els.syncStatus.textContent = text;
  }

  function loadSharedRead() {
    return fetch(STATE_RAW + "?_=" + Date.now(), { cache: "no-store" })
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (data) {
        if (data && data.read) {
          mergeRead(data.read);
          if (state.posts.length) render();
        }
      })
      .catch(function () {
        /* 没有共享记录时忽略 */
      });
  }

  function syncNow() {
    var token = getToken();
    if (!token) {
      setSyncStatus("请先填写 PAT");
      return;
    }
    if (syncing) return;
    syncing = true;
    setSyncStatus("同步中…");

    var headers = {
      Authorization: "Bearer " + token,
      Accept: "application/vnd.github+json"
    };

    function readRemote() {
      return fetch(STATE_API + "?ref=state&_=" + Date.now(), {
        headers: headers,
        cache: "no-store"
      }).then(function (res) {
        if (res.status === 404) return { sha: null, read: {} };
        if (res.status === 401 || res.status === 403) {
          throw new Error("PAT 无效，或没有 Contents 读写权限");
        }
        if (!res.ok) throw new Error("读取失败 HTTP " + res.status);
        return res.json().then(function (data) {
          var parsed = {};
          try {
            var text = decodeURIComponent(escape(atob((data.content || "").replace(/\s/g, ""))));
            parsed = JSON.parse(text);
          } catch (err) {
            parsed = {};
          }
          return { sha: data.sha, read: parsed.read || {} };
        });
      });
    }

    function writeRemote(sha, merged, attempt) {
      var body = {
        message: "chore: 同步已读记录",
        content: base64(JSON.stringify({ read: merged })),
        branch: "state"
      };
      if (sha) body.sha = sha;

      return fetch(STATE_API, {
        method: "PUT",
        headers: Object.assign({ "Content-Type": "application/json" }, headers),
        body: JSON.stringify(body)
      }).then(function (res) {
        if (res.status === 409 && attempt < 1) {
          return readRemote().then(function (fresh) {
            var mergedAgain = {};
            Object.keys(fresh.read).forEach(function (url) { mergedAgain[url] = 1; });
            Object.keys(read).forEach(function (url) { mergedAgain[url] = 1; });
            read = mergedAgain;
            saveRead();
            return writeRemote(fresh.sha, mergedAgain, attempt + 1);
          });
        }
        if (res.status === 401 || res.status === 403) {
          throw new Error("PAT 无效，或没有 Contents 读写权限");
        }
        if (!res.ok) throw new Error("写入失败 HTTP " + res.status);
        return true;
      });
    }

    readRemote()
      .then(function (remote) {
        var merged = {};
        Object.keys(remote.read).forEach(function (url) { merged[url] = 1; });
        Object.keys(read).forEach(function (url) { merged[url] = 1; });
        read = merged;
        saveRead();
        return writeRemote(remote.sha, merged, 0);
      })
      .then(function () {
        syncing = false;
        setSyncStatus("已同步 " + new Date().toLocaleTimeString("zh-CN", { hour12: false }));
        if (state.posts.length) render();
      })
      .catch(function (err) {
        syncing = false;
        console.warn("[博客] 同步失败", err);
        setSyncStatus("同步失败：" + err.message);
      });
  }

  function queueSync() {
    if (!getToken()) return;
    setSyncStatus("待同步…");
    clearTimeout(syncTimer);
    syncTimer = setTimeout(syncNow, SYNC_DELAY);
  }

  var els = {
    count: document.getElementById("count"),
    search: document.getElementById("search"),
    size: document.getElementById("size"),
    list: document.getElementById("list"),
    empty: document.getElementById("empty"),
    pager: document.getElementById("pager"),
    pageInfo: document.getElementById("page-info"),
    jump: document.getElementById("jump"),
    first: document.getElementById("first"),
    prev: document.getElementById("prev"),
    next: document.getElementById("next"),
    last: document.getElementById("last"),
    go: document.getElementById("go"),
    reader: document.getElementById("reader"),
    pane: document.getElementById("pane"),
    paneFrame: document.getElementById("pane-frame"),
    paneTitle: document.getElementById("pane-title"),
    paneClose: document.getElementById("pane-close"),
    syncBox: document.getElementById("sync-box"),
    syncToken: document.getElementById("sync-token"),
    syncSave: document.getElementById("sync-save"),
    syncClear: document.getElementById("sync-clear"),
    syncStatus: document.getElementById("sync-status")
  };

  function setPane(open) {
    els.reader.classList.toggle("with-pane", open);
    els.pane.hidden = !open;
    if (!open) {
      els.paneFrame.hidden = true;
      els.paneFrame.src = "about:blank";
      els.paneTitle.textContent = "点击左侧标题预览";
    }
  }

  function openPost(url, title) {
    els.paneTitle.textContent = title;
    els.paneFrame.hidden = false;
    if (els.paneFrame.src !== url) {
      els.paneFrame.src = url;
    }
    setPane(true);
  }

  function pages() {
    return Math.max(1, Math.ceil(state.filtered.length / state.size));
  }

  function clampPage(page) {
    return Math.min(Math.max(1, page), pages());
  }

  function syncUrl() {
    var params = new URLSearchParams();
    if (state.page > 1) params.set("page", state.page);
    if (state.query) params.set("q", state.query);
    var query = params.toString();
    try {
      history.replaceState(null, "", location.pathname + (query ? "?" + query : ""));
    } catch (err) {
      /* 忽略 */
    }
  }

  function applyFilter() {
    var query = state.query.toLowerCase();
    state.filtered = state.posts.filter(function (post) {
      return !query || post.title.toLowerCase().indexOf(query) !== -1;
    });
  }

  function render() {
    applyFilter();
    state.page = clampPage(state.page);

    var total = state.filtered.length;
    var countPages = pages();
    var start = (state.page - 1) * state.size;
    var rows = state.filtered.slice(start, start + state.size);

    els.list.textContent = "";
    rows.forEach(function (post) {
      var li = document.createElement("li");
      var link = document.createElement("a");
      link.href = post.url;
      link.target = "_blank";
      link.rel = "noopener";
      if (read[post.url]) link.classList.add("is-read");

      var date = document.createElement("span");
      date.className = "post-date";
      date.textContent = post.date;

      var title = document.createElement("span");
      title.className = "post-title";
      title.textContent = post.title;

      link.appendChild(date);
      link.appendChild(document.createTextNode(" "));
      link.appendChild(title);
      li.appendChild(link);
      els.list.appendChild(li);
    });

    els.empty.hidden = total !== 0;
    els.pager.hidden = countPages <= 1;
    els.pageInfo.textContent = "第 " + state.page + " / " + countPages + " 页 · " + total + " 篇";
    els.first.disabled = state.page <= 1;
    els.prev.disabled = state.page <= 1;
    els.next.disabled = state.page >= countPages;
    els.last.disabled = state.page >= countPages;
    els.jump.max = String(countPages);
    els.jump.value = "";
    syncUrl();
  }

  function goPage(page) {
    var target = clampPage(page);
    if (target === state.page) return;
    state.page = target;
    render();
    if (window.scrollY > 200) {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  function init() {
    try {
      var savedRead = JSON.parse(localStorage.getItem("blog-read") || "{}");
      if (savedRead && typeof savedRead === "object") read = savedRead;
    } catch (err) {
      read = {};
    }

    els.syncBox.open = false;
    if (getToken()) els.syncToken.placeholder = "已保存，留空沿用";

    els.syncSave.addEventListener("click", function () {
      var value = els.syncToken.value.trim();
      if (value) {
        setToken(value);
        els.syncToken.value = "";
        els.syncToken.placeholder = "已保存，留空沿用";
      }
      if (!getToken()) {
        setSyncStatus("请先填写 PAT");
        return;
      }
      syncNow();
    });

    els.syncClear.addEventListener("click", function () {
      setToken("");
      els.syncToken.value = "";
      els.syncToken.placeholder = "github_pat_...";
      setSyncStatus("已清除本机 PAT");
    });

    loadSharedRead();

    window.addEventListener("pagehide", function () {
      if (syncTimer) {
        clearTimeout(syncTimer);
        syncTimer = null;
        syncNow();
      }
    });

    var params = new URLSearchParams(location.search);
    var page = parseInt(params.get("page"), 10);
    state.query = params.get("q") || "";
    state.page = isFinite(page) && page > 0 ? page : 1;
    els.search.value = state.query;

    try {
      var saved = parseInt(localStorage.getItem("blog-size"), 10);
      if ([50, 100, 200].indexOf(saved) >= 0) {
        state.size = saved;
        els.size.value = String(saved);
      }
    } catch (err) {
      /* 忽略 */
    }

    els.search.addEventListener("input", function () {
      state.query = this.value.trim();
      state.page = 1;
      render();
    });

    els.size.addEventListener("change", function () {
      state.size = parseInt(this.value, 10) || DEFAULT_SIZE;
      state.page = 1;
      try {
        localStorage.setItem("blog-size", String(state.size));
      } catch (err) {
        /* 忽略 */
      }
      render();
    });

    els.first.addEventListener("click", function () { goPage(1); });
    els.prev.addEventListener("click", function () { goPage(state.page - 1); });
    els.next.addEventListener("click", function () { goPage(state.page + 1); });
    els.last.addEventListener("click", function () { goPage(pages()); });

    els.go.addEventListener("click", function () {
      var value = parseInt(els.jump.value, 10);
      if (isFinite(value)) goPage(value);
    });

    els.jump.addEventListener("keydown", function (event) {
      if (event.key === "Enter") {
        var value = parseInt(els.jump.value, 10);
        if (isFinite(value)) goPage(value);
      }
    });

    els.paneClose.addEventListener("click", function () {
      setPane(false);
    });

    els.list.addEventListener("click", function (event) {
      var link = event.target.closest("a");
      if (!link) return;
      if (event.defaultPrevented || event.button !== 0 ||
          event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }
      var title = link.querySelector(".post-title");
      event.preventDefault();
      markRead(link.href);
      link.classList.add("is-read");
      queueSync();
      openPost(link.href, title ? title.textContent : link.href);
    });

    // 没点链接时不显示右侧窗口
    setPane(false);

    fetch(DATA_URL, { cache: "no-cache" })
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (data) {
        state.posts = Array.isArray(data.posts) ? data.posts : [];
        var latest = state.posts.length ? state.posts[0].date : "";
        els.count.textContent =
          "共 " + state.posts.length.toLocaleString("zh-CN") + " 篇" +
          (latest ? " · 最近 " + latest : "");
        render();
      })
      .catch(function (err) {
        console.warn("[博客] 索引加载失败", err);
        els.count.textContent = "索引加载失败";
        els.empty.hidden = false;
        els.empty.textContent = "索引加载失败，请稍后刷新重试。";
      });
  }

  init();
})();
