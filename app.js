window.addEventListener("DOMContentLoaded", () => {
  // Telegram WebApp интеграция
  if (window.Telegram && window.Telegram.WebApp) {
    const tg = window.Telegram.WebApp;
    tg.expand();
    tg.setHeaderColor("#0b1020");
    tg.setBackgroundColor("#0b1020");
    tg.ready();

    const user = tg.initDataUnsafe?.user;
    if (user) {
      const name = (user.first_name || "") + " " + (user.last_name || "");
      const profileName = document.getElementById("profile-name");
      const profileId = document.getElementById("profile-id");
      if (profileName) profileName.textContent = name.trim() || "Player";
      if (profileId) profileId.textContent = "ID: " + user.id;
    }
  }

  const tabs = document.querySelectorAll(".tab");
  const pages = document.querySelectorAll(".page");

  function showPage(id) {
    pages.forEach(p => p.classList.remove("active"));
    const page = document.getElementById(id);
    if (page) page.classList.add("active");
  }

  function setTabActive(tabId) {
    tabs.forEach(t => {
      if (t.dataset.tab === tabId) t.classList.add("active");
      else t.classList.remove("active");
    });
  }

  // Верхние табы (Games / Social)
  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      const target = tab.dataset.tab;
      setTabActive(target);
      showPage(target);
    });
  });

  // Нижнее меню (HamsterVerse / Wallet / Charge / Profile)
  const bottomButtons = document.querySelectorAll(".bottom-btn");
  bottomButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      const screen = btn.dataset.screen;

      bottomButtons.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      if (screen === "games" || screen === "charge") {
        showPage("games");
        setTabActive("games");
      } else if (screen === "wallet") {
        showPage("wallet");
      } else if (screen === "profile") {
        showPage("profile");
      }
    });
  });

  // Клик по карточке игры
  document.querySelectorAll(".card").forEach(card => {
    card.addEventListener("click", () => {
      const title = card.querySelector(".card-title").textContent;
      if (window.Telegram && window.Telegram.WebApp) {
        window.Telegram.WebApp.HapticFeedback.impactOccurred("light");
      }
      alert("Откроется игра: " + title);
    });
  });

  // Демонстрация обновления кошелька
  const refreshBtn = document.getElementById("refresh-btn");
  if (refreshBtn) {
    refreshBtn.addEventListener("click", () => {
      document.getElementById("coins-value").textContent = "123 456";
      document.getElementById("energy-value").textContent = "73 / 100";
      document.getElementById("pph-value").textContent = "900 / hour";

      if (window.Telegram && window.Telegram.WebApp) {
        window.Telegram.WebApp.HapticFeedback.notificationOccurred("success");
      }
    });
  }
});
