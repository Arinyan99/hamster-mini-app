window.addEventListener("DOMContentLoaded", () => {
  // === Telegram WebApp ===
  const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;

  // URL твоего API (когда появится backend — сюда вставишь адрес, пока оставь пустым)
  const API_BASE = ""; // например: "https://my-hamster-backend.onrender.com"
  const DAY_MS = 1000 * 60 * 60 * 24;

  let userId = "local";
  if (tg) {
    tg.expand();
    tg.setHeaderColor("#0b1020");
    tg.setBackgroundColor("#0b1020");
    tg.ready();

    const user = tg.initDataUnsafe?.user;
    if (user) {
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
    },
    createdAt: Date.now(),
    // daily bonus
    lastDailyDay: 0,
    dailyStreak: 0,
  };

  let state = { ...DEFAULT_STATE };

  // === UPGRADE LOGIC ===
  const UPGRADE_COSTS = {
    miner: 5000,
    gym: 2000,
    farm: 3000,
  };

  function applyUpgrades() {
    state.pph = 0;
    state.tapValue = 1;
    state.maxEnergy = state.upgrades.farm ? 150 : 100;

    if (state.upgrades.miner) state.pph += 200;
    if (state.upgrades.gym) state.tapValue = 2;
  }

  // --- Локальное хранилище (fallback) ---
  function loadFromLocal() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const obj = JSON.parse(raw);
      state = { ...DEFAULT_STATE, ...obj };
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

  // === Работа с внешним API (пока опционально) ===
  async function apiLoadState() {
    if (!API_BASE) return; // если URL не задан — ничего не делаем

    try {
      const res = await fetch(`${API_BASE}/state/${userId}`);
      if (!res.ok) return;

      const json = await res.json();
      if (json && Object.keys(json).length > 0) {
        state = { ...DEFAULT_STATE, ...json };
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

  function saveState() {
    saveToLocal();
    saveToCloud();
    apiSaveState();
  }

  // --- Инициализация состояния ---
  (function initState() {
    loadFromLocal();   // локальное
    applyUpgrades();
    updateAllUI();     // чтобы сразу что-то показать

    loadFromCloud();   // поверх — CloudStorage
    apiLoadState();    // и, при наличии backend, поверх — API
  })();

  // === ЛОГИКА ИГРЫ ===

  // Регенерация энергии (1 ед. / 5 секунд)
  function regenEnergy() {
    const now = Date.now();
    const diff = Math.max(0, now - (state.lastEnergyTs || now));
    const gained = Math.floor(diff / 5000);
    if (gained > 0) {
      state.lastEnergyTs = (state.lastEnergyTs || now) + gained * 5000;
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
    if (!lvlEl || !daysEl || !tapsEl) return;

    lvlEl.textContent = computeLevel();
    daysEl.textContent = computeDays();
    tapsEl.textContent = formatNumber(state.totalTaps);
  }

  function updateDailyUI() {
    const btn = document.getElementById("daily-btn");
    const statusEl = document.getElementById("daily-status");
    if (!btn || !statusEl) return;

    const currentDay = getCurrentDayIndex();
    const last = state.lastDailyDay || 0;
    const diff = currentDay - last;

    if (diff >= 1) {
      // бонус доступен
      btn.disabled = false;
      btn.classList.remove("disabled");
      statusEl.textContent =
        "Бонус доступен! Стрик: " + (state.dailyStreak || 0);
    } else {
      // ждём следующий день
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
      state.coins += state.tapValue;
      state.totalTaps += 1;
      state.lastEnergyTs = Date.now();
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
      saveState();
      updateAllUI();

      if (tg && tg.HapticFeedback) {
        tg.HapticFeedback.notificationOccurred("success");
      }

      btn.textContent = "Owned";
      btn.disabled = true;
      btn.style.background = "#4b5563";
    });
  });

  // Обновляем кнопки "Owned" при загрузке
  ["miner", "gym", "farm"].forEach((key) => {
    if (state.upgrades[key]) {
      const btn = document.querySelector(`.upgrade-btn[data-upgrade="${key}"]`);
      if (btn) {
        btn.textContent = "Owned";
        btn.disabled = true;
        btn.style.background = "#4b5563";
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
        return; // уже забрал сегодня
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

  // Первичная отрисовка + таймер для обновления таймера бонуса
  updateAllUI();
  setInterval(updateDailyUI, 1000);
});
