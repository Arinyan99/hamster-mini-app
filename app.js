// ===================== Telegram WebApp =====================
const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
if (tg) {
  tg.expand();
}

// ===================== КОНСТАНТЫ =====================
const STORAGE_KEY = "hamsterverse_state_v4";

// ID твоего аккаунта в Telegram (чтобы только ты видел экран Players)
const ADMIN_ID = 1306116066; // если что — можно поменять

const DAILY_BONUS_BASE = 1000;       // базовый ежедневный бонус
const BASE_ENERGY_REGEN = 5;         // энергия в минуту
const REGEN_BONUS_PER_LEVEL = 3;     // +3 энергии/мин за апгрейд regen
const LUCKY_CHANCE = 0.05;           // 5% шанс x10 награды за тап

// ===================== СТЕЙТ =====================
const DEFAULT_STATE = {
  coins: 0,
  energy: 100,
  maxEnergy: 100,
  pph: 0,
  tapPower: 1,
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

  lastEnergyUpdate: Date.now(),

  // daily bonus
  lastBonusTime: 0,
  bonusStreak: 0,

  createdAt: Date.now(),
};

let state = { ...DEFAULT_STATE };
let isAdmin = false;

// ===================== ХЕЛПЕРЫ С ХРАНИЛИЩЕМ =====================

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

function syncWithBot() {
  if (!tg) return;
  const payload = {
    type: "sync",
    coins: state.coins,
    energy: state.energy,
    maxEnergy: state.maxEnergy,
    pph: state.pph,
    tapPower: state.tapPower,
    totalTaps: state.totalTaps,
    upgrades: state.upgrades,
    lastEnergyUpdate: state.lastEnergyUpdate,
    lastBonusTime: state.lastBonusTime,
    bonusStreak: state.bonusStreak,
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

function getEnergyRegenPerMin() {
  let regen = BASE_ENERGY_REGEN;
  if (state.upgrades.regen) regen += REGEN_BONUS_PER_LEVEL;
  return regen;
}

function updateEnergyFromTime() {
  const now = Date.now();
  const dtMs = now - state.lastEnergyUpdate;
  if (dtMs <= 0) return;

  const minutes = dtMs / 60000;
  const restored = Math.floor(minutes * getEnergyRegenPerMin());

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

// ===================== UI ХЕЛПЕРЫ =====================

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

// форматирование числа с пробелами
function fmtNum(n) {
  return n.toLocaleString("ru-RU");
}

// ===================== DAILY BONUS =====================

function canTakeDailyBonus() {
  if (!state.lastBonusTime) return true;
  const now = Date.now();
  return now - state.lastBonusTime >= 24 * 60 * 60 * 1000;
}

function updateDailyUI() {
  const statusEl = document.getElementById("daily-status");
  const btn = document.getElementById("daily-btn");
  if (!statusEl || !btn) return;

  if (canTakeDailyBonus()) {
    const streak = state.bonusStreak || 0;
    statusEl.textContent =
      streak > 0 ? `Бонус доступен! Стрик: ${streak}` : "Бонус доступен!";
    btn.classList.remove("disabled");
    btn.disabled = false;
  } else {
    const now = Date.now();
    const diffMs = 24 * 60 * 60 * 1000 - (now - state.lastBonusTime);
    const hrs = Math.floor(diffMs / 3600000);
    const mins = Math.floor((diffMs % 3600000) / 60000);
    statusEl.textContent = `Следующий бонус через ${hrs} ч ${mins} мин`;
    btn.classList.add("disabled");
    btn.disabled = true;
  }
}

function takeDailyBonus() {
  if (!canTakeDailyBonus()) return;

  const now = Date.now();

  if (!state.lastBonusTime) {
    state.bonusStreak = 1;
  } else {
    const diffDays = (now - state.lastBonusTime) / (24 * 60 * 60 * 1000);
    if (diffDays > 1.5) {
      state.bonusStreak = 1;
    } else {
      state.bonusStreak = (state.bonusStreak || 0) + 1;
    }
  }

  const reward = Math.round(
    DAILY_BONUS_BASE * (1 + 0.1 * (state.bonusStreak - 1))
  );
  state.coins += reward;
  state.lastBonusTime = now;

  saveState();
  applyStateToUI();

  if (tg) {
    tg.showPopup({
      title: "Ежедневный бонус",
      message: `Ты получил ${fmtNum(
        reward
      )} монет!\nСтрик: ${state.bonusStreak}`,
      buttons: [{ type: "close" }],
    });
  }
}

// ===================== TAP & UPGRADES =====================

function handleTap() {
  if (state.energy <= 0) {
    tg && tg.showAlert("Нет энергии! Жди восстановления или прокачай энергию.");
    return;
  }

  let gain = state.tapPower;

  // Lucky Tap x10
  if (state.upgrades.lucky && Math.random() < LUCKY_CHANCE) {
    gain *= 10;
  }

  state.coins += gain;
  state.totalTaps = (state.totalTaps || 0) + 1;
  state.energy = Math.max(0, state.energy - 1);

  saveState();
  applyStateToUI();
}

const UPGRADE_CONFIG = {
  miner: { price: 5000, apply: () => (state.pph += 200) },
  gym: { price: 2000, apply: () => (state.tapPower += 1) },
  farm: { price: 3000, apply: () => (state.maxEnergy += 50) },
  tap2: { price: 4000, apply: () => (state.tapPower += 1) },
  regen: { price: 6000, apply: () => {} }, // ускорение регена учтено в getEnergyRegenPerMin
  crypto: { price: 10000, apply: () => (state.pph += 1000) },
  lucky: { price: 7000, apply: () => {} }, // шанс Lucky Tap уже в handleTap
};

function buyUpgrade(key) {
  const conf = UPGRADE_CONFIG[key];
  if (!conf) return;

  if (state.upgrades[key]) return;

  if (state.coins < conf.price) {
    tg && tg.showAlert("Не хватает монет");
    return;
  }

  state.coins -= conf.price;
  state.upgrades[key] = true;
  conf.apply();

  saveState();
  applyStateToUI();
}

// ===================== PROFILE & ACHIEVEMENTS =====================

function updateProfileFromTelegram() {
  if (!tg || !tg.initDataUnsafe || !tg.initDataUnsafe.user) return;
  const u = tg.initDataUnsafe.user;

  const fullName = (u.first_name || "") + (u.last_name ? " " + u.last_name : "");
  setText("profile-name", fullName || "Player");
  setText("profile-id", `ID: ${u.id}`);

  if (u.id === ADMIN_ID) {
    isAdmin = true;
  }
}

function updateProfileStatsUI() {
  const days =
    1 + Math.floor((Date.now() - state.createdAt) / (24 * 60 * 60 * 1000));
  setText("days-value", days);
  setText("taps-value", state.totalTaps || 0);
  setText("streak-value", state.bonusStreak || 0);

  // условный уровень от монет
  const level = 1 + Math.floor(state.coins / 10000);
  setText("level-value", level);
}

function updateAchievementsUI() {
  const el = document.getElementById("ach-list");
  if (!el) return;

  const ach = [];

  if ((state.totalTaps || 0) >= 10) {
    ach.push({ title: "Tap Rookie", desc: "Сделай 10 тапов" });
  }
  if ((state.totalTaps || 0) >= 100) {
    ach.push({ title: "Tap Master", desc: "Сделай 100 тапов" });
  }
  if (state.coins >= 10000) {
    ach.push({ title: "Rich Hamster", desc: "Накопи 10 000 монет" });
  }
  if (state.bonusStreak >= 3) {
    ach.push({ title: "Bonus Streak", desc: "3 дня подряд забирай бонус" });
  }

  if (ach.length === 0) {
    el.innerHTML = `<div class="players-empty">Пока достижений нет. Залогинься и поиграй 🐹</div>`;
    return;
  }

  el.innerHTML = ach
    .map(
      (a) => `
      <div class="ach-item">
        <div class="ach-title">${a.title}</div>
        <div class="ach-desc">${a.desc}</div>
      </div>`
    )
    .join("");
}

// ===================== ПРИМЕНЕНИЕ СТЕЙТА НА UI =====================

function applyStateToUI() {
  // Wallet
  setText("coins-value", fmtNum(state.coins));
  setText(
    "energy-value",
    `${fmtNum(state.energy)} / ${fmtNum(state.maxEnergy)}`
  );
  setText("pph-value", `${fmtNum(state.pph)} / hour`);

  // Charge
  setText("charge-coins", fmtNum(state.coins));
  setText(
    "charge-energy",
    `${fmtNum(state.energy)} / ${fmtNum(state.maxEnergy)}`
  );
  setText("tap-value", `+${state.tapPower}`);

  // Upgrades
  document.querySelectorAll(".upgrade-btn").forEach((btn) => {
    const key = btn.dataset.upgrade;
    const bought = !!state.upgrades[key];
    btn.textContent = bought ? "Куплено" : "Buy";
    btn.disabled = bought;
  });

  updateDailyUI();
  updateProfileStatsUI();
  updateAchievementsUI();
}

// ===================== НАВИГАЦИЯ ПО ВЕРХНИМ ТАБАМ =====================

function showPage(pageId) {
  document.querySelectorAll(".page").forEach((p) => {
    if (p.id === pageId) p.classList.add("active");
    else p.classList.remove("active");
  });
}

function initTabsAndNav() {
  const tabs = document.querySelectorAll(".tabs .tab");
  const bottomButtons = document.querySelectorAll(".bottom-nav .bottom-btn");

  // верхние табы Games / Social
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");

      const target = tab.dataset.tab; // games / social
      showPage(target);

      // при переключении таба снизу активна кнопка HamsterVerse
      bottomButtons.forEach((b) =>
        b.classList.toggle("active", b.dataset.screen === "games")
      );
    });
  });

  // нижнее меню
  bottomButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const screen = btn.dataset.screen; // games / wallet / charge / players / profile

      bottomButtons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      if (screen === "games") {
        // показываем либо games, либо social в зависимости от активного таба
        const activeTab = document.querySelector(".tabs .tab.active");
        const tabId = activeTab ? activeTab.dataset.tab : "games";
        showPage(tabId);
      } else {
        showPage(screen);
      }
    });
  });
}

// ===================== ИНИЦИАЛИЗАЦИЯ =====================

document.addEventListener("DOMContentLoaded", () => {
  // логин из Telegram
  updateProfileFromTelegram();

  // если не админ — скрываем экран и кнопку Players
  if (!isAdmin) {
    const playersPage = document.getElementById("players");
    if (playersPage) playersPage.remove();
    const playersBtn = document.querySelector(
      '.bottom-nav .bottom-btn[data-screen="players"]'
    );
    if (playersBtn) playersBtn.remove();
  }

  loadFromLocal();
  updateEnergyFromTime();
  applyStateToUI();

  // таймер восстановления энергии
  setInterval(tickEnergy, 60 * 1000);

  initTabsAndNav();

  // кнопка TAP
  const tapBtn = document.getElementById("tap-button");
  tapBtn && tapBtn.addEventListener("click", handleTap);

  // апгрейды
  document.querySelectorAll(".upgrade-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.upgrade;
      buyUpgrade(key);
    });
  });

  // daily bonus
  const dailyBtn = document.getElementById("daily-btn");
  dailyBtn && dailyBtn.addEventListener("click", takeDailyBonus);

  // refresh в Wallet
  const refreshBtn = document.getElementById("refresh-btn");
  refreshBtn &&
    refreshBtn.addEventListener("click", () => {
      updateEnergyFromTime();
      applyStateToUI();
      saveState();
    });

  // кнопка Telegram в Social
  const tgLinkBtn = document.getElementById("tg-link-btn");
  tgLinkBtn &&
    tgLinkBtn.addEventListener("click", () => {
      window.open("https://t.me/netysil8888", "_blank");
    });

  // стартовая страница — Games
  showPage("games");
});
