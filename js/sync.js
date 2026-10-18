"use strict";
/* ================================================================
   考研学习站 · 学习数据同步（WebDAV / OneDrive）
   - 配置跨站共享：同一域名下 815 / 341 两个学习站共用一份同步配置
     （localStorage 键 study_sync_config），任一站配置一次即可。
   - 数据按站分文件备份：<站>-progress.json，合并粒度为"键内子项"
     （每道题/每个名词/每章），按写入时间戳后写者胜出，删除留墓碑。
   - 明文存储与传输（未加密）：凭据保存在本机浏览器，请勿在共用设备上保存密码。
   ================================================================ */
(function () {
  const APPS = [["815", "a815_"], ["341", "a341_"]];
  const SELF_APP = location.pathname.indexOf("341") >= 0 ? "341" : "815";
  const SELF_PREFIX = APPS.find(a => a[0] === SELF_APP)[1];
  const CFG_KEY = "study_sync_config";
  const META_KEY = "study_sync_meta";
  const LAST_KEY = "study_sync_last";
  const APPROOT = "https://graph.microsoft.com/v1.0/me/drive/special/approot";
  const OD_AUTH = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
  const OD_TOKEN = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
  const OD_SCOPE = "Files.ReadWrite.AppFolder offline_access";

  /* ===== 配置（跨站共享） ===== */
  const defCfg = () => ({ device: "", auto: false, wd: { url: "", user: "", pass: "", dir: "karrystudy" }, od: { cid: "", at: "", rt: "", exp: 0, name: "" } });
  const loadCfg = () => { try { return Object.assign(defCfg(), JSON.parse(localStorage.getItem(CFG_KEY)) || {}); } catch (e) { return defCfg(); } };
  const saveCfg = c => localStorage.setItem(CFG_KEY, JSON.stringify(c));
  let cfg = loadCfg();
  if (!cfg.device) { cfg.device = "设备" + Math.random().toString(36).slice(2, 6).toUpperCase(); saveCfg(cfg); }

  const loadMeta = () => { try { return JSON.parse(localStorage.getItem(META_KEY)) || {}; } catch (e) { return {}; } };
  const saveMeta = m => localStorage.setItem(META_KEY, JSON.stringify(m));

  /* ===== 写入钩子：app.js 的 store.set 调用，记录子项时间戳/墓碑 ===== */
  const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  window.__storeChanged = function (key, prev, cur, prefix) {
    try {
      const m = loadMeta();
      const full = prefix + key;
      const km = m[full] || (m[full] = { __k: 0, s: {} });
      km.__k = Date.now();
      if (cur && typeof cur === "object" && !Array.isArray(cur)) {
        const prevObj = (prev && typeof prev === "object" && !Array.isArray(prev)) ? prev : null;
        if (!prevObj) {                       /* 首次写入：全部子项按当前时间记戳 */
          Object.keys(cur).forEach(s => { km.s[s] = Date.now(); });
        } else {
          new Set([...Object.keys(prevObj), ...Object.keys(cur)]).forEach(s => {
            if (eq(prevObj[s], cur[s])) return;
            km.s[s] = (s in cur) ? Date.now() : { d: 1, t: Date.now() };
          });
        }
      }
      saveMeta(m);
    } catch (_) {}
  };

  /* ===== 数据收集 / 写回 ===== */
  function collect(prefix) {
    const out = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || k.indexOf(prefix) !== 0) continue;
      try { out[k.slice(prefix.length)] = JSON.parse(localStorage.getItem(k)); } catch (_) {}
    }
    return out;
  }
  function apply(prefix, data) {
    Object.keys(data).forEach(name => {
      try { localStorage.setItem(prefix + name, JSON.stringify(data[name])); } catch (_) {}
    });
  }
  const stamp = (km, s) => !km || !km.s || km.s[s] === undefined ? -1 : (typeof km.s[s] === "number" ? km.s[s] : km.s[s].t);
  const tomb = (km, s) => !!(km && km.s && km.s[s] && typeof km.s[s] === "object");

  /* ===== 合并：子项级后写者胜出。返回 {data, meta, applied, sent} ===== */
  function merge(localData, localMeta, remote) {
    const out = {}, outMeta = {};
    let applied = 0, sent = 0;
    const rdata = remote.data || {}, rmeta = remote.meta || {};
    const rFallback = Date.parse(remote.uploadedAt) || 0;   /* 旧备份无子级时间戳时的回退 */
    new Set([...Object.keys(localData), ...Object.keys(rdata)]).forEach(name => {
      const lv = localData[name], rv = rdata[name];
      const lm = localMeta[name] || {}, rm = rmeta[name] || {};
      const rmK = rm.__k || rFallback;
      if (lv && rv && typeof lv === "object" && typeof rv === "object" && !Array.isArray(lv) && !Array.isArray(rv)) {
        const merged = {}, ms = {};
        new Set([...Object.keys(lv), ...Object.keys(rv)]).forEach(s => {
          const lt = stamp(lm, s);
          const rt = stamp(rm, s) >= 0 ? stamp(rm, s) : (rv[s] !== undefined ? rFallback : -1);
          if (rt > lt) {                       /* 远端较新：采用远端（含墓碑删除） */
            if (tomb(rm, s)) applied++;
            else { merged[s] = rv[s]; applied++; }
            ms[s] = rm.s[s] !== undefined ? rm.s[s] : rt;
          } else {                             /* 本地较新或并列：保留本地 */
            merged[s] = lv[s];
            if (lt > rt && rv[s] !== undefined && !eq(lv[s], rv[s])) sent++;
            ms[s] = (lm.s && lm.s[s] !== undefined) ? lm.s[s] : { t: 0 };
          }
        });
        out[name] = merged;
        outMeta[name] = { __k: Math.max(lm.__k || 0, rmK), s: ms };
      } else {
        const lt = lm.__k || 0, rt = rmK;
        if (lv === undefined || rt > lt) { out[name] = rv; applied++; outMeta[name] = rm.__k ? rm : { __k: rFallback, s: {} }; }
        else { out[name] = lv; if (lt > rt && rv !== undefined && !eq(lv, rv)) sent++; outMeta[name] = lm; }
      }
    });
    return { data: out, meta: outMeta, applied, sent };
  }

  /* ===== WebDAV 后端 ===== */
  const b64 = s => { const b = new TextEncoder().encode(s); let r = ""; for (let i = 0; i < b.length; i++) r += String.fromCharCode(b[i]); return btoa(r); };
  function wdBase() { let u = (cfg.wd.url || "").trim(); return u && !u.endsWith("/") ? u + "/" : u; }
  function wdHeaders(extra) { return Object.assign({ Authorization: "Basic " + b64((cfg.wd.user || "") + ":" + (cfg.wd.pass || "")) }, extra || {}); }
  async function wdEnsureDir() {
    try { await fetch(wdBase() + (cfg.wd.dir || "karrystudy"), { method: "MKCOL", headers: wdHeaders() }); } catch (_) {}
  }
  async function wdTest() {
    if (!wdBase()) throw new Error("请填写服务器地址");
    const r = await fetch(wdBase(), { method: "PROPFIND", headers: wdHeaders({ Depth: "0" }) });
    if (r.ok || r.status === 207) return "连接成功";
    if (r.status === 401) throw new Error("账号或密码不对（坚果云需使用「应用密码」）");
    if (r.status === 0 || r.type === "error") throw new Error("无法连接（可能被 CORS 拦截，见下方说明）");
    throw new Error("服务器返回 " + r.status);
  }
  async function wdPut(text) {
    await wdEnsureDir();
    const r = await fetch(wdBase() + (cfg.wd.dir || "karrystudy") + "/" + SELF_APP + "-progress.json",
      { method: "PUT", headers: wdHeaders({ "Content-Type": "application/json" }), body: text });
    if (!r.ok && r.status !== 201 && r.status !== 204) throw new Error("上传失败（" + r.status + "）");
  }
  async function wdGet() {
    const r = await fetch(wdBase() + (cfg.wd.dir || "karrystudy") + "/" + SELF_APP + "-progress.json", { method: "GET", headers: wdHeaders() });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error("下载失败（" + r.status + "）");
    return JSON.parse(await r.text());
  }

  /* ===== OneDrive 后端（Graph API + PKCE 免密登录） ===== */
  const b64url = buf => { const b = new Uint8Array(buf); let s = ""; for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
  const redirectUri = () => location.origin + location.pathname;
  async function odSignIn() {
    if (!cfg.od.cid) throw new Error("请先填写 Azure 应用的客户端 ID");
    const ver = b64url(crypto.getRandomValues(new Uint8Array(32)));
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ver));
    const state = Math.random().toString(36).slice(2);
    const u = new URL(OD_AUTH);
    u.search = new URLSearchParams({
      client_id: cfg.od.cid, response_type: "code", redirect_uri: redirectUri(),
      response_mode: "query", scope: OD_SCOPE, state,
      code_challenge: b64url(digest), code_challenge_method: "S256", prompt: "select_account"
    }).toString();
    const w = window.open(u.toString(), "odauth", "width=520,height=660");
    if (!w) throw new Error("浏览器拦截了弹出窗口，请允许后重试");
    return new Promise((res, rej) => {
      const poll = setInterval(() => {
        try {
          if (!w || w.closed) { clearInterval(poll); return rej(new Error("登录窗口被关闭")); }
          const href = w.location.href;
          if (href && href.indexOf(redirectUri()) === 0) {
            clearInterval(poll); w.close();
            const q = new URLSearchParams(href.split("?")[1] || "");
            if (q.get("error")) return rej(new Error("登录未完成：" + (q.get("error_description") || q.get("error"))));
            if (q.get("state") !== state) return rej(new Error("state 校验失败，请重试"));
            odExchange(q.get("code"), ver).then(res, rej);
          }
        } catch (_) {} /* 登录页跨域阶段，忽略 */
      }, 400);
    });
  }
  async function odToken(body) {
    const r = await fetch(OD_TOKEN, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error_description || j.error || "令牌交换失败");
    cfg.od.at = j.access_token;
    if (j.refresh_token) cfg.od.rt = j.refresh_token;
    cfg.od.exp = Date.now() + (Math.max((j.expires_in || 3600) - 120, 60)) * 1000;
    try {
      const me = await fetch("https://graph.microsoft.com/v1.0/me", { headers: { Authorization: "Bearer " + cfg.od.at } }).then(x => x.json());
      cfg.od.name = me.displayName || me.userPrincipalName || "OneDrive";
    } catch (_) {}
    saveCfg(cfg); renderAuth();
    return j;
  }
  async function odExchange(code, ver) {
    return odToken(new URLSearchParams({
      client_id: cfg.od.cid, grant_type: "authorization_code", code,
      redirect_uri: redirectUri(), code_verifier: ver, scope: OD_SCOPE
    }));
  }
  async function odEnsure() {
    if (cfg.od.at && Date.now() < cfg.od.exp) return;
    if (!cfg.od.rt) { const e = new Error("NEED_LOGIN"); e.needLogin = true; throw e; }
    try {
      await odToken(new URLSearchParams({ client_id: cfg.od.cid, grant_type: "refresh_token", refresh_token: cfg.od.rt, scope: OD_SCOPE }));
    } catch (_) {
      cfg.od.rt = ""; saveCfg(cfg); renderAuth();
      const e = new Error("OneDrive 登录已过期，请重新登录"); e.needLogin = true; throw e;
    }
  }
  async function odPut(text) {
    await odEnsure();
    const path = "/" + SELF_APP + "-progress.json:/content?@name.conflictBehavior=replace";
    const go = () => fetch(APPROOT + path, { method: "PUT", headers: { Authorization: "Bearer " + cfg.od.at, "Content-Type": "application/json" }, body: text });
    let r = await go();
    if (r.status === 401) { await odEnsure(); r = await go(); }
    if (!r.ok) throw new Error("上传失败（" + r.status + "）");
  }
  async function odGet() {
    await odEnsure();
    const path = "/" + SELF_APP + "-progress.json:/content";
    const go = () => fetch(APPROOT + path, { headers: { Authorization: "Bearer " + cfg.od.at } });
    let r = await go();
    if (r.status === 401) { await odEnsure(); r = await go(); }
    if (r.status === 404) return null;
    if (!r.ok) throw new Error("下载失败（" + r.status + "）");
    return JSON.parse(await r.text());
  }

  /* ===== 同步动作 ===== */
  const logLines = [];
  function log(msg) {
    logLines.push("[" + new Date().toLocaleTimeString() + "] " + msg);
    if (logLines.length > 60) logLines.shift();
    const el = document.getElementById("syncLog");
    if (el) { el.textContent = logLines.join("\n"); el.classList.add("show"); }
  }
  function localStats() {
    return APPS.map(pair => {
      const d = collect(pair[1]);
      const n = o => o && typeof o === "object" ? Object.keys(o).length : 0;
      return pair[0] + "：" + n(d.chDone) + " 章 · " + n(d.termLearned) + " 词 · " + n(d.answers) + " 题";
    }).join("　|　");
  }
  function backendsFor(kind) {
    const list = [];
    if (cfg.wd.url && (cfg.wd.user || kind === "test")) list.push({ name: "WebDAV", read: wdGet, write: wdPut });
    if (cfg.od.rt || cfg.od.at) list.push({ name: "OneDrive", read: odGet, write: odPut });
    return list;
  }
  async function syncOne(be, mode, silent) {
    const localData = collect(SELF_PREFIX);
    const allMeta = loadMeta();
    const localMeta = {};
    Object.keys(allMeta).forEach(k => { if (k.indexOf(SELF_PREFIX) === 0) localMeta[k.slice(SELF_PREFIX.length)] = allMeta[k]; });
    let applied = 0, sent = 0;
    if (mode !== "up") {
      const remote = await be.read();
      if (remote) {
        const m = merge(localData, localMeta, remote);
        apply(SELF_PREFIX, m.data);
        const all = loadMeta();
        Object.keys(m.meta).forEach(name => { all[SELF_PREFIX + name] = m.meta[name]; });
        saveMeta(all);
        applied = m.applied; sent = m.sent;
      } else if (!silent) log("[" + be.name + "] 云端暂无备份，将上传本机数据");
    }
    if (mode !== "down") {
      const meta2 = {};
      const all = loadMeta();
      Object.keys(all).forEach(k => { if (k.indexOf(SELF_PREFIX) === 0) meta2[k.slice(SELF_PREFIX.length)] = all[k]; });
      await be.write(JSON.stringify({ v: 1, app: SELF_APP, uploadedAt: new Date().toISOString(), device: cfg.device, data: collect(SELF_PREFIX), meta: meta2 }));
    }
    localStorage.setItem(LAST_KEY, JSON.stringify({ at: Date.now(), device: cfg.device }));
    if (!silent) log("[" + be.name + "] " + (mode === "up" ? "上传完成" : mode === "down" ? "下载合并完成" : "双向同步完成") + "：应用远端 " + applied + " 项，本机较新 " + sent + " 项");
    refreshInfo();
    return { applied };
  }
  async function doAll(kind, silent) {
    const bes = backendsFor(kind === "bidir" ? "bidir" : kind);
    if (!bes.length) throw new Error("尚未配置 WebDAV 或登录 OneDrive");
    let applied = 0;
    for (const be of bes) { const r = await syncOne(be, kind, silent); applied += r.applied; }
    if (applied > 0 && !silent && confirm("同步已更新本机 " + applied + " 项学习数据，刷新页面立即生效？")) location.reload();
    return applied;
  }

  /* ===== UI ===== */
  const CSS = `
  .sync-btn{width:34px;height:34px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;background:var(--green-100,#E4EFE8);color:var(--green-700,#2E6B4F);cursor:pointer;flex:none;border:none}
  .sync-btn:hover{background:var(--green-700,#2E6B4F);color:#fff}
  .sync-btn svg{width:17px;height:17px}
  .sync-mask{position:fixed;inset:0;background:rgba(22,43,35,.45);z-index:300;display:none;align-items:flex-start;justify-content:center;padding:max(16px,calc(env(safe-area-inset-top) + 12px)) 14px calc(20px + env(safe-area-inset-bottom));overflow:auto}
  .sync-mask.show{display:flex}
  .sync-modal{background:#fff;border-radius:16px;max-width:640px;width:100%;padding:22px 22px 18px;box-shadow:0 18px 60px rgba(0,0,0,.25);font-size:13.5px;color:#24312B;line-height:1.7}
  .sync-modal h3{font-family:var(--serif,serif);font-size:18px;color:var(--green-900,#1E4D3A);display:flex;align-items:center;margin:0 0 10px}
  .sync-modal h4{font-size:13.5px;color:var(--green-900,#1E4D3A);margin:18px 0 6px;padding-left:8px;border-left:3px solid var(--gold-500,#C9963D)}
  .sync-modal .row{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:6px 0}
  .sync-modal input{flex:1;min-width:120px;padding:7px 10px;border:1px solid #E2E6DC;border-radius:8px;font-size:13px;font-family:inherit}
  .sync-modal input:focus{outline:2px solid var(--green-300,#8FBFA4)}
  .sync-modal .btn{padding:6px 14px;border-radius:99px;font-size:12.5px;font-weight:600;cursor:pointer;border:none;background:var(--green-100,#E4EFE8);color:var(--green-700,#2E6B4F)}
  .sync-modal .btn.pri{background:var(--green-700,#2E6B4F);color:#fff}
  .sync-modal .btn:hover{filter:brightness(.95)}
  .sync-modal .tip{font-size:11.5px;color:#8A9A8E;margin-top:4px}
  .sync-modal .info{background:var(--green-50,#F0F6F2);border-radius:10px;padding:8px 12px;font-size:12px;color:#33413A}
  #syncLog{background:#163B2B;color:#CFE0D5;border-radius:10px;padding:10px 12px;font-size:11.5px;font-family:Consolas,monospace;white-space:pre-wrap;max-height:150px;overflow:auto;margin-top:10px;display:none}
  #syncLog.show{display:block}
  .sync-close{background:rgba(22,59,43,.06);border:none;width:40px;height:40px;border-radius:50%;cursor:pointer;color:#5A6B60;line-height:1;font-size:22px;margin-left:auto;flex:none}`;
  function injectUI() {
    const st = document.createElement("style"); st.textContent = CSS; document.head.appendChild(st);
    const host = document.querySelector(".topbar .right");
    if (host) {
      const b = document.createElement("button");
      b.className = "sync-btn"; b.title = "学习数据同步"; b.setAttribute("aria-label", "学习数据同步");
      b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-2.6-6.4M21 3v6h-6"/></svg>';
      b.addEventListener("click", openModal);
      host.prepend(b);
    }
    const mask = document.createElement("div");
    mask.className = "sync-mask"; mask.id = "syncMask";
    mask.innerHTML = `
    <div class="sync-modal">
      <h3>学习数据同步<button class="sync-close" id="syncClose" title="关闭">×</button></h3>
      <div class="info" id="syncInfo"></div>
      <h4>通用</h4>
      <div class="row"><span style="flex:none">设备名</span><input id="syncDevice" style="max-width:180px"></div>
      <div class="row"><label style="display:flex;gap:6px;align-items:center;cursor:pointer"><input type="checkbox" id="syncAuto" style="flex:none;width:auto"> 打开本站时自动双向同步（推荐）</label></div>
      <div class="tip">配置在 815 / 341 两个学习站之间互通；数据按站分别备份（本站文件：${SELF_APP}-progress.json）。凭据明文保存在本机浏览器，请勿在共用设备上保存。</div>
      <h4>WebDAV（坚果云 / 群晖 / Nextcloud 等）</h4>
      <div class="row"><input id="wdUrl" placeholder="服务器地址，如 https://dav.jianguoyun.com/dav/"></div>
      <div class="row"><input id="wdUser" placeholder="账号" style="max-width:45%"><input id="wdPass" placeholder="应用密码" type="password" style="max-width:45%"></div>
      <div class="row"><input id="wdDir" placeholder="目录（默认 karrystudy）" style="max-width:200px"><button class="btn" data-act="wdTest">测试连接</button></div>
      <div class="row">
        <button class="btn pri" data-act="bidir">双向同步</button>
        <button class="btn" data-act="up">上传（覆盖云端）</button>
        <button class="btn" data-act="down">下载合并</button>
      </div>
      <div class="tip">WebDAV 需服务器允许浏览器跨域访问（坚果云等主流网盘支持）。失败时检查地址是否以 / 结尾、是否用了应用密码。</div>
      <h4>OneDrive（微软个人账号）</h4>
      <div class="row"><input id="odCid" placeholder="Azure 应用「客户端 ID」（见下方说明）"></div>
      <div class="tip">首次使用：在 <a href="https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps/ApplicationsListBlade" target="_blank" rel="noopener" style="color:var(--blue,#3E6B8C)">Azure 门户 - 应用注册</a> 新建「单页应用(SPA)」，把重定向 URI 设为 <b id="odRedirect" style="user-select:all"></b>（815 与 341 两个站点的地址都加上），「API 权限」添加委托权限 Files.ReadWrite.AppFolder、offline_access，然后把「应用程序(客户端) ID」粘贴到上面。</div>
      <div class="row">
        <button class="btn pri" data-act="odSign">登录 OneDrive</button>
        <button class="btn" data-act="odOut">退出登录</button>
        <span id="odName" style="font-size:12px;color:#5A6B60"></span>
      </div>
      <div class="row">
        <button class="btn pri" data-act="bidir2">双向同步</button>
        <button class="btn" data-act="up2">上传（覆盖云端）</button>
        <button class="btn" data-act="down2">下载合并</button>
      </div>
      <div class="row"><button class="btn" data-act="toggleLog">日志</button><span style="font-size:11.5px;color:#8A9A8E" id="syncLast"></span></div>
      <pre id="syncLog"></pre>
    </div>`;
    document.body.appendChild(mask);
    mask.addEventListener("click", e => { if (e.target === mask) mask.classList.remove("show"); });
    mask.querySelector("#syncClose").addEventListener("click", () => mask.classList.remove("show"));
    mask.querySelectorAll("[data-act]").forEach(b => b.addEventListener("click", () => onAct(b.dataset.act)));
    mask.querySelector("#syncDevice").addEventListener("change", e => { cfg.device = e.target.value.trim() || cfg.device; saveCfg(cfg); });
    mask.querySelector("#syncAuto").addEventListener("change", e => { cfg.auto = e.target.checked; saveCfg(cfg); });
    const fieldMap = { wdUrl: ["wd", "url"], wdUser: ["wd", "user"], wdPass: ["wd", "pass"], wdDir: ["wd", "dir"] };
    Object.keys(fieldMap).forEach(id => {
      mask.querySelector("#" + id).addEventListener("change", e => {
        cfg[fieldMap[id][0]][fieldMap[id][1]] = e.target.value.trim();
        if (id === "wdDir" && !cfg.wd.dir) cfg.wd.dir = "karrystudy";
        saveCfg(cfg);
      });
    });
    mask.querySelector("#odCid").addEventListener("change", e => { cfg.od.cid = e.target.value.trim(); saveCfg(cfg); });
  }
  function renderAuth() {
    const el = document.getElementById("odName");
    if (el) el.textContent = (cfg.od.rt || cfg.od.at) ? "已登录：" + (cfg.od.name || "OneDrive") : "未登录";
    const btn = document.querySelector('[data-act="odSign"]');
    if (btn) btn.textContent = (cfg.od.rt || cfg.od.at) ? "重新登录" : "登录 OneDrive";
  }
  function refreshInfo() {
    const el = document.getElementById("syncInfo");
    if (el) el.innerHTML = "<b>本机数据</b>　" + localStats();
    const last = document.getElementById("syncLast");
    if (last) {
      try {
        const l = JSON.parse(localStorage.getItem(LAST_KEY));
        last.textContent = l ? "上次同步：" + new Date(l.at).toLocaleString() + "（" + l.device + "）" : "从未同步";
      } catch (_) { last.textContent = "从未同步"; }
    }
    const dev = document.getElementById("syncDevice");
    if (dev && document.activeElement !== dev) dev.value = cfg.device;
    const au = document.getElementById("syncAuto");
    if (au) au.checked = !!cfg.auto;
    const fmap = { wdUrl: "url", wdUser: "user", wdPass: "pass", wdDir: "dir" };
    Object.keys(fmap).forEach(id => {
      const el2 = document.getElementById(id);
      if (el2 && document.activeElement !== el2) el2.value = cfg.wd[fmap[id]] || (id === "wdDir" ? "karrystudy" : "");
    });
    const cid = document.getElementById("odCid");
    if (cid && document.activeElement !== cid) cid.value = cfg.od.cid || "";
    const rd = document.getElementById("odRedirect");
    if (rd) rd.textContent = redirectUri();
    renderAuth();
  }
  function openModal() {
    refreshInfo();
    const el = document.getElementById("syncLog");
    if (el) el.textContent = logLines.join("\n");
    document.getElementById("syncMask").classList.add("show");
  }
  const busy = {};
  async function manualSync(be, mode) {
    const r = await syncOne(be, mode, false);
    if (r.applied > 0 && confirm("同步已更新本机 " + r.applied + " 项学习数据，刷新页面立即生效？")) location.reload();
  }
  async function onAct(act) {
    if (busy[act]) return; busy[act] = true;
    try {
      if (act === "wdTest") { log("测试 WebDAV 连接…"); log(await wdTest()); }
      else if (act === "odSign") { log("打开 OneDrive 登录窗口…"); await odSignIn(); log("OneDrive 登录成功"); }
      else if (act === "odOut") { cfg.od.at = ""; cfg.od.rt = ""; cfg.od.exp = 0; cfg.od.name = ""; saveCfg(cfg); renderAuth(); log("已退出 OneDrive 登录"); }
      else if (act === "bidir") {
        if (!(cfg.wd.url && cfg.wd.user)) throw new Error("请先填写 WebDAV 服务器与账号");
        log("双向同步（WebDAV）…"); await manualSync({ name: "WebDAV", read: wdGet, write: wdPut }, "bidir");
      }
      else if (act === "bidir2") {
        if (!(cfg.od.rt || cfg.od.at)) throw new Error("请先登录 OneDrive");
        log("双向同步（OneDrive）…"); await manualSync({ name: "OneDrive", read: odGet, write: odPut }, "bidir");
      }
      else if (act === "up" || act === "up2") {
        if (!confirm("将用本机数据覆盖云端「" + SELF_APP + "」的备份，确定？")) return;
        if (act === "up") { if (!(cfg.wd.url && cfg.wd.user)) throw new Error("请先填写 WebDAV 服务器与账号"); await manualSync({ name: "WebDAV", read: wdGet, write: wdPut }, "up"); }
        else { if (!(cfg.od.rt || cfg.od.at)) throw new Error("请先登录 OneDrive"); await manualSync({ name: "OneDrive", read: odGet, write: odPut }, "up"); }
      }
      else if (act === "down" || act === "down2") {
        if (act === "down") { if (!(cfg.wd.url && cfg.wd.user)) throw new Error("请先填写 WebDAV 服务器与账号"); await manualSync({ name: "WebDAV", read: wdGet, write: wdPut }, "down"); }
        else { if (!(cfg.od.rt || cfg.od.at)) throw new Error("请先登录 OneDrive"); await manualSync({ name: "OneDrive", read: odGet, write: odPut }, "down"); }
      }
      else if (act === "toggleLog") { document.getElementById("syncLog").classList.toggle("show"); }
      refreshInfo();
    } catch (e) {
      log("操作失败：" + (e.needLogin ? "OneDrive 登录已过期，请重新登录" : e.message));
    } finally { busy[act] = false; }
  }

  /* ===== 启动 ===== */
  injectUI();
  setTimeout(() => {
    if (!cfg.auto || !navigator.onLine) return;
    if (!backendsFor("bidir").length) return;
    doAll("bidir", true).then(n => { if (n) log("自动同步完成，更新 " + n + " 项（刷新页面后生效）"); else log("自动同步完成，无差异"); }).catch(() => {});
  }, 4000);
})();
