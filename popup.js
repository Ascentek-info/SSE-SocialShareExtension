const $ = (id) => document.getElementById(id);
let page = { title: "", url: "" };
let blocked = false;

// 取得當前分頁的標題、網址、選取文字
async function loadPage() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  let title = tab?.title || "";
  let canonical = "";
  try {
    // 預設在隔離環境執行，頁面本身的 JS 無法竄改這個函式
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const meta = (p) => document.querySelector(`meta[property="${p}"]`)?.content;
        return {
          title: meta("og:title") || document.title,
          canonical: document.querySelector('link[rel="canonical"]')?.href || "",
          selection: String(getSelection()).trim(),
        };
      },
    });
    title = result.title || title;
    canonical = result.canonical;
    if (result.selection) $("comment").value = `「${clip(result.selection, 500)}」\n`;
  } catch (_) { /* chrome:// 等受限頁面無法讀取，沿用 tab 資訊 */ }

  const cleaned = cleanUrl(pickBaseUrl(tab?.url || "", canonical));
  page = { title: clip(title, 300), url: cleaned.url || "" };
  $("title").textContent = page.title || "(無標題)";

  if (cleaned.error) {
    blocked = true;
    $("url").textContent = "";
    $("go").disabled = true;
    $("hint").textContent = cleaned.error;
  } else {
    $("url").textContent = page.url;
    const notes = [];
    if (cleaned.removedTracking) notes.push(`已移除 ${cleaned.removedTracking} 個追蹤參數`);
    if (cleaned.removedSensitive) notes.push(`已移除 ${cleaned.removedSensitive} 個疑似登入憑證的參數`);
    $("hint").textContent = notes.join("；");
  }
  updateCount();
}

// 組合要發的文字（不含網址）
function buildText() {
  const parts = [];
  const c = $("comment").value.trim();
  if (c) parts.push(c);
  if ($("incTitle").checked && page.title) parts.push(page.title);
  return parts.join("\n\n");
}

function updateCount() {
  // X 網址固定算 23 字
  const n = [...buildText()].length + 1 + 23;
  const el = $("count");
  el.textContent = `X 字數 ${n}/280`;
  el.classList.toggle("over", n > 280);
}

const enc = encodeURIComponent;
const builders = {
  threads:   (t, u) => `https://www.threads.net/intent/post?text=${enc(t ? t + "\n" + u : u)}`,
  x:         (t, u) => `https://x.com/intent/post?text=${enc(t)}&url=${enc(u)}`,
  facebook:  (t, u) => `https://www.facebook.com/sharer/sharer.php?u=${enc(u)}`,
  instagram: () => "https://www.instagram.com/",
};

$("go").addEventListener("click", async () => {
  if (blocked || !page.url) return;
  const picked = [...document.querySelectorAll(".platforms input:checked")]
    .map((i) => i.dataset.p)
    .filter((p) => Object.hasOwn(builders, p));
  if (!picked.length) { $("hint").textContent = "請至少選一個平台"; return; }

  const text = buildText();
  const full = text ? `${text}\n${page.url}` : page.url;

  // Facebook / Instagram 不支援預填文字 → 複製到剪貼簿，開啟後貼上
  const needClip = picked.some((p) => p === "facebook" || p === "instagram");
  let copied = true;
  if (needClip) {
    try { await navigator.clipboard.writeText(full); } catch (_) { copied = false; }
  }

  try { await chrome.storage.local.set({ picked }); } catch (_) { /* 記不住也沒關係 */ }
  // 第一個分頁顯示在前景，其餘在背景載入，避免焦點被最後一個搶走
  picked.forEach((p, i) => chrome.tabs.create({ url: builders[p](text, page.url), active: i === 0 }));

  $("hint").textContent = !needClip
    ? "已開啟發文視窗，確認後按發佈。"
    : copied
      ? "已複製評論與連結，到 Facebook / Instagram 貼上即可。"
      : "無法寫入剪貼簿，請自行複製評論後貼上。";
});

$("comment").addEventListener("input", updateCount);
$("incTitle").addEventListener("change", updateCount);

(async () => {
  let picked = ["threads", "x"];
  try {
    const s = await chrome.storage.local.get("picked");
    if (Array.isArray(s.picked)) picked = s.picked;
  } catch (_) { /* 使用預設 */ }
  document.querySelectorAll(".platforms input").forEach((i) => (i.checked = picked.includes(i.dataset.p)));
  loadPage();
  $("comment").focus();
})();
