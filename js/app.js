(function () {
  const grid = document.querySelector("#grid");
  const photosRoot = document.querySelector("#photos");
  const progress = document.querySelector("#progress");
  const sync = document.querySelector("#sync");
  const dialog = document.querySelector("#reserve");
  const form = document.querySelector("#reserve-form");
  const nameInput = document.querySelector("#giver-name");
  const modalText = document.querySelector("#modal-text");
  const modalError = document.querySelector("#modal-error");
  const submitBtn = document.querySelector("#reserve-submit");
  const toast = document.querySelector("#toast");

  let filter = "all";
  let claims = {};
  let tokens = Store.readTokens();
  let photoIndex = {};
  let activeGift = null;
  let toastTimer = 0;
  let busy = false;

  function esc(value) {
    return String(value).replace(/[&<>"']/g, function (char) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char];
    });
  }

  function money(value) {
    return new Intl.NumberFormat("ru-RU").format(value) + " ₽";
  }

  function newToken() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  function isMine(gift) {
    const claim = claims[gift.id];
    return !!(claim && claim.token && tokens[gift.id] === claim.token);
  }

  function visibleGifts() {
    return GIFTS.filter(function (gift) {
      const taken = !!claims[gift.id];
      if (filter === "free") return !taken;
      if (filter === "taken") return taken;
      return true;
    });
  }

  function renderPhotos() {
    const photos = Array.isArray(SITE.photos) ? SITE.photos.filter(function (photo) { return photo && photo.src; }) : [];
    if (!photos.length) {
      photosRoot.innerHTML = [1, 2, 3].map(function (n) {
        return (
          '<figure class="frame"><div class="empty">Место для фото ' + n +
          "<br>добавьте снимок в папку photos</div></figure>"
        );
      }).join("");
      return;
    }
    photosRoot.innerHTML = photos.map(function (photo) {
      var caption = photo.caption
        ? "<figcaption>" + esc(photo.caption) + "</figcaption>"
        : "";
      return (
        '<figure class="frame"><img src="' + esc(photo.src) + '" alt="' + esc(photo.alt || "Миша") +
        '">' + caption + "</figure>"
      );
    }).join("");
  }

  function renderSync(result) {
    sync.classList.remove("live", "warn");
    if (!Store.storeKey()) {
      sync.classList.add("warn");
      sync.innerHTML = "<i></i><span>Общий список не настроен: в js/config.js пустой storeKey.</span>";
      return;
    }
    if (result && result.ok) {
      sync.classList.add("live");
      sync.innerHTML = "<i></i><span>Бронь общая: её сразу видят все, кто открыл вишлист.</span>";
      return;
    }
    sync.classList.add("warn");
    sync.innerHTML = "<i></i><span>Не удалось обновить список. Проверьте интернет и обновите страницу.</span>";
  }

  function shotHtml(gift) {
    if (!gift.images.length) {
      return '<div class="placeholder"><div><strong>Фото откроется на Ozon</strong><br>по кнопке магазина</div></div>';
    }
    const index = photoIndex[gift.id] || 0;
    const dots = gift.images.length > 1
      ? '<div class="dots">' + gift.images.map(function (_, i) {
          return '<button type="button" data-photo="' + i + '" aria-label="Фото ' + (i + 1) + '"' +
            (i === index ? ' aria-current="true"' : "") + "></button>";
        }).join("") + "</div>"
      : "";
    return '<img src="' + esc(gift.images[index]) + '" alt="' + esc(gift.title) + '">' + dots;
  }

  function actionsHtml(gift) {
    const shop = '<a class="btn ghost" href="' + esc(gift.url) + '" target="_blank" rel="noopener">Открыть в магазине</a>';
    if (!claims[gift.id]) return shop + '<button class="btn" type="button" data-reserve>Забронировать</button>';
    if (isMine(gift)) return shop + '<button class="btn ghost" type="button" data-cancel>Снять бронь</button>';
    return shop;
  }

  function render() {
    const gifts = visibleGifts();
    const taken = GIFTS.filter(function (gift) { return !!claims[gift.id]; }).length;
    progress.textContent = "Забронировано " + taken + " из " + GIFTS.length;
    if (!gifts.length) {
      grid.innerHTML = '<p class="note">В этом фильтре пока пусто.</p>';
      return;
    }
    grid.innerHTML = gifts.map(function (gift) {
      const claim = claims[gift.id];
      const price = gift.price == null
        ? '<p class="price">Цена на ' + esc(gift.shop) + "<small>смотрите на странице товара</small></p>"
        : '<p class="price">≈ ' + money(gift.price) + "<small>ориентир с " + esc(gift.shop) + ", перед покупкой сверьте</small></p>";
      const who = claim ? '<p class="who">Дарит ' + esc(claim.name) + "</p>" : "";
      const badge = claim ? '<div class="badge">Уже дарят</div>' : "";
      return (
        '<article class="card ' + (claim ? "taken" : "") + '" data-id="' + esc(gift.id) + '">' +
          '<div class="shot">' + badge + shotHtml(gift) + "</div>" +
          '<div class="card-body">' +
            '<p class="shop">' + esc(gift.shop) + "</p>" +
            "<h3>" + esc(gift.title) + "</h3>" +
            '<p class="full">' + esc(gift.fullName) + "</p>" +
            price +
            '<p class="blurb">' + esc(gift.blurb) + "</p>" +
            who +
            '<div class="actions">' + actionsHtml(gift) + "</div>" +
          "</div>" +
        "</article>"
      );
    }).join("");
  }

  function showToast(text) {
    toast.textContent = text;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.classList.remove("show"); }, 2800);
  }

  function forgetStaleTokens() {
    let changed = false;
    Object.keys(tokens).forEach(function (id) {
      const claim = claims[id];
      if (!claim || claim.token !== tokens[id]) {
        delete tokens[id];
        changed = true;
      }
    });
    if (changed) Store.writeTokens(tokens);
  }

  async function refresh() {
    const result = await Store.fetchClaims();
    if (result.ok) {
      claims = result.claims;
      forgetStaleTokens();
    }
    renderSync(result);
    render();
    return result;
  }

  document.querySelectorAll(".chip").forEach(function (chip) {
    chip.addEventListener("click", function () {
      filter = chip.dataset.filter;
      document.querySelectorAll(".chip").forEach(function (item) {
        item.setAttribute("aria-pressed", String(item === chip));
      });
      render();
    });
  });

  grid.addEventListener("click", async function (event) {
    const card = event.target.closest(".card");
    if (!card || busy) return;
    const gift = GIFTS.find(function (item) { return item.id === card.dataset.id; });
    if (!gift) return;

    const photoBtn = event.target.closest("[data-photo]");
    if (photoBtn) {
      photoIndex[gift.id] = Number(photoBtn.dataset.photo);
      render();
      return;
    }

    if (event.target.closest("[data-cancel]")) {
      if (!isMine(gift)) return;
      busy = true;
      render();
      const ok = await Store.saveClaim(gift.id, null);
      busy = false;
      if (!ok) {
        showToast("Не удалось снять бронь. Попробуйте ещё раз");
        render();
        return;
      }
      delete claims[gift.id];
      delete tokens[gift.id];
      Store.writeTokens(tokens);
      showToast("Бронь снята, подарок снова свободен");
      refresh();
      return;
    }

    if (event.target.closest("[data-reserve]")) {
      activeGift = gift;
      modalError.textContent = "";
      modalText.textContent = "«" + gift.title + "». Напишите, как вас представить. Можно выбрать ещё несколько — родители потом посмотрят список.";
      submitBtn.disabled = false;
      submitBtn.textContent = "Забронировать";
      dialog.showModal();
      nameInput.focus();
    }
  });

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    if (!activeGift || busy) return;
    const name = nameInput.value.trim();
    if (!name) return;
    const gift = activeGift;
    const token = newToken();
    busy = true;
    submitBtn.disabled = true;
    submitBtn.textContent = "Сохраняем…";
    modalError.textContent = "";
    const claim = { name: name, at: Store.today(), token: token };
    const saved = await Store.saveClaim(gift.id, claim);
    const result = await Store.fetchClaims();
    busy = false;
    submitBtn.disabled = false;
    submitBtn.textContent = "Забронировать";
    if (result.ok) claims = result.claims;
    const current = claims[gift.id];
    if (saved && current && current.token === token) {
      tokens[gift.id] = token;
      Store.writeTokens(tokens);
      dialog.close();
      form.reset();
      showToast("Забронировано. Можно выбрать ещё");
      renderSync(result);
      render();
      return;
    }
    if (current && current.token !== token) {
      dialog.close();
      form.reset();
      showToast("Этот подарок только что забронировал " + current.name);
      renderSync(result);
      render();
      return;
    }
    modalError.textContent = "Не получилось сохранить бронь. Проверьте интернет и попробуйте ещё раз.";
    render();
  });

  renderPhotos();
  render();
  refresh();
  setInterval(refresh, 20000);
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible") refresh();
  });
})();
