// ========== GitHub API Config ==========
const REPO_OWNER = "Laurens1234";
const REPO_NAME = "Arcs-Leader-Generator";
const BRANCH = "main";
const LEADERS_PATH = "results";
const LORE_PATH = "results/lore";

const RAW_BASE = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${BRANCH}`;

// ======= Beyond the Reach ========
// Names of leaders to show when the "beyond" tab is active
const BEYOND_NAMES = [
  "God's Hand",
  "Firebrand",
  "Scavenger",
  "Diplomat",
  "Imperator",
  "Ancient Wraith",
  "Poet",
  "Brainbox",
  "Brain Box"
];
const BEYOND_SET = new Set(BEYOND_NAMES.map(n => normalizeName(n)));

function normalizeName(n) {
  if (!n) return "";
  // normalize curly quotes, lowercase, remove punctuation, collapse spaces
  let s = String(n).toLowerCase();
  s = s.replace(/[’‘]/g, "'");
  // replace all non-alphanumeric characters (except spaces) with nothing
  s = s.replace(/[^a-z0-9\s]/g, "");
  // collapse multiple spaces
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

// ========== URL Sync ==========
function setUrlTab(tab) {
  try {
    // Use pathname + search to avoid embedding auth/origin specifics
    const path = window.location.pathname || "/";
    const hash = window.location.hash || "";
    const search = `?tab=${encodeURIComponent(tab)}`;
    history.replaceState(null, "", `${path}${search}${hash}`);
  } catch (e) {
    // ignore URL errors
  }
}

function getUrlTab() {
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get("tab");
  } catch (e) {
    return null;
  }
}

function getUrlCardName() {
  try {
    const hash = (window.location.hash || "").replace(/^#/, "");
    if (!hash) return null;
    const params = new URLSearchParams(hash);
    const name = params.get("card");
    return name ? name : null;
  } catch (e) {
    return null;
  }
}

let suppressHashHandler = false;

function setUrlCardName(cardName) {
  try {
    const path = window.location.pathname || "/";
    const search = window.location.search || "";

    const hash = (window.location.hash || "").replace(/^#/, "");
    const params = new URLSearchParams(hash);
    if (cardName) params.set("card", String(cardName));
    else params.delete("card");

    const nextHash = params.toString();
    suppressHashHandler = true;
    history.replaceState(null, "", `${path}${search}${nextHash ? "#" + nextHash : ""}`);
  } catch (e) {
    // ignore URL errors
  } finally {
    // Let the browser dispatch hashchange first if it will.
    setTimeout(() => {
      suppressHashHandler = false;
    }, 0);
  }
}

function clearUrlCardName() {
  setUrlCardName("");
}

// ========== DOM ==========
const el = {
  status: document.getElementById("status"),
  cardGrid: document.getElementById("cardGrid"),
  query: document.getElementById("query"),
  searchModeSelect: document.getElementById("searchModeSelect"),
  tabs: document.querySelectorAll(".tab"),
  sortSelect: document.getElementById("sortSelect"),
  resourceSelect: document.getElementById("resourceSelect"),
  setupSelect: document.getElementById("setupSelect"),
  themeToggle: document.getElementById("themeToggle"),
  lightbox: document.getElementById("lightbox"),
  lightboxImg: document.getElementById("lightboxImg"),
  lightboxTitle: document.getElementById("lightboxTitle"),
  lightboxMeta: document.getElementById("lightboxMeta"),
  lightboxAbilities: document.getElementById("lightboxAbilities"),
  lightboxBackdrop: document.querySelector(".lightbox-backdrop"),
  historyBtn: document.getElementById("historyBtn"),
  historyModal: document.getElementById("historyModal"),
  historyModalBackdrop: document.querySelector(".history-modal-backdrop"),
  historyModalContent: document.querySelector(".history-modal-content"),
  historyModalClose: document.getElementById("historyModalClose"),
  historyModalTitle: document.getElementById("historyModalTitle"),
  historyModalStatus: document.getElementById("historyModalStatus"),
  historyModalGrid: document.getElementById("historyModalGrid"),
};

// ========== State ==========
let allCards = [];
let activeTab = "leaders";
let selectMode = false;
let selectedCards = new Set(); // stores card imageUrl as unique key
let currentLightboxCard = null;

// Lightbox History state
let historyLoadedForPath = null;
const commitHistoryCache = new Map(); // path -> commits[]
const commitHistoryInFlight = new Map(); // cacheKey -> Promise
let lightboxSwapToken = 0;

// Sorting: last changed
const lastChangedMsByPath = new Map(); // path -> number|null (ms since epoch)
const lastChangedInFlightByPath = new Map(); // path -> Promise<number|null>
let lastChangedPrefetchToken = 0;

async function fetchLastChangedMsForPath(path) {
  if (!path) return null;
  if (lastChangedMsByPath.has(path)) return lastChangedMsByPath.get(path);
  if (lastChangedInFlightByPath.has(path)) return lastChangedInFlightByPath.get(path);

  const p = (async () => {
    try {
      // Prefer a HEAD request to the raw URL (no GitHub API rate limit).
      try {
        const headUrl = rawUrlForRef(BRANCH, path);
        const res = await fetch(headUrl, { method: "HEAD" });
        if (res && res.ok) {
          const lastMod = res.headers.get("last-modified");
          const headMs = lastMod ? Date.parse(lastMod) : null;
          if (Number.isFinite(headMs)) {
            lastChangedMsByPath.set(path, headMs);
            return headMs;
          }
        }
      } catch (e) {
        // Fall back to commits API below.
      }

      // Fallback: latest commit date for that file.
      const commits = await fetchGitHubCommitHistory(path, 1);
      const c = Array.isArray(commits) && commits.length ? commits[0] : null;
      const iso = c?.commit?.author?.date || c?.commit?.committer?.date;
      const apiMs = iso ? Date.parse(iso) : null;
      lastChangedMsByPath.set(path, Number.isFinite(apiMs) ? apiMs : null);
      return lastChangedMsByPath.get(path);
    } catch (e) {
      // Cache as unknown to avoid hammering the API.
      lastChangedMsByPath.set(path, null);
      return null;
    }
  })();

  lastChangedInFlightByPath.set(path, p);
  try {
    return await p;
  } finally {
    lastChangedInFlightByPath.delete(path);
  }
}

function prefetchLastChangedDatesForCards(cards) {
  if (!Array.isArray(cards) || cards.length === 0) return;
  const token = ++lastChangedPrefetchToken;

  const paths = [];
  const seen = new Set();
  for (const c of cards) {
    const p = getGithubFilePathForCard(c);
    if (!p || seen.has(p)) continue;
    seen.add(p);
    if (!lastChangedMsByPath.has(p)) paths.push(p);
  }
  if (paths.length === 0) return;

  const total = paths.length;
  let done = 0;
  if (el.status) el.status.textContent = `Loading change dates… (0/${total})`;

  const concurrency = 6;
  let index = 0;

  const worker = async () => {
    while (true) {
      const i = index++;
      if (i >= paths.length) return;
      await fetchLastChangedMsForPath(paths[i]);
      done++;

      if (token === lastChangedPrefetchToken && el.status) {
        if (done === total || done % 12 === 0) {
          el.status.textContent = `Loading change dates… (${done}/${total})`;
        }
      }
    }
  };

  (async () => {
    try {
      await Promise.all(Array.from({ length: Math.min(concurrency, total) }, () => worker()));
    } finally {
      if (token !== lastChangedPrefetchToken) return;
      if (el.status && String(el.status.textContent || "").startsWith("Loading change dates")) {
        el.status.textContent = "";
      }
      const sortMode = getLeaderSortMode();
      const isLeaderTab = activeTab === "leaders" || activeTab === "beyond";
      if (isLeaderTab && sortMode === "lastChanged") {
        render();
      }
    }
  })();
}

let leaderOrderByName = new Map(); // key: normalizeName(leaderName) -> number (1-based)
let leaderAbilityCharsByName = new Map(); // key: normalizeName(leaderName) -> number (chars in ability names + text)
let leaderAbilityTextByName = new Map(); // key: normalizeName(leaderName) -> string (combined abilities text)
let leaderResourcesByName = new Map(); // key: normalizeName(leaderName) -> Set<string>
let leaderResourceListByName = new Map(); // key: normalizeName(leaderName) -> string[] (ordered)
let leaderHasTwoSameResourceByName = new Map(); // key: normalizeName(leaderName) -> boolean
let leaderSetupFootprintByName = new Map(); // key: normalizeName(leaderName) -> string (e.g. "3-3-2|CS-")
let leaderMetadataLoaded = false;

// ========== Theme ==========
function initTheme() {
  const saved = localStorage.getItem("arcs-theme");
  if (saved) document.documentElement.dataset.theme = saved;
}

function toggleTheme() {
  const current = document.documentElement.dataset.theme || "dark";
  const next = current === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  localStorage.setItem("arcs-theme", next);
}

// ========== Data Loading ==========
async function fetchGitHubDir(path) {
  const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}?ref=${BRANCH}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GitHub API error ${res.status} for ${path}`);
  return res.json();
}

function encodePath(path) {
  return String(path)
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
}

function getGithubFilePathForCard(card) {
  if (!card) return "";
  if (card.githubPath) return String(card.githubPath);
  if (card.type === "Lore") return `${LORE_PATH}/${card.filename}`;
  return `${LEADERS_PATH}/${card.filename}`;
}

function rawUrlForRef(ref, path) {
  return `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${ref}/${encodePath(path)}`;
}

function githubRawUrlForRef(ref, path) {
  return `https://github.com/${REPO_OWNER}/${REPO_NAME}/raw/${ref}/${encodePath(path)}`;
}

function jsDelivrUrlForRef(ref, path) {
  // jsDelivr supports GitHub repos by commit/tag/branch.
  return `https://cdn.jsdelivr.net/gh/${REPO_OWNER}/${REPO_NAME}@${ref}/${encodePath(path)}`;
}

function getHistoricalImageCandidateUrls(ref, path) {
  // Try a few equivalent CDNs/hosts to reduce the chance of user-side blocking.
  return [
    rawUrlForRef(ref, path),
    githubRawUrlForRef(ref, path),
    jsDelivrUrlForRef(ref, path),
  ];
}

async function fetchGitHubCommitHistory(path, perPage = 12) {
  if (!path) return [];
  const cacheKey = `${path}|${perPage}`;
  if (commitHistoryCache.has(cacheKey)) return commitHistoryCache.get(cacheKey);

  if (commitHistoryInFlight.has(cacheKey)) return commitHistoryInFlight.get(cacheKey);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/commits?sha=${encodeURIComponent(
    BRANCH
  )}&path=${encodeURIComponent(path)}&per_page=${encodeURIComponent(perPage)}`;

  const p = (async () => {
    let res;
    try {
      res = await fetch(url, {
        signal: controller.signal,
        headers: {
          Accept: "application/vnd.github+json",
        },
      });
    } catch (e) {
      if (controller.signal.aborted) {
        throw new Error("GitHub request timed out; try again.");
      }
      throw e;
    } finally {
      clearTimeout(timeoutId);
    }

    if (!res.ok) {
      let extra = "";
      try {
        const remaining = res.headers.get("x-ratelimit-remaining");
        if (res.status === 403 && remaining === "0") {
          extra = " (GitHub rate limit reached; try again later)";
        }
      } catch (e) {
        // ignore
      }
      throw new Error(`GitHub commits API error ${res.status} for ${path}${extra}`);
    }

    const commits = await res.json();
    const list = Array.isArray(commits) ? commits : [];
    commitHistoryCache.set(cacheKey, list);
    return list;
  })();

  commitHistoryInFlight.set(cacheKey, p);
  try {
    return await p;
  } finally {
    commitHistoryInFlight.delete(cacheKey);
  }
}

async function fetchGitHubCommitHistoryAll(path) {
  if (!path) return [];
  const cacheKey = `${path}|all`;
  if (commitHistoryCache.has(cacheKey)) return commitHistoryCache.get(cacheKey);

  if (commitHistoryInFlight.has(cacheKey)) return commitHistoryInFlight.get(cacheKey);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20000);

  const p = (async () => {
    const all = [];
    const perPage = 100;
    const maxPages = 10; // safety cap (1000 commits)

    try {
      for (let page = 1; page <= maxPages; page++) {
        const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/commits?sha=${encodeURIComponent(
          BRANCH
        )}&path=${encodeURIComponent(path)}&per_page=${perPage}&page=${page}`;

        const res = await fetch(url, {
          signal: controller.signal,
          headers: {
            Accept: "application/vnd.github+json",
          },
        });

        if (!res.ok) {
          let extra = "";
          try {
            const remaining = res.headers.get("x-ratelimit-remaining");
            if (res.status === 403 && remaining === "0") {
              extra = " (GitHub rate limit reached; try again later)";
            }
          } catch (e) {
            // ignore
          }
          throw new Error(`GitHub commits API error ${res.status} for ${path}${extra}`);
        }

        const pageCommits = await res.json();
        const list = Array.isArray(pageCommits) ? pageCommits : [];
        if (list.length === 0) break;
        all.push(...list);
        if (list.length < perPage) break;
      }
    } catch (e) {
      if (controller.signal.aborted) {
        throw new Error("GitHub request timed out; try again.");
      }
      throw e;
    } finally {
      clearTimeout(timeoutId);
    }

    commitHistoryCache.set(cacheKey, all);
    return all;
  })();

  commitHistoryInFlight.set(cacheKey, p);
  try {
    return await p;
  } finally {
    commitHistoryInFlight.delete(cacheKey);
  }
}

function resetHistoryUi() {
  historyLoadedForPath = null;
  if (el.historyBtn) el.historyBtn.setAttribute("aria-expanded", "false");
  if (el.historyModal) {
    el.historyModal.classList.add("hidden");
    el.historyModal.setAttribute("aria-hidden", "true");
  }
  if (el.historyModalStatus) el.historyModalStatus.textContent = "";
  if (el.historyModalGrid) el.historyModalGrid.innerHTML = "";
}

function setHistoryUiVisible(visible) {
  if (!el.historyModal || !el.historyBtn) return;
  el.historyModal.classList.toggle("hidden", !visible);
  el.historyModal.setAttribute("aria-hidden", visible ? "false" : "true");
  el.historyBtn.setAttribute("aria-expanded", visible ? "true" : "false");
  document.body.style.overflow = visible ? "hidden" : (el.lightbox && !el.lightbox.classList.contains("hidden") ? "hidden" : "");
}

function formatCommitCaption(commitObj) {
  const iso = commitObj?.commit?.author?.date || commitObj?.commit?.committer?.date;
  if (!iso) return "";
  // Keep it compact and consistent across locales.
  return new Date(iso).toISOString().slice(0, 10);
}

function selectHistoryItem(btn) {
  if (!el.historyModalGrid) return;
  for (const child of el.historyModalGrid.querySelectorAll(".history-item.selected")) {
    child.classList.remove("selected");
  }
  if (btn) btn.classList.add("selected");
}

function swapLightboxImage(nextUrl, opts = {}) {
  if (!el.lightboxImg) return;

  const {
    statusText = "",
    onErrorFallbackUrl = null,
    onErrorMessage = "",
  } = opts;

  if (el.historyModalStatus && statusText) el.historyModalStatus.textContent = statusText;

  const img = el.lightboxImg;
  const prevOnLoad = img.onload;
  const prevOnError = img.onerror;

  img.onload = () => {
    if (el.historyModalStatus && statusText) el.historyModalStatus.textContent = "";
    img.onload = prevOnLoad;
    img.onerror = prevOnError;
    if (typeof prevOnLoad === "function") prevOnLoad();
  };

  img.onerror = () => {
    if (el.historyModalStatus) {
      el.historyModalStatus.textContent = onErrorMessage || "Could not load that version.";
    }
    img.onload = prevOnLoad;
    img.onerror = prevOnError;
    if (onErrorFallbackUrl) {
      // Avoid leaving a broken URL stuck in the lightbox.
      img.src = onErrorFallbackUrl;
    }
    if (typeof prevOnError === "function") prevOnError();
  };

  // Assigning the same URL twice can re-trigger requests in some browsers.
  if (img.src === nextUrl) return;
  img.src = nextUrl;
}

function swapLightboxImageWithFallback(urls, opts = {}) {
  if (!el.lightboxImg) return;
  const img = el.lightboxImg;

  const token = ++lightboxSwapToken;
  const {
    statusText = "",
    onErrorFallbackUrl = null,
    onErrorMessage = "Could not load that version.",
  } = opts;

  let index = 0;
  let lastTried = "";

  const prevOnLoad = img.onload;
  const prevOnError = img.onerror;

  function cleanup() {
    img.onload = prevOnLoad;
    img.onerror = prevOnError;
  }

  function tryNext() {
    if (token !== lightboxSwapToken) return;

    if (!Array.isArray(urls) || index >= urls.length) {
      if (el.historyModalStatus) {
        el.historyModalStatus.textContent = `${onErrorMessage}${lastTried ? " Tried: " + lastTried : ""}`;
      }
      cleanup();
      if (onErrorFallbackUrl) img.src = onErrorFallbackUrl;
      return;
    }

    const nextUrl = urls[index++];
    lastTried = nextUrl;

    if (el.historyModalStatus && statusText) {
      el.historyModalStatus.textContent = statusText;
    }

    img.onload = () => {
      if (token !== lightboxSwapToken) return;
      if (el.historyModalStatus && statusText) el.historyModalStatus.textContent = "";
      cleanup();
      if (typeof prevOnLoad === "function") prevOnLoad();
    };

    img.onerror = () => {
      if (token !== lightboxSwapToken) return;
      tryNext();
    };

    img.src = nextUrl;
  }

  tryNext();
}

function setImgSrcWithFallback(imgEl, urls) {
  if (!imgEl) return;
  if (!Array.isArray(urls) || urls.length === 0) return;

  let index = 0;
  function tryNext() {
    if (index >= urls.length) return;
    const next = urls[index++];
    imgEl.src = next;
  }

  imgEl.addEventListener(
    "error",
    () => {
      tryNext();
    },
    { once: false }
  );

  tryNext();
}

async function showHistoryForCurrentCard() {
  const card = currentLightboxCard;
  if (!card || !el.historyModalGrid || !el.historyModalStatus) return;

  const path = getGithubFilePathForCard(card);
  setHistoryUiVisible(true);

  if (el.historyModalTitle) el.historyModalTitle.textContent = `Previous Versions: ${card.name}`;

  if (el.historyBtn) el.historyBtn.disabled = true;
  try {
    // If we've already loaded this card's history, just keep it open.
    if (historyLoadedForPath === path && el.historyModalGrid.childElementCount > 0) return;

    el.historyModalStatus.textContent = "Loading versions…";
    el.historyModalGrid.innerHTML = "";

    let commits = [];
    try {
      commits = await fetchGitHubCommitHistoryAll(path);
    } catch (e) {
      el.historyModalStatus.textContent = `Could not load previous versions: ${e.message}`;
      return;
    }

    historyLoadedForPath = path;

    // Current version
    const currentBtn = document.createElement("button");
    currentBtn.type = "button";
    currentBtn.className = "history-item selected";
    currentBtn.addEventListener("click", () => {
      swapLightboxImage(card.imageUrl, { statusText: "" });
      selectHistoryItem(currentBtn);
    });
    const curImg = document.createElement("img");
    curImg.className = `history-thumb ${card.type === "Lore" ? "lore" : "leader"}`;
    curImg.loading = "lazy";
    curImg.alt = `${card.name} (current)`;
    curImg.src = card.imageUrl;
    const curCap = document.createElement("div");
    curCap.className = "history-caption";
    const currentDate = commits.length ? formatCommitCaption(commits[0]) : "";
    curCap.textContent = currentDate ? `Current — ${currentDate}` : "Current";
    currentBtn.appendChild(curImg);
    currentBtn.appendChild(curCap);
    el.historyModalGrid.appendChild(currentBtn);

    if (!commits.length) {
      el.historyModalStatus.textContent = "No older versions found.";
      return;
    }

    el.historyModalStatus.textContent = `${commits.length} version(s)`;

    for (const c of commits) {
      const sha = c?.sha;
      if (!sha) continue;
      const candidates = getHistoricalImageCandidateUrls(sha, path);
      const previewUrl = candidates[0];

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "history-item";
      btn.addEventListener("click", () => {
        swapLightboxImageWithFallback(candidates, {
          statusText: `Loading ${card.name} @ ${sha.slice(0, 7)}…`,
          onErrorFallbackUrl: card.imageUrl,
          onErrorMessage: `Could not load ${card.name} @ ${sha.slice(0, 7)}.`,
        });
        selectHistoryItem(btn);
      });

      const img = document.createElement("img");
      img.className = `history-thumb ${card.type === "Lore" ? "lore" : "leader"}`;
      img.loading = "lazy";
      img.alt = `${card.name} (${sha.slice(0, 7)})`;
      // Use fallback hosts for thumbnail too; prevents endless 404 spam.
      setImgSrcWithFallback(img, candidates);

      // If the first candidate works, great; if it doesn't, error handler will advance.
      // Ensure we start at a deterministic URL to avoid any browser prefetch oddities.
      if (!img.src) img.src = previewUrl;

      const cap = document.createElement("div");
      cap.className = "history-caption";
      const caption = formatCommitCaption(c);
      cap.textContent = caption;

      btn.appendChild(img);
      btn.appendChild(cap);
      el.historyModalGrid.appendChild(btn);
    }
  } finally {
    if (el.historyBtn) el.historyBtn.disabled = false;
  }
}

function nameFromFile(filename, type) {
  // "Alchemist_Card.png" → "Alchemist"
  // "Ancient Prophecy_Lore_Card.png" → "Ancient Prophecy"
  let name = filename.replace(/\.png$/i, "");
  if (type === "Lore") {
    name = name.replace(/_Lore_Card$/i, "");
  } else {
    name = name.replace(/_Card$/i, "");
  }
  return name.replace(/_/g, " ");
}

async function loadCards() {
  el.status.textContent = "Loading cards from GitHub…";

  try {
    // Load leader ordering metadata in the background; don't block image list.
    loadLeaderMetadata().then(() => {
      // Counts for the resource dropdown also depend on this metadata.
      if (activeTab !== "leaders" && activeTab !== "beyond") return;
      if (!el.lightbox.classList.contains("hidden") && currentLightboxCard) {
        updateLightboxDetails(currentLightboxCard);
      }
      render();
    });

    const [leaderFiles, loreFiles] = await Promise.all([
      fetchGitHubDir(LEADERS_PATH),
      fetchGitHubDir(LORE_PATH),
    ]);

    const leaders = leaderFiles
      .filter((f) => f.type === "file" && f.name.toLowerCase().endsWith(".png"))
      .map((f) => ({
        name: nameFromFile(f.name, "Leader"),
        type: "Leader",
        filename: f.name,
        githubPath: `${LEADERS_PATH}/${f.name}`,
        imageUrl: `${RAW_BASE}/${LEADERS_PATH}/${encodeURIComponent(f.name)}`,
      }));

    const lore = loreFiles
      .filter((f) => f.type === "file" && f.name.toLowerCase().endsWith(".png"))
      .map((f) => ({
        name: nameFromFile(f.name, "Lore"),
        type: "Lore",
        filename: f.name,
        githubPath: `${LORE_PATH}/${f.name}`,
        imageUrl: `${RAW_BASE}/${LORE_PATH}/${encodeURIComponent(f.name)}`,
      }));

    allCards = [...leaders, ...lore].sort((a, b) => a.name.localeCompare(b.name));

    el.status.textContent = "";
    render();

    // If the URL has a card hash, open it (and switch to a sensible tab).
    const cardFromUrl = getUrlCardName();
    if (cardFromUrl) {
      const target = allCards.find((c) => normalizeName(c.name) === normalizeName(cardFromUrl));
      if (target) {
        if (target.type === "Leader") {
          activeTab = BEYOND_SET.has(normalizeName(target.name)) ? "beyond" : "leaders";
        } else if (target.type === "Lore") {
          activeTab = "lore";
        }
        el.tabs.forEach((t) => t.classList.toggle("active", t.dataset.tab === activeTab));
        setUrlTab(activeTab);
        updateSortControlVisibility();
        render();
        openLightbox(target);
      }
    }
  } catch (err) {
    el.status.textContent = `Error loading cards: ${err.message}`;
    el.status.classList.add("error");
    console.error(err);
  }
}

async function loadLeaderOrderMap() {
  // Deprecated: kept for backwards compatibility; metadata is loaded via loadLeaderMetadata().
  await loadLeaderMetadata();
}

function decodeBackslashEscapes(s) {
  // Decode only the escapes we expect to see in this generated file.
  // Leave any unknown escapes as-is.
  return String(s)
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\r/g, "\r")
    .replace(/\\\"/g, '"')
    .replace(/\\\\/g, "\\");
}

function stripMarkdownForCharCount(s) {
  return String(s)
    // Remove markdown markers commonly used in ability text.
    .replace(/\*\*|\*/g, "")
    // Collapse whitespace to approximate visible character count.
    .replace(/\s+/g, " ")
    .trim();
}

function extractDoubleQuotedStrings(source) {
  // Extracts the contents of all double-quoted string literals in `source`.
  // Handles escaped quotes/backslashes, and allows literal newlines.
  const strings = [];
  let i = 0;
  while (i < source.length) {
    if (source[i] !== '"') {
      i++;
      continue;
    }
    i++; // skip opening quote
    let buf = "";
    while (i < source.length) {
      const ch = source[i];
      if (ch === "\\") {
        // Keep escape sequences intact for later decode.
        if (i + 1 < source.length) {
          buf += ch + source[i + 1];
          i += 2;
          continue;
        }
        buf += ch;
        i++;
        continue;
      }
      if (ch === '"') {
        i++; // closing quote
        break;
      }
      buf += ch;
      i++;
    }
    strings.push(decodeBackslashEscapes(buf));
  }
  return strings;
}

function findMatchingParen(text, openParenIndex) {
  // Finds the matching ')' for the '(' at openParenIndex, skipping parentheses inside strings.
  let depth = 0;
  let inString = false;
  for (let i = openParenIndex; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (ch === "\\") {
        i++; // skip escaped char
        continue;
      }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "(") {
      depth++;
      continue;
    }
    if (ch === ")") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function computeAbilityCharCount(abilitiesCombinedText) {
  const text = String(abilitiesCombinedText || "");
  // Ability headers look like: *Blitzing.* (italic name + dot)
  const headerRe = /(?:^|\n)\s*\*([^*]+?)\.\*\s*/g;
  const matches = [];
  let m;
  while ((m = headerRe.exec(text))) {
    matches.push({
      name: m[1] || "",
      start: m.index,
      contentStart: headerRe.lastIndex,
    });
  }

  // If we can't detect headers, fall back to counting everything as text.
  if (matches.length === 0) {
    const visible = stripMarkdownForCharCount(text);
    return visible.length;
  }

  let total = 0;
  for (let i = 0; i < matches.length; i++) {
    const cur = matches[i];
    const next = matches[i + 1];
    const rawName = stripMarkdownForCharCount(cur.name);
    const body = text.slice(cur.contentStart, next ? next.start : text.length);
    const rawBody = stripMarkdownForCharCount(body);
    total += rawName.length + rawBody.length;
  }
  return total;
}

async function loadLeaderMetadata() {
  const urls = {
    leaders: `${RAW_BASE}/scripts/leadersFormatted.py`,
    btr: `${RAW_BASE}/scripts/btrFormatted.py`,
  };

  async function safeFetchText(url) {
    try {
      const res = await fetch(url);
      if (!res.ok) return "";
      return await res.text();
    } catch (e) {
      return "";
    }
  }

  function parseInto(text, opts) {
    const {
      includeKey = () => true,
      overwrite = false,
      writeOrder = false,
      orderCounter = { value: 1 },
      orderMap,
      abilityCharsMap,
      abilityTextMap,
      resourcesMap,
      resourceListMap,
      twoSameMap,
      setupMap,
    } = opts;

    if (!text) return;

    const nameRe = /"name"\s*:\s*"([^"]+)"/g;
    const nameMatches = [];
    let match;
    while ((match = nameRe.exec(text))) {
      const name = match[1];
      const key = normalizeName(name);
      if (!key) continue;
      if (!includeKey(key)) continue;
      if (writeOrder && !orderMap.has(key)) {
        orderMap.set(key, orderCounter.value++);
      }
      nameMatches.push({ name, key, index: match.index });
    }

    for (let i = 0; i < nameMatches.length; i++) {
      const { key, index } = nameMatches[i];
      const nextIndex = i + 1 < nameMatches.length ? nameMatches[i + 1].index : text.length;
      const slice = text.slice(index, nextIndex);

      // abilities
      if (overwrite || !abilityCharsMap.has(key) || !abilityTextMap.has(key)) {
        const abilitiesKeyIndex = slice.search(/"abilities"\s*:\s*\(/);
        if (abilitiesKeyIndex !== -1) {
          const openParenIndex = slice.indexOf("(", abilitiesKeyIndex);
          if (openParenIndex !== -1) {
            const closeParenIndex = findMatchingParen(slice, openParenIndex);
            if (closeParenIndex !== -1) {
              const inside = slice.slice(openParenIndex + 1, closeParenIndex);
              const pieces = extractDoubleQuotedStrings(inside);
              if (pieces.length) {
                const combined = pieces.join("");
                abilityTextMap.set(key, combined);
                abilityCharsMap.set(key, computeAbilityCharCount(combined));
              }
            }
          }
        }
      }

      // resources
      if (overwrite || !resourcesMap.has(key) || !resourceListMap.has(key)) {
        const resMatch = slice.match(/"resources"\s*:\s*\[([^\]]*)\]/);
        if (resMatch && resMatch[1] !== undefined) {
          const items = extractDoubleQuotedStrings(resMatch[1]);
          const cleaned = items.map((s) => stripMarkdownForCharCount(s)).filter(Boolean);
          const set = new Set(cleaned);
          if (set.size) {
            resourcesMap.set(key, set);
            resourceListMap.set(key, cleaned);
          }
          if (cleaned.length >= 2) {
            twoSameMap.set(key, cleaned[0] === cleaned[1]);
          }
        }
      }

      // setup footprint
      if (overwrite || !setupMap.has(key)) {
        const setupMatch = slice.match(/"setup"\s*:\s*\{([\s\S]*?)\}\s*,?\s*(?:"body_font_size"|\}|$)/);
        const setupText = setupMatch ? setupMatch[1] : "";
        if (setupText) {
          function readSlot(slot) {
            const slotRe = new RegExp(`"${slot}"\\s*:\\s*\\{[\\s\\S]*?"ships"\\s*:\\s*(\\d+)[\\s\\S]*?"building"\\s*:\\s*"([^\"]+)"`, "m");
            const m = setupText.match(slotRe);
            if (!m) return null;
            const ships = parseInt(m[1], 10);
            const buildingRaw = stripMarkdownForCharCount(m[2]);
            const building = (buildingRaw || "").toLowerCase();
            return { ships: Number.isFinite(ships) ? ships : 0, building };
          }

          const a = readSlot("A");
          const b = readSlot("B");
          const c = readSlot("C");
          if (a && b && c) {
            const shipsPattern = `${a.ships}-${b.ships}-${c.ships}`;
            function bldChar(bld) {
              if (bld === "city") return "C";
              if (bld === "starport") return "S";
              return "-";
            }
            const buildingsPattern3 = `${bldChar(a.building)}${bldChar(b.building)}${bldChar(c.building)}`;
            const buildingsPattern = buildingsPattern3.endsWith("-")
              ? buildingsPattern3.slice(0, -1)
              : buildingsPattern3;
            setupMap.set(key, `${shipsPattern}|${buildingsPattern}`);
          }
        }
      }
    }
  }

  const [leadersText, btrText] = await Promise.all([
    safeFetchText(urls.leaders),
    safeFetchText(urls.btr),
  ]);

  const nextOrderMap = new Map();
  const nextAbilityMap = new Map();
  const nextAbilityTextMap = new Map();
  const nextResourcesMap = new Map();
  const nextResourceListMap = new Map();
  const nextTwoSameMap = new Map();
  const nextSetupMap = new Map();
  const orderCounter = { value: 1 };

  // Regular leaders use leadersFormatted.py
  parseInto(leadersText, {
    includeKey: (k) => !BEYOND_SET.has(k),
    overwrite: false,
    writeOrder: true,
    orderCounter,
    orderMap: nextOrderMap,
    abilityCharsMap: nextAbilityMap,
    abilityTextMap: nextAbilityTextMap,
    resourcesMap: nextResourcesMap,
    resourceListMap: nextResourceListMap,
    twoSameMap: nextTwoSameMap,
    setupMap: nextSetupMap,
  });

  // Beyond the Reach leaders use btrFormatted.py
  parseInto(btrText, {
    includeKey: (k) => BEYOND_SET.has(k),
    overwrite: true,
    writeOrder: false,
    orderCounter,
    orderMap: nextOrderMap,
    abilityCharsMap: nextAbilityMap,
    abilityTextMap: nextAbilityTextMap,
    resourcesMap: nextResourcesMap,
    resourceListMap: nextResourceListMap,
    twoSameMap: nextTwoSameMap,
    setupMap: nextSetupMap,
  });

  leaderOrderByName = nextOrderMap;
  leaderAbilityCharsByName = nextAbilityMap;
  leaderAbilityTextByName = nextAbilityTextMap;
  leaderResourcesByName = nextResourcesMap;
  leaderResourceListByName = nextResourceListMap;
  leaderHasTwoSameResourceByName = nextTwoSameMap;
  leaderSetupFootprintByName = nextSetupMap;
  leaderMetadataLoaded = true;
}

function getLeaderSortMode() {
  return el.sortSelect?.value || "name";
}

function getLeaderResourceFilter() {
  return el.resourceSelect?.value || "any";
}

function getLeaderSetupFilter() {
  return el.setupSelect?.value || "any";
}

function getSearchMode() {
  const mode = el.searchModeSelect?.value || "name";
  if (mode === "abilities" || mode === "both" || mode === "name") return mode;
  return "name";
}

function getLeaderAbilitySearchText(cardName) {
  const key = normalizeName(cardName);
  const raw = leaderAbilityTextByName.get(key) || "";
  // Use a normalized visible-ish string for searching.
  return stripMarkdownForCharCount(raw).toLowerCase();
}

function cardMatchesQuery(card, qLower, searchMode) {
  if (!qLower) return true;
  const nameText = String(card?.name || "").toLowerCase();

  if (searchMode === "name") {
    return nameText.includes(qLower);
  }

  if (searchMode === "abilities") {
    if (card?.type !== "Leader") return false;
    return getLeaderAbilitySearchText(card.name).includes(qLower);
  }

  // both
  if (nameText.includes(qLower)) return true;
  if (card?.type !== "Leader") return false;
  return getLeaderAbilitySearchText(card.name).includes(qLower);
}

function updateSortControlVisibility() {
  if (!el.sortSelect) return;
  const show = activeTab === "leaders" || activeTab === "beyond";
  el.sortSelect.style.display = show ? "" : "none";
  if (el.resourceSelect) el.resourceSelect.style.display = show ? "" : "none";
  if (el.setupSelect) el.setupSelect.style.display = show ? "" : "none";
}

function filterLeaderCardsByResource(cards, resource) {
  if (!resource || resource === "any") return cards;
  return cards.filter((c) => {
    if (c.type !== "Leader") return false;
    const key = normalizeName(c.name);
    if (resource === "twoSame") {
      return leaderHasTwoSameResourceByName.get(key) === true;
    }
    const resources = leaderResourcesByName.get(key);
    return resources ? resources.has(resource) : false;
  });
}

function filterLeaderCardsBySetup(cards, setupKey) {
  if (!setupKey || setupKey === "any") return cards;
  return cards.filter((c) => {
    if (c.type !== "Leader") return false;
    return leaderSetupFootprintByName.get(normalizeName(c.name)) === setupKey;
  });
}

function getLeaderBaseCardsForCounts() {
  // Returns leader cards after tab filtering + search filtering, but BEFORE resource filtering.
  // Used to compute counts displayed in the filter dropdowns.
  let cards = allCards;

  if (activeTab === "leaders") {
    cards = cards.filter(
      (c) => c.type === "Leader" && !BEYOND_SET.has(normalizeName(c.name))
    );
  } else if (activeTab === "beyond") {
    cards = cards.filter(
      (c) => c.type === "Leader" && BEYOND_SET.has(normalizeName(c.name))
    );
  } else {
    return [];
  }

  const q = (el.query.value || "").trim().toLowerCase();
  const mode = getSearchMode();
  if (q) {
    cards = cards.filter((c) => cardMatchesQuery(c, q, mode));
  }

  return cards;
}

function updateResourceDropdownCounts() {
  if (!el.resourceSelect) return;
  if (activeTab !== "leaders" && activeTab !== "beyond") return;

  // Counts should respect the other filter (setup), but not this resource filter.
  const baseCards = filterLeaderCardsBySetup(getLeaderBaseCardsForCounts(), getLeaderSetupFilter());
  const total = baseCards.length;

  // Update "Has any" label
  const anyOpt = el.resourceSelect.querySelector('option[value="any"]');
  if (anyOpt) anyOpt.textContent = `Has any (${total})`;

  const resourcesInOrder = ["Material", "Fuel", "Weapon", "Relic", "Psionic"];
  for (const r of resourcesInOrder) {
    const opt = el.resourceSelect.querySelector(`option[value="${r}"]`);
    if (!opt) continue;
    let count = 0;
    for (const c of baseCards) {
      const set = leaderResourcesByName.get(normalizeName(c.name));
      if (set && set.has(r)) count++;
    }
    opt.textContent = `Has ${r} (${count})`;
  }

  const twoSameOpt = el.resourceSelect.querySelector('option[value="twoSame"]');
  if (twoSameOpt) {
    let count = 0;
    for (const c of baseCards) {
      if (leaderHasTwoSameResourceByName.get(normalizeName(c.name)) === true) count++;
    }
    twoSameOpt.textContent = `Has same (${count})`;
  }
}

function formatSetupFootprintLabel(setupKey) {
  // setupKey is "shipsPattern|buildingsPattern".
  const [ships, buildings] = String(setupKey).split("|");
  if (!ships || !buildings) return String(setupKey);
  return `${ships} / ${buildings}`;
}

function updateSetupDropdownOptionsAndCounts() {
  if (!el.setupSelect) return;
  if (activeTab !== "leaders" && activeTab !== "beyond") return;

  const selected = getLeaderSetupFilter();

  // Counts should respect the other filter (resource), but not this setup filter.
  const baseCards = filterLeaderCardsByResource(getLeaderBaseCardsForCounts(), getLeaderResourceFilter());

  const counts = new Map();
  for (const c of baseCards) {
    const key = leaderSetupFootprintByName.get(normalizeName(c.name));
    if (!key) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  const keys = [...counts.keys()];
  keys.sort((a, b) => {
    const aCount = counts.get(a) || 0;
    const bCount = counts.get(b) || 0;
    if (aCount !== bCount) return bCount - aCount;

    const [aShips, aBld] = String(a).split("|");
    const [bShips, bBld] = String(b).split("|");
    const aTotal = (aShips || "").split("-").reduce((s, x) => s + (parseInt(x, 10) || 0), 0);
    const bTotal = (bShips || "").split("-").reduce((s, x) => s + (parseInt(x, 10) || 0), 0);
    if (aTotal !== bTotal) return bTotal - aTotal;
    if (aShips !== bShips) return String(aShips).localeCompare(String(bShips));
    return String(aBld).localeCompare(String(bBld));
  });

  // Rebuild options (preserve selection if possible)
  const total = baseCards.length;
  const anyText = `Setup: Any (${total})`;
  el.setupSelect.innerHTML = `<option value="any">${anyText}</option>` +
    keys.map((k) => {
      const n = counts.get(k) || 0;
      const label = formatSetupFootprintLabel(k);
      return `<option value="${String(k).replace(/"/g, "&quot;")}">Setup: ${label} (${n})</option>`;
    }).join("");

  // Restore selection
  const stillExists = [...el.setupSelect.options].some((o) => o.value === selected);
  el.setupSelect.value = stillExists ? selected : "any";
}

// ========== Rendering ==========
function getFilteredCards() {
  let cards = allCards;

  // Tab filter
  if (activeTab === "leaders") {
    // Regular leaders tab should NOT include the Beyond the Reach leader set
    cards = cards.filter(
      (c) => c.type === "Leader" && !BEYOND_SET.has(normalizeName(c.name))
    );
  } else if (activeTab === "lore") {
    cards = cards.filter((c) => c.type === "Lore");
  } else if (activeTab === "beyond") {
    // Show only the specified leaders for the "Beyond the Reach" tab
    cards = cards.filter((c) => c.type === "Leader" && BEYOND_SET.has(normalizeName(c.name)));
  }

  // Filters (leader tabs only)
  if (activeTab === "leaders" || activeTab === "beyond") {
    cards = filterLeaderCardsByResource(cards, getLeaderResourceFilter());
    cards = filterLeaderCardsBySetup(cards, getLeaderSetupFilter());
  }

  // Search filter
  const q = (el.query.value || "").trim().toLowerCase();
  const mode = getSearchMode();
  if (q) {
    cards = cards.filter((c) => cardMatchesQuery(c, q, mode));
  }

  // Sorting (leader-based tabs only)
  if (activeTab === "leaders" || activeTab === "beyond") {
    const sortMode = getLeaderSortMode();
    if (sortMode === "number") {
      cards = [...cards].sort((a, b) => {
        const aNum = leaderOrderByName.get(normalizeName(a.name)) ?? Number.POSITIVE_INFINITY;
        const bNum = leaderOrderByName.get(normalizeName(b.name)) ?? Number.POSITIVE_INFINITY;
        if (aNum !== bNum) return aNum - bNum;
        return a.name.localeCompare(b.name);
      });
    } else if (sortMode === "lastChanged") {
      // Kick off background fetches; sorting will improve as dates arrive.
      prefetchLastChangedDatesForCards(cards);

      cards = [...cards].sort((a, b) => {
        const aPath = getGithubFilePathForCard(a);
        const bPath = getGithubFilePathForCard(b);
        const aMs = lastChangedMsByPath.has(aPath) ? lastChangedMsByPath.get(aPath) : null;
        const bMs = lastChangedMsByPath.has(bPath) ? lastChangedMsByPath.get(bPath) : null;

        const aKnown = typeof aMs === "number" && Number.isFinite(aMs);
        const bKnown = typeof bMs === "number" && Number.isFinite(bMs);
        if (aKnown !== bKnown) return aKnown ? -1 : 1;
        if (!aKnown && !bKnown) return a.name.localeCompare(b.name);

        if (aMs !== bMs) return bMs - aMs; // newest first
        return a.name.localeCompare(b.name);
      });
    } else if (sortMode === "abilityCharsAsc" || sortMode === "abilityCharsDesc") {
      const dir = sortMode === "abilityCharsAsc" ? 1 : -1;
      cards = [...cards].sort((a, b) => {
        // Put leaders with unknown counts at the end.
        const aChars = leaderAbilityCharsByName.get(normalizeName(a.name));
        const bChars = leaderAbilityCharsByName.get(normalizeName(b.name));

        const aKnown = Number.isFinite(aChars);
        const bKnown = Number.isFinite(bChars);
        if (aKnown !== bKnown) return aKnown ? -1 : 1;
        if (!aKnown && !bKnown) return a.name.localeCompare(b.name);

        if (aChars !== bChars) return (aChars - bChars) * dir;
        return a.name.localeCompare(b.name);
      });
    }
  }

  return cards;
}

function render() {
  updateResourceDropdownCounts();
  updateSetupDropdownOptionsAndCounts();
  const cards = getFilteredCards();

  if (cards.length === 0 && allCards.length > 0) {
    el.cardGrid.innerHTML = `<p class="status">No cards match your search.</p>`;
    return;
  }

  el.cardGrid.innerHTML = cards
    .map(
      (card, i) => `
    <div class="card${selectMode ? ' selectable' : ''}${selectedCards.has(card.imageUrl) ? ' selected' : ''}" data-index="${i}" style="animation-delay: ${Math.min(i * 0.02, 0.22)}s">
      ${selectMode ? `<div class="card-checkbox${selectedCards.has(card.imageUrl) ? ' checked' : ''}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg></div>` : ''}
      <div class="card-image">
        <img src="${card.imageUrl}" alt="${card.name}" loading="lazy" />
      </div>
      <div class="card-info">
        <h3 class="card-name">${card.name}</h3>
      </div>
    </div>`
    )
    .join("");

  // Attach click listeners
  el.cardGrid.querySelectorAll(".card").forEach((cardEl) => {
    cardEl.addEventListener("click", () => {
      const idx = parseInt(cardEl.dataset.index);
      const card = cards[idx];
      if (!card) return;
      if (selectMode) {
        toggleCardSelection(card, cardEl);
      } else {
        openLightbox(card);
      }
    });
  });

  updateSelectionCount();
}

// ========== Lightbox ==========
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderInlineMarkdownToHtml(s) {
  // Minimal markdown support used by the generator output.
  // Safe because we escape first.
  const escaped = escapeHtml(s);
  return escaped
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");
}

function parseAbilitySections(abilitiesCombinedText) {
  const text = String(abilitiesCombinedText || "");
  const headerRe = /(?:^|\n)\s*\*([^*]+?)\.\*\s*/g;
  const matches = [];
  let m;
  while ((m = headerRe.exec(text))) {
    matches.push({
      name: (m[1] || "").trim(),
      start: m.index,
      contentStart: headerRe.lastIndex,
    });
  }

  if (matches.length === 0) {
    const body = text.trim();
    return body ? [{ name: "", body }] : [];
  }

  const sections = [];
  for (let i = 0; i < matches.length; i++) {
    const cur = matches[i];
    const next = matches[i + 1];
    const body = text.slice(cur.contentStart, next ? next.start : text.length).trim();
    sections.push({ name: cur.name, body });
  }
  return sections;
}

function clearLightboxDetails() {
  if (el.lightboxTitle) el.lightboxTitle.textContent = "";
  if (el.lightboxMeta) el.lightboxMeta.textContent = "";
  if (el.lightboxAbilities) el.lightboxAbilities.innerHTML = "";
}

function updateLightboxDetails(card) {
  if (!card) {
    clearLightboxDetails();
    return;
  }

  if (el.lightboxTitle) el.lightboxTitle.textContent = card.name || "";

  if (card.type !== "Leader") {
    if (el.lightboxMeta) el.lightboxMeta.textContent = "";
    if (el.lightboxAbilities) el.lightboxAbilities.innerHTML = "";
    return;
  }

  const key = normalizeName(card.name);
  const resources = leaderResourceListByName.get(key) || [];
  const setupKey = leaderSetupFootprintByName.get(key) || "";

  const metaParts = [];
  if (resources.length) metaParts.push(`Resources: ${resources.join(", ")}`);
  if (setupKey) metaParts.push(`Setup: ${formatSetupFootprintLabel(setupKey)}`);
  if (el.lightboxMeta) el.lightboxMeta.textContent = metaParts.join(" · ");

  const abilitiesText = leaderAbilityTextByName.get(key);
  if (!el.lightboxAbilities) return;

  if (!abilitiesText) {
    if (!leaderMetadataLoaded) {
      el.lightboxAbilities.innerHTML = `<div class="lightbox-ability"><div class="lightbox-ability-body">Loading details…</div></div>`;
    } else {
      el.lightboxAbilities.innerHTML = `<div class="lightbox-ability"><div class="lightbox-ability-body">No ability text found.</div></div>`;
    }
    return;
  }

  const sections = parseAbilitySections(abilitiesText);
  if (sections.length === 0) {
    el.lightboxAbilities.innerHTML = `<div class="lightbox-ability"><div class="lightbox-ability-body">No ability text found.</div></div>`;
    return;
  }

  el.lightboxAbilities.innerHTML = sections
    .map(({ name, body }) => {
      const nameHtml = name ? `<div class="lightbox-ability-name">${escapeHtml(name)}</div>` : "";
      const bodyHtml = renderInlineMarkdownToHtml(body).replace(/\n/g, "<br>");
      return `<div class="lightbox-ability">${nameHtml}<div class="lightbox-ability-body">${bodyHtml}</div></div>`;
    })
    .join("");
}

function openLightbox(card) {
  currentLightboxCard = card;
  el.lightboxImg.src = card.imageUrl;
  el.lightboxImg.alt = card.name;
  resetHistoryUi();
  updateLightboxDetails(card);
  el.lightbox.classList.remove("hidden");
  document.body.style.overflow = "hidden";
  setUrlCardName(card.name);
}

function closeLightbox() {
  el.lightbox.classList.add("hidden");
  el.lightboxImg.src = "";
  currentLightboxCard = null;
  clearLightboxDetails();
  resetHistoryUi();
  document.body.style.overflow = "";
  clearUrlCardName();
}

function closeHistoryModal() {
  setHistoryUiVisible(false);
  if (el.historyModalStatus) el.historyModalStatus.textContent = "";
}

// ========== Selection ==========
function toggleSelectMode() {
  selectMode = !selectMode;
  document.getElementById("selectBtn").textContent = selectMode ? "✅ Done" : "☑ Select";
  document.getElementById("selectActions").style.display = selectMode ? "inline-flex" : "none";
  if (!selectMode) {
    // Keep selections but exit visual mode
  }
  render();
}

function toggleCardSelection(card, cardEl) {
  if (selectedCards.has(card.imageUrl)) {
    selectedCards.delete(card.imageUrl);
    cardEl.classList.remove("selected");
    cardEl.querySelector(".card-checkbox")?.classList.remove("checked");
  } else {
    selectedCards.add(card.imageUrl);
    cardEl.classList.add("selected");
    cardEl.querySelector(".card-checkbox")?.classList.add("checked");
  }
  updateSelectionCount();
}

function selectAll() {
  const cards = getFilteredCards();
  for (const c of cards) selectedCards.add(c.imageUrl);
  render();
}

function deselectAll() {
  selectedCards.clear();
  render();
}

function updateSelectionCount() {
  const countEl = document.getElementById("selectionCount");
  if (!countEl) return;
  const n = selectedCards.size;
  countEl.textContent = n > 0 ? `${n} selected` : "";
  document.getElementById("printBtn").textContent = n > 0 ? `🖨 Print (${n})` : "🖨 Print All";
}

// ========== Print ==========
function printCards() {
  // If cards are selected, print only those; otherwise print all visible
  const visible = getFilteredCards();
  const cards = selectedCards.size > 0
    ? visible.filter((c) => selectedCards.has(c.imageUrl))
    : visible;
  if (cards.length === 0) return;

  const container = document.getElementById("printContainer");
  container.innerHTML = "";

  // Pre-load all images, then print
  const promises = cards.map((card) => {
    return new Promise((resolve) => {
      const div = document.createElement("div");
      div.className = `print-card ${card.type === "Lore" ? "print-card-lore" : "print-card-leader"}`;
      const img = document.createElement("img");
      img.src = card.imageUrl;
      img.alt = card.name;
      img.onload = resolve;
      img.onerror = resolve; // don't block on broken images
      div.appendChild(img);
      container.appendChild(div);
    });
  });

  Promise.all(promises).then(() => {
    window.print();
  });
}

// ========== Download Images ==========
async function downloadImages() {
  const visible = getFilteredCards();
  const cards = selectedCards.size > 0
    ? visible.filter((c) => selectedCards.has(c.imageUrl))
    : visible;
  if (cards.length === 0) return;

  el.status.textContent = "Preparing download…";

  try {
    const zip = new JSZip();
    const folder = zip.folder("cards") || zip;

    for (const card of cards) {
      try {
        const res = await fetch(card.imageUrl);
        const blob = await res.blob();
        const filename = card.filename || `${card.name.replace(/\s+/g, "_")}.png`;
        folder.file(filename, blob);
      } catch (err) {
        console.error("Failed to fetch", card.imageUrl, err);
      }
    }

    const content = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(content);
    const a = document.createElement("a");
    a.href = url;
    function tabToFilename(tab) {
      const map = {
        leaders: "leaders.zip",
        lore: "lore.zip",
        all: "all_cards.zip",
        beyond: "beyond-the-reach.zip",
      };
      return map[tab] || `${(tab || 'cards').replace(/\s+/g, '_')}.zip`;
    }
    a.download = tabToFilename(activeTab);
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error("Error creating ZIP", err);
  } finally {
    el.status.textContent = "";
  }
}

// ========== Event Listeners ==========
function init() {
  initTheme();

  el.themeToggle.addEventListener("click", toggleTheme);

  // Print
  document.getElementById("printBtn").addEventListener("click", printCards);
  // Download
  const downloadBtn = document.getElementById("downloadBtn");
  if (downloadBtn) downloadBtn.addEventListener("click", downloadImages);

  // Select mode
  document.getElementById("selectBtn").addEventListener("click", toggleSelectMode);
  document.getElementById("selectAllBtn").addEventListener("click", selectAll);
  document.getElementById("deselectAllBtn").addEventListener("click", deselectAll);

  // Tabs
  el.tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      el.tabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      activeTab = tab.dataset.tab;
      // reflect tab in the URL
      setUrlTab(activeTab);
      updateSortControlVisibility();
      render();
    });
  });

  // Read tab from URL if present and valid
  const initialUrlTab = getUrlTab();
  const validTabs = ["leaders", "lore", "all", "beyond"];
  if (initialUrlTab && validTabs.includes(initialUrlTab)) {
    activeTab = initialUrlTab;
    // update active class on tab buttons
    el.tabs.forEach((t) => t.classList.toggle("active", t.dataset.tab === activeTab));
  }

  updateSortControlVisibility();

  // Sort
  if (el.sortSelect) {
    el.sortSelect.addEventListener("change", () => {
      render();
    });
  }

  // Resource filter
  if (el.resourceSelect) {
    el.resourceSelect.addEventListener("change", () => {
      render();
    });
  }

  // Setup filter
  if (el.setupSelect) {
    el.setupSelect.addEventListener("change", () => {
      render();
    });
  }

  // Search
  el.query.addEventListener("input", render);
  if (el.searchModeSelect) {
    el.searchModeSelect.addEventListener("change", render);
  }

  // Lightbox close
  el.lightboxBackdrop.addEventListener("click", closeLightbox);

  // Lightbox history
  if (el.historyBtn) {
    el.historyBtn.addEventListener("click", async () => {
      const isOpen = el.historyModal && !el.historyModal.classList.contains("hidden");
      if (isOpen) {
        closeHistoryModal();
        return;
      }
      await showHistoryForCurrentCard();
    });
  }

  if (el.historyModalClose) {
    el.historyModalClose.addEventListener("click", closeHistoryModal);
  }
  if (el.historyModalBackdrop) {
    el.historyModalBackdrop.addEventListener("click", closeHistoryModal);
  }
  if (el.historyModalContent) {
    el.historyModalContent.addEventListener("click", (e) => {
      // Clicking the empty gutters (transparent sides) should dismiss.
      if (e.target === el.historyModalContent) closeHistoryModal();
    });
  }

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (el.historyModal && !el.historyModal.classList.contains("hidden")) {
      closeHistoryModal();
      return;
    }
    closeLightbox();
  });

  window.addEventListener("hashchange", () => {
    if (suppressHashHandler) return;
    const cardName = getUrlCardName();
    if (!cardName) {
      if (!el.lightbox.classList.contains("hidden")) closeLightbox();
      return;
    }

    const target = allCards.find((c) => normalizeName(c.name) === normalizeName(cardName));
    if (target) {
      if (!currentLightboxCard || normalizeName(currentLightboxCard.name) !== normalizeName(target.name)) {
        openLightbox(target);
      }
    }
  });

  loadCards();
}

init();
