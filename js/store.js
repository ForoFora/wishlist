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

  function busyStatus(status) {
    return status === 429 || status === 502 || status === 503 || status === 504;
  }

  async function mapLimited(items, limit, fn) {
    const results = new Array(items.length);
    let cursor = 0;
    async function worker() {
      while (cursor < items.length) {
        const index = cursor;
        cursor += 1;
        results[index] = await fn(items[index]);
      }
    }
    const jobs = [];
    const workers = Math.min(limit, items.length);
    for (let i = 0; i < workers; i += 1) jobs.push(worker());
    await Promise.all(jobs);
    return results;
  }

  async function readClaim(giftId) {
    const response = await fetch(BASE + "GetValue/" + encodeURIComponent(storeKey()) + "/" + claimKey(giftId), {
      cache: "no-store",
    });
    if (response.status === 500) return null;
    if (busyStatus(response.status)) {
      const error = new Error("retry");
      error.retry = true;
      throw error;
    }
    if (!response.ok) throw new Error("read");
    let value = (await response.text()).trim();
    if (!value || value === '""' || value === "null") return null;
    if (value.charAt(0) === '"') {
      try {
        value = JSON.parse(value);
      } catch (error) {
        return null;
      }
    }
    if (!value || value === "0") return null;
    try {
      const claim = decode(value);
      if (!claim || !String(claim.name || "").trim()) return null;
      return {
        name: String(claim.name).trim(),
        at: claim.at ? String(claim.at) : "",
        token: claim.token ? String(claim.token) : "",
      };
    } catch (error) {
      return null;
    }
  }

  async function readClaimRetry(giftId) {
    const waits = [0, 400, 900, 1600];
    for (let attempt = 0; attempt < waits.length; attempt += 1) {
      if (waits[attempt]) await sleep(waits[attempt]);
      try {
        return await readClaim(giftId);
      } catch (error) {
        if (!error || !error.retry || attempt === waits.length - 1) throw error;
      }
    }
    return null;
  }

  async function fetchClaims() {
    if (!storeKey()) return { ok: false, reason: "empty", claims: {} };
    try {
      const claims = {};
      const rows = await mapLimited(GIFTS, 2, async function (gift) {
        return { id: gift.id, claim: await readClaimRetry(gift.id) };
      });
      rows.forEach(function (row) {
        if (row && row.claim) claims[row.id] = row.claim;
      });
      return { ok: true, reason: "ok", claims: claims };
    } catch (error) {
      return { ok: false, reason: "network", claims: {} };
    }
  }

  async function saveClaim(giftId, claim) {
    if (!storeKey()) return false;
    const value = claim ? encode(claim) : "0";
    const waits = [0, 400, 900];
    for (let attempt = 0; attempt < waits.length; attempt += 1) {
      if (waits[attempt]) await sleep(waits[attempt]);
      const response = await fetch(
        BASE + "UpdateValue/" + encodeURIComponent(storeKey()) + "/" + claimKey(giftId) + "/" + value,
        { method: "POST", body: "1" }
      );
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
