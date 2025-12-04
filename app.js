window.addEventListener("DOMContentLoaded", () => {
  // === НАСТРОЙКИ АДМИНА ===
  // TODO: сюда подставь СВОЙ числовой Telegram ID, например "123456789"
  const ADMIN_ID = "1306116066";
  // TODO: сюда подставь СВОЙ username без @, например "Arinyan99"
  const OWNER_USERNAME = "netysil8888";

  // ===================== Telegram WebApp =====================
const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
if (tg) {
  tg.expand();
}

// ===================== ИГРОВОЙ СТЕЙТ =====================

const STORAGE_KEY = "hamsterverse_state_v3";

const DEFAULT_STATE = {
  coins: 0,
  energy: 100,
  maxEnergy: 100,
  pph: 0,             // пассивный доход (монет в час)
  tapPower: 1,        // монет за тап
  upgrades: {
    miner: false,
    gym: false,
    farm: false,
  },
  lastEnergyUpdate: Date.now(),
  lastBonusTime: 0,
  createdAt: Date.now(),
};

let state = { ...DEFAULT_STATE };

// ===================== ЗАГРУЗКА / СОХРАНЕНИЕ =====================

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

// отправка данных боту
function syncWithBot() {
  if (!tg) return;

  const payload = {
    type: "sync",
    coins: state.coins,
    energy: state.energy,
    maxEnergy: state.maxEnergy,
    pph: state.pph,
    tapPower: state.tapPower,
    upgrades: state.upgrades,
    lastEnergyUpdate: state.lastEnergyUpdate,
    lastBonusTime: state.lastBonusTime,
    ts: Date.now(),
  };

  try {
    tg.sendData(JSON.stringify(payload));
  } catch (e) {
    console.error("tg.sendData error", e);
  }
}

function saveState() {
  saveToLocal();
  syncWithBot();
}

// ===================== ЭНЕРГИЯ =====================

const ENERGY_RESTORE_PER_MIN = 5; // сколько энергии в минуту восстанавливается

function updateEnergyFromTime() {
  const now = Date.now();
  const dtMs = now - state.lastEnergyUpdate;
  if (dtMs <= 0) return;

  const minutes = dtMs / 60000;
  const restored = Math.floor(minutes * ENERGY_RESTORE_PER_MIN);

  if (restored > 0) {
    state.energy = Math.min(state.maxEnergy, state.energy + restored);
    state.lastEnergyUpdate = now;
  }
}

function tickEnergy() {
  updateEnergyFromTime();
  applyStateToUI();
  saveState();
}

// ===================== UI-ПОМOЩНИКИ =====================

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function applyStateToUI() {
  // Главный экран (Charge / HamsterVerse)
  setText("coins-main", state.coins);
  setText("energy-main", `${state.energy} / ${state.maxEnergy}`);
  setText("pph-main", `${state.pph} / hour`);

  // Wallet
  setText("wallet-coins", state.coins);
  setText("wallet-energy", `${state.energy} / ${state.maxEnergy}`);
  setText("wallet-pph", `${state.pph} / hour`);

  // Profile
  setText("profile-coins", state.coins);
  setText("profile-energy", `${state.energy} / ${state.maxEnergy}`);
  setText("profile-pph", `${state.pph} / hour`);

  // Кнопки апгрейдов
  const minerBtn = document.getElementById("upgrade-miner-btn");
  const gymBtn = document.getElementById("upgrade-gym-btn");
  const farmBtn = document.getElementById("upgrade-farm-btn");

  if (minerBtn) {
    minerBtn.disabled = state.upgrades.miner;
    minerBtn.textContent = state.upgrades.miner ? "Куплено" : "Buy";
  }
  if (gymBtn) {
    gymBtn.disabled = state.upgrades.gym;
    gymBtn.textContent = state.upgrades.gym ? "Куплено" : "Buy";
  }
  if (farmBtn) {
    farmBtn.disabled = state.upgrades.farm;
    farmBtn.textContent = state.upgrades.farm ? "Куплено" : "Buy";
  }

  // Ежедневный бонус
  const bonusBtn = document.getElementById("daily-bonus-btn");
  if (bonusBtn) {
    bonusBtn.disabled = !canTakeDailyBonus();
  }
}

// ===================== ЕЖЕДНЕВНЫЙ БОНУС =====================

const DAILY_BONUS_COINS = 1000;

function canTakeDailyBonus() {
  if (!state.lastBonusTime) return true;
  const now = Date.now();
  return now - state.lastBonusTime >= 24 * 60 * 60 * 1000; // 24 часа
}

function takeDailyBonus() {
  if (!canTakeDailyBonus()) return;

  state.coins += DAILY_BONUS_COINS;
  state.lastBonusTime = Date.now();
  saveState();
  applyStateToUI();

  if (tg) {
    tg.showPopup({
      title: "Ежедневный бонус",
      message: `Ты получил ${DAILY_BОНUS_COINS} монет!`,
      buttons: [{ type: "close" }],
    });
  }
}

// ===================== ТАПЫ И АПГРЕЙДЫ =====================

function handleTap() {
  if (state.energy <= 0) {
    if (tg) tg.showAlert("Нет энергии! Подожди восстановления или прокачай энергию.");
    return;
  }
  state.coins += state.tapPower;
  state.energy = Math.max(0, state.energy - 1);
  saveState();
  applyStateToUI();
}

function buyUpgradeMiner() {
  const price = 5000;
  if (state.upgrades.miner) return;
  if (state.coins < price) {
    tg && tg.showAlert("Не хватает монет на Auto-Miner");
    return;
  }
  state.coins -= price;
  state.pph += 200;
  state.upgrades.miner = true;
  saveState();
  applyStateToUI();
}

function buyUpgradeGym() {
  const price = 2000;
  if (state.upgrades.gym) return;
  if (state.coins < price) {
    tg && tg.showAlert("Не хватает монет на Hamster Gym");
    return;
  }
  state.coins -= price;
  state.tapPower += 1;
  state.upgrades.gym = true;
  saveState();
  applyStateToUI();
}

function buyUpgradeFarm() {
  const price = 3000;
  if (state.upgrades.farm) return;
  if (state.coins < price) {
    tg && tg.showAlert("Не хватает монет на Energy Farm");
    return;
  }
  state.coins -= price;
  state.maxEnergy += 50;
  state.upgrades.farm = true;
  saveState();
  applyStateToUI();
}

// ===================== НАВИГАЦИЯ ПО ЭКРАНАМ =====================

function switchScreen(screenId) {
  const screens = document.querySelectorAll("[data-screen]");
  screens.forEach((el) => {
    el.classList.toggle("screen-active", el.id === screenId);
  });

  const navButtons = document.querySelectorAll("[data-nav]");
  navButtons.forEach((btn) => {
    const target = btn.getAttribute("data-nav");
    const isActive = target === screenId;
    btn.classList.toggle("bottom-btn--active", isActive);
    btn.classList.toggle("active", isActive); // на случай старого класса
  });
}

// ===================== ИНИЦИАЛИЗАЦИЯ =====================

document.addEventListener("DOMContentLoaded", () => {
  loadFromLocal();
  updateEnergyFromTime();
  applyStateToUI();

  // Восстановление энергии раз в минуту
  setInterval(tickEnergy, 60 * 1000);

  // Навигация
  document.querySelectorAll("[data-nav]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.getAttribute("data-nav");
      switchScreen(target);
    });
  });

  // TAP
  const tapBtn = document.getElementById("tap-btn");
  tapBtn && tapBtn.addEventListener("click", handleTap);

  // Ежедневный бонус
  const bonusBtn = document.getElementById("daily-bonus-btn");
  bonusBtn && bonusBtn.addEventListener("click", takeDailyBonus);

  // Апгрейды
  const minerBtn = document.getElementById("upgrade-miner-btn");
  const gymBtn = document.getElementById("upgrade-gym-btn");
  const farmBtn = document.getElementById("upgrade-farm-btn");

  minerBtn && minerBtn.addEventListener("click", buyUpgradeMiner);
  gymBtn && gymBtn.addEventListener("click", buyUpgradeGym);
  farmBtn && farmBtn.addEventListener("click", buyUpgradeFarm);

  // Кнопка обновления в Wallet (если есть)
  const walletRefreshBtn = document.getElementById("wallet-refresh-btn");
  walletRefreshBtn &&
    walletRefreshBtn.addEventListener("click", () => {
      updateEnergyFromTime();
      applyStateToUI();
      saveState();
    });

  // Стартовый экран (HamsterVerse / Charge)
  switchScreen("screen-hamsterverse");
});

