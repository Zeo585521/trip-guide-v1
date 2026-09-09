const CONFIG = {
  localDataUrl: "data/trip.json",
  remoteDataUrl: "",
  googleMapsEmbedApiKey: "",
  autoWikimediaImages: true,
  cacheKey: "trip-guide-data-v1",
  cacheTimeKey: "trip-guide-updated-at-v1",
  imageCacheKey: "trip-guide-image-cache-v1",
  remoteUrlKey: "trip-guide-remote-url-v1",
};

Object.assign(CONFIG, window.TRIP_GUIDE_CONFIG || {});

const state = {
  trip: null,
  activeDayIndex: 0,
};

const els = {
  tripName: document.querySelector("#tripName"),
  tripDates: document.querySelector("#tripDates"),
  activeDayLabel: document.querySelector("#activeDayLabel"),
  updatedAt: document.querySelector("#updatedAt"),
  dayTabs: document.querySelector("#dayTabs"),
  dayDate: document.querySelector("#dayDate"),
  dayTitle: document.querySelector("#dayTitle"),
  messageArea: document.querySelector("#messageArea"),
  placeList: document.querySelector("#placeList"),
  sourceButton: document.querySelector("#sourceButton"),
  refreshButton: document.querySelector("#refreshButton"),
  todayButton: document.querySelector("#todayButton"),
  placeTemplate: document.querySelector("#placeCardTemplate"),
  transportTemplate: document.querySelector("#transportCardTemplate"),
};

init();

async function init() {
  wireEvents();

  const cached = readCachedTrip();
  if (cached) {
    setTrip(cached.trip, { updatedAt: cached.updatedAt });
  }

  try {
    const trip = await fetchTrip(getDataUrl());
    cacheTrip(trip);
    clearMessage();
    setTrip(trip, { updatedAt: new Date().toISOString() });
  } catch (error) {
    if (!cached) {
      renderError(errorMessage("讀取行程失敗", error));
    } else {
      showMessage(errorMessage("遠端資料讀取失敗，已顯示快取行程", error), "error");
    }
  }
}

function wireEvents() {
  els.sourceButton.addEventListener("click", configureRemoteSource);
  els.refreshButton.addEventListener("click", refreshTrip);
  els.todayButton.addEventListener("click", () => {
    if (!state.trip) return;
    state.activeDayIndex = getTodayDayIndex(state.trip);
    render();
  });
}

async function refreshTrip() {
  if (!state.trip) {
    els.activeDayLabel.textContent = "更新中";
  }

  els.refreshButton.disabled = true;
  els.refreshButton.setAttribute("aria-busy", "true");

  try {
    const url = getDataUrl();
    const trip = await fetchTrip(url);
    const updatedAt = new Date().toISOString();
    cacheTrip(trip, updatedAt);
    clearMessage();
    setTrip(trip, { updatedAt });
  } catch (error) {
    showMessage(errorMessage("更新失敗，已保留目前行程", error), "error");
  } finally {
    els.refreshButton.disabled = false;
    els.refreshButton.removeAttribute("aria-busy");
  }
}

function configureRemoteSource() {
  const currentUrl = getRemoteDataUrl();
  const nextUrl = window.prompt("貼上 Google Apps Script Web App URL。留空會改回本地 trip.json。", currentUrl);
  if (nextUrl === null) return;

  const trimmed = nextUrl.trim();
  if (trimmed) {
    localStorage.setItem(CONFIG.remoteUrlKey, trimmed);
  } else {
    localStorage.removeItem(CONFIG.remoteUrlKey);
  }

  refreshTrip();
}

function getDataUrl() {
  return getRemoteDataUrl() || CONFIG.localDataUrl;
}

function getRemoteDataUrl() {
  return localStorage.getItem(CONFIG.remoteUrlKey) || CONFIG.remoteDataUrl;
}

async function fetchTrip(url) {
  const requestUrl = withCacheBuster(url);
  const response = await fetch(requestUrl, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}：${requestUrl}`);
  }

  const text = await response.text();
  let trip;
  try {
    trip = JSON.parse(text);
  } catch {
    const sample = text.slice(0, 80).replace(/\s+/g, " ");
    throw new Error(`回傳內容不是 JSON，可能是 Apps Script 權限頁或部署 URL 錯誤。開頭內容：${sample}`);
  }

  validateTrip(trip);
  return trip;
}

function withCacheBuster(url) {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}t=${Date.now()}`;
}

function validateTrip(trip) {
  if (!trip || !Array.isArray(trip.days) || trip.days.length === 0) {
    throw new Error("Invalid trip data");
  }
}

function errorMessage(prefix, error) {
  return `${prefix}：${error?.message || "未知錯誤"}`;
}

function setTrip(trip, options = {}) {
  state.trip = trip;
  state.activeDayIndex = clampDayIndex(getTodayDayIndex(trip), trip);
  render(options.updatedAt);
}

function render(updatedAt) {
  const trip = state.trip;
  if (!trip) return;

  const activeDay = trip.days[state.activeDayIndex];
  els.tripName.textContent = trip.tripName || "旅遊行程導航";
  els.tripDates.textContent = formatTripDates(trip);
  els.activeDayLabel.textContent = `Day ${activeDay.day}`;
  els.updatedAt.textContent = formatUpdatedAt(updatedAt || localStorage.getItem(CONFIG.cacheTimeKey));
  els.dayDate.textContent = activeDay.date || "";
  els.dayTitle.textContent = activeDay.title || `Day ${activeDay.day}`;

  renderTabs(trip);
  renderItems(getDayItems(activeDay));
}

function renderTabs(trip) {
  els.dayTabs.replaceChildren();

  trip.days.forEach((day, index) => {
    const button = document.createElement("button");
    button.className = "day-tab";
    button.type = "button";
    button.textContent = `Day ${day.day}`;
    button.setAttribute("aria-selected", String(index === state.activeDayIndex));
    button.addEventListener("click", () => {
      state.activeDayIndex = index;
      render();
    });
    els.dayTabs.append(button);
  });
}

function renderItems(items) {
  els.placeList.replaceChildren();

  const visibleItems = items.filter((item) => item.enabled !== false);
  if (!visibleItems.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "這一天還沒有安排行程。";
    els.placeList.append(empty);
    return;
  }

  visibleItems.forEach((item, index) => {
    const node = item.type === "transport" ? renderTransportCard(item, index) : renderPlaceCard(item, index);
    els.placeList.append(node);
  });
}

function renderPlaceCard(place, index) {
  const node = els.placeTemplate.content.firstElementChild.cloneNode(true);
  const image = node.querySelector(".place-image");
  const mapPreview = node.querySelector(".map-preview");
  const imageCredit = node.querySelector(".image-credit");
  const websiteLink = node.querySelector(".website-link");
  const mapLink = node.querySelector(".map-link");

  renderCardVisual({ image, mapPreview, imageCredit }, place);
  node.querySelector(".type-badge").textContent = typeLabel(place.type);
  node.querySelector(".time-text").textContent = place.time || "時間彈性";
  node.querySelector(".place-name").textContent = place.name || "未命名行程";
  node.querySelector(".place-order").textContent = String(index + 1);
  node.querySelector(".place-description").textContent = place.description || "";
  node.querySelector(".place-address").textContent = place.mapName || "";

  setOptionalLink(websiteLink, place.websiteUrl, linkLabel(place.type));
  setOptionalLink(mapLink, place.mapUrl, "地圖");

  node.querySelector(".apple-link").href = appleMapsUrl(place);
  node.querySelector(".google-link").href = googleMapsUrl(place);
  node.classList.add(`${normalizedType(place.type)}-card`);

  return node;
}

function renderCardVisual(elements, item) {
  const { image, mapPreview, imageCredit } = elements;
  const previewUrl = googleMapsEmbedUrl(item);

  if (item.imageUrl) {
    image.hidden = false;
    mapPreview.hidden = true;
    imageCredit.hidden = true;
    image.src = item.imageUrl;
    image.alt = item.name ? `${item.name} 縮圖` : "地點縮圖";
    return;
  }

  if (CONFIG.autoWikimediaImages && item.name) {
    const cachedImage = readCachedImage(item.name);
    if (cachedImage) {
      showImage(image, mapPreview, imageCredit, item, cachedImage);
      return;
    }

    showPlaceholderOrMap(image, mapPreview, imageCredit, item, previewUrl);
    fetchWikimediaImage(item.name).then((result) => {
      if (!result) return;
      cacheImage(item.name, result);
      showImage(image, mapPreview, imageCredit, item, result);
    });
    return;
  }

  showPlaceholderOrMap(image, mapPreview, imageCredit, item, previewUrl);
}

function showImage(image, mapPreview, imageCredit, item, imageData) {
  image.hidden = false;
  mapPreview.hidden = true;
  imageCredit.hidden = !imageData.pageUrl;
  image.src = imageData.url;
  image.alt = item.name ? `${item.name} 圖片` : "行程圖片";
  if (imageData.pageUrl) {
    imageCredit.href = imageData.pageUrl;
    imageCredit.textContent = imageData.source || "圖片來源";
  }
}

function showPlaceholderOrMap(image, mapPreview, imageCredit, item, previewUrl) {
  imageCredit.hidden = true;
  if (previewUrl) {
    image.hidden = true;
    mapPreview.hidden = false;
    mapPreview.src = previewUrl;
    mapPreview.title = `${item.name || "地點"} 地圖預覽`;
    return;
  }

  image.hidden = false;
  mapPreview.hidden = true;
  image.src = placeholderImage(item.name);
  image.alt = item.name ? `${item.name} 縮圖` : "地點縮圖";
}

async function fetchWikimediaImage(query) {
  const searchUrl = new URL("https://commons.wikimedia.org/w/api.php");
  searchUrl.search = new URLSearchParams({
    action: "query",
    generator: "search",
    gsrsearch: query,
    gsrnamespace: "6",
    gsrlimit: "1",
    prop: "imageinfo",
    iiprop: "url|extmetadata",
    iiurlwidth: "640",
    format: "json",
    origin: "*",
  }).toString();

  try {
    const response = await fetch(searchUrl.toString());
    if (!response.ok) return null;

    const data = await response.json();
    const page = Object.values(data.query?.pages || {})[0];
    const imageInfo = page?.imageinfo?.[0];
    const url = imageInfo?.thumburl || imageInfo?.url;
    if (!url) return null;

    return {
      url,
      pageUrl: imageInfo.descriptionurl || "",
      source: "Wikimedia Commons",
    };
  } catch {
    return null;
  }
}

function readCachedImage(name) {
  try {
    const cache = JSON.parse(localStorage.getItem(CONFIG.imageCacheKey) || "{}");
    return cache[name] || null;
  } catch {
    return null;
  }
}

function cacheImage(name, imageData) {
  try {
    const cache = JSON.parse(localStorage.getItem(CONFIG.imageCacheKey) || "{}");
    cache[name] = imageData;
    localStorage.setItem(CONFIG.imageCacheKey, JSON.stringify(cache));
  } catch {
    // Image cache is optional.
  }
}

function renderTransportCard(item, index) {
  const node = els.transportTemplate.content.firstElementChild.cloneNode(true);
  const ticketLink = node.querySelector(".ticket-link");
  const origin = {
    name: item.mapName || item.name,
    mapUrl: item.mapUrl,
    lat: item.lat,
    lng: item.lng,
    transportMode: item.navMode || item.transportMode || "transit",
  };

  node.querySelector(".transport-time .time-text").textContent = item.time || item.departureTime || "時間未定";
  node.querySelector(".transport-name").textContent = item.name || "交通移動";
  node.querySelector(".place-order").textContent = String(index + 1);
  node.querySelector(".route-line").textContent = formatRouteLine(item);
  node.querySelector(".transport-note").textContent = item.description || item.note || "";
  setOptionalLink(ticketLink, item.ticketUrl, "票券");
  node.querySelector(".apple-link").href = appleMapsUrl(origin);
  node.querySelector(".google-link").href = googleMapsUrl(origin);

  return node;
}

function getDayItems(day) {
  return day.items || day.places || [];
}

function normalizedType(type) {
  return {
    place: "place",
    hotel: "hotel",
    restaurant: "restaurant",
    shopping: "shopping",
    景點: "place",
    飯店: "hotel",
    餐廳: "restaurant",
    購物: "shopping",
  }[type] || "place";
}

function typeLabel(type) {
  return {
    hotel: "飯店",
    restaurant: "餐廳",
    shopping: "購物",
    place: "景點",
  }[normalizedType(type)];
}

function linkLabel(type) {
  return {
    hotel: "飯店",
    restaurant: "餐廳",
    shopping: "商店",
    place: "網站",
  }[normalizedType(type)];
}

function formatRouteLine(item) {
  const from = item.from || "目前位置";
  const to = item.to || item.mapName || item.name || "目的地";
  const depart = item.departureTime ? `${item.departureTime} 出發` : "";
  const arrive = item.arrivalTime ? `${item.arrivalTime} 抵達` : "";
  return [from, "→", to, depart, arrive].filter(Boolean).join(" ");
}

function setTextOrHide(element, value) {
  const wrapper = element.closest("div");
  if (!value) {
    wrapper.hidden = true;
    return;
  }
  wrapper.hidden = false;
  element.textContent = value;
}

function setOptionalLink(link, url, label) {
  if (!url) {
    link.hidden = true;
    return;
  }
  link.hidden = false;
  link.href = url;
  link.textContent = label;
}

function appleMapsUrl(place) {
  const destination = coordinateOrQuery(place);
  const mode = appleMapsMode(place.transportMode || place.navMode);
  return `https://maps.apple.com/?daddr=${encodeURIComponent(destination)}&dirflg=${mode}`;
}

function googleMapsUrl(place) {
  const destination = coordinateOrQuery(place);
  const mode = googleMapsMode(place.transportMode || place.navMode);
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}&travelmode=${encodeURIComponent(mode)}&dir_action=navigate`;
}

function coordinateOrQuery(place) {
  if (isFiniteNumber(place.lat) && isFiniteNumber(place.lng)) {
    return `${place.lat},${place.lng}`;
  }
  return place.mapName || place.name || "";
}

function googleMapsEmbedUrl(item) {
  if (!CONFIG.googleMapsEmbedApiKey) return "";

  const destination = coordinateOrQuery(item);
  if (!destination) return "";

  const params = new URLSearchParams({
    key: CONFIG.googleMapsEmbedApiKey,
    q: destination,
    zoom: "16",
  });
  return `https://www.google.com/maps/embed/v1/place?${params.toString()}`;
}

function googleMapsMode(mode) {
  return {
    walking: "walking",
    driving: "driving",
    transit: "transit",
    步行: "walking",
    走路: "walking",
    開車: "driving",
    自駕: "driving",
    大眾運輸: "transit",
    電車: "transit",
    地鐵: "transit",
    JR: "transit",
  }[mode] || "walking";
}

function appleMapsMode(mode) {
  return {
    walking: "w",
    driving: "d",
    transit: "r",
    步行: "w",
    走路: "w",
    開車: "d",
    自駕: "d",
    大眾運輸: "r",
    電車: "r",
    地鐵: "r",
    JR: "r",
  }[mode] || "w";
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function getTodayDayIndex(trip) {
  if (!trip.startDate) return 0;

  const start = parseDateOnly(trip.startDate);
  const today = parseDateOnly(new Date().toISOString().slice(0, 10));
  const diffDays = Math.floor((today - start) / 86400000);
  return clampDayIndex(diffDays, trip);
}

function clampDayIndex(index, trip) {
  return Math.max(0, Math.min(index, trip.days.length - 1));
}

function parseDateOnly(value) {
  return new Date(`${value}T00:00:00`);
}

function formatTripDates(trip) {
  const first = trip.days[0]?.date || trip.startDate || "";
  const last = trip.days.at(-1)?.date || "";
  if (!first && !last) return "Trip Guide";
  if (first === last || !last) return first;
  return `${first} - ${last}`;
}

function formatUpdatedAt(value) {
  if (!value) return "尚未更新";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "尚未更新";
  return `更新於 ${date.toLocaleString("zh-TW", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

function cacheTrip(trip, updatedAt = new Date().toISOString()) {
  localStorage.setItem(CONFIG.cacheKey, JSON.stringify(trip));
  localStorage.setItem(CONFIG.cacheTimeKey, updatedAt);
}

function readCachedTrip() {
  const raw = localStorage.getItem(CONFIG.cacheKey);
  const updatedAt = localStorage.getItem(CONFIG.cacheTimeKey);
  if (!raw) return null;

  try {
    const trip = JSON.parse(raw);
    validateTrip(trip);
    return { trip, updatedAt };
  } catch {
    return null;
  }
}

function renderError(message) {
  clearMessage();
  els.placeList.replaceChildren();
  const error = document.createElement("div");
  error.className = "error-state";
  error.textContent = message;
  els.placeList.append(error);
}

function showMessage(message, type = "info") {
  els.messageArea.hidden = false;
  els.messageArea.className = `message-area ${type}-message`;
  els.messageArea.textContent = message;
}

function clearMessage() {
  els.messageArea.hidden = true;
  els.messageArea.textContent = "";
}

function placeholderImage(name = "Trip") {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="480" height="360" viewBox="0 0 480 360">
      <rect width="480" height="360" fill="#dce8e6"/>
      <path d="M0 292l122-102 85 60 91-108 182 150v68H0z" fill="#8bb3ad"/>
      <circle cx="350" cy="84" r="38" fill="#f59e0b"/>
      <text x="34" y="54" fill="#142024" font-family="Arial, sans-serif" font-size="28" font-weight="700">${escapeSvg(name)}</text>
    </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function escapeSvg(value) {
  return String(value).replace(/[&<>"']/g, (char) => {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[char];
  });
}
