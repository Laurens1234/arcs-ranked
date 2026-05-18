import yaml from "https://cdn.jsdelivr.net/npm/js-yaml@4.1.0/+esm";
import Papa from "https://cdn.jsdelivr.net/npm/papaparse@5.4.1/+esm";
import { buildCommunityStats } from "./community-data.js";
import { CONFIG } from "./config.js";

// ========== DOM Elements ==========
const el = {
  status: document.getElementById("status"),
  allCards: document.getElementById("allCards"),
  leaderCards: document.getElementById("leaderCards"),
  loreCards: document.getElementById("loreCards"),
  gamesContainer: document.getElementById("gamesContainer"),
  allSection: document.getElementById("allSection"),
  leadersSection: document.getElementById("leadersSection"),
  loreSection: document.getElementById("loreSection"),
  gamesSection: document.getElementById("gamesSection"),
  query: document.getElementById("query"),
  metric: document.getElementById("metric"),
  tabs: document.querySelectorAll(".tab"),
  // Theme
  themeToggle: document.getElementById("themeToggle"),
  // Modal
  modal: document.getElementById("cardModal"),
  modalImg: document.getElementById("modalImg"),
  modalName: document.getElementById("modalName"),
  modalStats: document.getElementById("modalStats"),
  modalText: document.getElementById("modalText"),
  modalClose: document.querySelector(".modal-close"),
  modalBackdrop: document.querySelector(".modal-backdrop"),
  modalShareBtn: document.getElementById("modalShareBtn"),
  // Compare
  compareBtn: document.getElementById("compareBtn"),
  comparePanel: document.getElementById("comparePanel"),
  closeCompare: document.getElementById("closeCompare"),
  compareSlots: document.getElementById("compareSlots"),
  // Insights - All
  allScatterChart: document.getElementById("allScatterChart"),
  allHistogram: document.getElementById("allHistogram"),
  allAnalysis: document.getElementById("allAnalysis"),
  allTierList: document.getElementById("allTierList"),
  // Insights - Leaders
  leaderScatterChart: document.getElementById("leaderScatterChart"),
  leaderHistogram: document.getElementById("leaderHistogram"),
  leaderAnalysis: document.getElementById("leaderAnalysis"),
  leaderTierList: document.getElementById("leaderTierList"),
  // Insights - Lore
  loreScatterChart: document.getElementById("loreScatterChart"),
  loreHistogram: document.getElementById("loreHistogram"),
  loreAnalysis: document.getElementById("loreAnalysis"),
  loreTierList: document.getElementById("loreTierList"),
  // Histogram titles/subtitles/help buttons
  leaderHistogramTitle: document.getElementById("leaderHistogramTitle"),
  leaderHistogramSubtitle: document.getElementById("leaderHistogramSubtitle"),
  leaderHistogramHelp: document.getElementById("leaderHistogramHelp"),
  loreHistogramTitle: document.getElementById("loreHistogramTitle"),
  loreHistogramSubtitle: document.getElementById("loreHistogramSubtitle"),
  loreHistogramHelp: document.getElementById("loreHistogramHelp"),
  allHistogramTitle: document.getElementById("allHistogramTitle"),
  allHistogramSubtitle: document.getElementById("allHistogramSubtitle"),
  allHistogramHelp: document.getElementById("allHistogramHelp"),
  // Data source toggle
  dataSourceGroup: document.getElementById("dataSourceGroup"),
  playerCountGroup: document.getElementById("playerCountGroup"),
  dataSourceLabel: document.getElementById("dataSourceLabel"),
  pageTagline: document.getElementById("pageTagline"),
  // Games tab
  gamesTab: document.querySelector("button[data-tab='games']"),
  // Leaderboard tab
  leaderboardSection: document.getElementById("leaderboardSection"),
  leaderboardContainer: document.getElementById("leaderboardContainer"),
  leaderboardTab: document.querySelector("button[data-tab='leaderboard']"),
  // Player Stats tab
  playerStatsSection: document.getElementById("playerStatsSection"),
  playerStatsContainer: document.getElementById("playerStatsContainer"),
  playerSelector: document.getElementById("playerSelector"),
  playerList: document.getElementById("playerList"),
  playerStatsTab: document.querySelector("button[data-tab='playerStats']"),
};

// ========== State ==========
let appState = {
  leaders: [],
  lore: [],
  otherCards: [],
  allCards: [],
  compareMode: false,
  compareCards: [null, null],
  insights: null,
  dataSource: "league",      // "league" | "Community"
  playerCount: "3p",         // "3p" | "4p" (for Community)
  yamlCards: [],              // loaded card definitions
  leagueCards: null,          // { leaders, lore } from league data
  celestialCards: null,       // { leaders, lore, others, games } from celestial data
  currentModalCard: null,     // current card in modal
  celestialGames: [],         // array of game objects for Games tab
  leaderboardStats: [],       // array of player stats for leaderboard
  selectedGame: null,         // currently selected game for detail view
};

// ========== Utilities ==========
function setStatus(message, { isError = false } = {}) {
  el.status.textContent = message;
  el.status.classList.toggle("error", isError);
}

function normalizeText(value) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeCardNameForLookup(value) {
  const raw = String(value ?? "").trim();
  return normalizeText(raw.replace(/^leader:\s*/i, "").replace(/^fate:\s*/i, ""));
}

function getDisplayCardName(fullName) {
  // Don't split the special Imperial Regent / Outlaw case
  if (/IMPERIAL REGENT\s*\/\s*OUTLAW/i.test(fullName)) {
    return fullName;
  }
  // For other cards with " / ", only show the first part
  if (fullName && fullName.includes(' / ')) {
    return fullName.split(' / ')[0].trim();
  }
  return fullName;
}

let leaderYamlDocsPromise = null;

async function loadLeaderYamlDocs() {
  if (!CONFIG.leaderYamlUrl) return [];

  if (!leaderYamlDocsPromise) {
    leaderYamlDocsPromise = fetchText(CONFIG.leaderYamlUrl)
      .then((yamlText) => {
        const docs = yaml.load(yamlText);
        return Array.isArray(docs) ? docs : [];
      })
      .catch((err) => {
        console.warn("Failed to load leader YAML docs:", err);
        return [];
      });
  }

  return leaderYamlDocsPromise;
}

function getCardTypeFromTags(tags = []) {
  const normalized = new Set(tags.map((t) => normalizeText(t)));
  if (normalized.has("leader")) return "Leader";
  if (normalized.has("lore")) return "Lore";
  if (normalized.has("fate")) return "Fate";
  if (normalized.has("guild")) return "Guild";
  return "Other";
}

function formatCardText(text) {
  if (!text) return "";
  // Escape HTML first
  let formatted = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  // Bold: **text** → <strong>text</strong>
  formatted = formatted.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  // Italic: *text* → <em>text</em>
  formatted = formatted.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  return formatted;
}

// Update the browser URL to reflect current tab/source/playerCount
function updateUrlParams({ tab, source, playerCount, player } = {}) {
  try {
    const url = new URL(window.location.href);
    const params = url.searchParams;

    if (tab !== undefined) {
      if (tab) params.set('tab', tab);
      else params.delete('tab');
    }
    if (source !== undefined) {
      if (source) params.set('source', source);
      else params.delete('source');
    }
    if (player !== undefined) {
      if (player) params.set('player', player);
      else params.delete('player');
    }
    // If source is explicitly set and it's not Community, ensure playerCount is removed
    if (source !== undefined && source !== 'Community') {
      params.delete('playerCount');
    }
    if (playerCount !== undefined) {
      if (playerCount && source === 'Community') params.set('playerCount', playerCount);
      else if (!playerCount) params.delete('playerCount');
    }

    const newSearch = params.toString();
    const newUrl = url.pathname + (newSearch ? `?${newSearch}` : '') + url.hash;
    history.replaceState(null, '', newUrl);
  } catch (err) {
    console.warn('Failed to update URL params', err);
  }
}

function getImageUrl(card) {
  if (card?.image) {
    return `${CONFIG.cardImagesBaseUrl}${encodeURIComponent(card.image)}.png`;
  }

  const rawName = String(card?.name ?? "");
  const lookupName = rawName
    .trim()
    .replace(/^leader:\s*/i, "")
    .replace(/^fate:\s*/i, "");
  // Avoid trying to fetch images for generic placeholder names like "Card"
  const normalizedLookup = normalizeText(lookupName);
  if (normalizedLookup === 'card' || normalizedLookup === 'cardcustom') return null;
  if (!lookupName) return null;

  const normalizedLookupName = normalizeCardNameForLookup(lookupName);
  const canonicalName = leaderFallbackNamesByKey.get(normalizedLookupName);
  if (canonicalName) {
    const filename = `${String(canonicalName || lookupName || "").replace(/[^A-Za-z0-9_ ]/g, "")}_Card.png`;
    return `${CONFIG.leaderImageFallbackBaseUrl}${encodeURIComponent(filename)}`;
  }

  return `${CONFIG.cardImageFallbackBaseUrl}${encodeURIComponent(lookupName)}.png`;
}

let leaderFallbackNamesByKey = new Map();
let leaderFallbackNamesLoaded = false;

async function loadLeaderFallbackNames() {
  if (leaderFallbackNamesLoaded) return leaderFallbackNamesByKey;
  leaderFallbackNamesLoaded = true;

  if (!CONFIG.leaderYamlUrl) return leaderFallbackNamesByKey;

  try {
    const docs = await loadLeaderYamlDocs();
    if (!Array.isArray(docs)) return leaderFallbackNamesByKey;

    const nextMap = new Map();
    for (const doc of docs) {
      const name = String(doc?.name ?? "").trim();
      if (!name) continue;
      const key = normalizeCardNameForLookup(name);
      if (!nextMap.has(key)) nextMap.set(key, name);
    }
    leaderFallbackNamesByKey = nextMap;
  } catch (err) {
    console.warn("Failed to load leader YAML fallback names:", err);
  }

  return leaderFallbackNamesByKey;
}

// ========== Theme Toggle ==========
function initTheme() {
  const saved = localStorage.getItem("arcs-theme");
  if (saved) {
    document.documentElement.dataset.theme = saved;
  }
}

function toggleTheme() {
  const current = document.documentElement.dataset.theme || "dark";
  const next = current === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  localStorage.setItem("arcs-theme", next);
}

// ========== Data Loading ==========
async function fetchText(url, options = {}) {
  const maxAttempts = options.attempts || 3;
  const baseTimeout = options.timeoutMs || 20000; // 20s default

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), baseTimeout * (attempt));
    try {
      const res = await fetch(url, { cache: "no-store", signal: controller.signal });
      clearTimeout(timeoutId);

      if (!res.ok) {
        // For 4xx errors, don't retry
        if (res.status >= 400 && res.status < 500) {
          throw new Error(`Fetch failed ${res.status}: ${url}`);
        }
        throw new Error(`Fetch failed ${res.status}: ${url}`);
      }

      const text = await res.text();

      if (text.includes("accounts.google.com") && text.includes("Sign in")) {
        throw new Error("Google requires login. Make the sheet public.");
      }

      return text;
    } catch (err) {
      clearTimeout(timeoutId);

      // If aborted due to timeout
      if (err.name === 'AbortError') {
        console.warn(`fetchText attempt ${attempt} timed out for ${url}`);
      } else if (err.message && err.message.includes('Google requires login')) {
        // Do not retry if sheet is private
        throw err;
      } else {
        console.warn(`fetchText attempt ${attempt} failed for ${url}:`, err.message || err);
      }

      // If last attempt, throw a clear error
      if (attempt === maxAttempts) {
        if (err.name === 'AbortError') {
          throw new Error(`Fetch timed out after ${maxAttempts} attempts: ${url}`);
        }
        throw err;
      }

      // Backoff before retrying
      const backoffMs = 500 * attempt;
      await new Promise((res) => setTimeout(res, backoffMs));
    }
  }
}

async function loadCards() {
  const [baseText, blightedText, leaderDocs] = await Promise.all([
    fetchText(CONFIG.cardsYamlUrl),
    CONFIG.blightedReachYamlUrl ? fetchText(CONFIG.blightedReachYamlUrl) : Promise.resolve(null),
    loadLeaderYamlDocs(),
  ]);
  const baseData = yaml.load(baseText);
  if (!Array.isArray(baseData)) throw new Error("Invalid YAML format");

  const blightedData = blightedText ? yaml.load(blightedText) : [];
  if (blightedData && !Array.isArray(blightedData)) throw new Error("Invalid Blighted Reach YAML format");

  const leaderData = (leaderDocs || [])
    .map((doc) => {
      const name = String(doc?.name ?? "").trim();
      if (!name) return null;
      return {
        id: doc?.id ?? null,
        name,
        image: null,
        imageClass: "",
        tags: ["Leader"],
        text: doc?.abilities ?? "",
        type: "Leader",
      };
    })
    .filter(Boolean);

  const combined = [...baseData, ...(blightedData || []), ...leaderData];

  const seen = new Set();
  const cards = [];

  for (const c of combined) {
    if (!c || typeof c !== "object" || !c.name) continue;
    const name = c.name ?? "";
    const normalizedName = normalizeCardNameForLookup(name);
    // Skip placeholder cards like "card" and "CardCustom"
    const normalizedText = normalizeText(name);
    if (normalizedText === 'card' || normalizedText === 'cardcustom') continue;
    if (seen.has(normalizedName)) continue;
    seen.add(normalizedName);

    const tags = Array.isArray(c.tags) ? c.tags : [];
    cards.push({
      id: c.id ?? null,
      name,
      image: c.image ?? null,
      imageClass: c.imageClass ?? "",
      tags,
      text: c.text ?? "",
      type: getCardTypeFromTags(tags),
    });
  }

  return cards;
}

async function loadSheet() {
  const text = await fetchText(CONFIG.sheetCsvUrl);
  const parsed = Papa.parse(text, { header: false, skipEmptyLines: false });
  return parsed.data ?? [];
}

function parseLeadersLoreSheet(rows) {
  const stats = [];
  
  let headerRowIdx = -1;
  for (let i = 0; i < Math.min(10, rows.length); i++) {
    const row = rows[i];
    if (row && normalizeText(row[0]) === "leader") {
      headerRowIdx = i;
      break;
    }
  }
  
  if (headerRowIdx === -1) return stats;
  
  const headerRow = rows[headerRowIdx];
  let loreColIdx = -1;
  for (let i = 0; i < headerRow.length; i++) {
    if (normalizeText(headerRow[i]) === "lore") {
      loreColIdx = i;
      break;
    }
  }
  
  for (let i = headerRowIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    
    const leaderName = (row[0] ?? "").trim();
    const leaderNormalized = normalizeText(leaderName);
    if (leaderName && leaderNormalized !== 'card' && leaderNormalized !== 'cardcustom') {
      stats.push({
        name: leaderName,
        type: "Leader",
        timesPicked: parseInt(row[1], 10) || 0,
        wins: parseInt(row[2], 10) || 0,
        winRate: parseFloat((row[3] ?? "").replace("%", "")) || 0,
      });
    }
    
    if (loreColIdx > 0) {
      const loreName = (row[loreColIdx] ?? "").trim();
      const loreNormalized = normalizeText(loreName);
      if (loreName && loreNormalized !== 'card' && loreNormalized !== 'cardcustom') {
        stats.push({
          name: loreName,
          type: "Lore",
          timesPicked: parseInt(row[loreColIdx + 1], 10) || 0,
          wins: parseInt(row[loreColIdx + 2], 10) || 0,
          winRate: parseFloat((row[loreColIdx + 3] ?? "").replace("%", "")) || 0,
        });
      }
    }
  }
  
  return stats;
}

function joinCardsWithStats(cards, sheetRows) {
  const stats = parseLeadersLoreSheet(sheetRows);
  const statsIndex = new Map(stats.map((s) => [normalizeText(s.name), s]));
  
  const joined = [];
  for (const card of cards) {
    const stat = statsIndex.get(normalizeText(card.name));
    if (stat) {
      joined.push({ ...card, stats: stat });
    }
  }
  
  return { cards: joined, totalStats: stats.length };
}

// ========== Celestial Data Parsing ==========
async function loadCelestialSheet() {
  const text = await fetchText(CONFIG.celestialCsvUrl);
  const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
  return parsed.data ?? [];
}

function parseCelestialSheet(rows, cardIndex) {
  // Group rows by Game ID to find winners
  const gameGroups = new Map();
  
  for (const row of rows) {
    if (!row || !row["Game ID"]) continue;
    
    const gameId = row["Game ID"].trim();
    if (!gameGroups.has(gameId)) {
      gameGroups.set(gameId, []);
    }
    gameGroups.get(gameId).push(row);
  }
  
  // Track stats for each card
  const cardStats = new Map(); // cardName -> { wins, timesPicked }
  const games = []; // Array of game objects for display
  let totalGames = 0;

  function resolveCardFromCsvName(csvName) {
    let raw = String(csvName ?? "").trim();
    
    // Handle IMPERIAL REGENT / OUTLAW face variants
    if (/IMPERIAL REGENT\s*\/\s*OUTLAW\s*\(face-down\)/i.test(raw)) {
      raw = "Outlaw";
    } else if (/IMPERIAL REGENT\s*\/\s*OUTLAW\s*\(face-up\)/i.test(raw)) {
      raw = "Imperial Regent";
    }
    
    const normalized = normalizeCardNameForLookup(raw);
    let matched = cardIndex?.get(normalized);
    
    // If not found and the name contains " / ", try just the first part
    if (!matched && raw.includes(' / ')) {
      const firstPart = raw.split(' / ')[0].trim();
      const normalizedFirstPart = normalizeCardNameForLookup(firstPart);
      matched = cardIndex?.get(normalizedFirstPart);
    }
    
    if (matched) {
      return { name: matched.name, type: matched.type };
    }
    if (/^leader:/i.test(raw)) {
      return { name: raw.replace(/^leader:\s*/i, ""), type: "Leader" };
    }
    if (/^fate:/i.test(raw)) {
      return { name: raw.replace(/^fate:\s*/i, ""), type: "Fate" };
    }
    return { name: raw, type: "Other" };
  }
  
  function processActRows(actRows, campaignId, playerOrder = null) {
    const firstPlayer = actRows[0];
    const modeField = firstPlayer?.["Mode"] || "";
    
    // Determine if this is Act I, II, or III
    const actMatch = modeField.match(/Act\s+([IVX]+)/i);
    const actNumber = actMatch ? actMatch[1].toUpperCase() : "Unknown";
    
    // Find winner (highest power) - only for Act III or standalone games
    let winner = null;
    const isActIorII = /Act\s+I+$/i.test(modeField) || /Act\s+II$/i.test(modeField);
    
    if (!isActIorII) {
      let maxPower = -Infinity;
      for (const player of actRows) {
        const power = parseInt(player["Power"] ?? "0", 10);
        if (power > maxPower) {
          maxPower = power;
          winner = player;
        }
      }
    }
    
    // Extract cards from winner's JSON
    let winnerCards = [];
    if (winner) {
      try {
        const jsonStr = winner["JSON"];
        if (jsonStr) {
          const jsonData = JSON.parse(jsonStr);
          winnerCards = jsonData.cards ?? [];
        }
      } catch (e) {
        console.warn(`Failed to parse JSON for campaign ${campaignId}:`, e);
      }
    }
    
    // Sort actRows to match playerOrder if provided (for Act II/III consistency)
    let rowsToProcess = actRows;
    if (playerOrder && playerOrder.length > 0) {
      const playerNameMap = new Map();
      for (const row of actRows) {
        playerNameMap.set(row["Name"] || "Unknown", row);
      }
      rowsToProcess = playerOrder
        .map(name => playerNameMap.get(name))
        .filter(row => row !== undefined);
    }
    
    // Build game object with player data
    const gamePlayers_ = [];
    for (const player of rowsToProcess) {
      let playerCards = [];
      try {
        const jsonStr = player["JSON"];
        if (jsonStr) {
          const jsonData = JSON.parse(jsonStr);
          playerCards = jsonData.cards ?? [];
        }
      } catch (e) {
        // Ignore parse errors
      }
      
      gamePlayers_.push({
        name: player["Name"] || "Unknown",
        color: player["Color"] || "—",
        power: parseInt(player["Power"] ?? "0", 10),
        isWinner: player === winner,
        cards: playerCards
          .filter(c => c && c !== "Deck")
          .map(cardName => {
            const resolved = resolveCardFromCsvName(cardName);
            const normalized = normalizeCardNameForLookup(resolved.name);
            return cardIndex?.get(normalized) || { name: resolved.name, image: null };
          }),
        ...(modeField.match(/Act\s+/i) && {
          objective: parseInt(player["Objective"] ?? "0", 10),
          campaignResult: parseInt(player["Objective"] ?? "0", 10) === 0 ? "success" : "failure"
        })
      });
      
      // All players' cards go into timesPicked
      for (const cardName of playerCards) {
        if (!cardName || cardName === "Deck") continue;

        const resolved = resolveCardFromCsvName(cardName);
        const normalized = normalizeCardNameForLookup(resolved.name);
        const normalizedText_ = normalizeText(resolved.name);
        if (normalizedText_ === 'card' || normalizedText_ === 'cardcustom') continue;
        if (!cardStats.has(normalized)) {
          cardStats.set(normalized, { name: resolved.name, type: resolved.type, wins: 0, timesPicked: 0 });
        }
        cardStats.get(normalized).timesPicked++;
      }
    }
    
    // Winner's cards get a win (only if there is a winner, which is Act III or standalone)
    if (winner) {
      for (const cardName of winnerCards) {
        if (!cardName || cardName === "Deck") continue;

        const resolved = resolveCardFromCsvName(cardName);
        const normalized = normalizeCardNameForLookup(resolved.name);
        const normalizedText_ = normalizeText(resolved.name);
        if (normalizedText_ === 'card' || normalizedText_ === 'cardcustom') continue;
        if (!cardStats.has(normalized)) {
          cardStats.set(normalized, { name: resolved.name, type: resolved.type, wins: 0, timesPicked: 0 });
        }
        cardStats.get(normalized).wins++;
      }
    }
    
    return {
      actNumber,
      mode: modeField,
      players: gamePlayers_,
      time: actRows[0]?.["Time"] || "",
      winner
    };
  }
  
  // Process each game group
  for (const [gameId, gamePlayers] of gameGroups) {
    // Skip games marked as REMOVE_REQUEST
    const firstMode = gamePlayers[0]?.["Mode"] || "";
    if (/remove_request/i.test(firstMode)) {
      continue;
    }
    
    // Check if this is a campaign game (has Act I, Act II, or Act III)
    const actRegex = /Act\s+([IVX]+)/i;
    const hasCampaignActs = gamePlayers.some(row => actRegex.test(row["Mode"] || ""));
    
    if (hasCampaignActs) {
      // Group rows by act number
      const actGroups = new Map();
      for (const row of gamePlayers) {
        const modeField = row["Mode"] || "";
        const actMatch = modeField.match(actRegex);
        const actKey = actMatch ? actMatch[1].toUpperCase() : "Unknown";
        
        if (!actGroups.has(actKey)) {
          actGroups.set(actKey, []);
        }
        actGroups.get(actKey).push(row);
      }
      
      // Process each act and collect them
      const acts = [];
      const actOrder = ["I", "II", "III"];
      let playerOrder = null; // Extract from Act I
      
      for (const act of actOrder) {
        if (actGroups.has(act)) {
          const actRows = actGroups.get(act);
          // Extract player order from Act I (don't use playerOrder for Act I itself)
          if (act === "I") {
            playerOrder = actRows.map(row => row["Name"] || "Unknown");
            acts.push(processActRows(actRows, gameId, null));
          } else {
            // For Acts II and III, use the player order from Act I
            acts.push(processActRows(actRows, gameId, playerOrder));
          }
        }
      }
      
      // Create a campaign game object with all acts
      if (acts.length > 0) {
        totalGames++;
        games.push({
          gameId,
          time: acts[0].time,
          mode: "Campaign",
          acts: acts,
          players: acts[acts.length - 1].players, // Show final act players as main display
          isCampaign: true
        });
      }
    } else {
      // Non-campaign game - process normally
      const act = processActRows(gamePlayers, gameId);
      totalGames++;
      games.push({
        gameId,
        time: act.time,
        mode: act.mode,
        players: act.players,
        isCampaign: false
      });
    }
  }

  // Compute winRate for each card (avoid division by zero)
  const statsArray = Array.from(cardStats.values()).map(s => ({
    ...s,
    winRate: (s.timesPicked && s.timesPicked > 0) ? (s.wins / s.timesPicked) * 100 : 0
  }));

  return { stats: statsArray, totalGames, games };
}

// Compute player leaderboard stats from games
function computePlayerLeaderboardStats(games) {
  // Compute combined, base-only, and campaign-only leaderboards.
  // Return combined array for backward compatibility and store breakdown on appState.

  const combinedMap = new Map();
  const baseMap = new Map();
  const campaignMap = new Map();

  if (!Array.isArray(games)) return [];

  const processNonCampaign = (game, map) => {
    if (!game.players || !Array.isArray(game.players)) return;
    const hasWinner = game.players.some((p) => p.isWinner);
    const isActIII = /Act\s+III/i.test(game.mode || "");
    const weight = hasWinner ? 1 : (isActIII ? 0.33 : 0);

    for (const player of game.players) {
      const name = player.name || "Unknown";
      if (!map.has(name)) map.set(name, { name, wins: 0, games: 0, weightedGames: 0 });
      const s = map.get(name);
      s.games += 1;
      s.weightedGames += weight;
      if (hasWinner && player.isWinner) s.wins++;
    }
  };

  const processCampaignActs = (game, map) => {
    if (!game.acts || !Array.isArray(game.acts)) return;
    // For leaderboard games count, treat the whole campaign as a single game.
    // But for weightedGames and wins, accumulate across acts to preserve WR calculation.
    // Build per-player aggregates for this campaign first.
    const perPlayer = new Map();
    for (const act of game.acts) {
      if (!act.players || !Array.isArray(act.players)) continue;
      const hasWinner = act.players.some((p) => p.isWinner);
      const isActIII = /Act\s+III/i.test(act.mode || "");
      const weight = hasWinner ? 1 : (isActIII ? 0.33 : 0);

      for (const player of act.players) {
        const name = player.name || "Unknown";
        if (!perPlayer.has(name)) perPlayer.set(name, { name, wins: 0, weightedGames: 0 });
        const agg = perPlayer.get(name);
        agg.weightedGames += weight;
        if (hasWinner && player.isWinner) agg.wins += 1;
      }
    }

    // Now apply the aggregates: each player gets +1 `games` for the campaign,
    // plus the summed weightedGames and wins from acts.
    for (const [name, agg] of perPlayer.entries()) {
      if (!map.has(name)) map.set(name, { name, wins: 0, games: 0, weightedGames: 0 });
      const s = map.get(name);
      s.games += 1; // campaign counted as single game
      s.weightedGames += agg.weightedGames;
      s.wins += agg.wins;
    }
  };

  for (const game of games) {
    if (game.isCampaign && game.acts && game.acts.length > 0) {
      // campaign: update campaignMap and combinedMap
      processCampaignActs(game, campaignMap);
      processCampaignActs(game, combinedMap);
    } else {
      // non-campaign: update baseMap and combinedMap
      processNonCampaign(game, baseMap);
      processNonCampaign(game, combinedMap);
    }
  }

  const finalize = (map) => {
    const arr = Array.from(map.values()).map(s => ({ ...s, winRate: s.weightedGames > 0 ? (s.wins / s.weightedGames) * 100 : 0 }));
    arr.sort((a, b) => {
      if (b.wins !== a.wins) return b.wins - a.wins;
      return b.winRate - a.winRate;
    });
    return arr;
  };

  const combined = finalize(combinedMap);
  const base = finalize(baseMap);
  const campaign = finalize(campaignMap);

  // Save breakdown to appState for UI to pick from
  try { appState.leaderboardBreakdown = { combined, base, campaign }; } catch (e) { /* ignore */ }

  return combined;
}

// ========== Data Insights ==========
function calculateInsights(leaders, lore, gamesOverride, allCardsOverride) {
  const allCards = allCardsOverride ?? [...leaders, ...lore];
  const isCommunity = allCards[0]?.stats?.isCommunity;
  
  // Calculate averages
  const avgWinRate = allCards.reduce((sum, c) => sum + (c.stats?.winRate ?? 0), 0) / allCards.length;
  const avgPicks = isCommunity ? 0 : allCards.reduce((sum, c) => sum + (c.stats?.timesPicked ?? 0), 0) / allCards.length;
  
  const leaderAvgWR = leaders.reduce((sum, c) => sum + (c.stats?.winRate ?? 0), 0) / leaders.length;
  const loreAvgWR = lore.reduce((sum, c) => sum + (c.stats?.winRate ?? 0), 0) / lore.length;
  
  // Total games - use override if provided, else estimate from leader picks
  const totalPicks = isCommunity ? 0 : leaders.reduce((sum, c) => sum + (c.stats?.timesPicked ?? 0), 0);
  const estimatedGames = gamesOverride ?? Math.round(totalPicks / 4);
  
  let underrated = [];
  let overrated = [];
  let meta = [];
  let consistent = [];
  
  if (isCommunity) {
    // For Community data, use rank position vs win rate for insights
    const avgRank = allCards.reduce((sum, c) => sum + (c.stats?.rankPosition ?? 0), 0) / allCards.length;
    // Hidden gems: high WR but drafted late (high rank number)
    underrated = allCards
      .filter(c => c.stats?.winRate > avgWinRate && c.stats?.rankPosition > avgRank)
      .sort((a, b) => (b.stats?.winRate ?? 0) - (a.stats?.winRate ?? 0))
      .slice(0, 3);
    // Overrated: low WR but drafted early (low rank number)
    overrated = allCards
      .filter(c => c.stats?.winRate < avgWinRate && c.stats?.rankPosition < avgRank)
      .sort((a, b) => (a.stats?.winRate ?? 0) - (b.stats?.winRate ?? 0))
      .slice(0, 3);
    // Meta: high WR AND drafted early
    meta = allCards
      .filter(c => c.stats?.winRate > avgWinRate && c.stats?.rankPosition < avgRank)
      .sort((a, b) => (b.stats?.winRate ?? 0) - (a.stats?.winRate ?? 0))
      .slice(0, 3);
    // Most consistent (closest to expected average WR)
    consistent = allCards
      .sort((a, b) => Math.abs((a.stats?.winRate ?? 0) - avgWinRate) - Math.abs((b.stats?.winRate ?? 0) - avgWinRate))
      .slice(0, 3);
  } else {
    // Find underrated cards (high win rate, low picks)
    underrated = allCards
      .filter(c => c.stats?.winRate > avgWinRate && c.stats?.timesPicked < avgPicks)
      .sort((a, b) => (b.stats?.winRate ?? 0) - (a.stats?.winRate ?? 0))
      .slice(0, 3);
    // Find overrated cards (low win rate, high picks)
    overrated = allCards
      .filter(c => c.stats?.winRate < avgWinRate && c.stats?.timesPicked > avgPicks)
      .sort((a, b) => (a.stats?.winRate ?? 0) - (b.stats?.winRate ?? 0))
      .slice(0, 3);
    // Find meta cards (high win rate AND high picks)
    meta = allCards
      .filter(c => c.stats?.winRate > avgWinRate && c.stats?.timesPicked > avgPicks)
      .sort((a, b) => (b.stats?.winRate ?? 0) - (a.stats?.winRate ?? 0))
      .slice(0, 3);
    // Most consistent (closest to 25% win rate with decent sample)
    const minPicks = avgPicks * 0.5;
    consistent = allCards
      .filter(c => c.stats?.timesPicked >= minPicks)
      .sort((a, b) => Math.abs((a.stats?.winRate ?? 0) - 25) - Math.abs((b.stats?.winRate ?? 0) - 25))
      .slice(0, 3);
  }
  
  return {
    avgWinRate,
    avgPicks,
    leaderAvgWR,
    loreAvgWR,
    estimatedGames,
    underrated,
    overrated,
    meta,
    consistent,
  };
}

function getCardBadge(card, insights) {
  const wr = card.stats?.winRate ?? 0;
  // Community data has no picks – badges based on picks don't apply
  if (card.stats?.isCommunity) return null;
  const picks = card.stats?.timesPicked ?? 0;
  
  if (wr > insights.avgWinRate + 5 && picks < insights.avgPicks * 0.8) {
    return { type: "underrated", label: "Hidden Gem 💎" };
  }
  if (wr < insights.avgWinRate - 5 && picks > insights.avgPicks * 1.2) {
    return { type: "overrated", label: "Overrated 📉" };
  }
  if (wr > insights.avgWinRate + 3 && picks > insights.avgPicks * 1.2) {
    return { type: "meta", label: "Meta 🔥" };
  }
  return null;
}

function renderScatterChart(cards, container, dotClass = "leader") {
  const isCommunity = cards[0]?.stats?.isCommunity;
  
  // X-axis: rank position (inverted so rank 1 is rightmost) for Community, times picked for league
  const xValues = cards.map(c => isCommunity ? (c.stats?.rankPosition ?? 0) : (c.stats?.timesPicked ?? 0));
  const maxX = Math.max(...xValues);
  const minX = isCommunity ? 1 : Math.min(...xValues);
  const maxWR = Math.max(...cards.map(c => c.stats?.winRate ?? 0));
  const minWR = Math.min(...cards.map(c => c.stats?.winRate ?? 0));
  
  const width = 280;
  const height = 180;
  const padding = { top: 20, right: 20, bottom: 30, left: 40 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;
  
  // Scale functions - for Community, invert X so rank 1 is on the right
  // For league (non-community), map minX to left and maxX to right so axis starts at leftmost dot
  const spanX = (maxX - minX) || 1;
  const xScale = isCommunity
    ? (rank) => padding.left + ((maxX - rank) / (maxX - minX || 1)) * chartW
    : (picks) => padding.left + ((picks - minX) / spanX) * chartW;
  const yScale = (wr) => padding.top + chartH - ((wr - minWR) / ((maxWR - minWR) || 1)) * chartH;
  
  // Create SVG
  let svg = `<svg viewBox="0 0 ${width} ${height}" class="scatter-svg">`;
  
  // Grid lines
  svg += `<g class="grid">`;
  for (let i = 0; i <= 4; i++) {
    const y = padding.top + (chartH / 4) * i;
    svg += `<line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" stroke="currentColor" stroke-opacity="0.1"/>`;
  }
  svg += `</g>`;
  
  // Axes
  svg += `<line x1="${padding.left}" y1="${padding.top + chartH}" x2="${width - padding.right}" y2="${padding.top + chartH}" stroke="currentColor" stroke-opacity="0.3"/>`;
  svg += `<line x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${padding.top + chartH}" stroke="currentColor" stroke-opacity="0.3"/>`;
  
  // Axis labels
  const xLabel = isCommunity ? "Draft Rank " : "Times Picked";
  svg += `<text x="${width / 2}" y="${height - 5}" text-anchor="middle" class="axis-label">${xLabel}</text>`;
  svg += `<text x="12" y="${height / 2}" text-anchor="middle" transform="rotate(-90, 12, ${height / 2})" class="axis-label">Win Rate %</text>`;
  
  // Average lines (dashed)
  const avgX = xValues.reduce((sum, v) => sum + v, 0) / xValues.length;
  const avgWR = cards.reduce((sum, c) => sum + (c.stats?.winRate ?? 0), 0) / cards.length;
  svg += `<line x1="${xScale(avgX)}" y1="${padding.top}" x2="${xScale(avgX)}" y2="${padding.top + chartH}" stroke="var(--accent)" stroke-opacity="0.4" stroke-dasharray="4"/>`;
  svg += `<line x1="${padding.left}" y1="${yScale(avgWR)}" x2="${width - padding.right}" y2="${yScale(avgWR)}" stroke="var(--accent)" stroke-opacity="0.4" stroke-dasharray="4"/>`;
  
  // Plot points - use card type for "all" view, otherwise use dotClass
  cards.forEach(card => {
    const xVal = isCommunity ? (card.stats?.rankPosition ?? 0) : (card.stats?.timesPicked ?? 0);
    const x = xScale(xVal);
    const y = yScale(card.stats?.winRate ?? 0);
    const cardType = dotClass === "all" ? (card.stats?.type === "Leader" ? "leader" : "lore") : dotClass;
    const dataExtra = isCommunity ? `data-rank="${card.stats?.rankPosition}"` : `data-picks="${card.stats?.timesPicked}"`;
    svg += `<circle cx="${x}" cy="${y}" r="5" class="dot ${cardType}" data-name="${card.name}" data-wr="${card.stats?.winRate?.toFixed(1)}" ${dataExtra} data-type="${card.stats?.type || ''}" data-Community="${isCommunity ? '1' : '0'}"/>`;
  });
  
  svg += `</svg>`;
  
  // Add legend for "all" view
  if (dotClass === "all") {
    svg += `<div class="chart-legend"><span class="legend-item"><span class="legend-dot leader"></span>Leaders</span><span class="legend-item"><span class="legend-dot lore"></span>Lore</span></div>`;
  }
  
  const tooltipId = `tooltip-${dotClass}-${Date.now()}`;
  svg += `<div class="scatter-tooltip" id="${tooltipId}"></div>`;
  
  container.innerHTML = svg;
  
  // Add hover tooltips
  const tooltip = document.getElementById(tooltipId);
  container.querySelectorAll(".dot").forEach(dot => {
    dot.addEventListener("mouseenter", (e) => {
      const name = e.target.dataset.name;
      const wr = e.target.dataset.wr;
      if (e.target.dataset.Community === "1") {
        const rank = e.target.dataset.rank;
        tooltip.innerHTML = `<strong>${name}</strong><br>${wr}% WR · Rank #${rank}`;
      } else {
        const picks = e.target.dataset.picks;
        tooltip.innerHTML = `<strong>${name}</strong><br>${wr}% WR · ${picks} picks`;
      }
      tooltip.classList.add("visible");
    });
    dot.addEventListener("mousemove", (e) => {
      const rect = container.getBoundingClientRect();
      tooltip.style.left = `${e.clientX - rect.left + 10}px`;
      tooltip.style.top = `${e.clientY - rect.top - 10}px`;
    });
    dot.addEventListener("mouseleave", () => {
      tooltip.classList.remove("visible");
    });
    // Click to open card modal
    dot.addEventListener("click", () => {
      const name = dot.dataset.name;
      const card = appState.allCards.find(c => c.name === name);
      if (card) openModal(card);
    });
  });
}

function renderHistogram(cards, container, barClass = "leader", metric = "winRate") {
  // Get metric configuration
  const metricConfig = {
    winRate: {
      title: "Win Rate Distribution",
      subtitle: "How spread out are the win rates?",
      tooltip: "Histogram showing how win rates are distributed. In a 4-player game, 25% is expected average. Bars show how many cards fall into each win rate bracket.",
      getValue: (c) => c.stats?.winRate ?? 0,
      binSize: 5,
      formatLabel: (val) => `${val}%`,
      showExpectedLine: true,
      expectedValue: 25,
    },
    wins: {
      title: "Total Wins Distribution",
      subtitle: "How are wins distributed across cards?",
      tooltip: "Histogram showing how total wins are distributed. Bars show how many cards fall into each win count bracket.",
      getValue: (c) => c.stats?.wins ?? 0,
      binSize: null, // Auto-calculate
      formatLabel: (val) => `${val}`,
      showExpectedLine: false,
    },
    timesPicked: {
      title: "Times Picked Distribution",
      subtitle: "How popular are the cards?",
      tooltip: "Histogram showing how often cards are picked. Bars show how many cards fall into each pick count bracket.",
      getValue: (c) => c.stats?.timesPicked ?? 0,
      binSize: null, // Auto-calculate
      formatLabel: (val) => `${val}`,
      showExpectedLine: false,
    },
    draftRank: {
      title: "Draft Rank Distribution",
      subtitle: "How are draft positions distributed?",
      tooltip: "Histogram showing how draft ranks are distributed. Lower numbers indicate cards picked earlier in drafts.",
      getValue: (c) => c.stats?.rankPosition ?? 0,
      binSize: 5,
      formatLabel: (val) => `${val}`,
      showExpectedLine: false,
    },
  };
  
  const config = metricConfig[metric] || metricConfig.winRate;
  
  // Update titles based on section
  if (barClass === "leader") {
    el.leaderHistogramTitle.textContent = config.title;
    el.leaderHistogramSubtitle.textContent = config.subtitle;
    el.leaderHistogramHelp.dataset.tooltip = config.tooltip;
  } else if (barClass === "lore") {
    el.loreHistogramTitle.textContent = config.title;
    el.loreHistogramSubtitle.textContent = config.subtitle;
    el.loreHistogramHelp.dataset.tooltip = config.tooltip;
  } else if (barClass === "all") {
    el.allHistogramTitle.textContent = config.title;
    el.allHistogramSubtitle.textContent = config.subtitle;
    el.allHistogramHelp.dataset.tooltip = config.tooltip;
  }
  
  const values = cards.map(c => config.getValue(c));
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  
  // Auto-calculate bin size if not specified
  let binSize = config.binSize;
  if (!binSize) {
    const range = maxVal - minVal;
    // Aim for ~8-12 bins
    binSize = Math.ceil(range / 10);
    // Round to nice numbers
    if (binSize > 50) binSize = Math.ceil(binSize / 50) * 50;
    else if (binSize > 10) binSize = Math.ceil(binSize / 10) * 10;
    else if (binSize > 5) binSize = Math.ceil(binSize / 5) * 5;
    else binSize = Math.max(1, binSize);
  }
  
  const minBin = Math.floor(minVal / binSize) * binSize;
  const maxBin = Math.ceil(maxVal / binSize) * binSize;
  
  const bins = [];
  for (let start = minBin; start < maxBin; start += binSize) {
    const end = start + binSize;
    const cardsInBin = cards.filter(c => {
      const val = config.getValue(c);
      return val >= start && val < end;
    });
    bins.push({ start, end, count: cardsInBin.length, cards: cardsInBin });
  }
  
  // Handle edge case where max value equals the last bin start
  if (bins.length > 0) {
    const lastBin = bins[bins.length - 1];
    const cardsAtMax = cards.filter(c => config.getValue(c) === maxBin);
    if (cardsAtMax.length > 0 && lastBin.end === maxBin) {
      lastBin.cards = [...lastBin.cards, ...cardsAtMax.filter(c => !lastBin.cards.includes(c))];
      lastBin.count = lastBin.cards.length;
    }
  }
  
  const maxCount = Math.max(...bins.map(b => b.count), 1);
  
  const width = 280;
  const height = 160;
  const padding = { top: 15, right: 15, bottom: 35, left: 30 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;
  
  const barWidth = Math.max(8, chartW / bins.length - 4);
  const barGap = 4;
  
  // Create SVG
  let svg = `<svg viewBox="0 0 ${width} ${height}" class="histogram-svg">`;
  
  // Grid lines
  svg += `<g class="grid">`;
  for (let i = 0; i <= 4; i++) {
    const y = padding.top + (chartH / 4) * i;
    svg += `<line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" stroke="currentColor" stroke-opacity="0.1"/>`;
  }
  svg += `</g>`;
  
  // Expected line (only for win rate)
  if (config.showExpectedLine) {
    const expectedBin = bins.findIndex(b => b.start <= config.expectedValue && b.end > config.expectedValue);
    if (expectedBin >= 0) {
      const xExpected = padding.left + (expectedBin + 0.5) * (barWidth + barGap);
      svg += `<line x1="${xExpected}" y1="${padding.top}" x2="${xExpected}" y2="${padding.top + chartH}" stroke="var(--accent)" stroke-opacity="0.4" stroke-dasharray="4"/>`;
    }
  }
  
  // Bars
  bins.forEach((bin, i) => {
    const x = padding.left + i * (barWidth + barGap);
    const barH = (bin.count / maxCount) * chartH;
    const y = padding.top + chartH - barH;
    const cardNames = bin.cards.map(c => c.name).join(", ");
    const rangeLabel = `${config.formatLabel(bin.start)}-${config.formatLabel(bin.end)}`;
    
    svg += `<rect 
      x="${x}" y="${y}" 
      width="${barWidth}" height="${barH}" 
      class="bar ${barClass}" 
      rx="2"
      data-range="${rangeLabel}"
      data-count="${bin.count}"
      data-cards="${cardNames}"
    />`;
    
    // X-axis label (only show some labels to avoid crowding)
    if (bins.length <= 10 || i % 2 === 0) {
      svg += `<text x="${x + barWidth / 2}" y="${height - 8}" text-anchor="middle" class="axis-label">${config.formatLabel(bin.start)}</text>`;
    }
  });
  
  // Axes
  svg += `<line x1="${padding.left}" y1="${padding.top + chartH}" x2="${width - padding.right}" y2="${padding.top + chartH}" stroke="currentColor" stroke-opacity="0.3"/>`;
  svg += `<line x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${padding.top + chartH}" stroke="currentColor" stroke-opacity="0.3"/>`;
  
  // Y-axis label
  svg += `<text x="10" y="${height / 2 - 10}" text-anchor="middle" transform="rotate(-90, 10, ${height / 2 - 10})" class="axis-label">Cards</text>`;
  
  svg += `</svg>`;
  const tooltipId = `histogram-tooltip-${barClass}`;
  svg += `<div class="histogram-tooltip" id="${tooltipId}"></div>`;
  
  container.innerHTML = svg;
  
  // Add hover tooltips
  const tooltip = document.getElementById(tooltipId);
  container.querySelectorAll(".bar").forEach(bar => {
    bar.addEventListener("mouseenter", (e) => {
      const range = e.target.dataset.range;
      const count = e.target.dataset.count;
      const cardNames = e.target.dataset.cards;
      tooltip.innerHTML = `<strong>${range}</strong><br>${count} card${count !== "1" ? "s" : ""}${cardNames ? `<br><span class="tooltip-cards">${cardNames}</span>` : ""}`;
      tooltip.classList.add("visible");
    });
    bar.addEventListener("mousemove", (e) => {
      const rect = container.getBoundingClientRect();
      tooltip.style.left = `${e.clientX - rect.left + 10}px`;
      tooltip.style.top = `${e.clientY - rect.top - 10}px`;
    });
    bar.addEventListener("mouseleave", () => {
      tooltip.classList.remove("visible");
    });
  });
}

function renderCardAnalysis(cards, container) {
  const isCommunity = cards[0]?.stats?.isCommunity;
  const avgWinRate = cards.reduce((sum, c) => sum + (c.stats?.winRate ?? 0), 0) / cards.length;
  
  let underrated, overrated, meta;
  
  if (isCommunity) {
    const avgRank = cards.reduce((sum, c) => sum + (c.stats?.rankPosition ?? 0), 0) / cards.length;
    // Hidden gems: high WR but drafted late (high rank number)
    underrated = cards
      .filter(c => c.stats?.winRate > avgWinRate && c.stats?.rankPosition > avgRank)
      .sort((a, b) => (b.stats?.winRate ?? 0) - (a.stats?.winRate ?? 0))
      .slice(0, 3);
    // Overrated: low WR but drafted early (low rank number)
    overrated = cards
      .filter(c => c.stats?.winRate < avgWinRate && c.stats?.rankPosition < avgRank)
      .sort((a, b) => (a.stats?.winRate ?? 0) - (b.stats?.winRate ?? 0))
      .slice(0, 3);
    // Meta: high WR AND drafted early
    meta = cards
      .filter(c => c.stats?.winRate > avgWinRate && c.stats?.rankPosition < avgRank)
      .sort((a, b) => (b.stats?.winRate ?? 0) - (a.stats?.winRate ?? 0))
      .slice(0, 3);
  } else {
    const avgPicks = cards.reduce((sum, c) => sum + (c.stats?.timesPicked ?? 0), 0) / cards.length;
    underrated = cards
      .filter(c => c.stats?.winRate > avgWinRate && c.stats?.timesPicked < avgPicks)
      .sort((a, b) => (b.stats?.winRate ?? 0) - (a.stats?.winRate ?? 0))
      .slice(0, 3);
    overrated = cards
      .filter(c => c.stats?.winRate < avgWinRate && c.stats?.timesPicked > avgPicks)
      .sort((a, b) => (a.stats?.winRate ?? 0) - (b.stats?.winRate ?? 0))
      .slice(0, 3);
    meta = cards
      .filter(c => c.stats?.winRate > avgWinRate && c.stats?.timesPicked > avgPicks)
      .sort((a, b) => (b.stats?.winRate ?? 0) - (a.stats?.winRate ?? 0))
      .slice(0, 3);
  }
  
  const gemDesc = isCommunity ? "High win rate, drafted late" : "High win rate, low picks";
  const overDesc = isCommunity ? "Drafted early but underperforming" : "Popular but underperforming";
  const metaDesc = isCommunity ? "Drafted early AND winning" : "Popular AND winning";
  
  let html = "";
  
  if (underrated.length > 0) {
    html += `<div class="analysis-section">
      <h5 class="analysis-title">\u{1F48E} Hidden Gems</h5>
      <p class="analysis-desc">${gemDesc}</p>
      <ul class="analysis-list">
        ${underrated.map(c => `<li class="analysis-item" data-card="${c.name}"><span class="analysis-name">${c.name}</span> <span class="analysis-stat">${c.stats?.winRate?.toFixed(1)}% WR</span></li>`).join("")}
      </ul>
    </div>`;
  }
  
  if (overrated.length > 0) {
    html += `<div class="analysis-section">
      <h5 class="analysis-title">\u{1F4C9} Overrated</h5>
      <p class="analysis-desc">${overDesc}</p>
      <ul class="analysis-list">
        ${overrated.map(c => `<li class="analysis-item" data-card="${c.name}"><span class="analysis-name">${c.name}</span> <span class="analysis-stat">${c.stats?.winRate?.toFixed(1)}% WR</span></li>`).join("")}
      </ul>
    </div>`;
  }
  
  if (meta.length > 0) {
    html += `<div class="analysis-section">
      <h5 class="analysis-title">\u{1F525} Meta Picks</h5>
      <p class="analysis-desc">${metaDesc}</p>
      <ul class="analysis-list">
        ${meta.map(c => `<li class="analysis-item" data-card="${c.name}"><span class="analysis-name">${c.name}</span> <span class="analysis-stat">${c.stats?.winRate?.toFixed(1)}% WR</span></li>`).join("")}
      </ul>
    </div>`;
  }
  
  if (!html) {
    html = `<p class="analysis-desc">Not enough data variance for analysis</p>`;
  }
  
  container.innerHTML = html;
  
  // Add click handlers to analysis items
  container.querySelectorAll(".analysis-item").forEach(item => {
    item.addEventListener("click", () => {
      const name = item.dataset.card;
      const card = appState.allCards.find(c => c.name === name);
      if (card) openModal(card);
    });
  });
}

function getCardTier(card, sortedCards) {
  const index = sortedCards.findIndex(c => c.name === card.name);
  const percentile = (index / sortedCards.length) * 100;
  
  if (percentile <= 10) return { tier: "S", label: "S", color: "tier-s" };
  if (percentile <= 30) return { tier: "A", label: "A", color: "tier-a" };
  if (percentile <= 70) return { tier: "B", label: "B", color: "tier-b" };
  if (percentile <= 90) return { tier: "C", label: "C", color: "tier-c" };
  return { tier: "D", label: "D", color: "tier-d" };
}

function renderTierList(cards, container) {
  // Sort cards by win rate descending
  const sorted = [...cards].sort((a, b) => (b.stats?.winRate ?? 0) - (a.stats?.winRate ?? 0));
  
  // Group cards by tier
  const tiers = {
    S: { cards: [], label: "S", desc: "Exceptional" },
    A: { cards: [], label: "A", desc: "Strong" },
    B: { cards: [], label: "B", desc: "Average" },
    C: { cards: [], label: "C", desc: "Weak" },
    D: { cards: [], label: "D", desc: "Struggling" },
  };
  
  sorted.forEach(card => {
    const tierInfo = getCardTier(card, sorted);
    tiers[tierInfo.tier].cards.push(card);
  });
  
  let html = "";
  
  for (const [key, tier] of Object.entries(tiers)) {
    if (tier.cards.length === 0) continue;
    
    html += `
      <div class="tier-row">
        <div class="tier-label tier-${key.toLowerCase()}">${tier.label}</div>
        <div class="tier-cards">
          ${tier.cards.map(card => `
            <div class="tier-card" data-card="${card.name}" title="${card.name}: ${card.stats?.winRate?.toFixed(1)}% WR">
              <span class="tier-card-name">${card.name}</span>
              <span class="tier-card-wr">${card.stats?.winRate?.toFixed(1)}%</span>
            </div>
          `).join("")}
        </div>
      </div>
    `;
  }
  
  container.innerHTML = html;
  
  // Add click handlers to tier cards
  container.querySelectorAll(".tier-card").forEach(tierCard => {
    tierCard.addEventListener("click", () => {
      const name = tierCard.dataset.card;
      const card = appState.allCards.find(c => c.name === name);
      if (card) openModal(card);
    });
  });
}

function renderInsights(leaders, lore, gamesOverride, metric, allCardsOverride) {
  metric = metric || el.metric?.value || "winRate";
  const allCards = allCardsOverride ?? [...leaders, ...lore];
  const insights = calculateInsights(leaders, lore, gamesOverride, allCards);
  
  // Store insights in state for badge rendering
  appState.insights = insights;
  
  // Render All Cards insights
  renderScatterChart(allCards, el.allScatterChart, "all");
  renderHistogram(allCards, el.allHistogram, "all", metric);
  renderCardAnalysis(allCards, el.allAnalysis);
  renderTierList(allCards, el.allTierList);
  
  // Render Leader insights
  renderScatterChart(leaders, el.leaderScatterChart, "leader");
  renderHistogram(leaders, el.leaderHistogram, "leader", metric);
  renderCardAnalysis(leaders, el.leaderAnalysis);
  renderTierList(leaders, el.leaderTierList);
  
  // Render Lore insights
  renderScatterChart(lore, el.loreScatterChart, "lore");
  renderHistogram(lore, el.loreHistogram, "lore", metric);
  renderCardAnalysis(lore, el.loreAnalysis);
  renderTierList(lore, el.loreTierList);
}

function refreshHistograms(metric) {
  const allCards = appState.allCards?.length ? appState.allCards : [...appState.leaders, ...appState.lore];
  renderHistogram(allCards, el.allHistogram, "all", metric);
  renderHistogram(appState.leaders, el.leaderHistogram, "leader", metric);
  renderHistogram(appState.lore, el.loreHistogram, "lore", metric);
}

// ========== Card Rendering ==========
function getScore(card, metric) {
  if (metric === "draftRank") {
    // For draft rank, lower rankPosition is better (earlier pick)
    // Return negative rankPosition so lower positions sort first
    return -(card.stats?.rankPosition ?? 999);
  }
  return card.stats?.[metric] ?? 0;
}

function sortCards(cards, metric) {
  return [...cards].sort((a, b) => {
    const diff = getScore(b, metric) - getScore(a, metric);
    return diff !== 0 ? diff : a.name.localeCompare(b.name);
  });
}

function matchesFilter(card, query) {
  if (!query) return true;
  // Filter out placeholder cards
  const normalizedCardName = normalizeText(card.name);
  if (normalizedCardName === 'card' || normalizedCardName === 'cardcustom') return false;
  return normalizedCardName.includes(normalizeText(query));
}

function createCardElement(card, rank, metric) {
  const div = document.createElement("div");
  div.className = "card";
  div.dataset.cardName = card.name;
  
  const imgUrl = getImageUrl(card);
  const isRotated = normalizeText(card.imageClass) === "rotated";
  const winRate = card.stats?.winRate ?? 0;
  const isCommunity = card.stats?.isCommunity;
  
  let rankClass = "";
  if (rank === 1) rankClass = "rank-1";
  else if (rank === 2) rankClass = "rank-2";
  else if (rank === 3) rankClass = "rank-3";
  
  // Check if card is selected for comparison
  const isSelected = appState.compareCards.some((c) => c?.name === card.name);
  if (isSelected) div.classList.add("selected");
  
  let statsHtml;
  if (isCommunity) {
    const pos = card.stats?.rankPosition ?? "–";
    statsHtml = `
        <div class="stat">
          <span class="stat-value ${metric === 'winRate' ? 'highlight' : ''}">${winRate.toFixed(1)}%</span>
          <span class="stat-label">Win Rate</span>
        </div>
        <div class="stat">
          <span class="stat-value ${metric === 'draftRank' ? 'highlight' : ''}">${pos}</span>
          <span class="stat-label">Draft Rank</span>
        </div>
    `;
  } else {
    const picks = card.stats?.timesPicked ?? 0;
    const wins = card.stats?.wins ?? 0;
    statsHtml = `
        <div class="stat">
          <span class="stat-value ${metric === 'winRate' ? 'highlight' : ''}">${winRate.toFixed(1)}%</span>
          <span class="stat-label">Win Rate</span>
        </div>
        <div class="stat">
          <span class="stat-value ${metric === 'wins' ? 'highlight' : ''}">${wins}</span>
          <span class="stat-label">Wins</span>
        </div>
        <div class="stat">
          <span class="stat-value ${metric === 'timesPicked' ? 'highlight' : ''}">${picks}</span>
          <span class="stat-label">Picked</span>
        </div>
    `;
  }
  
  div.innerHTML = `
    <div class="card-rank ${rankClass}">${rank}</div>
    <div class="card-image">
      ${imgUrl ? `<img src="${imgUrl}" alt="${card.name}" loading="lazy" ${isRotated ? 'class="rotated"' : ''}>` : ""}
    </div>
    <div class="card-info">
      <div class="card-name">${getDisplayCardName(card.name)}</div>
      <div class="card-stats">
        ${statsHtml}
      </div>
    </div>
  `;
  
  // Click handler
  div.addEventListener("click", () => {
    if (appState.compareMode) {
      toggleCompareCard(card);
    } else {
      openModal(card);
    }
  });
  
  return div;
}

function renderCards(cards, container, metric, query) {
  const filtered = cards.filter((c) => matchesFilter(c, query));
  const sorted = sortCards(filtered, metric);
  
  container.innerHTML = "";
  sorted.forEach((card, i) => {
    container.appendChild(createCardElement(card, i + 1, metric));
  });
}

// ========== Render Games ==========
function renderGames(games, container) {
  if (!games || games.length === 0) {
    container.innerHTML = `<div style="padding:2rem;text-align:center;color:var(--text-muted)">No games available</div>`;
    return;
  }
  
  // Helper function to get color for each act
  const getActColor = (actNumber) => {
    const colors = {
      "I": "#3b82f6",      // Blue
      "II": "#8b5cf6",     // Purple
      "III": "#ef4444"     // Red
    };
    return colors[actNumber] || "var(--accent)";
  };
  
  const sortPlayerCards = (cards) => {
    return [...cards].sort((a, b) => {
      const getOrder = (card) => {
        const rawName = String(card?.name ?? "").trim();
        const typeNorm = normalizeText(card?.type);
        const nameNorm = normalizeText(rawName);
        
        // Leader or Fate first (order 0)
        if (typeNorm === 'leader' || typeNorm === 'fate' || /^leader:/i.test(rawName) || /^fate:/i.test(rawName)) return 0;
        
        // Imperial Regent or Outlaw second (order 1)
        if (nameNorm === 'imperial regent' || nameNorm === 'outlaw') return 1;
        
        // First Regent third (order 2)
        if (nameNorm === 'first regent') return 2;
        
        // Lore next (order 3)
        if (typeNorm === 'lore' || /^lore:/i.test(rawName)) return 3;
        
        return 4;
      };

      const aOrder = getOrder(a);
      const bOrder = getOrder(b);
      return aOrder - bOrder;
    });
  };
  
  container.innerHTML = games.map((game, idx) => {
    // Helper function to render player rows for a given set of players
    const renderPlayerRows = (players) => {
      return players.map(p => {
        const sortedCards = sortPlayerCards(p.cards);
          const cardImages = sortedCards.length > 0 
          ? sortedCards.map(card => {
              const imgUrl = getImageUrl(card);
              const isRotated = normalizeText(card.imageClass) === "rotated";
              const nameNorm = normalizeText(card.name || '');
              // Do not show placeholder or image for generic 'Card' or 'CardCustom' entries
              if (nameNorm === 'card' || nameNorm === 'cardcustom') return '';
              const displayName = getDisplayCardName(card.name);
              return imgUrl 
                ? `<img src="${imgUrl}" alt="${displayName}" data-card="${card.name}" class="game-card-image ${isRotated ? 'rotated' : ''}" loading="lazy" style="cursor: pointer;">` 
                : `<span class="game-card-placeholder" data-card="${card.name}" style="cursor: pointer;">${getDisplayCardName(card.name)}</span>`;
            }).join("")
          : '<span style="color:var(--text-muted);font-size:0.9rem">No cards</span>';
        
        const playerColor = getPlayerColorHex(p.color);
        return `<div class="game-player ${p.isWinner ? "game-winner" : ""}"><div class="game-player-header"><span class="game-player-name player-link" data-player="${(p.name || "Unknown").replace(/"/g, '&quot;')}" style="cursor:pointer;color:${playerColor};">${p.name || "Unknown"}</span><span class="game-player-color" style="color:${playerColor}">●</span><span class="game-player-power">${p.power} Power</span>${p.objective !== undefined ? `<span class="game-player-objective" style="font-size:0.85rem;color: ${p.campaignResult === 'success' ? 'var(--color-success, #4ade80)' : 'var(--color-failure, #f87171)'};margin-left:0.5rem">Obj: ${p.objective} ${p.campaignResult === 'success' ? '✓' : '✗'}</span>` : ''}${p.isWinner ? '<span class="game-winner-badge">🏆 Winner</span>' : ''}</div><div class="game-player-cards">${cardImages}</div></div>`;
      }).join("");
    };
    
    // Format date in international order (DD-MM-YYYY)
    let formattedDate = "—";
    if (game.time) {
      const datePart = game.time.split(" ")[0]; // Get only the date part
      const [month, day, year] = datePart.split("/");
      formattedDate = `${day.padStart(2, "0")}-${month.padStart(2, "0")}-${year}`;
    }
    
    // Handle campaign games with multiple acts
    if (game.isCampaign && game.acts && game.acts.length > 0) {
      const actsHtml = game.acts.map(act => {
        const actColor = getActColor(act.actNumber);
        const actPlayerRows = renderPlayerRows(act.players);
        // Format act date (DD-MM-YYYY)
        let actDate = "—";
        if (act.time) {
          const datePart = (act.time + "").split(" ")[0];
          const [month, day, year] = datePart.split("/");
          if (month && day && year) actDate = `${day.padStart(2, "0")}-${month.padStart(2, "0")}-${year}`;
        }
        return `<div style="border-left: 4px solid ${actColor}; padding-left: 1rem; margin-bottom: 1rem;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.25rem;">
            <h4 style="margin: 0; color: ${actColor};">Act ${act.actNumber}</h4>
            <span style="color:${actColor}; font-size:0.9rem;">${actDate}</span>
          </div>
          <div class="game-players">${actPlayerRows}</div>
        </div>`;
      }).join("");
      
      return `<div class="game-card" style="transition:all 0.2s;"><div class="game-header"><h3 class="game-title">Campaign ${game.gameId}</h3></div><div style="padding: 1rem;">${actsHtml}</div></div>`;
    } else {
      // Non-campaign game
      const playerRows = renderPlayerRows(game.players);
      return `<div class="game-card" style="transition:all 0.2s;"><div class="game-header"><h3 class="game-title">Game ${game.gameId}</h3><span class="game-timestamp">${formattedDate}</span></div><div class="game-players">${playerRows}</div></div>`;
    }
  }).join("");
  
  // Add click handlers to cards, player names, and game cards
  container.querySelectorAll("[data-card]").forEach(elem => {
    elem.addEventListener("click", () => {
      const name = elem.dataset.card;
      const card = appState.allCards.find(c => c.name === name);
      if (card) openModal(card);
    });
  });
  
  container.querySelectorAll("[data-player]").forEach(elem => {
    elem.addEventListener("click", () => {
      const playerName = elem.dataset.player;
      showPlayerProfile(playerName);
    });
  });
  
  // Game cards are not clickable anymore (no detailed view on click)
  
  container.querySelectorAll("[data-player]").forEach(elem => {
    elem.addEventListener("click", () => {
      const playerName = elem.dataset.player;
      showPlayerProfile(playerName);
    });
  });
}

// ========== Render Leaderboard ==========
function renderLeaderboard(playerStats, container) {
  if (!playerStats || playerStats.length === 0) {
    container.innerHTML = `<div style="padding:2rem;text-align:center;color:var(--text-muted)">No leaderboard data available</div>`;
    return;
  }

  const breakdown = appState.leaderboardBreakdown || null;

  const buildContent = (statsArray) => {
    const getMedalColor = (rank) => {
      if (rank === 0) return { bg: 'rgb(255, 215, 0)', medal: '🥇' };
      if (rank === 1) return { bg: 'rgb(192, 192, 192)', medal: '🥈' };
      if (rank === 2) return { bg: 'rgb(205, 127, 50)', medal: '🥉' };
      return { bg: 'var(--bg)', medal: '' };
    };

    const getPodiumStyle = (rank) => {
      if (rank === 0) return 'padding: 16px; font-size: 1.2em; border-radius: 8px; order: 1;';
      if (rank === 1) return 'padding: 12px; font-size: 1.05em; border-radius: 6px; order: 2;';
      if (rank === 2) return 'padding: 10px; font-size: 0.95em; border-radius: 4px; order: 3;';
      return 'padding: 8px; border-radius: 4px; order: 4;';
    };

    let html = `
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 24px; padding: 20px 0;">
    `;

    // Most Wins - only include players with at least one win
    const topWinners = [...statsArray].filter(p => p.wins && p.wins > 0).sort((a, b) => b.wins - a.wins);
    html += `
      <div style="background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius); padding: 20px;">
        <h3 style="margin: 0 0 16px 0; color: var(--accent);"> Most Wins</h3>
        <div style="display: flex; flex-direction: column; gap: 8px;">
    `;
    if (topWinners.length === 0) {
      html += `<div style="color:var(--text-muted); padding:12px;">No players with wins yet</div>`;
    } else {
      topWinners.forEach((p, i) => {
        const medal = getMedalColor(i);
        const podiumStyle = getPodiumStyle(i);
        const textColor = i < 3 ? 'color: black; text-shadow: 0 1px 2px rgba(255,255,255,0.3);' : '';
        html += `
          <div style="display: flex; justify-content: space-between; align-items: center; ${podiumStyle} background: ${medal.bg};">
            <span style="font-weight: 700; ${textColor}"><span class="leaderboard-player-name player-link" data-player="${(p.name).replace(/"/g, '&quot;')}" style="cursor:pointer;">${medal.medal} ${i + 1}. ${p.name}</span></span>
            <span style="font-weight: 700; ${textColor}">${p.wins} wins</span>
          </div>
        `;
      });
    }
    html += `</div></div>`;

    // Most Games Played
    const mostGames = [...statsArray].sort((a, b) => b.games - a.games);
    html += `
      <div style="background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius); padding: 20px;">
        <h3 style="margin: 0 0 16px 0; color: var(--accent);"> Most Games Played</h3>
        <div style="display: flex; flex-direction: column; gap: 8px;">
    `;
    mostGames.forEach((p, i) => {
      const medal = getMedalColor(i);
      const podiumStyle = getPodiumStyle(i);
      const textColor = i < 3 ? 'color: black; text-shadow: 0 1px 2px rgba(255,255,255,0.3);' : '';
      html += `
        <div style="display: flex; justify-content: space-between; align-items: center; ${podiumStyle} background: ${medal.bg};">
          <span style="font-weight: 700; ${textColor}"><span class="leaderboard-player-name player-link" data-player="${(p.name).replace(/"/g, '&quot;')}" style="cursor:pointer;">${medal.medal} ${i + 1}. ${p.name}</span></span>
          <span style="font-weight: 700; ${textColor}">${p.games} games</span>
        </div>
      `;
    });
    html += `</div></div>`;

    // Highest Win Rate
    const highestWR = [...statsArray].filter(p => p.games >= 3).sort((a, b) => b.winRate - a.winRate);
    html += `
      <div style="background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius); padding: 20px;">
        <h3 style="margin: 0 0 16px 0; color: var(--accent);">Highest Win Rate <span style="font-size: 0.75em; color: var(--text-muted);">(min 3 games)</span></h3>
        <div style="display: flex; flex-direction: column; gap: 8px;">
    `;
    highestWR.forEach((p, i) => {
      const medal = getMedalColor(i);
      const podiumStyle = getPodiumStyle(i);
      const textColor = i < 3 ? 'color: black; text-shadow: 0 1px 2px rgba(255,255,255,0.3);' : '';
      const denom = (p.weightedGames !== undefined && p.weightedGames !== null) ? p.weightedGames : p.games;
      const denomDisplay = Number.isInteger(denom) ? String(denom) : denom.toFixed(2);
      html += `
        <div style="display: flex; justify-content: space-between; align-items: center; ${podiumStyle} background: ${medal.bg};">
          <span style="font-weight: 700; ${textColor}"><span class="leaderboard-player-name player-link" data-player="${(p.name).replace(/"/g, '&quot;')}" style="cursor:pointer;">${medal.medal} ${i + 1}. ${p.name}</span></span>
          <span style="font-weight: 700; ${textColor}">${p.wins}/${denomDisplay} • ${p.winRate.toFixed(1)}%</span>
        </div>
      `;
    });
    html += `</div></div>`;

    html += `</div>`;
    return html;
  };

  // If breakdown exists, render a selector and allow toggling between combined/base/campaign
  if (breakdown) {
    const selectorHtml = `
      <style>
        .lb-view-btn { padding:8px 12px; border-radius:8px; border:1px solid rgba(0,0,0,0.06); background:var(--bg-card); cursor:pointer; font-weight:600; color:var(--text); }
        .lb-view-btn.active { background:var(--accent); color:#fff; box-shadow:0 6px 18px rgba(0,0,0,0.08); transform:translateY(-1px); }
        .lb-view-btn:hover { opacity:0.95; transform:translateY(-1px); }
        .lb-view-btn:focus { outline:2px solid rgba(0,0,0,0.06); }
      </style>
      <div style="margin-bottom:12px; display:flex; gap:8px; align-items:center;">
        <button class="lb-view-btn active" data-view="combined">All</button>
        <button class="lb-view-btn" data-view="base">Base</button>
        <button class="lb-view-btn" data-view="campaign">Campaign</button>
      </div>
    `;

    container.innerHTML = selectorHtml + `<div class="leaderboard-content">` + buildContent(breakdown.combined) + `</div>`;

    // attach selector handlers
    container.querySelectorAll('.lb-view-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        container.querySelectorAll('.lb-view-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const view = btn.dataset.view;
        const contentDiv = container.querySelector('.leaderboard-content');
        if (!contentDiv) return;
        if (view === 'base') contentDiv.innerHTML = buildContent(breakdown.base);
        else if (view === 'campaign') contentDiv.innerHTML = buildContent(breakdown.campaign);
        else contentDiv.innerHTML = buildContent(breakdown.combined);

        // rewire player name click handlers inside updated content
        contentDiv.querySelectorAll('.leaderboard-player-name').forEach(elem => {
          elem.addEventListener('click', () => showPlayerProfile(elem.dataset.player));
        });
      });
    });

    // initial wiring
    container.querySelectorAll('.leaderboard-player-name').forEach(elem => {
      elem.addEventListener('click', () => showPlayerProfile(elem.dataset.player));
    });

    return;
  }

  // Fallback: render using provided playerStats array
  container.innerHTML = buildContent(playerStats);
  container.querySelectorAll('.leaderboard-player-name').forEach(elem => {
    elem.addEventListener('click', () => showPlayerProfile(elem.dataset.player));
  });
}

// ========== Player Stats ==========
function getUniquePlayers(games) {
  const players = new Set();
  if (!games) return [];
  for (const game of games) {
    if (game.players && Array.isArray(game.players)) {
      for (const player of game.players) {
        if (player.name) players.add(player.name);
      }
    }
  }
  return Array.from(players).sort();
}

function computePlayerStats(playerName, games) {
  const playerGames = [];
  const campaignActsByGameId = {}; // Collect acts for each campaign
  const leaderStats = {};
  const opponentStats = {};
  let wins = 0;
  let countedGames = 0; // games that had a winner and should be counted for win rate

  if (!games) return { playerGames, leaderStats, opponentStats, wins, winRate: 0, totalGames: 0, countedGames: 0 };

  for (const game of games) {
    // Handle campaign games with multiple acts
    if (game.isCampaign && game.acts && game.acts.length > 0) {
      // Collect acts for this campaign that the player participated in
      const playerActs = [];
      
      for (const act of game.acts) {
        const playerInGame = act.players.find(p => p.name === playerName);
        if (!playerInGame) continue;

        playerActs.push(act);
        
        // Determine weight for win-rate counting
        const hasWinner = act.players.some(p => p.isWinner);
        const isActIII = /Act\s+III/i.test(act.mode || "");
        const weight = hasWinner ? 1 : (isActIII ? 0.33 : 0);
        if (weight > 0) {
          countedGames += weight;
          if (hasWinner && playerInGame.isWinner) wins++;
        }

        // Track leaders/fates played
        if (playerInGame.cards) {
          for (const card of playerInGame.cards) {
            const cardName = card?.name || '';
            const cardType = normalizeText(card?.type);
            const hasLeaderPrefix = /^leader:/i.test(cardName);
            const hasFatePrefix = /^fate:/i.test(cardName);
            const isLeaderOrFate = cardType === 'leader' || cardType === 'fate' || hasLeaderPrefix || hasFatePrefix;
            const normalizedCardName = normalizeText(cardName);
            if (normalizedCardName === 'card' || normalizedCardName === 'cardcustom') continue;
            if (cardName && isLeaderOrFate) {
              leaderStats[cardName] = (leaderStats[cardName] || 0) + 1;
            }
          }
        }

        // Track opponents
        for (const opponent of act.players) {
          if (opponent.name !== playerName && opponent.name) {
            opponentStats[opponent.name] = (opponentStats[opponent.name] || 0) + 1;
          }
        }
      }
      
      // If player was in any acts of this campaign, store them for later reconstruction
      if (playerActs.length > 0) {
        campaignActsByGameId[game.gameId] = {
          gameId: game.gameId,
          time: game.time,
          acts: playerActs
        };
      }
    } else {
      // Non-campaign game
      if (!game.players) continue;
      const playerInGame = game.players.find(p => p.name === playerName);
      if (!playerInGame) continue;

      playerGames.push(game);
      const hasWinner = game.players.some(p => p.isWinner);
      const isActIII = /Act\s+III/i.test(game.mode || "");
      const weight = hasWinner ? 1 : (isActIII ? 0.33 : 0);
      if (weight > 0) {
        countedGames += weight;
        if (hasWinner && playerInGame.isWinner) wins++;
      }

      // Track leaders/fates played
      if (playerInGame.cards) {
        for (const card of playerInGame.cards) {
          const cardName = card?.name || '';
          const cardType = normalizeText(card?.type);
          const hasLeaderPrefix = /^leader:/i.test(cardName);
          const hasFatePrefix = /^fate:/i.test(cardName);
          const isLeaderOrFate = cardType === 'leader' || cardType === 'fate' || hasLeaderPrefix || hasFatePrefix;
          const normalizedCardName = normalizeText(cardName);
          if (normalizedCardName === 'card' || normalizedCardName === 'cardcustom') continue;
          if (cardName && isLeaderOrFate) {
            leaderStats[cardName] = (leaderStats[cardName] || 0) + 1;
          }
        }
      }

      // Track opponents
      for (const opponent of game.players) {
        if (opponent.name !== playerName && opponent.name) {
          opponentStats[opponent.name] = (opponentStats[opponent.name] || 0) + 1;
        }
      }
    }
  }

  // Add reconstructed campaigns to playerGames
  for (const gameId in campaignActsByGameId) {
    const campaignData = campaignActsByGameId[gameId];
    playerGames.push({
      gameId: campaignData.gameId,
      time: campaignData.time,
      mode: "Campaign",
      acts: campaignData.acts,
      players: campaignData.acts[campaignData.acts.length - 1].players,
      isCampaign: true
    });
  }

  const totalGames = playerGames.length;
  const winRate = countedGames > 0 ? ((wins / countedGames) * 100).toFixed(1) : 0;

  return { playerGames, leaderStats, opponentStats, wins, winRate, totalGames, countedGames };
}

function renderPlayerStats(playerName, stats, container) {
  if (!stats || stats.totalGames === 0) {
    container.innerHTML = `<div style="padding:2rem;text-align:center;color:var(--text-muted)">No games found for this player</div>`;
    return;
  }

  const { leaderStats, opponentStats, wins, winRate, totalGames, playerGames } = stats;

  // Sort leaders by usage
  const topLeaders = Object.entries(leaderStats)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  // Sort opponents by games played
  const topOpponents = Object.entries(opponentStats)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  let html = `
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 24px; margin-bottom: 32px;">
      <div style="background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius); padding: 20px; text-align: center;">
        <div style="font-size: 0.9rem; color: var(--text-muted); margin-bottom: 8px;">Games Played</div>
        <div style="font-size: 2.5em; font-weight: 700; color: var(--accent);">${totalGames}</div>
      </div>
      <div style="background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius); padding: 20px; text-align: center;">
        <div style="font-size: 0.9rem; color: var(--text-muted); margin-bottom: 8px;">Wins</div>
        <div style="font-size: 2.5em; font-weight: 700; color: var(--accent);">${wins}</div>
      </div>
      <div style="background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius); padding: 20px; text-align: center;">
        <div style="font-size: 0.9rem; color: var(--text-muted); margin-bottom: 8px;">Win Rate</div>
        <div style="font-size: 2.5em; font-weight: 700; color: var(--accent);">${winRate}%</div>
      </div>
    </div>

    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 24px; margin-bottom: 32px;">
      <div style="background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius); padding: 20px;">
        <h4 style="margin: 0 0 16px 0; color: var(--accent);">Most Played Leaders/Fates</h4>
        <div style="display: flex; flex-direction: column; gap: 8px;">
  `;

  if (topLeaders.length > 0) {
    topLeaders.forEach(([leader, count]) => {
      // percentage removed by request; show raw counts only
      let leaderCard = appState.allCards.find(
        (c) => normalizeCardNameForLookup(c.name) === normalizeCardNameForLookup(leader)
      );
      
      // If not found and the leader name contains " / ", try just the first part
      if (!leaderCard && leader.includes(' / ')) {
        const firstPart = leader.split(' / ')[0].trim();
        leaderCard = appState.allCards.find(
          (c) => normalizeCardNameForLookup(c.name) === normalizeCardNameForLookup(firstPart)
        );
      }
      
      const leaderImgUrl = leaderCard
        ? getImageUrl(leaderCard)
        : getImageUrl({
            name: leader,
            image: null,
            type: /^fate:/i.test(leader) ? "Fate" : "Leader",
          });
      const leaderDisplayName = getDisplayCardName(leader);
      html += `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 20px 0; border-bottom: 1px solid var(--border); cursor: pointer;" data-card="${leader.replace(/"/g, '&quot;')}">
          <span style="display:flex; align-items:center; gap:18px; min-width:0;">
            ${leaderImgUrl ? `<img src="${leaderImgUrl}" alt="${leaderDisplayName}" loading="lazy" style="width:192px;height:192px;object-fit:contain;border-radius:10px;flex:0 0 auto; pointer-events: none;">` : ""}
            <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${leaderDisplayName}</span>
          </span>
          <span style="color: var(--accent); font-weight: 600;">${count}x</span>
        </div>
      `;
    });
  } else {
    html += `<span style="color: var(--text-muted);">No leaders played</span>`;
  }

  html += `
        </div>
      </div>

      <div style="background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius); padding: 20px;">
        <h4 style="margin: 0 0 16px 0; color: var(--accent);"> Most Common Opponents</h4>
        <div style="display: flex; flex-direction: column; gap: 8px;">
  `;

  if (topOpponents.length > 0) {
    topOpponents.forEach(([opponent, count]) => {
      html += `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--border); cursor: pointer;" data-player="${opponent.replace(/"/g, '&quot;')}">
          <span style="cursor: pointer;">${opponent}</span>
          <span style="color: var(--accent); font-weight: 600;">${count}x</span>
        </div>
      `;
    });
  } else {
    html += `<span style="color: var(--text-muted);">No opponents</span>`;
  }

  html += `
        </div>
      </div>
    </div>

    <h3 style="margin: 32px 0 16px 0; color: var(--accent);"> Games</h3>
  `;

  container.innerHTML = html;

  // Render games for this player
  const gamesDiv = document.createElement('div');
  renderGames(playerGames, gamesDiv);
  container.appendChild(gamesDiv);
}

// ========== Modal ==========
function openModal(card) {
  appState.currentModalCard = card;
  const imgUrl = getImageUrl(card);
  const displayName = getDisplayCardName(card.name);
  
  // Update page title and meta tags for sharing
  document.title = `${displayName} - Arcs Arsenal`;
  const ogTitle = document.querySelector('meta[property="og:title"]');
  if (ogTitle) ogTitle.setAttribute('content', `${displayName} - Arcs Arsenal`);
  const twitterTitle = document.querySelector('meta[name="twitter:title"]');
  if (twitterTitle) twitterTitle.setAttribute('content', `${displayName} - Arcs Arsenal`);
  const desc = `View stats for ${displayName} in Arcs. Win rate: ${card.stats?.winRate?.toFixed(1)}%`;
  const ogDesc = document.querySelector('meta[property="og:description"]');
  if (ogDesc) ogDesc.setAttribute('content', desc);
  const twitterDesc = document.querySelector('meta[name="twitter:description"]');
  if (twitterDesc) twitterDesc.setAttribute('content', desc);
  const ogImage = document.querySelector('meta[property="og:image"]');
  if (ogImage && imgUrl) ogImage.setAttribute('content', imgUrl);
  const twitterImage = document.querySelector('meta[name="twitter:image"]');
  if (twitterImage && imgUrl) twitterImage.setAttribute('content', imgUrl);
  
  el.modalImg.src = imgUrl || "";
  el.modalImg.alt = card.name;
  el.modalName.textContent = displayName;
  el.modalText.innerHTML = formatCardText(card.text);
  
  const winRate = card.stats?.winRate ?? 0;
  const isCommunity = card.stats?.isCommunity;
  
  if (isCommunity) {
    const pos = card.stats?.rankPosition ?? "–";
    el.modalStats.innerHTML = `
      <div class="stat">
        <span class="stat-value highlight">${winRate.toFixed(1)}%</span>
        <span class="stat-label">Win Rate</span>
      </div>
      <div class="stat">
        <span class="stat-value">${pos}</span>
        <span class="stat-label">Draft Rank</span>
      </div>
    `;
  } else {
    const wins = card.stats?.wins ?? 0;
    const picks = card.stats?.timesPicked ?? 0;
    el.modalStats.innerHTML = `
      <div class="stat">
        <span class="stat-value highlight">${winRate.toFixed(1)}%</span>
        <span class="stat-label">Win Rate</span>
      </div>
      <div class="stat">
        <span class="stat-value">${wins}</span>
        <span class="stat-label">Wins</span>
      </div>
      <div class="stat">
        <span class="stat-value">${picks}</span>
        <span class="stat-label">Times Picked</span>
      </div>
    `;
  }
  
  el.modal.classList.remove("hidden");
  document.body.style.overflow = "hidden";
}

function closeModal() {
  el.modal.classList.add("hidden");
  document.body.style.overflow = "";
  
  // Reset page title and meta tags
  document.title = "Arcs Arsenal - Rankings";
  const ogTitle = document.querySelector('meta[property="og:title"]');
  if (ogTitle) ogTitle.setAttribute('content', 'Arcs Arsenal - Rankings');
  const twitterTitle = document.querySelector('meta[name="twitter:title"]');
  if (twitterTitle) twitterTitle.setAttribute('content', 'Arcs Arsenal - Rankings');
  const desc = "Arcs cards ranked with win rates and pick statistics.";
  const ogDesc = document.querySelector('meta[property="og:description"]');
  if (ogDesc) ogDesc.setAttribute('content', desc);
  const twitterDesc = document.querySelector('meta[name="twitter:description"]');
  if (twitterDesc) twitterDesc.setAttribute('content', desc);
  const ogImage = document.querySelector('meta[property="og:image"]');
  if (ogImage) ogImage.setAttribute('content', './favicon.svg');
  const twitterImage = document.querySelector('meta[name="twitter:image"]');
  if (twitterImage) twitterImage.setAttribute('content', './favicon.svg');
}

function getPlayerColorHex(colorName) {
  const colorMap = {
    'red': '#e74c3c',
    'blue': '#3498db',
    'green': '#2ecc71',
    'yellow': '#f1c40f',
    'purple': '#9b59b6',
    'orange': '#e67e22',
    'pink': '#ff1493',
    'teal': '#1abc9c',
    'white': '#f5f5f5',
    'black': '#2c3e50',
    'gray': '#95a5a6'
  };
  
  const normalized = String(colorName ?? '').toLowerCase().trim();
  return colorMap[normalized] || colorMap['gray'];
}

function shareCard(card) {
  const url = new URL(window.location);
  url.searchParams.set('card', encodeURIComponent(card.name));
  navigator.clipboard.writeText(url.toString()).then(() => {
    alert('Shareable link copied to clipboard!');
  }).catch(() => {
    alert(`Shareable link:\n${url.toString()}`);
  });
}

function renderGameDetail(game) {
  const container = document.createElement('div');
  container.style.cssText = 'padding: 2rem; max-width: 900px; margin: 0 auto;';
  
  // Format date
  let formattedDate = "—";
  if (game.time) {
    const datePart = game.time.split(" ")[0];
    const [month, day, year] = datePart.split("/");
    formattedDate = `${day.padStart(2, "0")}-${month.padStart(2, "0")}-${year}`;
  }
  
  // Build player details HTML
  const playerDetails = game.players.map(p => {
    const playerColor = getPlayerColorHex(p.color);
    const cardsList = p.cards.map(c => `<div style="padding: 4px 8px; background: rgba(255,255,255,0.05); border-radius: 4px; font-size: 0.9rem;">${c.name || c}</div>`).join('');
    
    return `
      <div style="background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius); padding: 1.5rem; margin-bottom: 1rem;">
        <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 1rem;">
          <span style="font-size: 1.2rem; font-weight: bold; color: ${playerColor};">${p.name || "Unknown"}</span>
          <span style="color: ${playerColor}; font-size: 1.5rem;">●</span>
          <span>${p.color}</span>
          ${p.isWinner ? '<span style="background: gold; color: black; padding: 4px 12px; border-radius: 4px; font-weight: bold;">🏆 Winner</span>' : ''}
        </div>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1rem; margin-bottom: 1rem;">
          <div style="background: rgba(255,255,255,0.05); padding: 0.75rem; border-radius: 8px;">
            <div style="color: var(--text-muted); font-size: 0.85rem;">Power</div>
            <div style="font-size: 1.5rem; font-weight: bold;">${p.power}</div>
          </div>
          ${p.objective !== undefined ? `
            <div style="background: rgba(255,255,255,0.05); padding: 0.75rem; border-radius: 8px;">
              <div style="color: var(--text-muted); font-size: 0.85rem;">Objective</div>
              <div style="font-size: 1.5rem; font-weight: bold; color: ${p.campaignResult === 'success' ? '#4ade80' : '#f87171'};">${p.objective} ${p.campaignResult === 'success' ? '✓' : '✗'}</div>
            </div>
          ` : ''}
        </div>
        <div style="margin-bottom: 1rem;">
          <div style="color: var(--text-muted); font-size: 0.85rem; margin-bottom: 0.5rem;">Cards (${p.cards.length})</div>
          <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 0.5rem;">${cardsList}</div>
        </div>
      </div>
    `;
  }).join('');
  
  container.innerHTML = `
    <h1 style="margin-bottom: 0.5rem;">Game ${game.gameId}</h1>
    <div style="color: var(--text-muted); font-size: 0.95rem; margin-bottom: 2rem;">Date: ${formattedDate} | Time: ${game.time || '—'}</div>
    ${playerDetails}
  `;
  
  // Show in a modal or replace the games container
  const gamesContainer = el.gamesContainer;
  if (gamesContainer) {
    gamesContainer.innerHTML = '';
    gamesContainer.appendChild(container);
    
    // Add back button
    const backBtn = document.createElement('button');
    backBtn.textContent = '← Back to Games';
    backBtn.style.cssText = 'padding: 10px 20px; margin-bottom: 1rem; cursor: pointer; background: var(--accent); color: white; border: none; border-radius: 4px;';
    backBtn.addEventListener('click', () => {
      const gamesTab = document.querySelector("button[data-tab='games']");
      if (gamesTab) gamesTab.click();
    });
    gamesContainer.insertBefore(backBtn, container);
  }
}


function showPlayerProfile(playerName) {
  // Navigate to player stats tab on the data page with the player selected
  // Detect if we're on the GitHub Pages live site (has /arcs-arsenal in path)
  const currentPath = window.location.pathname;
  let basePath = '';
  
  if (currentPath.includes('/arcs-arsenal/')) {
    basePath = '/arcs-arsenal';
  }
  
  window.location.href = `${basePath}/data?tab=playerStats&source=celestial&player=${encodeURIComponent(playerName)}`;
}

function showGameDetail(gameId) {
  // Find the game in the celestialGames array
  const game = appState.celestialGames.find(g => g.gameId === gameId);
  if (!game) {
    alert(`Game ${gameId} not found`);
    return;
  }
  
  // Switch to gameDetail tab and store the selected game
  appState.selectedGame = game;
  const gameDetailTab = document.querySelector("button[data-tab='gameDetail']");
  if (gameDetailTab) {
    gameDetailTab.click();
  } else {
    // If tab doesn't exist, render the detail view in a modal or container
    renderGameDetail(game);
  }
}


// ========== Compare Mode ==========
function toggleCompareMode() {
  appState.compareMode = !appState.compareMode;
  el.compareBtn.classList.toggle("active", appState.compareMode);
  el.comparePanel.classList.toggle("hidden", !appState.compareMode);
  
  if (!appState.compareMode) {
    appState.compareCards = [null, null];
    renderCompareSlots();
    // Re-render to remove selection styling
    refreshCards();
  }
}

function toggleCompareCard(card) {
  const idx = appState.compareCards.findIndex((c) => c?.name === card.name);
  
  if (idx >= 0) {
    // Remove from comparison
    appState.compareCards[idx] = null;
  } else {
    // Add to comparison
    const emptySlot = appState.compareCards.findIndex((c) => c === null);
    if (emptySlot >= 0) {
      appState.compareCards[emptySlot] = card;
    } else {
      // Replace first slot
      appState.compareCards[0] = card;
    }
  }
  
  renderCompareSlots();
  refreshCards();
}

function renderCompareSlots() {
  const slots = el.compareSlots.querySelectorAll(".compare-slot");
  
  appState.compareCards.forEach((card, i) => {
    const slot = slots[i];
    
    if (card) {
      const imgUrl = getImageUrl(card);
      slot.classList.remove("empty");
      slot.classList.add("filled");
      slot.innerHTML = `
        <div class="slot-card">
          ${imgUrl ? `<img class="slot-img" src="${imgUrl}" alt="${card.name}">` : ""}
          <div class="slot-info">
            <div class="slot-name">${card.name}</div>
            <div class="slot-stats">
              <span><span class="slot-stat-value">${(card.stats?.winRate ?? 0).toFixed(1)}%</span> WR</span>
              <span><span class="slot-stat-value">${card.stats?.wins ?? 0}</span> Wins</span>
              <span><span class="slot-stat-value">${card.stats?.timesPicked ?? 0}</span> Picks</span>
            </div>
          </div>
        </div>
      `;
    } else {
      slot.classList.add("empty");
      slot.classList.remove("filled");
      slot.innerHTML = `<span>Select a card</span>`;
    }
  });
}

// ========== UI Wiring ==========
let refreshCards;

function initializeAllCardFilters() {
  // Extract unique card types and tags from all cards
  const types = new Set();
  const tags = new Set();
  
  (appState.allCards || []).forEach(card => {
    if (card.stats?.type) types.add(card.stats.type);
    if (Array.isArray(card.tags)) {
      card.tags.forEach(tag => tags.add(tag));
    }
  });
  
  // Populate type filter dropdown
  const typeSelect = document.getElementById('typeFilterSelect');
  if (typeSelect) {
    // Clear existing options except the default
    typeSelect.innerHTML = '<option value="">All Types</option>';
    const sortedTypes = Array.from(types).sort();
    sortedTypes.forEach(type => {
      const option = document.createElement('option');
      option.value = type;
      option.textContent = type;
      typeSelect.appendChild(option);
    });
    typeSelect.removeEventListener('change', updateAllCardView);
    typeSelect.addEventListener('change', updateAllCardView);
  }
  
  // Populate tag filter dropdown
  const tagSelect = document.getElementById('tagFilterSelect');
  if (tagSelect) {
    // Clear existing options except the default
    tagSelect.innerHTML = '<option value="">All Tags</option>';
    const sortedTags = Array.from(tags).sort();
    sortedTags.forEach(tag => {
      const option = document.createElement('option');
      option.value = tag;
      option.textContent = tag;
      tagSelect.appendChild(option);
    });
    tagSelect.removeEventListener('change', updateAllCardView);
    tagSelect.addEventListener('change', updateAllCardView);
  }
  
  // Wire clear filters button
  const clearBtn = document.getElementById('clearFilters');
  if (clearBtn) {
    clearBtn.removeEventListener('click', clearFiltersHandler);
    clearBtn.addEventListener('click', clearFiltersHandler);
  }
}

function clearFiltersHandler() {
  const typeSelect = document.getElementById('typeFilterSelect');
  const tagSelect = document.getElementById('tagFilterSelect');
  if (typeSelect) typeSelect.value = '';
  if (tagSelect) tagSelect.value = '';
  updateAllCardView();
}

function updateAllCardView() {
  // Get selected filters from dropdowns
  const typeSelect = document.getElementById('typeFilterSelect');
  const tagSelect = document.getElementById('tagFilterSelect');
  
  const selectedType = typeSelect ? typeSelect.value : '';
  const selectedTag = tagSelect ? tagSelect.value : '';
  
  // Filter cards based on selections
  let filteredCards = appState.allCards;
  
  if (selectedType) {
    filteredCards = filteredCards.filter(card => card.stats?.type === selectedType);
  }
  
  if (selectedTag) {
    filteredCards = filteredCards.filter(card => {
      return (card.tags || []).includes(selectedTag);
    });
  }
  
  // Re-render insights and cards with filtered data
  const metric = el.metric.value;
  renderInsights(
    filteredCards.filter(c => c.stats?.type === 'Leader'),
    filteredCards.filter(c => c.stats?.type === 'Lore'),
    undefined,
    metric,
    filteredCards
  );
  renderCards(filteredCards, el.allCards, metric, el.query.value);
}

function wireUi(state) {
  appState.leaders = state.leaders;
  appState.lore = state.lore;
  appState.allCards = [...state.leaders, ...state.lore];
  
  let currentTab = "leaders";
  
  refreshCards = () => {
    const metric = el.metric.value;
    const query = el.query.value;
    renderCards(appState.allCards, el.allCards, metric, query);
    renderCards(appState.leaders, el.leaderCards, metric, query);
    renderCards(appState.lore, el.loreCards, metric, query);
  };
  
  const onMetricChange = () => {
    refreshCards();
    // Also update histograms when metric changes
    refreshHistograms(el.metric.value);
  };
  
  el.metric.addEventListener("change", onMetricChange);
  el.query.addEventListener("input", refreshCards);
  
  el.tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      el.tabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      currentTab = tab.dataset.tab;
      
      // Hide all sections first
      el.allSection.classList.add("hidden");
      el.leadersSection.classList.add("hidden");
      el.loreSection.classList.add("hidden");
      if (el.gamesSection) el.gamesSection.classList.add("hidden");
      if (el.leaderboardSection) el.leaderboardSection.classList.add("hidden");
      if (el.playerStatsSection) el.playerStatsSection.classList.add("hidden");
      
      // Show the selected section
      if (tab.dataset.tab === "all") {
        el.allSection.classList.remove("hidden");
        initializeAllCardFilters();
      } else if (tab.dataset.tab === "leaders") {
        el.leadersSection.classList.remove("hidden");
      } else if (tab.dataset.tab === "lore") {
        el.loreSection.classList.remove("hidden");
      } else if (tab.dataset.tab === "games") {
        if (el.gamesSection) el.gamesSection.classList.remove("hidden");
      } else if (tab.dataset.tab === "leaderboard") {
        if (el.leaderboardSection) el.leaderboardSection.classList.remove("hidden");
        renderLeaderboard(appState.leaderboardStats, el.leaderboardContainer);
      } else if (tab.dataset.tab === "playerStats") {
        if (el.playerStatsSection) el.playerStatsSection.classList.remove("hidden");
      }

      // Reflect tab selection in the URL (only include playerCount for Community source)
      const urlParams = { tab: currentTab, source: appState.dataSource };
      if (appState.dataSource === 'Community') urlParams.playerCount = appState.playerCount;
      updateUrlParams(urlParams);
    });
  });
  
  // Theme toggle
  el.themeToggle.addEventListener("click", toggleTheme);
  
  // Modal
  el.modalClose.addEventListener("click", closeModal);
  el.modalBackdrop.addEventListener("click", closeModal);
  el.modalShareBtn.addEventListener("click", () => {
    if (appState.currentModalCard) shareCard(appState.currentModalCard);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
  });
  
  // Compare mode
  el.compareBtn.addEventListener("click", toggleCompareMode);
  el.closeCompare.addEventListener("click", toggleCompareMode);
  
  // Player Stats search input
  if (el.playerSelector) {
    const handlePlayerSearch = (typedName) => {
      const query = String(typedName ?? "").trim();
      if (!query) {
        el.playerStatsContainer.innerHTML = `<div style="padding:2rem;text-align:center;color:var(--text-muted)">Search a player to view their stats</div>`;
        updateUrlParams({ player: null });
        return;
      }

      const players = getUniquePlayers(appState.celestialGames);
      const matchedName = players.find((p) => normalizeText(p) === normalizeText(query));
      if (!matchedName) {
        el.playerStatsContainer.innerHTML = `<div style="padding:2rem;text-align:center;color:var(--text-muted)">No exact player match yet. Keep typing or select from suggestions.</div>`;
        updateUrlParams({ player: null });
        return;
      }

      const stats = computePlayerStats(matchedName, appState.celestialGames);
      renderPlayerStats(matchedName, stats, el.playerStatsContainer);
      updateUrlParams({ player: matchedName });
    };

    el.playerSelector.addEventListener("input", (e) => handlePlayerSearch(e.target.value));
    el.playerSelector.addEventListener("change", (e) => handlePlayerSearch(e.target.value));
  }
  
  return refreshCards;
}

// ========== Community Data ==========
function buildCommunityCards(yamlCards, playerCount) {
  const { stats, games } = buildCommunityStats(playerCount);
  const statsIndex = new Map(stats.map((s) => [normalizeText(s.name), s]));

  const cards = [];
  for (const card of yamlCards) {
    const stat = statsIndex.get(normalizeText(card.name));
    if (stat) {
      cards.push({ ...card, stats: stat });
    }
  }

  const leaders = cards.filter((c) => c.stats?.type === "Leader");
  const lore = cards.filter((c) => c.stats?.type === "Lore");
  return { leaders, lore, games };
}

// ========== Celestial Data ==========
async function buildCelestialCards(yamlCards) {
  const rows = await loadCelestialSheet();
  const cardIndex = new Map(yamlCards.map((c) => [normalizeCardNameForLookup(c.name), c]));

  // Parse celestial rows to compute raw stats and games
  const { stats, totalGames, games } = parseCelestialSheet(rows, cardIndex);

  // Ensure any stat entries that refer to cards not present in yamlCards
  // are synthesized as minimal card objects so they appear in lists and
  // are clickable in the UI. Do not mutate the original yamlCards array.
  const mergedYaml = [...yamlCards];
  const syntheticAdded = [];
  for (const s of stats) {
    const normalized = normalizeCardNameForLookup(s.name);
    if (!cardIndex.has(normalized)) {
      const synth = {
        id: null,
        name: s.name,
        image: null,
        imageClass: "",
        tags: [],
        text: "",
        type: s.type || getCardTypeFromTags([]),
        stats: s,
      };
      mergedYaml.push(synth);
      cardIndex.set(normalized, synth);
      syntheticAdded.push(synth);
    }
  }

  // Rewire games so player card entries reference the cardIndex objects
  // (this makes click/lookup consistent and allows openModal to find cards)
  const normalizedGet = (name) => normalizeCardNameForLookup(name);
  for (const g of games) {
    if (!g.players) continue;
    for (const p of g.players) {
      if (!Array.isArray(p.cards)) continue;
      p.cards = p.cards.map((c) => {
        const nm = String(c?.name ?? c).trim();
        const found = cardIndex.get(normalizedGet(nm));
        return found || (typeof c === 'object' ? c : { name: nm, image: null });
      });
    }
  }

  const statsIndex = new Map(stats.map((s) => [normalizeText(s.name), s]));

  const cards = [];
  for (const card of mergedYaml) {
    const stat = statsIndex.get(normalizeText(card.name));
    if (stat) {
      // If synthetic objects already have stats attached, prefer them
      if (card.stats) {
        cards.push(card);
      } else {
        cards.push({ ...card, stats: stat });
      }
    }
  }

  const leaders = cards.filter((c) => c.stats?.type === "Leader");
  const lore = cards.filter((c) => c.stats?.type === "Lore");
  const others = cards.filter((c) => !["Leader", "Lore"].includes(c.stats?.type));
  return { leaders, lore, others, games: totalGames, gamesArray: games };
}

function switchDataSource(source, playerCount) {
  appState.dataSource = source;
  appState.playerCount = playerCount || appState.playerCount;

  let leaders, lore, games, allCards;
  // Ensure Games tab enabled/disabled according to source
  if (el.gamesTab) {
    el.gamesTab.disabled = source !== 'celestial';
  }
  // Ensure Leaderboard tab enabled/disabled according to source
  if (el.leaderboardTab) {
    el.leaderboardTab.disabled = source !== 'celestial';
  }
  if (source === "league") {
    leaders = appState.leagueCards.leaders;
    lore = appState.leagueCards.lore;
    games = null; // will be estimated by calculateInsights
    appState.celestialGames = [];
    appState.leaderboardStats = [];
    allCards = [...leaders, ...lore];
    const totalPicks = leaders.reduce((sum, c) => sum + (c.stats?.timesPicked ?? 0), 0);
    const estimatedGames = Math.round(totalPicks / 4);
    if (el.dataSourceLabel) {
      el.dataSourceLabel.innerHTML = `Data from <a href="https://docs.google.com/spreadsheets/d/13Wb-JoX7L2-o3Q-ejvepsx11MW--yhTN5oJ-I4Hp2DU/edit?gid=1136087345" target="_blank">Arcs League Tracker</a> (${estimatedGames} games)`;
    }
    if (el.pageTagline) {
      el.pageTagline.textContent = "Leaders & Lore win rates from Arcs League games";
    }
  } else if (source === "celestial") {
    if (!appState.celestialCards) {
      setStatus("Celestial data not available", { isError: true });
      return;
    }
    leaders = appState.celestialCards.leaders;
    lore = appState.celestialCards.lore;
    games = appState.celestialCards.games;
    // Show newest games first (reverse chronological)
    appState.celestialGames = (appState.celestialCards.gamesArray || []).slice().reverse();
    appState.leaderboardStats = computePlayerLeaderboardStats(appState.celestialGames);
    allCards = [...leaders, ...lore, ...(appState.celestialCards.others || [])];
    if (el.dataSourceLabel) {
      el.dataSourceLabel.innerHTML = `Data from <a href="https://docs.google.com/spreadsheets/d/1yGuP7IcjnG_jbua4KH57D_68VaEhwOPhMT2yJkxG838/edit?gid=0" target="_blank">Celestial Games</a> (${games} games)`;
    }
    if (el.pageTagline) {
      el.pageTagline.textContent = "Leaders & Lore win rates from Celestial game results";
    }
  } else {
    const { stats, games } = buildCommunityStats(appState.playerCount);
    const communityCards = appState.yamlCards
      .map((yamlCard) => {
        const stat = stats.find((s) => s.name === yamlCard.name);
        return stat ? { ...yamlCard, stats: stat } : null;
      })
      .filter(Boolean);
    leaders = communityCards.filter((c) => c.stats.type === "Leader");
    lore = communityCards.filter((c) => c.stats.type === "Lore");
    appState.celestialGames = [];
    appState.leaderboardStats = [];
    allCards = [...leaders, ...lore];
    if (el.dataSourceLabel) {
      const label = appState.playerCount === "3p" ? "3-player" : "4-player";
      el.dataSourceLabel.innerHTML = `Community ${label} data (${games} games) from <a href="https://boardgamegeek.com/thread/3604653/leaders-and-lore-ranking-and-winrates" target="_blank">BGG</a>`;
    }
    if (el.pageTagline) {
      const label = appState.playerCount === "3p" ? "3-player" : "4-player";
      el.pageTagline.textContent = `Leaders & Lore win rates from Community ${label} games`;
    }
  }

  if (leaders.length === 0 && lore.length === 0) return;

  // Update state
  appState.leaders = leaders;
  appState.lore = lore;
  appState.otherCards = allCards.filter((c) => !["Leader", "Lore"].includes(c.stats?.type));
  appState.allCards = allCards;
  appState.compareCards = [null, null];

  // Configure metric options based on data source
  if (source === "Community") {
    el.metric.value = "winRate";
    // For Community data: enable winRate and draftRank, disable wins/timesPicked
    el.metric.querySelector('option[value="winRate"]').disabled = false;
    el.metric.querySelector('option[value="draftRank"]').disabled = false;
    el.metric.querySelector('option[value="wins"]').disabled = true;
    el.metric.querySelector('option[value="timesPicked"]').disabled = true;
  } else {
    el.metric.value = "winRate";
    // For league data and celestial: enable winRate/wins/timesPicked, disable draftRank
    el.metric.querySelector('option[value="winRate"]').disabled = false;
    el.metric.querySelector('option[value="wins"]').disabled = false;
    el.metric.querySelector('option[value="timesPicked"]').disabled = false;
    el.metric.querySelector('option[value="draftRank"]').disabled = true;
  }

  // Re-render everything
  renderInsights(leaders, lore, games, undefined, allCards);
  if (el.gamesContainer && appState.celestialGames.length > 0) {
    renderGames(appState.celestialGames, el.gamesContainer);
  }
  
  // Populate player suggestions for player stats tab
  if (el.playerSelector && el.playerList) {
    el.playerSelector.value = "";
    el.playerList.innerHTML = "";
    if (appState.celestialGames.length > 0) {
      const players = getUniquePlayers(appState.celestialGames);
      players.forEach((player) => {
        const option = document.createElement("option");
        option.value = player;
        el.playerList.appendChild(option);
      });
    }
  }
  
  if (refreshCards) refreshCards();
}

function wireDataSourceToggle() {
  if (!el.dataSourceGroup) return;

  el.dataSourceGroup.querySelectorAll(".ds-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      el.dataSourceGroup.querySelectorAll(".ds-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const value = btn.dataset.value;
      // Enable Games tab only for Celestial data source
      if (el.gamesTab) {
        if (value === "celestial") {
          el.gamesTab.disabled = false;
        } else {
          el.gamesTab.disabled = true;
          // Switch away from Games tab if it's currently active
          if (el.gamesTab.classList.contains("active")) {
            el.gamesTab.classList.remove("active");
            document.querySelector("button[data-tab='leaders']").classList.add("active");
          }
        }
      }
      if (value === "Community") {
        el.playerCountGroup.classList.remove("hidden");
        switchDataSource("Community", appState.playerCount);
        updateUrlParams({ source: 'Community', playerCount: appState.playerCount });
      } else {
        el.playerCountGroup.classList.add("hidden");
        switchDataSource(value);
        updateUrlParams({ source: value });
      }
    });
  });

  el.playerCountGroup.querySelectorAll(".ds-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      el.playerCountGroup.querySelectorAll(".ds-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      switchDataSource("Community", btn.dataset.value);
      updateUrlParams({ source: 'Community', playerCount: btn.dataset.value });
    });
  });
}

// ========== Pretty URLs (hide .html) ==========
function initPrettyUrls() {
  try {
    // If the current URL ends with .html (or /index.html), replace it with a prettier path
    const pathname = window.location.pathname || "";
    if (/\/index\.html$/.test(pathname)) {
      const pretty = pathname.replace(/\/index\.html$/, "/") || "/";
      history.replaceState(null, "", pretty + window.location.search + window.location.hash);
    } else if (pathname.endsWith('.html')) {
      const pretty = pathname.replace(/\.html$/, '');
      history.replaceState(null, "", pretty + window.location.search + window.location.hash);
    }

    // Rewrite same-origin links so they appear without .html but still navigate to the real .html file.
    document.querySelectorAll('a[href]').forEach((a) => {
      const orig = a.getAttribute('href');
      if (!orig) return;
      // Ignore anchors and mailto/tel
      if (orig.startsWith('#') || orig.startsWith('mailto:') || orig.startsWith('tel:')) return;
      let url;
      try {
        url = new URL(orig, window.location.href);
      } catch (e) {
        return;
      }
      if (url.origin !== window.location.origin) return; // external
      const p = url.pathname || '';
      if (p.endsWith('.html')) {
        // Build pretty href (turn /foo/index.html -> /foo/ ; /bar.html -> /bar)
        const prettyPath = p.replace(/\/index\.html$/, '/').replace(/\.html$/, '');
        const prettyHref = prettyPath + (url.search || '') + (url.hash || '');
        a.dataset.htmlHref = orig; // keep original target
        a.setAttribute('href', prettyHref);

        // Intercept clicks to actually navigate to the real .html so servers that expect .html still respond.
        a.addEventListener('click', (e) => {
          // Allow modifier keys / non-left clicks to behave normally
          if (e.defaultPrevented) return;
          if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
          e.preventDefault();
          window.location.href = a.dataset.htmlHref;
        });
      }
    });
  } catch (err) {
    console.error('initPrettyUrls failed', err);
  }
}

// ========== Main ==========
async function main() {
  initTheme();
  setStatus("Loading…");
  
  try {
    const [allCards, sheetRows] = await Promise.all([loadCards(), loadSheet(), loadLeaderFallbackNames()]);
    appState.yamlCards = allCards;

    const { cards } = joinCardsWithStats(allCards, sheetRows);
    
    if (cards.length === 0) {
      setStatus("No matching cards found.", { isError: true });
      return;
    }
    
    const leaders = cards.filter((c) => c.stats?.type === "Leader");
    const lore = cards.filter((c) => c.stats?.type === "Lore");
    
    // Store league data for switching
    appState.leagueCards = { leaders, lore };
    
    // Load Celestial data in the background
    try {
      const celestialData = await buildCelestialCards(allCards);
      appState.celestialCards = celestialData;
    } catch (err) {
      console.warn("Failed to load Celestial data:", err);
      appState.celestialCards = null;
    }
    
    setStatus("");
    
    // Render insights first (sets appState.insights for badges)
    renderInsights(leaders, lore);
    
    const refresh = wireUi({ leaders, lore });
    refresh();

    // Check for card URL parameter
    const urlParams = new URLSearchParams(window.location.search);
    const cardName = urlParams.get('card');
    if (cardName) {
      const card = appState.allCards.find(c => c.name === decodeURIComponent(cardName));
      if (card) {
        openModal(card);
      }
    }
    
    // Check for tab URL parameter first
    const tabParam = urlParams.get('tab');
    if (tabParam) {
      const tabButton = document.querySelector(`button[data-tab='${tabParam}']`);
      if (tabButton) {
        tabButton.click();
      }
    }
    
    // Check for player URL parameter
    const playerName = urlParams.get('player');
    if (playerName) {
      // If tab param is playerStats (or wasn't specified), load the player
      if (tabParam === 'playerStats' || !tabParam) {
        // Ensure we're on the playerStats tab if needed
        if (!tabParam) {
          const playerTab = document.querySelector("button[data-tab='playerStats']");
          if (playerTab) {
            playerTab.click();
          }
        }
        // Set the player selector value and trigger search after a brief delay
        setTimeout(() => {
          if (el.playerSelector) {
            el.playerSelector.value = decodeURIComponent(playerName);
            el.playerSelector.dispatchEvent(new Event('input', { bubbles: true }));
          }
        }, 100);
      }
    }

    // Wire up data source toggle
    wireDataSourceToggle();
    
    // Disable Games tab initially (only enabled with Celestial data source)
    if (el.gamesTab) {
      el.gamesTab.disabled = true;
    }

    // Ensure initial data source UI/footer is populated (show celestial totals)
    switchDataSource("celestial");
    // Reflect current tab state in URL (don't override if tab was already set)
    const currentTab = tabParam || 'leaders';
    updateUrlParams({ tab: currentTab, source: 'celestial' });

    // After switching data source, re-apply the requested tab and player selection
    if (tabParam) {
      const tabButtonAfter = document.querySelector(`button[data-tab='${tabParam}']`);
      if (tabButtonAfter) tabButtonAfter.click();
    }

    if (playerName && (tabParam === 'playerStats' || !tabParam)) {
      setTimeout(() => {
        if (el.playerSelector) {
          el.playerSelector.value = decodeURIComponent(playerName);
          el.playerSelector.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }, 200);
    }
    
    // Configure initial metric options for league data source
    el.metric.querySelector('option[value="winRate"]').disabled = false;
    el.metric.querySelector('option[value="wins"]').disabled = false;
    el.metric.querySelector('option[value="timesPicked"]').disabled = false;
    el.metric.querySelector('option[value="draftRank"]').disabled = true;
  } catch (err) {
    setStatus(err.message, { isError: true });
  }
}

// Initialize pretty URLs (hide .html in address bar and rewrite same-origin links)
initPrettyUrls();
main();
