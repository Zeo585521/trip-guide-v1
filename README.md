# Trip Guide V1

第一版是純靜態旅遊行程頁：

- 依 `startDate` 自動切到今日對應 Day
- 可手動切換 Day 1、Day 2 ...
- 每天可混排交通卡、景點卡、飯店卡、餐廳卡、購物卡
- Apple Maps / Google Maps 導航按鈕
- 手動更新按鈕
- 成功讀取後會快取到瀏覽器 `localStorage`

## 本機預覽

因為瀏覽器直接開 `index.html` 可能無法 `fetch()` JSON，請用本機伺服器：

```bash
cd trip-guide-v1
python3 -m http.server 4173
```

打開：

```txt
http://localhost:4173
```

## 編輯行程

目前資料在：

```txt
data/trip.json
```

之後要接 Google 試算表時，先用 Apps Script 把試算表轉成同樣格式的 JSON，再把 `app.js` 的 `remoteDataUrl` 改成 Apps Script Web App URL：

```js
remoteDataUrl: "https://script.google.com/macros/s/xxxxx/exec"
```

正式上架時建議改 `config.js`：

```js
window.TRIP_GUIDE_CONFIG = {
  remoteDataUrl: "https://script.google.com/macros/s/xxxxx/exec",
  googleMapsEmbedApiKey: "",
};
```

測試串接時也可以不用改程式。打開網頁後按右上角齒輪，貼上 Apps Script Web App URL，瀏覽器會記住這個資料來源。留空儲存會改回本地 `data/trip.json`。

## GitHub Pages 上架

目前專案在 `Python_code` repo 的子資料夾：

```txt
trip-guide-v1/
```

若使用既有 repo 上架，GitHub Pages 網址會類似：

```txt
https://Zeo585521.github.io/Python_code/trip-guide-v1/
```

建議只 commit 這個資料夾，不要 `git add .`，因為 repo 裡可能有其他未整理的變更：

```bash
git add trip-guide-v1
git commit -m "Add trip guide static site"
git push origin master
```

到 GitHub repo 頁面設定：

```txt
Settings -> Pages
Source: Deploy from a branch
Branch: master
Folder: / (root)
Save
```

等待 Pages 部署完成後，打開 `/trip-guide-v1/` 路徑即可。

`google-apps-script-template.gs` 是之後接試算表時可貼到 Apps Script 的範本。

`google-sheets-template.csv` 可匯入 Google 試算表，分頁名稱請改成 `spots`。

## 地圖預覽

卡片可以在圖片區顯示 Google Maps 地圖預覽。這不是 Google Maps 景點照片，而是嵌入式地圖。

若要啟用，需建立 Google Maps Embed API key，然後在 `app.js` 填入：

```js
googleMapsEmbedApiKey: "你的 API key"
```

Maps Embed API 官方文件目前標示可免費使用且沒有每日/速率限制，但所有 Embed API request 都需要 API key。建議在 Google Cloud Console 把 key 限制為你的網站網域使用。

## 自動圖片

若 `圖片URL` 空白，前端會先用 `名稱` 嘗試從 Wikimedia Commons 找一張縮圖。找到時會顯示圖片並附上來源連結；找不到時才顯示 Google Maps Embed 地圖預覽或佔位圖。

這個功能在 `app.js` 控制：

```js
autoWikimediaImages: true
```

Google Maps 的景點照片不會被自動抓取。若要正式使用 Google 地點照片，需要 Google Places API / Place Photos，且要遵守 Google Maps Platform 條款與標示規則。

## Google 試算表欄位

```txt
天數
日期
每日標題
順序
卡片種類
名稱
時間
描述
圖片URL
MAP連結
交通模式
啟用
```

`卡片種類` 可用：

```txt
景點
交通
飯店
餐廳
購物
```

`交通模式` 可用：

```txt
步行
大眾運輸
開車
```

座標不需要另外填。Apps Script 會嘗試從 `MAP連結` 解析經緯度，例如：

```txt
https://maps.google.com/?q=35.681236,139.767125
https://www.google.com/maps/place/.../@35.681236,139.767125,17z
```

如果是 `https://maps.app.goo.gl/...` 這類短網址，可能解析不到座標；建議從 Google Maps 複製完整分享連結，或使用包含 `?q=緯度,經度` 的連結。

把 Apps Script 貼上後，可先手動執行一次：

```txt
setupDropdowns
```

它會替 `卡片種類`、`交通模式`、`啟用` 建立下拉選單，避免輸入錯字。
