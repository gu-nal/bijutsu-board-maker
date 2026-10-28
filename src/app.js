const DB = "bijutsu-board-db",
  STORE = "projects",
  KEY = "current";
const defaults = [
  { title: "全体の雰囲気", query: "food editorial photography table setting" },
  { title: "お皿", query: "ceramic plate food styling" },
  { title: "天板", query: "wood tabletop texture" },
  { title: "カトラリー", query: "fork spoon cutlery" },
  { title: "クロス", query: "linen tablecloth fabric" },
  { title: "その他小道具", query: "food photography props kitchen" },
];
let state = {
  projectName: "",
  brandName: "",
  shootDate: "",
  dishName: "",
  recipeNotes: "",
  accent: "#507b58",
  headingFontSize: 12,
  baseImageTitle: "ベースイメージ",
  brandLogo: null,
  sectionPresetVersion: 0,
  sceneGroups: [{ id: "scene1", title: "カット1", base: null }],
  sections: defaults.map((s, i) => ({
    ...s,
    id: "s" + i,
    sceneGroupId: "scene1",
    images: [],
  })),
  docs: [],
};
const candidateCache = {},
  selectedCandidates = {};
let activePasteSectionId = "";
let dbReady;
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
dbReady = openDB().then(
  (db) =>
    new Promise((resolve) => {
      const req = db.transaction(STORE).objectStore(STORE).get(KEY);
      req.onsuccess = () => {
        if (req.result) state = { ...state, ...req.result };
        if (!state.projectId) state.projectId = id();
        resolve(db);
      };
      req.onerror = () => {
        if (!state.projectId) state.projectId = id();
        resolve(db);
      };
    }),
);
async function saveStateNow() {
  const db = await dbReady,
    tx = db.transaction(STORE, "readwrite"),
    store = tx.objectStore(STORE),
    snapshot = JSON.parse(JSON.stringify(state));
  store.put(snapshot, KEY);
  store.put(
    {
      kind: "saved-project",
      id: state.projectId,
      name: state.projectName || "名称未設定",
      dishName: state.dishName || "",
      updatedAt: new Date().toISOString(),
      data: snapshot,
    },
    "project:" + state.projectId,
  );
  return new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}
let saveTimer;
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      await saveStateNow();
      const el = document.getElementById("savedStatus");
      el.textContent = "保存済み · この端末";
      setTimeout(() => (el.textContent = "この端末に自動保存"), 1800);
      renderLibrary();
    } catch (e) {
      toast("保存できませんでした。バックアップをお使いください。");
    }
  }, 350);
}
async function listSavedProjects() {
  const db = await dbReady;
  return new Promise((resolve) => {
    const req = db.transaction(STORE).objectStore(STORE).getAll();
    req.onsuccess = () =>
      resolve(
        (req.result || [])
          .filter((item) => item?.kind === "saved-project")
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
      );
    req.onerror = () => resolve([]);
  });
}
async function renderLibrary() {
  const list = document.getElementById("libraryList");
  if (!list) return;
  const records = await listSavedProjects(),
    query = (document.getElementById("librarySearch").value || "")
      .trim()
      .toLocaleLowerCase(),
    shown = records.filter((r) =>
      (r.name + " " + r.dishName).toLocaleLowerCase().includes(query),
    );
  document.getElementById("libraryCount").textContent =
    records.length + "件を保存中";
  document.getElementById("libraryEmpty").hidden = shown.length > 0;
  list.innerHTML = shown
    .map(
      (r) =>
        '<article class="library-card"><strong title="' +
        esc(r.name) +
        '">' +
        esc(r.name) +
        "</strong><small>" +
        esc(r.dishName || "料理名未入力") +
        " · 更新 " +
        new Date(r.updatedAt).toLocaleDateString("ja-JP") +
        '</small><div class="library-card-actions"><button class="btn soft" data-open-project="' +
        esc(r.id) +
        '">開く</button><button class="btn" data-copy-project="' +
        esc(r.id) +
        '">複製</button><button class="btn" data-delete-project="' +
        esc(r.id) +
        '">削除</button></div></article>',
    )
    .join("");
  list
    .querySelectorAll("[data-open-project]")
    .forEach(
      (b) => (b.onclick = () => openSavedProject(b.dataset.openProject)),
    );
  list
    .querySelectorAll("[data-copy-project]")
    .forEach(
      (b) => (b.onclick = () => copySavedProject(b.dataset.copyProject)),
    );
  list
    .querySelectorAll("[data-delete-project]")
    .forEach(
      (b) => (b.onclick = () => deleteSavedProject(b.dataset.deleteProject)),
    );
}
async function findSavedProject(projectId) {
  const db = await dbReady;
  return new Promise((resolve) => {
    const req = db
      .transaction(STORE)
      .objectStore(STORE)
      .get("project:" + projectId);
    req.onsuccess = () =>
      resolve(req.result?.kind === "saved-project" ? req.result : null);
    req.onerror = () => resolve(null);
  });
}
// 入力欄とプレビューはそれぞれスクロールするので、両方とも先頭に戻す
function scrollToTop() {
  window.scrollTo({ top: 0, behavior: "smooth" });
  document
    .querySelectorAll(".editor, .preview-wrap")
    .forEach((el) => el.scrollTo({ top: 0, behavior: "smooth" }));
}
async function openSavedProject(projectId) {
  const record = await findSavedProject(projectId);
  if (!record) return;
  await saveStateNow();
  state = JSON.parse(JSON.stringify(record.data));
  await saveStateNow();
  restoreUI();
  renderLibrary();
  scrollToTop();
  toast("保存した資料を開きました");
}
async function copySavedProject(projectId) {
  const record = await findSavedProject(projectId);
  if (!record) return;
  await saveStateNow();
  state = JSON.parse(JSON.stringify(record.data));
  state.projectId = id();
  state.projectName = (state.projectName || "名称未設定") + "（コピー）";
  await saveStateNow();
  restoreUI();
  renderLibrary();
  scrollToTop();
  toast("複製を作成しました。案件名を変更して編集できます");
}
async function deleteSavedProject(projectId) {
  const record = await findSavedProject(projectId);
  if (
    !record ||
    !confirm(
      "「" + (record.name || "名称未設定") + "」をストックから削除しますか？",
    )
  )
    return;
  const db = await dbReady;
  await new Promise((resolve) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete("project:" + projectId);
    tx.oncomplete = resolve;
    tx.onerror = resolve;
  });
  if (state.projectId === projectId) {
    state = makeBlankProject();
    await saveStateNow();
    restoreUI();
  }
  renderLibrary();
  toast("ストックから削除しました");
}
function makeBlankProject() {
  const groupId = id();
  return {
    projectId: id(),
    projectName: "",
    brandName: "",
    shootDate: "",
    dishName: "",
    recipeNotes: "",
    accent: "#507b58",
    headingFontSize: 12,
    baseImageTitle: "ベースイメージ",
    brandLogo: null,
    sectionPresetVersion: 0,
    sceneGroups: [{ id: groupId, title: "カット1", base: null }],
    sections: defaults.map((s) => ({
      ...s,
      id: id(),
      sceneGroupId: groupId,
      images: [],
    })),
    docs: [],
  };
}
function esc(v) {
  return String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}
function toast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2400);
}
function id() {
  return "s" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}
function setField(key, value) {
  state[key] = value;
  document.documentElement.style.setProperty(
    "--accent",
    state.accent || "#507b58",
  );
  persist();
  renderPreview();
}
function fileData(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}
// 動画ファイル本体は state に入れず、IndexedDB の "media:<id>" に Blob のまま保存する。
// state 側の写真データには代表コマ（src）と mediaId / videoUrl だけを持たせる。
async function putMedia(mediaId, blob) {
  const db = await dbReady,
    tx = db.transaction(STORE, "readwrite");
  tx.objectStore(STORE).put({ kind: "media", blob }, "media:" + mediaId);
  return new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}
async function getMedia(mediaId) {
  const db = await dbReady;
  return new Promise((resolve) => {
    const req = db
      .transaction(STORE)
      .objectStore(STORE)
      .get("media:" + mediaId);
    req.onsuccess = () => resolve(req.result?.blob || null);
    req.onerror = () => resolve(null);
  });
}
function videoPlaceholder(label) {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#2b302d"/><circle cx="320" cy="160" r="46" fill="#fff" fill-opacity=".9"/><path d="M305 135v50l42-25z" fill="#2b302d"/><text x="320" y="255" fill="#fff" font-family="sans-serif" font-size="24" text-anchor="middle">' +
    esc(label || "動画") +
    "</text></svg>";
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}
function videoPoster(src, crossOrigin) {
  return new Promise((resolve) => {
    const v = document.createElement("video");
    let finished = false;
    const done = (poster, duration = 0) => {
      if (finished) return;
      finished = true;
      v.removeAttribute("src");
      v.load();
      resolve({ poster, duration });
    };
    v.muted = true;
    v.playsInline = true;
    v.preload = "auto";
    if (crossOrigin) v.crossOrigin = "anonymous";
    v.onloadedmetadata = () => {
      v.currentTime = Math.min(1, (v.duration || 0) / 2);
    };
    v.onseeked = () => {
      try {
        const scale = Math.min(1, 1600 / (v.videoWidth || 1600)),
          c = document.createElement("canvas");
        c.width = Math.round((v.videoWidth || 640) * scale);
        c.height = Math.round((v.videoHeight || 360) * scale);
        c.getContext("2d").drawImage(v, 0, 0, c.width, c.height);
        done(c.toDataURL("image/jpeg", 0.85), v.duration);
      } catch {
        done(null, v.duration);
      }
    };
    v.onerror = () => done(null);
    setTimeout(() => done(null), 15000);
    v.src = src;
  });
}
function youtubeId(url) {
  const m = url.match(
    /(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/))([\w-]{11})/,
  );
  return m ? m[1] : "";
}
function isVideoUrl(parsed) {
  return (
    /(^|\.)(youtube\.com|youtu\.be|vimeo\.com|tiktok\.com)$/i.test(
      parsed.hostname,
    ) ||
    (/(^|\.)instagram\.com$/i.test(parsed.hostname) &&
      /\/(reel|reels|p|tv)\//.test(parsed.pathname)) ||
    /\.(mp4|mov|m4v|webm)(?:$|[?#])/i.test(parsed.href)
  );
}
async function videoFromUrl(url) {
  const yt = youtubeId(url);
  if (yt)
    return {
      src: "https://i.ytimg.com/vi/" + yt + "/hqdefault.jpg",
      fallback: videoPlaceholder("YouTube"),
      source: "YouTube",
    };
  const parsed = new URL(url);
  if (/\.(mp4|mov|m4v|webm)(?:$|[?#])/i.test(parsed.href)) {
    const { poster } = await videoPoster(url, true);
    return {
      src: poster || videoPlaceholder("動画"),
      source: "動画URLから追加",
    };
  }
  const host = parsed.hostname.replace(/^www\./, "");
  return { src: videoPlaceholder(host), source: host };
}
function formatDuration(sec) {
  if (!sec || !isFinite(sec)) return "";
  const s = Math.round(sec);
  return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
}
async function openVideo(im) {
  if (!im) return;
  const yt = im.videoUrl ? youtubeId(im.videoUrl) : "";
  let body;
  if (im.mediaId) {
    const blob = await getMedia(im.mediaId);
    if (!blob)
      return toast("動画ファイルが見つかりません。もう一度追加してください");
    body =
      '<video controls autoplay playsinline src="' +
      URL.createObjectURL(blob) +
      '"></video>';
  } else if (yt) {
    body =
      '<iframe src="https://www.youtube.com/embed/' +
      yt +
      '?autoplay=1" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>';
  } else if (/\.(mp4|mov|m4v|webm)(?:$|[?#])/i.test(im.videoUrl || "")) {
    body =
      '<video controls autoplay playsinline src="' +
      esc(im.videoUrl) +
      '"></video>';
  } else if (im.videoUrl) {
    window.open(im.videoUrl, "_blank", "noopener");
    return;
  } else return;
  const modal = document.createElement("div");
  modal.className = "video-modal";
  modal.innerHTML =
    '<div class="video-modal-inner">' +
    body +
    '<button class="video-modal-close" aria-label="閉じる">×</button></div>';
  const close = () => {
    const v = modal.querySelector("video");
    if (v?.src.startsWith("blob:")) URL.revokeObjectURL(v.src);
    modal.remove();
  };
  modal.onclick = (e) => {
    if (e.target === modal || e.target.closest(".video-modal-close")) close();
  };
  document.body.appendChild(modal);
}
function findImage(imageId) {
  for (const s of state.sections) {
    const im = (s.images || []).find((x) => x.id === imageId);
    if (im) return im;
  }
}
async function addImages(sectionId, files) {
  const section = state.sections.find((s) => s.id === sectionId);
  if (!section) return;
  for (const file of [...files]) {
    if (file.type.startsWith("video/")) {
      toast("動画を読み込んでいます…");
      const mediaId = id(),
        url = URL.createObjectURL(file),
        { poster, duration } = await videoPoster(url);
      URL.revokeObjectURL(url);
      try {
        await putMedia(mediaId, file);
      } catch {
        toast("動画を保存できませんでした（容量不足の可能性があります）");
        continue;
      }
      section.images.push({
        id: id(),
        kind: "video",
        mediaId,
        duration,
        src: poster || videoPlaceholder(file.name),
        title: file.name.replace(/\.[^.]+$/, ""),
        source: "端末から追加（動画）",
      });
      continue;
    }
    if (!file.type.startsWith("image/")) continue;
    const src = await fileData(file);
    section.images.push({
      id: id(),
      src,
      title: file.name.replace(/\.[^.]+$/, ""),
      source: "端末から追加",
    });
  }
  persist();
  renderSections();
  renderPreview();
}
function searchHref(provider, query) {
  const q = encodeURIComponent(query.trim());
  if (provider === "google")
    return "https://www.google.com/search?tbm=isch&q=" + q;
  if (provider === "web") return "https://www.google.com/search?q=" + q;
  if (provider === "pin")
    return "https://www.pinterest.com/search/pins/?q=" + q;
  return "https://stock.adobe.com/search?k=" + q;
}
function referenceSearchQuery(section, provider = "google") {
  const title = section.title || "";
  const map = [
    [
      /雰囲気|全体|イメージ/,
      "料理写真 フードスタイリング 自然光",
      "food photography editorial styling natural light",
    ],
    [
      /料理|盛り付け|料理写真/,
      "料理 盛り付け フードスタイリング",
      "food plating editorial food styling",
    ],
    [
      /器|皿|テーブル/,
      "料理写真 器 テーブルコーディネート",
      "ceramic plate food table setting",
    ],
    [
      /天板|テーブル|卓上/,
      "料理撮影 テーブル 天板 スタイリング",
      "food photography tabletop styling",
    ],
    [
      /カトラリー|フォーク|ナイフ/,
      "カトラリー テーブルコーディネート",
      "cutlery table setting food photography",
    ],
    [
      /クロス|布|ナプキン/,
      "リネン クロス テーブルコーディネート",
      "linen napkin table setting",
    ],
    [
      /小道具|背景|その他/,
      "料理撮影 小道具 背景 スタイリング",
      "food photography props background styling",
    ],
    [
      /食材|調理|工程/,
      "料理 食材 調理工程 写真",
      "food preparation ingredients cooking process photography",
    ],
  ];
  const terms = map.find(([pattern]) => pattern.test(title));
  const manual = (section.query || "").replace(/料理名/g, "").trim();
  const dish = state.dishName.trim();
  const translations = [
    [/パワーサラダ|サラダ/, "salad"],
    [/すき焼き/, "sukiyaki"],
    [/パスタ/, "pasta"],
    [/カレー/, "curry"],
    [/ラーメン/, "ramen"],
    [/うどん/, "udon"],
    [/そば/, "soba"],
    [/餃子/, "dumplings"],
    [/オムライス/, "omelet rice"],
    [/ハンバーグ/, "hamburger steak"],
    [/から揚げ|唐揚げ/, "Japanese fried chicken"],
    [/焼き魚|さんま|さば|サバ/, "grilled fish"],
    [/おにぎり/, "onigiri rice ball"],
    [/パンケーキ/, "pancakes"],
    [/サンドイッチ/, "sandwich"],
  ];
  const enDish =
    translations.find(([pattern]) => pattern.test(dish))?.[1] || "";
  const english = provider === "adobe" || provider === "pin";
  return [
    ...new Set(
      [
        dish,
        english ? enDish : "",
        manual,
        english ? terms?.[2] : terms?.[1],
      ].filter(Boolean),
    ),
  ].join(" ");
}
function searchLinks(section) {
  return [
    ["Google画像", "google"],
    ["Pinterest", "pin"],
    ["Adobe Stock", "adobe"],
    ["Google検索", "web"],
  ]
    .map(
      ([label, p]) =>
        '<a class="search-link" target="_blank" rel="noopener" href="' +
        searchHref(p, referenceSearchQuery(section, p)) +
        '">' +
        label +
        " ↗</a>",
    )
    .join("");
}
function candidateMarkup(s) {
  const results = candidateCache[s.id];
  if (!results) return "";
  const selected = selectedCandidates[s.id] || [];
  if (results.error)
    return '<div class="candidate-status">' + esc(results.error) + "</div>";
  if (results.loading)
    return '<div class="candidate-status">候補写真を検索しています…</div>';
  if (!results.items?.length)
    return '<div class="candidate-status">候補が見つかりませんでした。キーワードを変えるか、上の検索リンクをお試しください。</div>';
  return (
    '<p class="candidate-note">写真をクリックして複数選択できます。これは無料画像データベースの参考候補です。Google画像・Pinterest・Adobe Stockの結果ではありません。素材サイトの検索リンクから、料理名とシーンに合う写真も確認できます。利用前に各画像のライセンス条件を確認してください。</p><div class="candidate-grid">' +
    results.items
      .map(
        (im) =>
          '<button class="candidate-tile ' +
          (selected.includes(im.id) ? "selected" : "") +
          '" data-candidate="' +
          esc(im.id) +
          '" aria-pressed="' +
          selected.includes(im.id) +
          '"><img loading="lazy" src="' +
          esc(im.thumbnail || im.url) +
          '" alt=""><div class="candidate-caption"><b>' +
          esc(im.title || "Untitled image") +
          "</b><small>" +
          esc(im.creator || im.source || "") +
          " · " +
          esc((im.license || "").toUpperCase()) +
          "</small></div></button>",
      )
      .join("") +
    '</div><div class="candidate-actions"><span>' +
    selected.length +
    '枚を選択中</span><button class="btn small primary candidate-add-selected" ' +
    (selected.length ? "" : "disabled") +
    '>選んだ写真を追加</button></div><div class="candidate-source">検索: <a target="_blank" rel="noopener" href="' +
    (candidateCache[s.id]?.provider === "Wikimedia Commons"
      ? "https://commons.wikimedia.org/w/index.php?search="
      : "https://openverse.org/search/image?q=") +
    encodeURIComponent([state.dishName, s.query].filter(Boolean).join(" ")) +
    '">' +
    esc(candidateCache[s.id]?.provider || "Openverse") +
    " ↗</a></div>"
  );
}
function fallbackSearchTerms(section) {
  const title = section.title || "";
  const map = [
    [/雰囲気|全体|イメージ/, "food photography styling"],
    [/料理|盛り付け|料理写真/, "food plating photography"],
    [/器|皿|テーブル/, "table setting ceramic plate"],
    [/天板|テーブル|卓上/, "food photography table setting"],
    [/カトラリー|フォーク|ナイフ/, "cutlery fork spoon"],
    [/クロス|布|ナプキン/, "linen napkin tablecloth"],
    [/小道具|背景|その他/, "food photography props background"],
    [/食材|調理|工程/, "food preparation ingredients"],
  ];
  const english = map.find(([pattern]) => pattern.test(title))?.[1];
  const dish = state.dishName
    ?.replace(/パワーサラダ/g, "power salad")
    .replace(/サラダ/g, "salad")
    .replace(/パスタ/g, "pasta")
    .replace(/カレー/g, "curry")
    .replace(/すき焼き/g, "sukiyaki");
  return [
    ...new Set(
      [
        english,
        [dish, section.query].filter(Boolean).join(" "),
        dish,
        section.query || "",
      ].filter(Boolean),
    ),
  ];
}
async function commonsCandidates(query) {
  const params = new URLSearchParams({
    action: "query",
    generator: "search",
    gsrsearch: "filetype:bitmap " + query,
    gsrnamespace: "6",
    gsrlimit: "20",
    prop: "imageinfo",
    iiprop: "url|extmetadata",
    iiurlwidth: "420",
    format: "json",
    origin: "*",
  });
  const response = await fetch(
    "https://commons.wikimedia.org/w/api.php?" + params.toString(),
    { headers: { Accept: "application/json" } },
  );
  if (!response.ok)
    throw Error("画像検索に接続できません (" + response.status + ")");
  const body = await response.json();
  return Object.values(body.query?.pages || {})
    .map((page) => {
      const info = page.imageinfo?.[0] || {},
        meta = info.extmetadata || {};
      const clean = (value) =>
        String(value?.value || "")
          .replace(/<[^>]*>/g, " ")
          .replace(/&amp;/g, "&")
          .trim();
      const license = clean(meta.LicenseShortName) || "ライセンス要確認";
      return {
        id: "commons-" + page.pageid,
        title: page.title?.replace(/^File:/, ""),
        url: info.thumburl || info.url,
        thumbnail: info.thumburl || info.url,
        creator:
          clean(meta.Artist) || clean(meta.Credit) || "Wikimedia Commons",
        license,
        license_version: clean(meta.LicenseVersion),
        foreign_landing_url: info.descriptionurl,
        license_url: meta.LicenseUrl?.value,
        source: "Wikimedia Commons",
      };
    })
    .filter((item) => item.thumbnail);
}
async function searchCandidates(sectionId) {
  const s = state.sections.find((x) => x.id === sectionId);
  if (!s) return;
  const query = [state.dishName, s.query || s.title]
    .filter(Boolean)
    .join(" ")
    .trim();
  candidateCache[sectionId] = { loading: true, items: [] };
  selectedCandidates[sectionId] = [];
  renderSections();
  let openverseError = "";
  try {
    const url =
      "https://api.openverse.org/v1/images/?q=" +
      encodeURIComponent(query) +
      "&page_size=20&license=cc0,by,by-sa";
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw Error("Openverse (" + response.status + ")");
    const body = await response.json();
    if (body.results?.length) {
      candidateCache[sectionId] = {
        items: body.results,
        provider: "Openverse",
      };
    }
  } catch (error) {
    openverseError = error.message || "Openverseに接続できません";
  }
  if (!candidateCache[sectionId]?.items?.length) {
    try {
      let items = [];
      for (const term of fallbackSearchTerms(s)) {
        const found = await commonsCandidates(term);
        const known = new Set(items.map((item) => item.id));
        items.push(...found.filter((item) => !known.has(item.id)));
        if (items.length >= 20) break;
      }
      candidateCache[sectionId] = items.length
        ? { items: items.slice(0, 20), provider: "Wikimedia Commons" }
        : {
            error:
              "候補が見つかりませんでした。シーンのキーワードを短くするか、検索リンクをお試しください。",
            items: [],
          };
    } catch (error) {
      candidateCache[sectionId] = {
        error:
          "画像検索につながりませんでした。検索リンクをお試しください。 (" +
          (error.message || openverseError) +
          ")",
        items: [],
      };
    }
  }
  renderSections();
}
function imageRowSelect(section, image) {
  const current = Number(image.layoutRow) || 0,
    max = Math.max(
      3,
      ...(section.images || []).map((item) => Number(item.layoutRow) || 1),
    );
  return (
    '<label class="image-row-label">段 <select class="image-row" data-image-row="' +
    esc(image.id) +
    '"><option value="0" ' +
    (current === 0 ? "selected" : "") +
    ">自動</option>" +
    Array.from({ length: max + 1 }, (_, i) => i + 1)
      .map(
        (row) =>
          '<option value="' +
          row +
          '" ' +
          (current === row ? "selected" : "") +
          ">" +
          row +
          "段目</option>",
      )
      .join("") +
    "</select></label>"
  );
}
function sectionMarkup(s, idx) {
  return (
    '<div class="section-editor' +
    (s.collapsed ? " is-collapsed" : "") +
    '" data-id="' +
    esc(s.id) +
    '"><div class="section-top"><input class="section-title" data-key="title" value="' +
    esc(s.title) +
    '" aria-label="項目名（クリックして編集）" title="項目名を直接編集できます"><button class="iconbtn rename-section" aria-label="項目名を編集" title="項目名を編集（クリックすると文字を選択）">✎</button><div class="section-actions"><button class="iconbtn section-fold" aria-expanded="' +
    String(!s.collapsed) +
    '" title="' +
    (s.collapsed ? "開く" : "折りたたむ") +
    '">' +
    (s.collapsed ? "›" : "⌄") +
    '</button><button class="iconbtn move-up" title="上へ">↑</button><button class="iconbtn move-down" title="下へ">↓</button><button class="iconbtn delete-section" title="削除">×</button></div></div><div class="section-inner"><input class="input section-query" data-key="query" value="' +
    esc(s.query || "") +
    '" placeholder="検索キーワード（任意）" style="font-size:10px;padding:7px 8px;margin-bottom:8px"><div class="searches">' +
    searchLinks(s) +
    '</div><button class="btn small soft candidate-search">無料画像の参考候補を表示</button><div class="candidate-browser">' +
    candidateMarkup(s) +
    '</div><div class="image-list">' +
    s.images
      .map(
        (im, imageIndex) =>
          '<div class="image-item" data-image="' +
          esc(im.id) +
          '"><div class="image-thumb' +
          (im.kind === "video" ? " is-video" : "") +
          '"><img src="' +
          esc(im.src) +
          '" alt="">' +
          (im.kind === "video"
            ? '<button type="button" class="video-play" title="動画を再生">▶</button>'
            : "") +
          '</div><div class="image-meta"><input data-image-key="title" value="' +
          esc(
            ["コピーした参考画像", "コピーした画像"].includes(im.title)
              ? ""
              : im.title || "",
          ) +
          '" placeholder="写真の説明"><input data-image-key="source" value="' +
          esc(im.source === "クリップボードから追加" ? "" : im.source || "") +
          '" placeholder="出典・作者・ライセンス">' +
          imageRowSelect(s, im) +
          '</div><div class="image-controls"><button class="iconbtn move-image-up" aria-label="写真を上へ" title="写真を上へ" ' +
          (imageIndex === 0 ? "disabled" : "") +
          '>↑</button><button class="iconbtn move-image-down" aria-label="写真を下へ" title="写真を下へ" ' +
          (imageIndex === s.images.length - 1 ? "disabled" : "") +
          '>↓</button><button class="iconbtn delete-image" title="写真を削除">×</button></div></div>',
      )
      .join("") +
    '</div><div class="url-row"><input class="input image-url" placeholder="画像・動画のURL（YouTube等も可）"><button class="btn small add-url">URL追加</button><label class="btn small file-add">写真・動画を選ぶ<input type="file" accept="image/*,video/*" multiple></label></div><button type="button" class="paste-images" aria-label="コピーした画像を貼り付け">検索先で画像をコピーしたら、ここをクリックして ⌘V<br>候補として追加し、不要なものは × で外せます</button></div></div>'
  );
}
function cutBaseMarkup(g) {
  return (
    '<div class="cut-base"><div class="cut-base-label">' +
    esc(state.baseImageTitle || "ベースイメージ") +
    "</div>" +
    (g.base
      ? '<div class="base-preview" style="display:block"><img src="' +
        esc(g.base) +
        '" alt="ベース写真"><button class="remove cut-base-remove" type="button" data-base-group="' +
        esc(g.id) +
        '" title="写真を削除">×</button></div>'
      : '<div class="drop" data-base-group="' +
        esc(g.id) +
        '"><input class="cut-base-input" type="file" accept="image/*" data-base-group="' +
        esc(g.id) +
        '"><div><strong>ベース写真をドロップ、またはクリックして選択</strong><span>このカットのページに大きく配置します</span></div></div>') +
    "</div>"
  );
}
function renderSections() {
  const root = document.getElementById("sections");
  root.innerHTML =
    (state.sceneGroups || [])
      .map(
        (g, gi) =>
          '<div class="scene-group' +
          (g.collapsed ? " is-collapsed" : "") +
          '" data-group-id="' +
          esc(g.id) +
          '"><div class="scene-group-head"><span class="step">' +
          (gi + 1) +
          '</span><input class="scene-group-title" data-group-title="' +
          esc(g.id) +
          '" value="' +
          esc(g.title || "カット" + (gi + 1)) +
          '" aria-label="カット名" placeholder="カット名（例：カット1 寄り）"><button class="scene-toggle" type="button" aria-expanded="' +
          String(!g.collapsed) +
          '" title="' +
          (g.collapsed ? "開く" : "折りたたむ") +
          '">' +
          (g.collapsed ? "›" : "⌄") +
          '</button><button class="iconbtn delete-scene-group" type="button" title="カットを削除">×</button></div><div class="scene-group-body">' +
          cutBaseMarkup(g) +
          state.sections
            .filter(
              (sec) => (sec.sceneGroupId || state.sceneGroups[0]?.id) === g.id,
            )
            .map(sectionMarkup)
            .join("") +
          '<button class="scene-group-add" type="button" data-add-section="' +
          esc(g.id) +
          '">＋ カテゴリを追加</button></div></div>',
      )
      .join("") +
    '<button class="add-scene-group" id="addSceneGroup" type="button">＋ カットを追加</button>';
  root.querySelectorAll(".scene-group-title").forEach((el) =>
    el.addEventListener("input", () => {
      const g = state.sceneGroups.find((x) => x.id === el.dataset.groupTitle);
      if (g) {
        g.title = el.value;
        persist();
        renderPreview();
      }
    }),
  );
  root.querySelectorAll(".scene-toggle").forEach(
    (el) =>
      (el.onclick = () => {
        const group = el.closest(".scene-group"),
          collapsed = group.classList.toggle("is-collapsed"),
          g = state.sceneGroups.find((x) => x.id === group.dataset.groupId);
        if (g) {
          g.collapsed = collapsed;
          persist();
        }
        el.textContent = collapsed ? "›" : "⌄";
        el.setAttribute("aria-expanded", String(!collapsed));
        el.title = collapsed ? "開く" : "折りたたむ";
      }),
  );
  root.querySelectorAll(".delete-scene-group").forEach(
    (el) =>
      (el.onclick = () => {
        const gid = el.closest(".scene-group").dataset.groupId;
        if (state.sceneGroups.length <= 1) {
          toast("最後のカットは削除できません");
          return;
        }
        const g = state.sceneGroups.find((x) => x.id === gid);
        if (!confirm("「" + (g?.title || "このカット") + "」を削除しますか？"))
          return;
        state.sceneGroups = state.sceneGroups.filter((g) => g.id !== gid);
        state.sections = state.sections.filter(
          (sec) => sec.sceneGroupId !== gid,
        );
        persist();
        renderSections();
        renderPreview();
      }),
  );
  root.querySelectorAll(".scene-group-add").forEach(
    (el) =>
      (el.onclick = () => {
        state.sections.push({
          id: id(),
          sceneGroupId: el.closest(".scene-group").dataset.groupId,
          title: "新しいシーン",
          query: state.dishName || "",
          images: [],
          collapsed: true,
        });
        persist();
        renderSections();
        renderPreview();
      }),
  );
  document.getElementById("addSceneGroup").onclick = () => {
    const gid = id();
    state.sceneGroups.push({
      id: gid,
      title: "カット" + (state.sceneGroups.length + 1),
      base: null,
    });
    defaults.forEach((d) =>
        state.sections.push({
          ...d,
          id: id(),
          sceneGroupId: gid,
          images: [],
          collapsed: true,
        }),
      );
    persist();
    renderSections();
    renderPreview();
  };
  root.querySelectorAll(".rename-section").forEach(
    (el) =>
      (el.onclick = () => {
        const input = el
          .closest(".section-editor")
          .querySelector(".section-title");
        input.focus();
        input.select();
      }),
  );
  root.querySelectorAll(".section-title,.section-query").forEach((el) =>
    el.addEventListener("input", () => {
      const section = state.sections.find(
        (s) => s.id === el.closest(".section-editor").dataset.id,
      );
      if (el.dataset.key === "title" && !section.categoryKey)
        section.categoryKey =
          {
            天板: "tabletop",
            全体の雰囲気: "ambience",
            お皿: "plate",
            カトラリー: "cutlery",
            クロス: "cloth",
            その他小道具: "props",
          }[section.title] || "";
      section[el.dataset.key] = el.value;
      persist();
      const links = el.closest(".section-editor").querySelector(".searches");
      if (links) links.innerHTML = searchLinks(section);
      renderPreview();
    }),
  );
  root.querySelectorAll(".section-fold").forEach(
    (el) =>
      (el.onclick = () => {
        const box = el.closest(".section-editor"),
          collapsed = box.classList.toggle("is-collapsed"),
          section = state.sections.find((s) => s.id === box.dataset.id);
        if (section) {
          section.collapsed = collapsed;
          persist();
        }
        el.textContent = collapsed ? "›" : "⌄";
        el.setAttribute("aria-expanded", String(!collapsed));
        el.title = collapsed ? "開く" : "折りたたむ";
      }),
  );
  root.querySelectorAll(".delete-section").forEach(
    (el) =>
      (el.onclick = () => {
        state.sections = state.sections.filter(
          (s) => s.id !== el.closest(".section-editor").dataset.id,
        );
        persist();
        renderSections();
        renderPreview();
      }),
  );
  root.querySelectorAll(".move-up,.move-down").forEach(
    (el) =>
      (el.onclick = () => {
        const node = el.closest(".section-editor"),
          i = state.sections.findIndex((s) => s.id === node.dataset.id),
          j = i + (el.classList.contains("move-up") ? -1 : 1);
        if (
          j < 0 ||
          j >= state.sections.length ||
          state.sections[j].sceneGroupId !== state.sections[i].sceneGroupId
        )
          return;
        [state.sections[i], state.sections[j]] = [
          state.sections[j],
          state.sections[i],
        ];
        persist();
        renderSections();
        renderPreview();
      }),
  );
  root
    .querySelectorAll(".video-play")
    .forEach(
      (el) =>
        (el.onclick = () =>
          openVideo(findImage(el.closest(".image-item").dataset.image))),
    );
  root.querySelectorAll(".delete-image").forEach(
    (el) =>
      (el.onclick = () => {
        const node = el.closest(".section-editor"),
          im = el.closest(".image-item");
        const s = state.sections.find((x) => x.id === node.dataset.id);
        s.images = s.images.filter((x) => x.id !== im.dataset.image);
        persist();
        renderSections();
        renderPreview();
      }),
  );
  root.querySelectorAll(".image-row").forEach(
    (el) =>
      (el.onchange = () => {
        const node = el.closest(".section-editor"),
          section = state.sections.find((x) => x.id === node.dataset.id);
        if (el.value === "0") {
          section.layoutMode = "auto";
          section.images.forEach((image) => delete image.layoutRow);
        } else {
          const grid = [...document.querySelectorAll(".board-grid")].find(
            (item) => item.dataset.sectionId === section.id,
          );
          if (section.layoutMode !== "manual") {
            for (const card of grid
              ? grid.querySelectorAll(".board-card")
              : []) {
              const photo = section.images.find(
                (image) => image.id === card.dataset.imageId,
              );
              if (photo) photo.layoutRow = Number(card.dataset.layoutRow) || 1;
            }
          }
          section.layoutMode = "manual";
          const image = section.images.find(
            (item) => item.id === el.dataset.imageRow,
          );
          if (!image) return;
          image.layoutRow = Number(el.value) || 1;
        }
        persist();
        renderSections();
        renderPreview();
      }),
  );
  root.querySelectorAll(".move-image-up,.move-image-down").forEach(
    (el) =>
      (el.onclick = () => {
        const node = el.closest(".section-editor"),
          item = el.closest(".image-item"),
          section = state.sections.find((x) => x.id === node.dataset.id),
          i = section.images.findIndex((x) => x.id === item.dataset.image),
          j = i + (el.classList.contains("move-image-up") ? -1 : 1);
        if (j < 0 || j >= section.images.length) return;
        [section.images[i], section.images[j]] = [
          section.images[j],
          section.images[i],
        ];
        persist();
        renderSections();
        renderPreview();
      }),
  );
  root
    .querySelectorAll(".candidate-search")
    .forEach(
      (el) =>
        (el.onclick = () =>
          searchCandidates(el.closest(".section-editor").dataset.id)),
    );
  root.querySelectorAll(".candidate-tile").forEach(
    (el) =>
      (el.onclick = () => {
        const sid = el.closest(".section-editor").dataset.id,
          selected = selectedCandidates[sid] || [],
          cid = el.dataset.candidate;
        selectedCandidates[sid] = selected.includes(cid)
          ? selected.filter((x) => x !== cid)
          : [...selected, cid];
        renderSections();
      }),
  );
  root.querySelectorAll(".candidate-add-selected").forEach(
    (el) =>
      (el.onclick = () => {
        const sid = el.closest(".section-editor").dataset.id,
          s = state.sections.find((x) => x.id === sid),
          ids = selectedCandidates[sid] || [],
          items = (candidateCache[sid]?.items || []).filter((im) =>
            ids.includes(im.id),
          );
        items.forEach((im) =>
          s.images.push({
            id: id(),
            src: im.url || im.thumbnail,
            fallback: im.thumbnail,
            title: im.title || "参考イメージ",
            source: [
              im.creator,
              im.license?.toUpperCase() +
                (im.license_version ? " " + im.license_version : ""),
            ]
              .filter(Boolean)
              .join(" · "),
            sourceUrl: im.foreign_landing_url,
            licenseUrl: im.license_url,
            provider: im.source,
          }),
        );
        selectedCandidates[sid] = [];
        persist();
        renderSections();
        renderPreview();
        toast(items.length + "枚を追加しました");
      }),
  );
  root.querySelectorAll(".image-meta input").forEach((el) =>
    el.addEventListener("input", () => {
      const item = el.closest(".image-item"),
        sec = el.closest(".section-editor"),
        s = state.sections.find((x) => x.id === sec.dataset.id),
        im = s.images.find((x) => x.id === item.dataset.image);
      im[el.dataset.imageKey] = el.value;
      persist();
      renderPreview();
    }),
  );
  root.querySelectorAll(".cut-base-input").forEach(
    (el) =>
      (el.onchange = () => {
        if (el.files[0]) setBase(el.dataset.baseGroup, el.files[0]);
      }),
  );
  root.querySelectorAll(".cut-base-remove").forEach(
    (el) =>
      (el.onclick = () => {
        const g = state.sceneGroups.find((x) => x.id === el.dataset.baseGroup);
        if (!g) return;
        g.base = null;
        persist();
        renderSections();
        renderPreview();
      }),
  );
  root
    .querySelectorAll(".file-add input")
    .forEach(
      (el) =>
        (el.onchange = () =>
          addImages(el.closest(".section-editor").dataset.id, el.files)),
    );
  root.querySelectorAll(".paste-images").forEach(
    (el) =>
      (el.onclick = () => {
        activePasteSectionId = el.closest(".section-editor").dataset.id;
        el.focus();
        toast("画像をコピーしたら ⌘V で候補に追加できます");
      }),
  );
  root.querySelectorAll(".add-url").forEach(
    (el) =>
      (el.onclick = async () => {
        const box = el.closest(".url-row"),
          field = box.querySelector(".image-url"),
          url = field.value.trim(),
          s = state.sections.find(
            (x) => x.id === el.closest(".section-editor").dataset.id,
          );
        if (!url) return;
        try {
          const parsed = new URL(url),
            providerPage =
              /(^|\.)pinterest\.com$|(^|\.)google\.com$|(^|\.)stock\.adobe\.com$/i.test(
                parsed.hostname,
              ),
            isImage = /\.(png|jpe?g|webp|gif|avif)(?:$|[?#])/i.test(
              parsed.href,
            );
          if (providerPage && !isImage) {
            toast(
              "検索結果や作品ページのURLです。写真をコピーして⌘Vするか、写真を保存して追加してください",
            );
            return;
          }
          if (!/^https?:$/.test(parsed.protocol)) throw Error();
          if (isVideoUrl(parsed)) {
            const video = await videoFromUrl(url);
            s.images.push({
              id: id(),
              kind: "video",
              videoUrl: url,
              title: "参考動画",
              ...video,
            });
            field.value = "";
            persist();
            renderSections();
            renderPreview();
            return;
          }
          s.images.push({
            id: id(),
            src: url,
            title: "画像候補",
            source: "画像URLから追加",
          });
          field.value = "";
          persist();
          renderSections();
          renderPreview();
        } catch {
          toast("有効な画像・動画のURLを入力してください");
        }
      }),
  );
  root.querySelectorAll(".drop").forEach((box) => {
    box.ondragover = (e) => {
      e.preventDefault();
      box.classList.add("drag");
    };
    box.ondragleave = () => box.classList.remove("drag");
    box.ondrop = (e) => {
      e.preventDefault();
      box.classList.remove("drag");
      const files = [...e.dataTransfer.files];
      if (box.dataset.baseGroup) {
        const f = files.find((x) => x.type.startsWith("image/"));
        if (f) setBase(box.dataset.baseGroup, f);
      } else {
        const id = box.closest(".section-editor")?.dataset.id;
        if (id) addImages(id, files);
      }
    };
  });
}
function pagesForSection(s) {
  const all = s.images || [];
  if (!all.length) return [];
  // 段を手動で指定しているときは、段の途中でページが切れないよう段ごとにまとめて送る
  if (s.layoutMode === "manual") {
    // 段が未指定の写真は、プレビューと同じく最後の段に入れる
    const lastRow = Math.max(1, ...all.map((im) => Number(im.layoutRow) || 1)),
      rowOf = (im) => Number(im.layoutRow) || lastRow,
      rowIds = [...new Set(all.map(rowOf))].sort((x, y) => x - y),
      chunks = [];
    let imgs = [],
      offset = 0;
    const flush = () => {
      chunks.push({ s, imgs, start: offset, continued: chunks.length > 0 });
      offset += imgs.length;
      imgs = [];
    };
    for (const rowId of rowIds) {
      const row = all.filter((im) => rowOf(im) === rowId);
      if (imgs.length && imgs.length + row.length > 9) flush();
      imgs = imgs.concat(row);
    }
    if (imgs.length) flush();
    return chunks;
  }
  const pageCount = Math.ceil(all.length / 9),
    base = Math.floor(all.length / pageCount),
    extra = all.length % pageCount,
    chunks = [];
  let offset = 0;
  for (let i = 0; i < pageCount; i++) {
    const size = base + (i < extra ? 1 : 0);
    chunks.push({
      s,
      imgs: all.slice(offset, offset + size),
      start: offset,
      continued: i > 0,
    });
    offset += size;
  }
  return chunks;
}
function caption(im) {
  return (
    "<figcaption>" +
    esc(im.title || "参考イメージ") +
    (im.source ? " · " + esc(im.source) : "") +
    "</figcaption>"
  );
}
function imageCard(im, number) {
  const fallback = im.fallback
    ? ' data-fallback="' +
      esc(im.fallback) +
      '" onerror="if(this.dataset.fallback){this.src=this.dataset.fallback;this.dataset.fallback=\'\'}"'
    : "";
  const sourceLink = im.sourceUrl
    ? '<a href="' +
      esc(im.sourceUrl) +
      '" target="_blank" rel="noopener">出典 ↗</a>'
    : "";
  const isVideo = im.kind === "video",
    videoLink =
      isVideo && im.videoUrl
        ? '<a href="' +
          esc(im.videoUrl) +
          '" target="_blank" rel="noopener">動画を見る ↗</a>'
        : "";
  const title =
    im.title && !["コピーした参考画像", "コピーした画像"].includes(im.title)
      ? im.title
      : "";
  const source =
    im.source && im.source !== "クリップボードから追加" ? im.source : "";
  const caption =
    title || source || sourceLink || videoLink
      ? "<figcaption>" +
        (title ? esc(title) : "") +
        (source ? " · " + esc(source) : "") +
        (sourceLink ? " · " + sourceLink : "") +
        (videoLink ? " · " + videoLink : "") +
        "</figcaption>"
      : "";
  return (
    '<figure class="board-card' +
    (isVideo ? " is-video" : "") +
    '" data-image-id="' +
    esc(im.id) +
    '" data-layout-row="' +
    (Number(im.layoutRow) || "") +
    '"><span class="board-photo-number">' +
    String(number).padStart(2, "0") +
    '</span><img src="' +
    esc(im.src) +
    '"' +
    fallback +
    ' alt="' +
    esc(title) +
    '" onload="refreshMosaics()">' +
    (isVideo
      ? '<button type="button" class="video-badge" title="動画を再生">▶' +
        (formatDuration(im.duration)
          ? "<span>" + formatDuration(im.duration) + "</span>"
          : "") +
        "</button>"
      : "") +
    caption +
    "</figure>"
  );
}

function migrateSections() {
  if (state.sectionPresetVersion >= 2) return false;
  const aliases = {
    "天板・テーブル": "天板",
    "お皿・器": "お皿",
    "器・テーブル": "お皿",
    "料理・盛り付け": "全体の雰囲気",
    "食材・調理工程": "全体の雰囲気",
    "小道具・背景": "その他小道具",
  };
  const byTitle = new Map();
  for (const sec of state.sections || []) {
    const title = aliases[sec.title] || sec.title;
    let target = byTitle.get(title);
    if (!target) {
      target = { ...sec, title, images: [...(sec.images || [])] };
      byTitle.set(title, target);
    } else target.images.push(...(sec.images || []));
  }
  const migrated = [...byTitle.values()];
  const required = [...defaults];
  for (const d of required) {
    if (!migrated.some((x) => x.title === d.title))
      migrated.push({ ...d, id: id(), images: [] });
  }
  const rank = new Map(required.map((x, i) => [x.title, i]));
  migrated.sort(
    (a, b) => (rank.get(a.title) ?? 999) - (rank.get(b.title) ?? 999),
  );
  state.sections = migrated;
  state.sectionPresetVersion = 2;
  return true;
}
// シーンセット（sceneGroups）＝撮影カット。旧データの共通ベース写真（state.base）は1カット目へ移す。
function ensureSceneGroups() {
  let changed = false;
  if (!Array.isArray(state.sceneGroups) || !state.sceneGroups.length) {
    state.sceneGroups = [{ id: "scene1", title: "カット1", base: null }];
    changed = true;
  }
  if ("base" in state) {
    if (state.base && !state.sceneGroups[0].base)
      state.sceneGroups[0].base = state.base;
    delete state.base;
    changed = true;
  }
  state.sceneGroups.forEach((g, i) => {
    if (!g.title || g.title === "シーン別の参考写真") {
      g.title = "カット" + (i + 1);
      changed = true;
    }
  });
  const first = state.sceneGroups[0].id;
  for (const sec of state.sections || [])
    if (!sec.sceneGroupId) {
      sec.sceneGroupId = first;
      changed = true;
    }
  return changed;
}
function layoutMosaicGrid(grid) {
  if (!grid) return;
  const cards =
    grid._mosaicCards ||
    (grid._mosaicCards = [...grid.querySelectorAll(".board-card")]);
  if (!cards.length) return;
  const ratios = cards.map((card) => {
      const im = card.querySelector("img"),
        r =
          im?.naturalWidth && im?.naturalHeight
            ? im.naturalWidth / im.naturalHeight
            : 1.2;
      return Math.max(0.3, Math.min(3.5, r));
    }),
    section = state.sections.find((s) => s.id === grid.dataset.sectionId),
    portraits = ratios.filter((r) => r < 0.9).length,
    portraitHeavy = portraits >= Math.ceil(cards.length / 2),
    maxCols = portraitHeavy ? 4 : 3;
  grid.classList.toggle("portrait-layout", portraitHeavy);
  let rows = [];
  if (section?.layoutMode === "manual") {
    let maxRow = Math.max(
        1,
        ...section.images.map((im) => Number(im.layoutRow) || 1),
      ),
      changed = false;
    for (const card of cards) {
      const image = section.images.find((im) => im.id === card.dataset.imageId);
      if (!image) continue;
      if (!Number(image.layoutRow)) {
        image.layoutRow = maxRow;
        changed = true;
      }
      card.dataset.layoutRow = String(image.layoutRow);
    }
    const rowIds = [
      ...new Set(cards.map((card) => Number(card.dataset.layoutRow) || 1)),
    ].sort((x, y) => x - y);
    rows = rowIds.map((rowId) =>
      cards.filter((card) => (Number(card.dataset.layoutRow) || 1) === rowId),
    );
    if (changed) persist();
  } else {
    let i = 0;
    while (i < cards.length) {
      const remaining = cards.length - i;
      let size = Math.min(maxCols, remaining);
      if (remaining - size === 1 && size > 2) size -= 1;
      rows.push(cards.slice(i, i + size));
      i += size;
    }
    rows.forEach((row, index) =>
      row.forEach((card) => (card.dataset.layoutRow = String(index + 1))),
    );
  }
  const rowSizes = rows.map((row) => row.length);
  grid.querySelectorAll(".mosaic-row").forEach((row) => row.remove());
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex],
      rowEl = document.createElement("div");
    rowEl.className = "mosaic-row";
    rowEl.dataset.row = String(rowIndex + 1);
    // 写真の縦横比をそのまま使い、上下左右を切らずに並べる
    const rowCards = row,
      rowRatios = rowCards.map((card) => ratios[cards.indexOf(card)]);
    rowCards.forEach((card) => rowEl.appendChild(card));
    const width = Math.max(1, grid.clientWidth - 7 * (rowCards.length - 1)),
      total = rowRatios.reduce((x, y) => x + y, 0),
      // 各段の下にキャプション（約16px）が付く分を引いて、枠の高さいっぱいまで使う
      available = Math.max(
        90,
        (grid.clientHeight || 480) - 7 * (rows.length - 1) - 16 * rows.length,
      ),
      maxHeight = Math.max(94, available / rows.length),
      height = Math.min(width / total, maxHeight);
    rowCards.forEach((card, i) => {
      card.style.width = rowRatios[i] * height + "px";
      card.style.height = "auto";
      const img = card.querySelector("img");
      if (img) img.style.height = height + "px";
      const editor = [...document.querySelectorAll(".section-editor")].find(
          (node) => node.dataset.id === grid.dataset.sectionId,
        ),
        item =
          editor &&
          [...editor.querySelectorAll(".image-item")].find(
            (node) => node.dataset.image === card.dataset.imageId,
          ),
        select = item?.querySelector(".image-row");
      if (select && document.activeElement !== select)
        select.value = String(card.dataset.layoutRow || rowIndex + 1);
    });
    grid.appendChild(rowEl);
  }
  grid.dataset.layoutColumns = String(maxCols);
}
function imageGrid(images, start = 1, sectionId = "") {
  if (!images.length) return "";
  return (
    '<div class="board-grid" data-section-id="' +
    esc(sectionId) +
    '">' +
    images.map((im, i) => imageCard(im, start + i)).join("") +
    "</div>"
  );
}
function refreshMosaics() {
  document.querySelectorAll(".board-grid").forEach(layoutMosaicGrid);
}
if (!window.__mosaicResizeBound) {
  window.__mosaicResizeBound = true;
  window.addEventListener("resize", () =>
    requestAnimationFrame(refreshMosaics),
  );
  window.addEventListener("beforeprint", refreshMosaics);
}
function renderPreview() {
  document.documentElement.style.setProperty(
    "--accent",
    state.accent || "#507b58",
  );
  document.documentElement.style.setProperty(
    "--section-heading-size",
    (Number(state.headingFontSize) || 12) + "pt",
  );
  const root = document.getElementById("preview"),
    pages = [];
  const groups = state.sceneGroups || [
    { id: "scene1", title: "カット1", base: null },
  ];
  const hasAny =
    groups.some((g) => g.base) ||
    state.projectName ||
    state.dishName ||
    state.sections.some((s) => (s.images || []).length);
  if (!hasAny) {
    root.innerHTML =
      '<div class="empty-state"><div><strong>資料のプレビューがここに表示されます</strong><p>案件名を入力し、カットごとにベース写真や参考写真を追加してください。<br>写真を入れるとページが自動で組み上がります。</p></div></div>';
    document.getElementById("pageCount").textContent =
      "入力すると自動更新されます";
    return;
  }
  const kindOf = (sec) =>
      ({
        天板: "tabletop",
        全体の雰囲気: "ambience",
        お皿: "plate",
        カトラリー: "cutlery",
        クロス: "cloth",
        その他小道具: "props",
      })[sec.title] ||
      sec.categoryKey ||
      "";
  pages.push({ type: "cover" });
  function packSections(sections, tabletop, cut) {
    let blocks = [];
    for (const sec of sections) {
      if (sec === tabletop) continue;
      const chunks = pagesForSection(sec);
      if (!chunks.length) {
        blocks.push({
          s: sec,
          imgs: [],
          start: 0,
          continued: false,
          weight: 3,
        });
        continue;
      }
      for (const chunk of chunks) {
        const weight = Math.min(9, Math.ceil(chunk.imgs.length / 3) * 3);
        blocks.push({
          s: sec,
          imgs: chunk.imgs,
          start: chunk.start,
          continued: chunk.continued,
          weight,
        });
      }
    }
    let batch = [],
      weight = 0;
    for (const block of blocks) {
      if (batch.length && weight + block.weight > 9) {
        pages.push({ type: "packed", cut, blocks: batch });
        batch = [];
        weight = 0;
      }
      batch.push(block);
      weight += block.weight;
    }
    if (batch.length) pages.push({ type: "packed", cut, blocks: batch });
  }
  groups.forEach((g) => {
    const sections = state.sections.filter(
        (sec) => (sec.sceneGroupId || groups[0].id) === g.id,
      ),
      tabletop = sections.find((sec) => kindOf(sec) === "tabletop"),
      tableChunks = tabletop ? pagesForSection(tabletop) : [];
    pages.push({
      type: "base",
      cut: g,
      table: tabletop
        ? { s: tabletop, imgs: tableChunks[0]?.imgs || [], start: 0 }
        : null,
    });
    tableChunks.slice(1).forEach((chunk) =>
      pages.push({
        type: "packed",
        cut: g,
        blocks: [
          {
            s: chunk.s,
            imgs: chunk.imgs,
            start: chunk.start,
            continued: true,
            weight: 9,
          },
        ],
      }),
    );
    packSections(sections, tabletop, g);
  });
  const sheetHead = (cut) =>
    '<div class="sheet-head">' +
    esc(
      [state.dishName || state.projectName || "美術資料", cut?.title]
        .filter(Boolean)
        .join(" ｜ "),
    ) +
    "</div>";
  root.innerHTML = pages
    .map((p, i) => {
      let content = "";
      if (p.type === "cover") {
        content =
          '<div class="cover-body"><div class="cover-title"><div class="cover-brand">' +
          (typeof state.brandLogo === "string" &&
          /^data:image\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/]+={0,2}$/i.test(
            state.brandLogo,
          )
            ? '<img class="cover-brand-logo" src="' +
              esc(state.brandLogo) +
              '" onerror="this.nextElementSibling.hidden=false;this.remove()"><span hidden>' +
              esc(state.brandName || "") +
              "</span>"
            : esc(state.brandName || "")) +
          "</div><h1>" +
          esc(state.projectName || "案件名") +
          "</h1>" +
          (state.dishName
            ? '<div class="cover-subtitle">' + esc(state.dishName) + "</div>"
            : "") +
          '</div><div class="cover-rule"></div><div class="cover-details"><span>美術資料</span>' +
          (state.shootDate
            ? "<span>撮影日 " +
              esc(state.shootDate.replaceAll("-", ".")) +
              "</span>"
            : "") +
          "</div></div>";
      } else if (p.type === "base") {
        content =
          sheetHead(p.cut) +
          '<div class="base-page-body"><div class="kicker">【' +
          esc(state.baseImageTitle || "ベースイメージ") +
          "】</div>" +
          (p.cut.base
            ? '<img class="base-photo" src="' + esc(p.cut.base) + '">'
            : '<div class="empty-hero">ベース写真を追加してください</div>') +
          (p.table
            ? '<div class="base-table-title">【' +
              esc(p.table.s.title) +
              "】</div>" +
              imageGrid(p.table.imgs, 1, p.table.s.id)
            : "") +
          "</div>";
      } else {
        content =
          sheetHead(p.cut) +
          '<div class="sheet-content"><div class="packed-sections">' +
          p.blocks
            .map(
              (block) =>
                '<section class="packed-category" style="flex:' +
                block.weight +
                '"><div class="kicker">【' +
                esc(block.s.title) +
                (block.continued ? "・続き" : "") +
                "】</div>" +
                (block.imgs.length
                  ? imageGrid(block.imgs, block.start + 1, block.s.id)
                  : '<div class="category-empty">参考写真を追加できます</div>') +
                "</section>",
            )
            .join("") +
          "</div></div>";
      }
      return (
        '<article class="sheet" style="--accent:' +
        esc(state.accent || "#507b58") +
        '">' +
        content +
        '<div class="board-page-number"><span>' +
        esc(state.projectName || "美術資料") +
        "</span><span>" +
        String(i + 1).padStart(2, "0") +
        " " +
        String(pages.length).padStart(2, "0") +
        "</span></div></article>"
      );
    })
    .join("");
  document.getElementById("pageCount").textContent = pages.length + "ページ";
  requestAnimationFrame(refreshMosaics);
}
async function setBase(groupId, file) {
  const g = state.sceneGroups.find((x) => x.id === groupId);
  if (!g) return;
  g.base = await fileData(file);
  persist();
  renderSections();
  renderPreview();
}
function renderDocs() {
  document.getElementById("docList").innerHTML = state.docs
    .map(
      (d) =>
        '<div class="image-item"><div style="width:58px;height:48px;display:grid;place-items:center;background:#f0f3f0;border-radius:5px;font-size:10px;color:#607164">' +
        esc((d.name.split(".").pop() || "FILE").toUpperCase()) +
        '</div><div class="image-meta"><input value="' +
        esc(d.name) +
        '" readonly><input value="' +
        esc(d.size) +
        '" readonly></div><button class="iconbtn" data-doc="' +
        esc(d.id) +
        '">×</button></div>',
    )
    .join("");
  document.querySelectorAll("[data-doc]").forEach(
    (b) =>
      (b.onclick = () => {
        state.docs = state.docs.filter((d) => d.id !== b.dataset.doc);
        persist();
        renderDocs();
      }),
  );
}
function setupCollapsiblePanels() {
  document.querySelectorAll(".editor .panel").forEach((panel) => {
    const n = Number(panel.querySelector(".step")?.textContent);
    if (![1, 2, 3].includes(n)) return;
    const head = panel.querySelector(".panel-head");
    if (!head || head.dataset.foldReady) return;
    head.dataset.foldReady = "1";
    head.setAttribute("role", "button");
    head.setAttribute("tabindex", "0");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "panel-toggle";
    btn.textContent = "⌄";
    btn.setAttribute("aria-expanded", "true");
    btn.setAttribute("aria-label", "折りたたむ");
    head.append(btn);
    const toggle = () => {
      const folded = panel.classList.toggle("is-collapsed");
      btn.textContent = folded ? "›" : "⌄";
      btn.setAttribute("aria-expanded", String(!folded));
      btn.setAttribute("aria-label", folded ? "開く" : "折りたたむ");
    };
    head.addEventListener("click", (e) => {
      if (!e.target.closest("button")) toggle();
    });
    btn.onclick = (e) => {
      e.stopPropagation();
      toggle();
    };
  });
}
async function restoreUI() {
  await dbReady;
  if (migrateSections() | ensureSceneGroups()) persist();
  for (const k of [
    "projectName",
    "brandName",
    "shootDate",
    "dishName",
    "recipeNotes",
  ])
    document.getElementById(k).value = state[k] || "";
  state.headingFontSize = Number(state.headingFontSize) || 12;
  state.baseImageTitle = state.baseImageTitle || "ベースイメージ";
  document.getElementById("headingFontSize").value = state.headingFontSize;
  document.getElementById("headingFontSizeValue").textContent =
    state.headingFontSize + " pt";
  document.getElementById("baseHeading").value = state.baseImageTitle;
  document.documentElement.style.setProperty(
    "--accent",
    state.accent || "#507b58",
  );
  document
    .querySelectorAll(".color-opt")
    .forEach((b) =>
      b.classList.toggle("active", b.dataset.color === state.accent),
    );
  const lp = document.getElementById("brandLogoPreview"),
    removeLogo = document.getElementById("removeBrandLogo");
  if (
    typeof state.brandLogo === "string" &&
    /^data:image\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/]+={0,2}$/i.test(
      state.brandLogo,
    )
  ) {
    lp.src = state.brandLogo;
    lp.style.display = "block";
    removeLogo.style.display = "inline-block";
  } else {
    lp.removeAttribute("src");
    lp.style.display = "none";
    removeLogo.style.display = "none";
  }
  renderSections();
  setupCollapsiblePanels();
  renderPreview();
}
let activePasteTarget = "";
document.querySelector(".paste-brand-logo").onclick = () => {
  activePasteTarget = "brandLogo";
  toast("ロゴ画像をコピーして⌘Vで貼り付けてください");
};
document.getElementById("brandLogoInput").onchange = async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  state.brandLogo = await fileData(f);
  updateBrandLogo();
  persist();
  renderPreview();
  e.target.value = "";
};
function updateBrandLogo() {
  const img = document.getElementById("brandLogoPreview"),
    remove = document.getElementById("removeBrandLogo");
  if (
    typeof state.brandLogo === "string" &&
    /^data:image\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/]+={0,2}$/i.test(
      state.brandLogo,
    )
  ) {
    img.src = state.brandLogo;
    img.style.display = "block";
    remove.style.display = "inline-block";
  } else {
    img.removeAttribute("src");
    img.style.display = "none";
    remove.style.display = "none";
  }
}
document.getElementById("removeBrandLogo").onclick = () => {
  state.brandLogo = null;
  updateBrandLogo();
  persist();
  renderPreview();
};
document.addEventListener("paste", async (e) => {
  const focus = e.target,
    logoTarget =
      activePasteTarget === "brandLogo" ||
      focus?.closest?.(".paste-brand-logo");
  if (logoTarget) {
    const file = [...(e.clipboardData?.items || [])]
      .find((item) => item.kind === "file" && item.type.startsWith("image/"))
      ?.getAsFile();
    if (file) {
      e.preventDefault();
      state.brandLogo = await fileData(file);
      activePasteTarget = "";
      updateBrandLogo();
      persist();
      renderPreview();
      toast("ブランドロゴを追加しました");
    }
    return;
  }
  const pasteBox = focus?.closest?.(".paste-images");
  if (focus?.closest?.("input,textarea,select") && !pasteBox) return;
  const sid =
    pasteBox?.closest(".section-editor")?.dataset.id || activePasteSectionId;
  if (!sid) return;
  const section = state.sections.find((s) => s.id === sid);
  if (!section) return;
  const files = [...(e.clipboardData?.items || [])]
      .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter(Boolean),
    urls = [],
    html = e.clipboardData?.getData("text/html") || "";
  if (html && !files.length) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    doc.querySelectorAll("img[src]").forEach((img) => {
      try {
        const u = new URL(img.getAttribute("src"), location.href).href,
          anchor = img.closest("a[href]"),
          sourceUrl = anchor
            ? new URL(anchor.getAttribute("href"), location.href).href
            : "";
        if (/^https?:/.test(u))
          urls.push({ src: u, title: img.alt || "コピーした画像", sourceUrl });
      } catch {}
    });
  }
  const plain = (e.clipboardData?.getData("text/plain") || "").trim();
  if (
    !files.length &&
    !urls.length &&
    /^https?:\/\//i.test(plain) &&
    /\.(png|jpe?g|webp|gif)(?:[?#].*)?$/i.test(plain)
  )
    urls.push({ src: plain, title: "コピーした画像" });
  if (!files.length && !urls.length) {
    if (/^https?:\/\//i.test(plain)) {
      e.preventDefault();
      toast(
        "ページURLでは画像を表示できません。画像ファイルのURLを使ってください",
      );
    }
    return;
  }
  e.preventDefault();
  for (const file of files) {
    const src = await fileData(file);
    section.images.push({ id: id(), src, title: "", source: "" });
  }
  for (const item of urls) {
    if (!section.images.some((im) => im.src === item.src))
      section.images.push({
        id: id(),
        src: item.src,
        title: "",
        source: "",
        sourceUrl: item.sourceUrl || "",
      });
  }
  activePasteSectionId = "";
  persist();
  renderSections();
  renderPreview();
  toast(files.length + urls.length + "枚を候補に追加しました");
});
document
  .querySelectorAll("#projectName,#brandName,#shootDate,#dishName,#recipeNotes")
  .forEach((el) =>
    el.addEventListener("input", () => setField(el.id, el.value)),
  );
document.getElementById("baseHeading").oninput = (e) => {
  setField("baseImageTitle", e.target.value);
  document
    .querySelectorAll(".cut-base-label")
    .forEach((el) => (el.textContent = e.target.value || "ベースイメージ"));
};
document.getElementById("headingFontSize").oninput = (e) => {
  state.headingFontSize = Number(e.target.value);
  document.getElementById("headingFontSizeValue").textContent =
    state.headingFontSize + " pt";
  persist();
  renderPreview();
};
document.getElementById("colorRow").onclick = (e) => {
  const b = e.target.closest(".color-opt");
  if (!b) return;
  state.accent = b.dataset.color;
  document
    .querySelectorAll(".color-opt")
    .forEach((x) => x.classList.toggle("active", x === b));
  persist();
  renderPreview();
};
document.getElementById("printBtn").onclick = () => {
  if (!state.projectName.trim()) toast("先に案件名を入力してください");
  setTimeout(() => window.print(), 100);
};
document.getElementById("backupBtn").onclick = async () => {
  // 動画ファイルは state の外にあるので、データURLにしてバックアップに同梱する
  const media = {};
  for (const s of state.sections)
    for (const im of s.images || [])
      if (im.mediaId && !media[im.mediaId]) {
        const file = await getMedia(im.mediaId);
        if (file) media[im.mediaId] = await fileData(file);
      }
  const blob = new Blob([JSON.stringify({ ...state, media })], {
      type: "application/json",
    }),
    a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download =
    (state.projectName || "美術資料").replace(/[\\/:*?"<>|]/g, "_") +
    "_backup.json";
  a.click();
  URL.revokeObjectURL(a.href);
  toast("バックアップを保存しました");
};
document.getElementById("restoreBtn").onclick = () =>
  document.getElementById("restoreFile").click();
document.getElementById("restoreFile").onchange = async (e) => {
  try {
    const obj = JSON.parse(await e.target.files[0].text());
    if (!obj || !Array.isArray(obj.sections)) throw Error();
    for (const [mediaId, dataUrl] of Object.entries(obj.media || {}))
      await putMedia(mediaId, await (await fetch(dataUrl)).blob());
    delete obj.media;
    state = { ...state, ...obj };
    persist();
    restoreUI();
    toast("バックアップを読み込みました");
  } catch {
    toast("バックアップファイルを読み込めませんでした");
  }
  e.target.value = "";
};
document.getElementById("resetBtn").onclick = async () => {
  await saveStateNow();
  state = makeBlankProject();
  Object.keys(candidateCache).forEach((k) => delete candidateCache[k]);
  Object.keys(selectedCandidates).forEach((k) => delete selectedCandidates[k]);
  await saveStateNow();
  restoreUI();
  renderLibrary();
  scrollToTop();
  toast("新しい案件を作成しました。前の資料はストックに保存されています");
};
document
  .getElementById("librarySearch")
  .addEventListener("input", renderLibrary);
document.getElementById("libraryToggle").onclick = () => {
  const library = document.getElementById("library"),
    folded = library.classList.toggle("is-collapsed");
  document.getElementById("libraryToggle").textContent = folded
    ? "開く"
    : "折りたたむ";
};
document.getElementById("preview").addEventListener("click", (e) => {
  const badge = e.target.closest(".video-badge");
  if (badge) openVideo(findImage(badge.closest(".board-card").dataset.imageId));
});
dbReady.then(async () => {
  await saveStateNow();
  restoreUI();
  renderLibrary();
});
