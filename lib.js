// 純函式：網址清理與安全檢查（無任何 DOM / chrome API，可單獨測試）

// 追蹤用參數：分享時移除，保護分享者與讀者的隱私
const TRACKING_RE =
  /^(utm_.+|fbclid|gclid|dclid|gbraid|wbraid|msclkid|yclid|twclid|ttclid|igshid|igsh|mc_cid|mc_eid|_ga|_gl|spm|vero_id|mkt_tok)$/i;

// 疑似授權資訊的參數：分享出去等於洩露登入憑證，一律移除
const SENSITIVE_RE =
  /^(token|access_token|refresh_token|id_token|auth|authorization|apikey|api_key|access_key|secret|client_secret|password|passwd|pwd|sig|signature|session|sessionid|session_id|sid|otp)$/i;

// 本機 / 內網主機：分享出去沒有意義，還可能洩露內部網址
function isPrivateHost(host) {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    h === "localhost" ||
    /\.(localhost|local|internal|lan|home\.arpa|intranet)$/.test(h)
  ) return true;
  if (!h.includes(".") && !h.includes(":")) return true; // 單一標籤，通常是內網主機
  if (h.includes(":")) return h === "::1" || /^(fc|fd|fe80)/.test(h); // IPv6 本機 / 私有
  const m = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (m) {
    const a = +m[1], b = +m[2];
    return (
      a === 0 || a === 10 || a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127)
    );
  }
  return false;
}

function hostKey(url) {
  return new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
}

// canonical 只在與目前分頁同網站時才採用，避免惡意頁面用 canonical 偷換分享連結
function pickBaseUrl(tabUrl, canonical) {
  try {
    if (canonical && hostKey(canonical) === hostKey(tabUrl)) return canonical;
  } catch (_) { /* ignore */ }
  return tabUrl;
}

// 回傳 { url, removedTracking, removedSensitive } 或 { error }
function cleanUrl(raw) {
  let u;
  try { u = new URL(raw); } catch (_) { return { error: "無法辨識這個頁面的網址" }; }
  if (u.protocol !== "http:" && u.protocol !== "https:")
    return { error: "只能分享 http / https 網頁" };
  if (isPrivateHost(u.hostname))
    return { error: "這是本機或內網網址，已停止分享以免洩露內部資訊" };

  u.username = "";
  u.password = "";

  let removedTracking = 0, removedSensitive = 0;
  for (const k of [...new Set(u.searchParams.keys())]) {
    if (SENSITIVE_RE.test(k)) { u.searchParams.delete(k); removedSensitive++; }
    else if (TRACKING_RE.test(k)) { u.searchParams.delete(k); removedTracking++; }
  }
  return { url: u.href, removedTracking, removedSensitive };
}

// 限制長度（以字元計，避免超長標題 / 選取文字）
function clip(s, n) {
  const a = [...String(s || "")];
  return a.length > n ? a.slice(0, n).join("") + "…" : a.join("");
}

if (typeof module !== "undefined") module.exports = { cleanUrl, isPrivateHost, pickBaseUrl, clip };
