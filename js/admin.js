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
      const clearBtn = claim
        ? '<button class="btn ghost admin-clear" type="button" data-clear>Удалить бронь</button>'
        : "";
      return (
        '<article class="admin-row" data-id="' + esc(gift.id) + '">' +
          image +
          "<div><h3>" + esc(gift.title) + "</h3>" +
          '<label>Кто дарит <input type="text" value="' + esc(claim ? claim.name : "") + '" placeholder="Пусто — подарок свободен"></label>' +
          clearBtn +
          "</div>" +
        "</article>"
      );
    }).join("");
  }

  saveBtn.addEventListener("click", async function () {
    if (list.dataset.busy === "1") return;
    saveBtn.disabled = true;
    saveBtn.textContent = "Сохраняем…";
    list.dataset.busy = "1";
    try {
      const jobs = [];
      list.querySelectorAll("[data-id]").forEach(function (row) {
        const id = row.dataset.id;
        const name = row.querySelector("input").value.trim();
        const previous = claims[id] || null;
        if (!name && !previous) return;
        if (name && previous && previous.name === name) return;
        const next = name ? { name: name, at: previous && previous.at ? previous.at : Store.today(), token: "" } : null;
        jobs.push(Store.saveClaim(id, next));
      });
      const results = await Promise.all(jobs);
      const failed = results.some(function (ok) { return !ok; });
      const fresh = await Store.fetchClaims();
      if (fresh.ok) claims = fresh.claims;
      render(fresh);
      saveBtn.textContent = failed ? "Не всё сохранилось" : "Сохранено";
      if (failed) status.textContent = "Не всё сохранилось. Проверьте интернет и попробуйте ещё раз.";
    } catch (error) {
      saveBtn.disabled = false;
      saveBtn.textContent = "Не всё сохранилось";
      status.textContent = "Не удалось сохранить. Попробуйте ещё раз.";
    } finally {
      delete list.dataset.busy;
      setTimeout(function () { saveBtn.textContent = "Сохранить"; }, 1800);
    }
  });

  list.addEventListener("click", async function (event) {
    const button = event.target.closest("[data-clear]");
    if (!button || list.dataset.busy === "1") return;
    const row = button.closest("[data-id]");
    const id = row.dataset.id;
    const gift = GIFTS.find(function (item) { return item.id === id; });
    const title = gift ? gift.title : "подарок";
    if (!window.confirm("Удалить бронь?\n\n" + title)) return;
    list.dataset.busy = "1";
    button.disabled = true;
    button.textContent = "Удаляем…";
    saveBtn.disabled = true;
    try {
      const ok = await Store.saveClaim(id, null);
      const fresh = await Store.fetchClaims();
      if (fresh.ok) claims = fresh.claims;
      render(fresh.ok ? fresh : { ok: true });
      status.textContent = ok && fresh.ok && !claims[id]
        ? "Бронь удалена. Подарок снова свободен."
        : "Не удалось удалить бронь. Попробуйте ещё раз.";
    } catch (error) {
      button.disabled = false;
      button.textContent = "Удалить бронь";
      saveBtn.disabled = false;
      status.textContent = "Не удалось удалить бронь. Попробуйте ещё раз.";
    } finally {
      delete list.dataset.busy;
    }
  });

  Store.fetchClaims().then(function (result) {
    if (result.ok) claims = result.claims;
    render(result);
  });
})();