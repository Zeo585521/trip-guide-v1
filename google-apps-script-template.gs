const SHEET_NAME = "spots";
const TRIP_NAME = "我的旅遊行程";

const CARD_TYPES = ["景點", "交通", "飯店", "餐廳", "購物"];
const TRANSPORT_MODES = ["步行", "大眾運輸", "開車"];

function doGet() {
  const trip = buildTripJson();
  return ContentService
    .createTextOutput(JSON.stringify(trip))
    .setMimeType(ContentService.MimeType.JSON);
}

function buildTripJson() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = spreadsheet.getSheetByName(SHEET_NAME);
  const values = sheet.getDataRange().getValues();
  const headers = values.shift().map(String);
  const rows = values.map((row) => rowToObject(headers, row));
  const enabledRows = rows.filter((row) => String(valueOf(row, "啟用", "enabled")).toUpperCase() !== "FALSE");

  const daysByKey = {};
  enabledRows.forEach((row) => {
    const day = Number(valueOf(row, "天數", "day") || 1);
    const key = String(day);
    const mapUrl = valueOf(row, "MAP連結", "mapUrl");
    const coords = parseCoordinatesFromMapUrl(mapUrl);
    const name = valueOf(row, "名稱", "name");

    if (!daysByKey[key]) {
      daysByKey[key] = {
        day,
        date: formatDate(valueOf(row, "日期", "date")),
        title: valueOf(row, "每日標題", "dayTitle") || `Day ${day}`,
        items: [],
      };
    }

    daysByKey[key].items.push({
      type: normalizeCardType(valueOf(row, "卡片種類", "type")),
      enabled: true,
      name,
      time: valueOf(row, "時間", "time"),
      description: valueOf(row, "描述", "description"),
      mapName: name,
      lat: coords.lat,
      lng: coords.lng,
      imageUrl: valueOf(row, "圖片URL", "imageUrl"),
      mapUrl,
      transportMode: normalizeTransportMode(valueOf(row, "交通模式", "transportMode")),
      order: Number(valueOf(row, "順序", "order") || 999),
    });
  });

  const days = Object.values(daysByKey)
    .sort((a, b) => a.day - b.day)
    .map((day) => {
      day.items.sort((a, b) => a.order - b.order);
      day.items.forEach((item) => delete item.order);
      return day;
    });

  return {
    tripName: TRIP_NAME,
    startDate: days[0]?.date || "",
    days,
  };
}

function setupDropdowns() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
  setColumnDropdown(sheet, headers, "卡片種類", CARD_TYPES);
  setColumnDropdown(sheet, headers, "交通模式", TRANSPORT_MODES);
  setColumnDropdown(sheet, headers, "啟用", ["TRUE", "FALSE"]);
}

function setColumnDropdown(sheet, headers, headerName, options) {
  const columnIndex = headers.indexOf(headerName) + 1;
  if (!columnIndex) return;

  const rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(options, true)
    .setAllowInvalid(false)
    .build();
  sheet.getRange(2, columnIndex, Math.max(sheet.getMaxRows() - 1, 1), 1).setDataValidation(rule);
}

function rowToObject(headers, row) {
  return headers.reduce((object, header, index) => {
    object[header] = row[index];
    return object;
  }, {});
}

function valueOf(row, chineseKey, englishKey) {
  return row[chineseKey] ?? row[englishKey] ?? "";
}

function normalizeCardType(value) {
  return {
    景點: "place",
    交通: "transport",
    飯店: "hotel",
    餐廳: "restaurant",
    購物: "shopping",
    place: "place",
    transport: "transport",
    hotel: "hotel",
    restaurant: "restaurant",
    shopping: "shopping",
  }[String(value).trim()] || "place";
}

function normalizeTransportMode(value) {
  return {
    步行: "walking",
    走路: "walking",
    大眾運輸: "transit",
    電車: "transit",
    地鐵: "transit",
    JR: "transit",
    開車: "driving",
    自駕: "driving",
    walking: "walking",
    transit: "transit",
    driving: "driving",
  }[String(value).trim()] || "walking";
}

function parseCoordinatesFromMapUrl(url) {
  const text = String(url || "");
  const patterns = [
    /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,
    /[?&](?:q|query|ll|destination)=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,
    /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return {
        lat: Number(match[1]),
        lng: Number(match[2]),
      };
    }
  }

  return { lat: "", lng: "" };
}

function formatDate(value) {
  if (Object.prototype.toString.call(value) === "[object Date]") {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), "yyyy-MM-dd");
  }
  return String(value || "");
}
