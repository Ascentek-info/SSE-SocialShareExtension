const $ = (id) => document.getElementById(id);
let page = { title: "", url: "" };

// 取得當前分頁的標題、網址、選取文字
async function loadPage() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  page = { title: tab.title || "", url: tab.url || "" };
  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const meta = (p) => document.querySelector(`meta[property="${p}"]`)?.content;
        return {
          title: meta("og:title") || document.title,
          url: document.querySelector('link[rel="canonical"]')?.href || location.href,
          selection: String(getSelection()).trim(),
        };
      },
    });
    page = { title: result.title, url: result.url };
    if (result.selection) $("comment").value = `「${result.selection}」\n`;
  } catch (_) { /* chrome:// 等頁面無法讀取，沿用 tab 資訊 */ }
  $("title").textContent = page.title || "(無標題)";
  $("url").textContent = page.url;
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
  const picked = [...document.querySelectorAll(".platforms input:checked")].map((i) => i.dataset.p);
  if (!picked.length) { $("hint").textContent = "請至少選一個平台"; return; }

  const text = buildText();
  const full = text ? `${text}\n${page.url}` : page.url;

  // Facebook / Instagram 不支援預填文字 → 複製到剪貼簿，開啟後貼上
  const needClip = picked.some((p) => p === "facebook" || p === "instagram");
  if (needClip) await navigator.clipboard.writeText(full);

  await chrome.storage.local.set({ picked });
  for (const p of picked) chrome.tabs.create({ url: builders[p](text, page.url) });

  $("hint").textContent = needClip
    ? "已複製評論與連結，到 Facebook / Instagram 貼上即可。"
    : "已開啟發文視窗，確認後按發佈。";
});

$("comment").addEventListener("input", updateCount);
$("incTitle").addEventListener("change", updateCount);

(async () => {
  const { picked = ["threads", "x"] } = await chrome.storage.local.get("picked");
  document.querySelectorAll(".platforms input").forEach((i) => (i.checked = picked.includes(i.dataset.p)));
  loadPage();
  $("comment").focus();
})();
