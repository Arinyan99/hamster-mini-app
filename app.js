// Инициализация Telegram WebApp (если открыто в Telegram)
window.addEventListener("DOMContentLoaded", () => {
    if (window.Telegram && window.Telegram.WebApp) {
        const tg = window.Telegram.WebApp;
        tg.expand();               // разворачиваем на весь экран
        tg.setHeaderColor("#0b1020");
        tg.setBackgroundColor("#0b1020");
        tg.ready();
    }

    // Логика табов
    const tabs = document.querySelectorAll(".tab");
    const pages = document.querySelectorAll(".page");

    tabs.forEach(tab => {
        tab.addEventListener("click", () => {
            const target = tab.dataset.tab;

            tabs.forEach(t => t.classList.remove("active"));
            pages.forEach(p => p.classList.remove("active"));

            tab.classList.add("active");
            document.getElementById(target).classList.add("active");
        });
    });

    // Клик по карточке — пока просто алерт (потом можно сделать переход в игру / экран)
    document.querySelectorAll(".card").forEach(card => {
        card.addEventListener("click", () => {
            const title = card.querySelector(".card-title").textContent;
            if (window.Telegram && window.Telegram.WebApp) {
                window.Telegram.WebApp.HapticFeedback.impactOccurred("light");
            }
            alert("Откроется игра: " + title);
        });
    });
});
