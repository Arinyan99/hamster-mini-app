window.addEventListener("DOMContentLoaded", () => {
  // === Telegram WebApp ===
  const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;

  // URL твоего API (когда поднимешь backend — сюда вставишь адрес)
  const API_BASE = ""; // например: "https://my-hamster-backend.onrender.com"
  const DAY_MS = 1000 * 60 * 60 * 24;
  const BASE_ENERGY_REGEN_MS = 5000;

  let userId = "local";
  let userInfo = null;

  if (tg) {
    tg.expand();
    tg.setHeaderColor("#0b1020");
    tg.setBackgroundColor("#0b1020");
    tg.ready();

    const user = tg.initDataUnsafe?.user;
    if (user) {
      userInfo = user;
      userId = String(user.id);
      const name = (user.first_name || "") + " " + (user.last_name || "");
      const profileName = document.getElementById("profile-name");
      const profileId = document.getElementById("profile-id");
      if (profileName) profileName.textContent = name.trim() || "Player";
      if (profileId) profileId.textContent = "ID: " + user.id;
    }
  }

  // === STATE (прогресс игрока) ===
  const STORAGE_KEY = "hv_state_" + userId;
  const DEFAULT_STATE = {
    coins: 0,
    energy: 100,
    maxEnergy: 100,
    pph: 0,
    tapValue: 1,
    lastEnergyTs: Date.now(),
    totalTaps: 0,
    upgrades: {
      miner: false,
      gym: false,
      farm: false,
      tap2: false,
      regen: false,
      crypto: false,
      lucky: false,
    },
    createdAt: Date.now(),
    // daily bonus
    lastDailyDay: 0,
    dailyStreak: 0,
    // achievements
    achievements: {},
  };

  let state = { ...DEFAULT_STATE };

  // === UPGRADE LOGIC ===
  const UPGRADE_COSTS = {
    miner: 5000,
    gym: 2000,
    farm: 3000,
    tap2: 4000,
    regen: 6000,
    crypto: 10000,
    lucky: 7000,
  };

  function getEnergyRegenMs() {
    let ms = BASE_ENERGY_REGEN_MS;
    if (state.upgrades?.regen) {
      ms = 3000; // быстрее реген
    }
    return ms;
  }

  function applyUpgrades() {
    state.pph = 0;
    state.tapValue = 1;
    state.maxEnergy = state.upgrades.farm ? 150 : 100;

    if (state.upgrades.miner) state.pph += 200;
    if (state.upgrades.crypto) state.pph += 1000;
    if (state.upgrades.gym) state.tapValue += 1;
    if (state.upgrades.tap2) state.tapValue += 1;
  }

  // === ACHIEVEMENTS META ===
  const ACH_DEFS = {
    first_tap: { icon: "👆", title: "Первый тап", desc: "Сделай 1 тап" },
    taps_100: { icon: "👆", title: "Тапер", desc: "Сделай 100 тапов" },
    taps_1000: { icon: "🔥", title: "Тап-машина", desc: "Сделай 1000 тапов" },
    coins_1k: { icon: "💰", title: "Первая тысяча", desc: "Накопи 1 000 монет" },
    coins_10k: { icon: "💰", title: "Большой банк", desc: "Накопи 10 000 монет" },
    daily_3: { icon: "📅", title: "3 дня подряд", desc: "Забери Daily bonus 3 дня подряд" },
    daily_7: { icon: "📅", title: "7 дней подряд", desc: "Забери Daily bonus 7 дней подряд" },
    upg_1: { icon: "🛠", title: "Первые апгрейды", desc: "Купи любой апгрейд" },
    upg_3: { icon: "🛠", title: "Инженер", desc: "Купи 3 апгрейда" },
  };

  // --- Локальное хранилище (fallback) ---
  function loadFromLocal() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const obj = JSON.parse(raw);
      state = { ...DEFAULT_STATE, ...obj };
      state.upgrades = { ...DEFAULT_STATE.upgrades, ...(obj.upgrades || {}) };
      state.achievements = { ...(obj.achievements || {}) };
    } catch (e) {
      console.error("loadFromLocal error", e);
    }
  }

  function saveToLocal() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.error("saveToLocal error", e);
    }
  }

  // --- CloudStorage Telegram ---
  function loadFromCloud() {
    if (!tg || !tg.CloudStorage || !tg.CloudStorage.getItem) return;

    tg.CloudStorage.getItem("hv_state", (err, value) => {
      if (err) {
        console.error("CloudStorage.getItem error:", err);
        return;
      }
      if (!value) return;

      try {
        const obj = JSON.parse(value);
        state = { ...DEFAULT_STATE, ...obj };
        state.upgrades = { ...DEFAULT_STATE.upgrades, ...(obj.upgrades || {}) };
        state.achievements = { ...(obj.achievements || {}) };
        applyUpgrades();
        updateAllUI();
      } catch (e) {
        console.error("parse cloud state error", e);
      }
    });
  }

  function saveToCloud() {
    if (!tg || !tg.CloudStorage || !tg.CloudStorage.setItem) return;

    tg.CloudStorage.setItem("hv_state", JSON.stringify(state), (err, stored) => {
      if (err) {
        console.error("CloudStorage.setItem error:", err);
      }
    });
  }

  // === Работа с внешним API (опционально) ===
  async function apiLoadState() {
    if (!API_BASE) return;

    try {
      const res = await fetch(`${API_BASE}/state/${userId}`);
      if (!res.ok) return;

      const json = await res.json();
      if (json && Object.keys(json).length > 0) {
        state = { ...DEFAULT_STATE, ...json };
        state.upgrades = {
          ...DEFAULT_STATE.upgrades,
          ...(json.upgrades || {}),
        };
        state.achievements = { ...(json.achievements || {}) };
        applyUpgrades();
        updateAllUI();
        console.log("state loaded from API");
      }
    } catch (e) {
      console.error("apiLoadState error:", e);
    }
  }

  async function apiSaveState() {
    if (!API_BASE) return;

    try {
      await fetch(`${API_BASE}/state`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          data: state,
        }),
      });
      console.log("state saved to API");
    } catch (e) {
      console.error("apiSaveState error:", e);
    }
  }

  async function apiRegisterIfNeeded() {
    if (!API_BASE || !userInfo) return;
    try {
      await fetch(`${API_BASE}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: String(userInfo.id),
          first_name: userInfo.first_name,
          last_name: userInfo.last_name,
          username: userInfo.username,
        }),
      });
    } catch (e) {
      console.error("register error:", e);
    }
  }

  function saveState() {
    saveToLocal();
    saveToCloud();
    apiSaveState();
  }

  // --- PLAYERS LIST (новый экран) ---
  async function loadPlayers() {
    const container = document.getElementById("players-list");
    if (!container) return;

    if (!API_BASE) {
      container.innerHTML =
        '<div class="players-empty">Функция списка игроков заработает, когда ты подключишь backend и укажешь API_BASE в app.js.</div>';
      return;
    }

    container.innerHTML =
      '<div class="players-empty">Загрузка списка игроков...</div>';

    try {
      const res = await fetch(`${API_BASE}/players`);
      if (!res.ok) throw new Error("Bad status " + res.status);
      const list = await res.json();

      if (!Array.isArray(list) || list.length === 0) {
        container.innerHTML =
          '<div class="players-empty">Пока что кроме тебя никого нет 👀</div>';
        return;
      }

      container.innerHTML = "";
      list.forEach((p, index) => {
        const row = document.createElement("div");
        row.className = "player-row";

        const place = index + 1;
        const name =
          p.name ||
          (p.username ? "@" + p.username : "Player " + (p.user_id || "?"));
        const coins = (p.coins || 0).toLocaleString("ru-RU");

        row.innerHTML = `
          <div class="player-main">
            <div class="player-title">#${place} ${name}</div>
            <div class="player-sub">${p.username ? "@" + p.username : ""}</div>
          </div>
          <div class="player-coins">${coins} 💰</div>
        `;
        container.appendChild(row);
      });
    } catch (e) {
      console.error("loadPlayers error:", e);
      container.innerHTML =
        '<div class="players-empty">Не удалось загрузить игроков 😢</div>';
    }
  }

  // --- Инициализация состояния ---
  (function initState() {
    loadFromLocal();
    applyUpgrades();
    updateAllUI();

    loadFromCloud();
    apiLoadState();
    apiRegisterIfNeeded();
  })();

  // === ЛОГИКА ИГРЫ ===

  function regenEnergy() {
    const now = Date.now();
    const diff = Math.max(0, now - (state.lastEnergyTs || now));
    const step = getEnergyRegenMs();
    const gained = Math.floor(diff / step);
    if (gained > 0) {
      state.lastEnergyTs = (state.lastEnergyTs || now) + gained * step;
      state.energy = Math.min(state.maxEnergy, state.energy + gained);
    }
  }

  function computeLevel() {
    return 1 + Math.floor(state.coins / 5000);
  }

  function computeDays() {
    const diff = Date.now() - state.createdAt;
    return Math.max(1, Math.floor(diff / (1000 * 60 * 60 * 24)));
  }

  function getCurrentDayIndex() {
    return Math.floor(Date.now() / DAY_MS);
  }

  // === ACHIEVEMENTS LOGIC ===
  function updateAchievementsUI() {
    const container = document.getElementById("ach-list");
    if (!container) return;

    const unlocked = state.achievements || {};
    container.innerHTML = "";

    Object.entries(ACH_DEFS).forEach(([id, def]) => {
      const isUnlocked = !!unlocked[id];
      const row = document.createElement("div");
      row.className = "ach-row" + (isUnlocked ? " unlocked" : "");
      row.innerHTML = `
        <div class="ach-main">
          <div class="ach-title">${def.icon} ${def.title}</div>
          <div class="ach-desc">${def.desc}</div>
        </div>
        <div class="ach-badge">${isUnlocked ? "Done" : "Locked"}</div>
      `;
      container.appendChild(row);
    });
  }

  function checkAchievements() {
    if (!state.achievements) state.achievements = {};
    const a = state.achievements;
    const before = { ...a };

    function unlock(id) {
      if (!a[id]) a[id] = true;
    }

    // условия
    if (state.totalTaps >= 1) unlock("first_tap");
    if (state.totalTaps >= 100) unlock("taps_100");
    if (state.totalTaps >= 1000) unlock("taps_1000");
    if (state.coins >= 1000) unlock("coins_1k");
    if (state.coins >= 10000) unlock("coins_10k");

    if ((state.dailyStreak || 0) >= 3) unlock("daily_3");
    if ((state.dailyStreak || 0) >= 7) unlock("daily_7");

    const upgradesOwned = Object.values(state.upgrades || {}).filter(Boolean).length;
    if (upgradesOwned >= 1) unlock("upg_1");
    if (upgradesOwned >= 3) unlock("upg_3");

    const newIds = Object.keys(a).filter((id) => a[id] && !before[id]);
    if (newIds.length) {
      const names = newIds
        .map((id) => ACH_DEFS[id]?.title || id)
        .join(", ");
      if (tg && tg.HapticFeedback) {
        tg.HapticFeedback.notificationOccurred("success");
      }
      alert("Новое достижение: " + names + " 🎉");
    }
  }

  // === UI UPDATE ===
  function formatNumber(n) {
    return n.toLocaleString("ru-RU");
  }

  function updateWalletUI() {
    const coinsEl = document.getElementById("coins-value");
    const energyEl = document.getElementById("energy-value");
    const pphEl = document.getElementById("pph-value");
    if (!coinsEl || !energyEl || !pphEl) return;

    coinsEl.textContent = formatNumber(state.coins);
    energyEl.textContent = state.energy + " / " + state.maxEnergy;
    pphEl.textContent = formatNumber(state.pph) + " / hour";
  }

  function updateChargeUI() {
    const coinsEl = document.getElementById("charge-coins");
    const energyEl = document.getElementById("charge-energy");
    const tapVal = document.getElementById("tap-value");
    if (!coinsEl || !energyEl || !tapVal) return;

    coinsEl.textContent = formatNumber(state.coins);
    energyEl.textContent = state.energy + " / " + state.maxEnergy;
    tapVal.textContent = "+" + state.tapValue;
  }

  function updateProfileUI() {
    const lvlEl = document.getElementById("level-value");
    const daysEl = document.getElementById("days-value");
    const tapsEl = document.getElementById("taps-value");
    const streakEl = document.getElementById("streak-value");
    if (!lvlEl || !daysEl || !tapsEl || !streakEl) return;

    lvlEl.textContent = computeLevel();
    daysEl.textContent = computeDays();
    tapsEl.textContent = formatNumber(state.totalTaps);
    streakEl.textContent = state.dailyStreak || 0;
  }

  function updateDailyUI() {
    const btn = document.getElementById("daily-btn");
    const statusEl = document.getElementById("daily-status");
    if (!btn || !statusEl) return;

    const currentDay = getCurrentDayIndex();
    const last = state.lastDailyDay || 0;
    const diff = currentDay - last;

    if (diff >= 1) {
      btn.disabled = false;
      btn.classList.remove("disabled");
      statusEl.textContent =
        "Бонус доступен! Стрик: " + (state.dailyStreak || 0);
    } else {
      btn.disabled = true;
      btn.classList.add("disabled");

      const nextTime = (last + 1) * DAY_MS;
      const msLeft = Math.max(0, nextTime - Date.now());
      const h = Math.floor(msLeft / (1000 * 60 * 60));
      const m = Math.floor((msLeft % (1000 * 60 * 60)) / (1000 * 60));
      const s = Math.floor((msLeft % (1000 * 60)) / 1000);

      const pad = (n) => String(n).padStart(2, "0");
      statusEl.textContent =
        "Следующий бонус через " + pad(h) + ":" + pad(m) + ":" + pad(s);
    }
  }

  function updateAllUI() {
    regenEnergy();
    updateWalletUI();
    updateChargeUI();
    updateProfileUI();
    updateDailyUI();
    updateAchievementsUI();
  }

  // === NAVIGATION ===
  const tabs = document.querySelectorAll(".tab");
  const pages = document.querySelectorAll(".page");

  function showPage(id) {
    pages.forEach((p) => p.classList.remove("active"));
    const page = document.getElementById(id);
    if (page) page.classList.add("active");
  }

  function setTabActive(tabId) {
    tabs.forEach((t) => {
      if (t.dataset.tab === tabId) t.classList.add("active");
      else t.classList.remove("active");
    });
  }

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const target = tab.dataset.tab;
      setTabActive(target);
      showPage(target === "games" ? "games" : "social");
    });
  });

  const bottomButtons = document.querySelectorAll(".bottom-btn");
  bottomButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const screen = btn.dataset.screen;

      bottomButtons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      if (screen === "games") {
        showPage("games");
        setTabActive("games");
      } else if (screen === "wallet") {
        showPage("wallet");
      } else if (screen === "charge") {
        showPage("charge");
      } else if (screen === "players") {
        showPage("players");
        loadPlayers();
      } else if (screen === "profile") {
        showPage("profile");
      }
    });
  });

  // === TAP BUTTON ===
  const tapBtn = document.getElementById("tap-button");
  if (tapBtn) {
    tapBtn.addEventListener("click", () => {
      regenEnergy();
      if (state.energy <= 0) {
        alert("Недостаточно энергии. Подожди немного — она восстановится.");
        return;
      }

      state.energy -= 1;

      let gain = state.tapValue;
      if (state.upgrades.lucky && Math.random() < 0.1) {
        gain *= 10;
      }

      state.coins += gain;
      state.totalTaps += 1;
      state.lastEnergyTs = Date.now();

      checkAchievements();
      saveState();
      updateAllUI();

      if (tg && tg.HapticFeedback) {
        tg.HapticFeedback.impactOccurred("medium");
      }
    });
  }

  // === UPGRADES ===
  document.querySelectorAll(".upgrade-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.upgrade;
      if (!key) return;

      if (state.upgrades[key]) {
        alert("Уже куплено ✅");
        return;
      }

      const cost = UPGRADE_COSTS[key] || 0;
      if (state.coins < cost) {
        alert("Не хватает монет!");
        return;
      }

      state.coins -= cost;
      state.upgrades[key] = true;
      applyUpgrades();
      checkAchievements();
      saveState();
      updateAllUI();

      if (tg && tg.HapticFeedback) {
        tg.HapticFeedback.notificationOccurred("success");
      }

      btn.textContent = "Owned";
      btn.disabled = true;
    });
  });

  // Обновляем кнопки "Owned" при загрузке
  Object.keys(UPGRADE_COSTS).forEach((key) => {
    if (state.upgrades[key]) {
      const btn = document.querySelector(`.upgrade-btn[data-upgrade="${key}"]`);
      if (btn) {
        btn.textContent = "Owned";
        btn.disabled = true;
      }
    }
  });

  // Клик по карточкам игр (демо)
  document.querySelectorAll(".card").forEach((card) => {
    card.addEventListener("click", () => {
      const title = card.querySelector(".card-title").textContent;
      alert("Откроется игра: " + title);
    });
  });

  // Кнопка "Обновить данные" в Wallet
  const refreshBtn = document.getElementById("refresh-btn");
  if (refreshBtn) {
    refreshBtn.addEventListener("click", () => {
      regenEnergy();
      saveState();
      updateAllUI();
      if (tg && tg.HapticFeedback) {
        tg.HapticFeedback.notificationOccurred("success");
      }
    });
  }

  // Кнопка Daily bonus
  const dailyBtn = document.getElementById("daily-btn");
  if (dailyBtn) {
    dailyBtn.addEventListener("click", () => {
      const currentDay = getCurrentDayIndex();
      const last = state.lastDailyDay || 0;
      const diff = currentDay - last;

      if (diff < 1) {
        return; // уже забрали сегодня
      }

      if (diff === 1) {
        state.dailyStreak = (state.dailyStreak || 0) + 1;
      } else {
        state.dailyStreak = 1;
      }
      state.lastDailyDay = currentDay;

      const base = 500;
      const reward = base + 100 * (state.dailyStreak - 1);
      state.coins += reward;

      checkAchievements();
      saveState();
      updateAllUI();

      if (tg && tg.HapticFeedback) {
        tg.HapticFeedback.notificationOccurred("success");
      }

      alert(
        "Ежедневный бонус: +" +
          reward.toLocaleString("ru-RU") +
          " монет! Стрик: " +
          state.dailyStreak
      );
    });
  }

  // Первичная отрисовка + таймер для обновления daily
  updateAllUI();
  setInterval(updateDailyUI, 1000);
});
