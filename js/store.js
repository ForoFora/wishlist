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

  async function readClaim(giftId) {
    const response = await fetch(BASE + "GetValue/" + encodeURIComponent(storeKey()) + "/" + claimKey(giftId), {
      cache: "no-store",
    });
    if (response.status === 500) return null;
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

  async function fetchClaims() {
    if (!storeKey()) return { ok: false, reason: "empty", claims: {} };
    try {
      const claims = {};
      await Promise.all(GIFTS.map(async function (gift) {
        const claim = await readClaim(gift.id);
        if (claim) claims[gift.id] = claim;
      }));
      return { ok: true, reason: "ok", claims: claims };
    } catch (error) {
      return { ok: false, reason: "network", claims: {} };
    }
  }

  async function saveClaim(giftId, claim) {
    if (!storeKey()) return false;
    const value = claim ? encode(claim) : "0";
    const response = await fetch(
      BASE + "UpdateValue/" + encodeURIComponent(storeKey()) + "/" + claimKey(giftId) + "/" + value,
      { method: "POST", body: "1" }
    );
    if (!response.ok) return false;
    const text = (await response.text()).trim();
    return text === "true" || text === '"true"';
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
