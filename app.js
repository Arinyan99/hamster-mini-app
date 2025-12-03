window.addEventListener("DOMContentLoaded", () => {
  // === Telegram WebApp ===
  const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;

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
  };

  let state = { ...DEFAULT_STATE };

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
      if (!value) return; // ещё ничего не сохранено

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

  function saveState() {
    saveToLocal();
    saveToCloud();
  }

  // --- Инициализация состояния ---
  (function initState() {
    // 1) пробуем подгрузить локально (для браузера или резерв)
    loadFromLocal();
    // 2) поверх — подгружаем из облака (для Telegram Mini App)
    loadFromCloud();
  })();

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

  // LEVEL = по монетам
  function computeLevel() {
    return 1 + Math.floor(state.coins / 5000);
  }

  function computeDays() {
    const diff = Date.now() - state.createdAt;
    return Math.max(1, Math.floor(diff / (1000 * 60 * 60 * 24)));
  }

  // === UI UPDATE ===
  function formatNumber(n) {
    return n.toLocaleString("ru-RU");
  }

  function updateWalletUI() {
    document.getElementById("coins-value").textContent = formatNumber(state.coins);
    document.getElementById("energy-value").textContent =
      state.energy + " / " + state.maxEnergy;
    document.getElementById("pph-value").textContent =
      formatNumber(state.pph) + " / hour";
  }

  function updateChargeUI() {
    document.getElementById("charge-coins").textContent = formatNumber(state.coins);
    document.getElementById("charge-energy").textContent =
      state.energy + " / " + state.maxEnergy;
    document.getElementById("tap-value").textContent = "+" + state.tapValue;
  }

  function updateProfileUI() {
    document.getElementById("level-value").textContent = computeLevel();
    document.getElementById("days-value").textContent = computeDays();
    document.getElementById("taps-value").textContent =
      formatNumber(state.totalTaps);
  }

  function updateAllUI() {
    regenEnergy();
    updateWalletUI();
    updateChargeUI();
    updateProfileUI();
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

  // === UPGRADES ===
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

  applyUpgrades();

  // Кнопки апгрейдов
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

  // Первичная отрисовка
  updateAllUI();
});
