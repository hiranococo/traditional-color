/**
 * 配置页右下角色卡库（与 index.html 色卡界面行为一致）
 * @param {{ loadSelectedColorsFromSession: () => { name: string; hex: string }[]; saveSelectedColorsToSession: (list: { name: string; hex: string }[]) => void; renderCandidatePool: () => void }} deps
 */
function initConfigCatalog(deps) {
  const { loadSelectedColorsFromSession, saveSelectedColorsToSession, renderCandidatePool } = deps;

  /** @type {{ name: string; hex: string; groupTitle?: string }[]} */
  let catalogColors = [];
  /** @type {"light-to-dark" | "dark-to-light"} */
  let catalogSortMode = "light-to-dark";

  const GROUP_SWATCH_META = {
    红色系: { swatch: "#c41e3a" },
    蓝色系: { swatch: "#2563eb" },
    紫色系: { swatch: "#6d28d9" },
    黄色系: { swatch: "#e6b800" },
    绿色系: { swatch: "#2d8640" },
    青色系: { swatch: "#3d8e86" },
    黑色系: { swatch: "#1a1a1a" },
    白色系: { swatch: "#f5f5f5", light: true },
    褐色系: { swatch: "#7c4a32" },
    粉色系: { swatch: "#db2777" },
    橙色系: { swatch: "#ea6b2f" },
    灰色系: { swatch: "#8a9399" },
    玉色系: { swatch: "#c4cbb8" },
  };

  /** @type {{ title: string; swatch: string; light: boolean }[]} */
  let familyOptions = [];
  const selectedFamilies = new Set();
  /** @type {Set<string>} */
  const favorites = new Set();
  let showFavoritesOnly = false;

  const COLS_STORAGE_KEY = "traditional-color-catalog-cols";
  const FAVORITES_STORAGE_KEY = "traditional-color-favorites";
  const COLS_MIN = 1;
  const COLS_MAX = 8;
  const COLS_DEFAULT = 3;

  const catalogColorGrid = document.getElementById("config-catalog-color-grid");
  const catalogColsSlider = document.getElementById("config-catalog-cols-slider");
  const catalogColsSliderValue = document.getElementById("config-catalog-cols-value");
  const catalogFilterWrap = document.getElementById("config-catalog-filter-wrap");
  const catalogFilterBtn = document.getElementById("config-catalog-filter-btn");
  const catalogFilterPanel = document.getElementById("config-catalog-filter-panel");
  const catalogFilterSwatches = document.getElementById("config-catalog-filter-swatches");
  const catalogFavoritesBtn = document.getElementById("config-catalog-favorites-btn");
  const catalogCopyToast = document.getElementById("config-copy-toast");

  if (!catalogColorGrid) return;

  const pageInnerEl = document.querySelector(".page-inner");
  const mainPanelEl = document.getElementById("config-main-panel");
  const desktopLayoutMq = window.matchMedia("(min-width: 981px)");

  function syncRightColumnHeight() {
    if (!pageInnerEl || !mainPanelEl) return;
    if (!desktopLayoutMq.matches) {
      pageInnerEl.style.removeProperty("--config-left-panel-h");
      return;
    }
    pageInnerEl.style.setProperty("--config-left-panel-h", `${mainPanelEl.offsetHeight}px`);
  }

  function bindRightColumnHeightSync() {
    if (!mainPanelEl || !pageInnerEl) return;
    syncRightColumnHeight();
    const ro = new ResizeObserver(() => syncRightColumnHeight());
    ro.observe(mainPanelEl);
    desktopLayoutMq.addEventListener("change", syncRightColumnHeight);
    window.addEventListener("resize", syncRightColumnHeight);
  }

  /** @type {ReturnType<typeof setTimeout> | null} */
  let copyToastHideTimer = null;
  /** @type {ReturnType<typeof setTimeout> | null} */
  let favoriteToggleRenderTimer = null;
  /** @type {HTMLElement | null} */
  let pressedSwatchCard = null;

  /**
   * @param {{ name: string; hex: string }} entry
   */
  function addToPalette(entry) {
    const hex = entry.hex.trim();
    const name = entry.name.trim();
    if (!hex) return;
    const key = hex.toLowerCase();
    const next = loadSelectedColorsFromSession().filter((x) => x.hex.trim().toLowerCase() !== key);
    next.push({ name, hex });
    saveSelectedColorsToSession(next);
    renderCandidatePool();
  }

  /**
   * @param {{ name: string; hex: string }} color
   */
  function colorKey(color) {
    return `${String(color.name ?? "").trim()}\0${String(color.hex ?? "").trim().toLowerCase()}`;
  }

  function matchesFilter(color) {
    if (selectedFamilies.size === 0) return true;
    return selectedFamilies.has(color.groupTitle || "");
  }

  function matchesFavoritesFilter(color) {
    if (!showFavoritesOnly) return true;
    return favorites.has(colorKey(color));
  }

  function parseHexToRgb(hex) {
    let h = String(hex).trim().replace("#", "");
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    const n = parseInt(h, 16);
    if (!Number.isFinite(n) || h.length !== 6) return null;
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  function relativeLuminance(hex) {
    const rgb = parseHexToRgb(hex);
    if (!rgb) return 0;
    const linear = [rgb.r, rgb.g, rgb.b].map((c) => {
      const x = c / 255;
      return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  }

  /**
   * @param {{ name: string; hex: string }[]} rows
   */
  function sortRows(rows) {
    return rows.slice().sort((a, b) => {
      const la = relativeLuminance(a.hex);
      const lb = relativeLuminance(b.hex);
      return catalogSortMode === "dark-to-light" ? la - lb : lb - la;
    });
  }

  function clampCols(n) {
    const v = Math.round(Number(n));
    if (!Number.isFinite(v)) return COLS_DEFAULT;
    return Math.min(COLS_MAX, Math.max(COLS_MIN, v));
  }

  function readStoredCols() {
    try {
      const raw = localStorage.getItem(COLS_STORAGE_KEY);
      if (raw == null) return COLS_DEFAULT;
      return clampCols(parseInt(raw, 10));
    } catch {
      return COLS_DEFAULT;
    }
  }

  function cardFontSizePxForCols(cols, minPx, maxPx) {
    const span = COLS_MAX - COLS_MIN;
    const t = span > 0 ? (cols - COLS_MIN) / span : 0;
    const px = maxPx + (minPx - maxPx) * t;
    return `${Math.round(Math.min(maxPx, Math.max(minPx, px)) * 4) / 4}px`;
  }

  function applyCols(cols) {
    const c = clampCols(cols);
    catalogColorGrid.style.setProperty("--catalog-cols", String(c));
    catalogColorGrid.style.setProperty("--card-name-font-size", cardFontSizePxForCols(c, 11, 16));
    catalogColorGrid.style.setProperty("--card-hex-font-size", cardFontSizePxForCols(c, 10, 14));
    if (catalogColsSlider instanceof HTMLInputElement) catalogColsSlider.value = String(c);
    if (catalogColsSliderValue) catalogColsSliderValue.textContent = String(c);
    if (catalogColsSlider) catalogColsSlider.setAttribute("aria-valuetext", String(c));
    try {
      localStorage.setItem(COLS_STORAGE_KEY, String(c));
    } catch {
      /* ignore */
    }
  }

  function loadFavorites() {
    favorites.clear();
    try {
      const raw = localStorage.getItem(FAVORITES_STORAGE_KEY);
      if (raw == null) return;
      const data = JSON.parse(raw);
      if (!Array.isArray(data)) return;
      for (const item of data) {
        if (typeof item === "string") favorites.add(item);
      }
    } catch {
      /* ignore */
    }
  }

  function persistFavorites() {
    try {
      localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify([...favorites]));
    } catch {
      /* ignore */
    }
  }

  function syncFavoritesFilterBtn() {
    if (!catalogFavoritesBtn) return;
    catalogFavoritesBtn.classList.toggle("is-active", showFavoritesOnly);
    catalogFavoritesBtn.setAttribute("aria-pressed", String(showFavoritesOnly));
  }

  /**
   * @param {HTMLButtonElement} btn
   * @param {boolean} isFav
   */
  function syncCardFavoriteBtnUi(btn, isFav) {
    btn.classList.toggle("is-on", isFav);
    btn.setAttribute("aria-pressed", String(isFav));
    btn.setAttribute("aria-label", isFav ? "取消收藏" : "加入收藏");
  }

  /**
   * @param {string} message
   */
  function showCopyToast(message) {
    if (!catalogCopyToast) return;
    catalogCopyToast.textContent = message;
    catalogCopyToast.classList.add("is-visible");
    if (copyToastHideTimer != null) clearTimeout(copyToastHideTimer);
    copyToastHideTimer = setTimeout(() => {
      catalogCopyToast.classList.remove("is-visible");
      copyToastHideTimer = null;
    }, 2000);
  }

  /**
   * @param {string} hex
   */
  async function copyHex(hex) {
    const text = hex.trim();
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      showCopyToast("已复制 " + text);
    } catch {
      showCopyToast("复制失败，请手动复制");
    }
  }

  /**
   * @param {unknown} groups
   */
  function buildFamilyOptions(groups) {
    if (!Array.isArray(groups)) return [];
    return groups
      .filter((group) => group && group.groupTitle && Array.isArray(group.colors))
      .map((group) => {
        const meta = GROUP_SWATCH_META[group.groupTitle] || {};
        const fallbackSwatch = group.colors[0]?.hex || "#cccccc";
        return {
          title: group.groupTitle,
          swatch: meta.swatch || fallbackSwatch,
          light: Boolean(meta.light),
        };
      });
  }

  function renderFilterSwatches() {
    if (!catalogFilterSwatches) return;
    catalogFilterSwatches.innerHTML = "";
    familyOptions.forEach((f) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className =
        "config-catalog-filter-swatch" + (f.light ? " config-catalog-filter-swatch--light" : "");
      btn.dataset.family = f.title;
      btn.title = f.title;
      btn.setAttribute("aria-label", f.title);
      btn.setAttribute("aria-pressed", "false");
      btn.style.background = f.swatch;
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (selectedFamilies.has(f.title)) selectedFamilies.delete(f.title);
        else selectedFamilies.add(f.title);
        syncFilterSwatchUi();
        renderColors();
      });
      catalogFilterSwatches.appendChild(btn);
    });
  }

  function syncFilterSwatchUi() {
    if (!catalogFilterSwatches || !catalogFilterBtn) return;
    catalogFilterSwatches.querySelectorAll(".config-catalog-filter-swatch").forEach((btn) => {
      const id = btn.dataset.family;
      const on = selectedFamilies.has(id);
      btn.classList.toggle("is-selected", on);
      btn.setAttribute("aria-pressed", String(on));
    });
    catalogFilterBtn.classList.toggle("is-active", selectedFamilies.size > 0);
  }

  function closeFilterPanel() {
    if (!catalogFilterPanel || !catalogFilterBtn) return;
    catalogFilterPanel.hidden = true;
    catalogFilterBtn.setAttribute("aria-expanded", "false");
  }

  function toggleFilterPanel() {
    if (!catalogFilterPanel || !catalogFilterBtn) return;
    const open = catalogFilterPanel.hidden;
    catalogFilterPanel.hidden = !open;
    catalogFilterBtn.setAttribute("aria-expanded", String(open));
  }

  function clearCardPress() {
    if (pressedSwatchCard) {
      pressedSwatchCard.classList.remove("swatch-card--pressing");
      pressedSwatchCard = null;
    }
  }

  /**
   * @param {PointerEvent | MouseEvent} e
   * @param {Element | null} card
   */
  function isInFavoriteButtonArea(e, card) {
    if (!card) return false;
    const favoriteBtn = card.querySelector(".swatch-card-favorite");
    if (!(favoriteBtn instanceof HTMLElement)) return false;
    const r = favoriteBtn.getBoundingClientRect();
    return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
  }

  function renderColors() {
    const filtered = catalogColors.filter((c) => matchesFilter(c) && matchesFavoritesFilter(c));
    const rows = sortRows(filtered);

    catalogColorGrid.innerHTML = "";
    pressedSwatchCard = null;

    const grid = document.createElement("div");
    grid.className = "config-swatch-grid";

    rows.forEach((color) => {
      const card = document.createElement("article");
      card.className = "swatch-card";
      const wrap = document.createElement("div");
      wrap.className = "swatch-card-preview-wrap";
      const preview = document.createElement("div");
      preview.className = "swatch-card-preview";
      preview.style.background = color.hex;
      const favBtn = document.createElement("button");
      favBtn.type = "button";
      favBtn.className = "swatch-card-favorite";
      const isFav = favorites.has(colorKey(color));
      if (isFav) favBtn.classList.add("is-on");
      favBtn.setAttribute("aria-pressed", String(isFav));
      favBtn.setAttribute("aria-label", isFav ? "取消收藏" : "加入收藏");
      favBtn.dataset.name = color.name;
      favBtn.dataset.hex = color.hex;
      favBtn.innerHTML =
        '<svg viewBox="0 0 24 24" aria-hidden="true">' +
        '<path class="card-favorite-star-fill" fill="currentColor" d="M12 3l2.45 4.95 5.48.8-3.97 3.87.94 5.47L12 15.9l-4.9 2.57.94-5.47-3.97-3.87 5.48-.8L12 3z"/>' +
        '<path class="card-favorite-star-stroke" fill="none" stroke-width="1.5" stroke-linejoin="round" d="M12 3l2.45 4.95 5.48.8-3.97 3.87.94 5.47L12 15.9l-4.9 2.57.94-5.47-3.97-3.87 5.48-.8L12 3z"/>' +
        "</svg>";
      wrap.appendChild(preview);
      wrap.appendChild(favBtn);
      const nameEl = document.createElement("h3");
      nameEl.className = "swatch-card-name";
      nameEl.textContent = color.name;
      const hexEl = document.createElement("p");
      hexEl.className = "swatch-card-hex";
      hexEl.setAttribute("title", "复制");
      hexEl.textContent = color.hex;
      card.appendChild(wrap);
      card.appendChild(nameEl);
      card.appendChild(hexEl);
      grid.appendChild(card);
    });
    catalogColorGrid.appendChild(grid);
    syncRightColumnHeight();
  }

  async function loadColors() {
    try {
      const response = await fetch("colors.json");
      if (!response.ok) throw new Error("读取 colors.json 失败");
      const data = await response.json();
      if (!Array.isArray(data) || data.length === 0) throw new Error("colors.json 格式不正确");
      catalogColors = [];
      familyOptions = buildFamilyOptions(data);
      const seen = new Set();
      for (const group of data) {
        if (!group || !Array.isArray(group.colors)) continue;
        const groupTitle = group.groupTitle || "";
        for (const item of group.colors) {
          if (!item || typeof item !== "object") continue;
          const name = String(item.name ?? "").trim();
          const hex = String(item.hex ?? "").trim();
          const dedupeKey = `${name}\0${hex.toLowerCase()}`;
          if (seen.has(dedupeKey)) continue;
          seen.add(dedupeKey);
          catalogColors.push({ ...item, name, hex, groupTitle });
        }
      }
      if (catalogColors.length === 0) throw new Error("colors.json 中没有任何色卡");
      selectedFamilies.clear();
      renderFilterSwatches();
      syncFilterSwatchUi();
    } catch (error) {
      alert(`加载色卡失败：${error instanceof Error ? error.message : String(error)}`);
    }
    renderColors();
  }

  loadFavorites();
  syncFavoritesFilterBtn();
  applyCols(readStoredCols());

  const sortSelect = document.getElementById("config-catalog-sort-select");
  if (sortSelect) {
    sortSelect.addEventListener("change", () => {
      const v = sortSelect.value;
      if (v === "light-to-dark" || v === "dark-to-light") {
        catalogSortMode = v;
        renderColors();
      }
    });
  }

  if (catalogColsSlider) {
    catalogColsSlider.addEventListener("input", () => {
      applyCols(catalogColsSlider.value);
    });
  }

  if (catalogFavoritesBtn) {
    catalogFavoritesBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      showFavoritesOnly = !showFavoritesOnly;
      syncFavoritesFilterBtn();
      renderColors();
    });
  }

  if (catalogFilterWrap) {
    catalogFilterWrap.addEventListener("click", (e) => e.stopPropagation());
  }
  if (catalogFilterBtn) {
    catalogFilterBtn.addEventListener("click", () => toggleFilterPanel());
  }

  document.getElementById("config-catalog-filter-select-all")?.addEventListener("click", (e) => {
    e.stopPropagation();
    familyOptions.forEach((f) => selectedFamilies.add(f.title));
    syncFilterSwatchUi();
    renderColors();
  });
  document.getElementById("config-catalog-filter-clear-all")?.addEventListener("click", (e) => {
    e.stopPropagation();
    selectedFamilies.clear();
    syncFilterSwatchUi();
    renderColors();
  });

  document.addEventListener("click", (e) => {
    if (catalogFilterPanel?.hidden) return;
    const t = e.target;
    if (t instanceof Node && catalogFilterWrap?.contains(t)) return;
    closeFilterPanel();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeFilterPanel();
  });

  catalogColorGrid.addEventListener("pointerdown", (e) => {
    if (e.target.closest(".swatch-card-favorite")) return;
    const card = e.target.closest(".swatch-card");
    if (!card || !catalogColorGrid.contains(card)) return;
    if (isInFavoriteButtonArea(e, card)) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    clearCardPress();
    pressedSwatchCard = card;
    card.classList.add("swatch-card--pressing");
  });
  document.addEventListener("pointerup", clearCardPress);
  document.addEventListener("pointercancel", clearCardPress);

  catalogColorGrid.addEventListener("click", (e) => {
    const favBtn = e.target.closest(".swatch-card-favorite");
    if (favBtn && catalogColorGrid.contains(favBtn)) {
      e.stopPropagation();
      e.preventDefault();
      if (!(favBtn instanceof HTMLButtonElement)) return;
      const name = favBtn.dataset.name?.trim() ?? "";
      const hex = favBtn.dataset.hex?.trim() ?? "";
      const k = colorKey({ name, hex });
      const isFav = !favorites.has(k);
      if (isFav) favorites.add(k);
      else favorites.delete(k);
      persistFavorites();
      syncFavoritesFilterBtn();
      syncCardFavoriteBtnUi(favBtn, isFav);
      if (!showFavoritesOnly) return;
      if (favoriteToggleRenderTimer != null) clearTimeout(favoriteToggleRenderTimer);
      favoriteToggleRenderTimer = setTimeout(() => {
        favoriteToggleRenderTimer = null;
        renderColors();
      }, 180);
      return;
    }
    const card = e.target.closest(".swatch-card");
    if (!card || !catalogColorGrid.contains(card)) return;
    if (isInFavoriteButtonArea(e, card)) return;
    const hex = card.querySelector(".swatch-card-hex")?.textContent?.trim() ?? "";
    const name = card.querySelector(".swatch-card-name")?.textContent?.trim() ?? "";
    if (!hex) return;
    addToPalette({ name, hex });
    if (e.target.closest(".swatch-card-hex")) {
      e.preventDefault();
      void copyHex(hex);
    }
  });

  bindRightColumnHeightSync();
  void loadColors();
}
