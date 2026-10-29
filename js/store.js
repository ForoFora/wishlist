(function () {
  const TOKEN_KEY = "misha-wishlist-tokens";
  const BASE = "https://keyvalue.immanuel.co/api/KeyVal/";

  function storeKey() {
    return (window.SITE.storeKey || "").trim();
  }

  function readTokens() {
    try {
      const raw = localStorage.getItem(TOKEN_KEY);
      const data = raw ? JSON.parse(raw) : {};
      return data && typeof data === "object" ? data : {};
    } catch (error) {
      return {};
    }
  }

  function writeTokens(data) {
    try {
      localStorage.setItem(TOKEN_KEY, JSON.stringify(data));
    } catch (error) {
      return;
    }
  }

  function encode(value) {
    return btoa(unescape(encodeURIComponent(JSON.stringify(value))))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");
  }

  function decode(value) {
    const pad = value.length % 4 === 0 ? "" : "=".repeat(4 - (value.length % 4));
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/") + pad;
    return JSON.parse(decodeURIComponent(escape(atob(normalized))));
  }

  function today() {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return now.getFullYear() + "-" + month + "-" + day;
  }

  function claimKey(giftId) {
    return "claim-" + giftId;
  }

  function sleep(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function request(url, options) {
    const controller = new AbortController();
    const timer = setTimeout(function () { controller.abort(); }, 8000);
    return fetch(url, Object.assign({}, options || {}, { signal: controller.signal })).finally(function () {
      clearTimeout(timer);
    });
  }

  function busyStatus(status) {
    return status === 429 || status === 502 || status === 503 || status === 504;
  }

  function parseClaim(raw) {
    let value = String(raw || "").trim();
    if (!value || value === '""' || value === "null" || value === "0") return { ok: true, claim: null };
    if (value.charAt(0) === "<") return { ok: false, claim: null };
    if (value.charAt(0) === '"') {
      try {
        value = JSON.parse(value);
      } catch (error) {
        return { ok: false, claim: null };
      }
    }
    if (!value || value === "0") return { ok: true, claim: null };
    try {
      const claim = decode(value);
      if (!claim || !String(claim.name || "").trim()) return { ok: true, claim: null };
      return {
        ok: true,
        claim: {
          name: String(claim.name).trim(),
          at: claim.at ? String(claim.at) : "",
          token: claim.token ? String(claim.token) : "",
        },
      };
    } catch (error) {
      return { ok: false, claim: null };
    }
  }

  async function readClaim(giftId) {
    let response;
    try {
      response = await request(BASE + "GetValue/" + encodeURIComponent(storeKey()) + "/" + claimKey(giftId), {
        cache: "no-store",
      });
    } catch (error) {
      return { ok: false, claim: null };
    }
    if (!response.ok || busyStatus(response.status)) return { ok: false, claim: null };
    return parseClaim(await response.text());
  }

  async function readClaimSure(giftId) {
    const waits = [0, 600, 1200, 2000, 3000, 4000];
    let last = { ok: false, claim: null };
    for (let attempt = 0; attempt < waits.length; attempt += 1) {
      if (waits[attempt]) await sleep(waits[attempt]);
      last = await readClaim(giftId);
      if (last.ok) return last;
    }
    return last;
  }

  async function fetchClaims() {
    if (!storeKey()) return { ok: false, reason: "empty", claims: {} };
    const claims = {};
    for (let i = 0; i < GIFTS.length; i += 1) {
      if (i) await sleep(200);
      const read = await readClaimSure(GIFTS[i].id);
      if (!read.ok) return { ok: false, reason: "network", claims: {} };
      if (read.claim) claims[GIFTS[i].id] = read.claim;
    }
    return { ok: true, reason: "ok", claims: claims };
  }

  async function saveClaim(giftId, claim) {
    if (!storeKey()) return false;
    const value = claim ? encode(claim) : "0";
    const waits = [0, 400, 900];
    for (let attempt = 0; attempt < waits.length; attempt += 1) {
      if (waits[attempt]) await sleep(waits[attempt]);
      let response;
      try {
        response = await request(
          BASE + "UpdateValue/" + encodeURIComponent(storeKey()) + "/" + claimKey(giftId) + "/" + value,
          { method: "POST", body: "1" }
        );
      } catch (error) {
        if (attempt < waits.length - 1) continue;
        return false;
      }
      if (busyStatus(response.status) && attempt < waits.length - 1) continue;
      if (!response.ok) return false;
      const text = (await response.text()).trim();
      return text === "true" || text === '"true"';
    }
    return false;
  }

  window.Store = {
    storeKey: storeKey,
    readTokens: readTokens,
    writeTokens: writeTokens,
    fetchClaims: fetchClaims,
    saveClaim: saveClaim,
    today: today,
  };
})();
