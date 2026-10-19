(function () {
  const list = document.querySelector("#admin-list");
  const saveBtn = document.querySelector("#save-claims");
  const status = document.querySelector("#admin-status");
  let claims = {};

  function esc(value) {
    return String(value).replace(/[&<>"']/g, function (char) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char];
    });
  }

  function render(result) {
    if (!Store.storeKey()) {
      status.textContent = "В js/config.js пустой storeKey, общий список не работает.";
    } else if (result && result.ok) {
      status.textContent = "Гости бронируют подарки сами на главной странице. Здесь можно поправить имя или снять бронь, если кто-то ошибся.";
    } else {
      status.textContent = "Список не прочитался. Проверьте интернет и обновите страницу.";
    }
    saveBtn.disabled = !(result && result.ok);

    list.innerHTML = GIFTS.map(function (gift) {
      const claim = claims[gift.id];
      const image = gift.images[0]
        ? '<img src="' + esc(gift.images[0]) + '" alt="">'
        : '<img alt="" src="favicon.svg">';
      return (
        '<article class="admin-row" data-id="' + esc(gift.id) + '">' +
          image +
          "<div><h3>" + esc(gift.title) + "</h3>" +
          '<label>Кто дарит <input type="text" value="' + esc(claim ? claim.name : "") + '" placeholder="Пусто — подарок свободен"></label></div>' +
        "</article>"
      );
    }).join("");
  }

  saveBtn.addEventListener("click", async function () {
    saveBtn.disabled = true;
    saveBtn.textContent = "Сохраняем…";
    const jobs = [];
    list.querySelectorAll("[data-id]").forEach(function (row) {
      const id = row.dataset.id;
      const name = row.querySelector("input").value.trim();
      const previous = claims[id] || null;
      if (!name && !previous) return;
      if (name && previous && previous.name === name) return;
      const next = name ? { name: name, at: previous && previous.at ? previous.at : Store.today(), token: "" } : null;
      jobs.push(Store.saveClaim(id, next).then(function (ok) {
        return ok;
      }));
    });
    const results = await Promise.all(jobs);
    const failed = results.some(function (ok) { return !ok; });
    const fresh = await Store.fetchClaims();
    if (fresh.ok) claims = fresh.claims;
    render(fresh);
    saveBtn.textContent = failed ? "Не всё сохранилось" : "Сохранено";
    setTimeout(function () { saveBtn.textContent = "Сохранить"; }, 1800);
  });

  Store.fetchClaims().then(function (result) {
    if (result.ok) claims = result.claims;
    render(result);
  });
})();