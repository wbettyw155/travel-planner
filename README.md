# 新加坡四天旅遊行程管理網頁工具

這是一個純前端 HTML/CSS/JavaScript 專案。基本功能可直接開啟 HTML 使用；PWA、安裝到手機主畫面與離線快取需要透過 localhost 或 HTTPS 開啟。

## 檔案結構

```text
day1-14-00-16-00-merlion/
├── index.html
├── styles.css
├── script.js
├── manifest.webmanifest
├── service-worker.js
├── icons/
│   ├── app-icon.svg
│   ├── app-icon-192.png
│   └── app-icon-512.png
└── README.md
```

## 如何開啟

直接用瀏覽器開啟 `index.html` 即可使用。

Windows 可在檔案總管中雙擊：

```text
C:\Users\HOTTEN\Documents\Codex\2026-04-30\day1-14-00-16-00-merlion\index.html
```

若要測試 PWA、離線功能或加到手機主畫面，請在專案資料夾啟動本機伺服器：

```powershell
python -m http.server 4173
```

接著開啟：

```text
http://localhost:4173
```

## 功能

- Day1 到 Day4 預設分頁與新加坡行程資料
- 備註分頁與獨立 `notes` 資料
- 記帳分頁與獨立 `members`、`expenses` 資料
- 編輯、刪除既有行程
- 新增、編輯、刪除備註
- 成員管理、支出紀錄與自動分帳結算
- 勾選已完成行程
- 拖曳排序
- 行程展開與收合
- 點擊地點名稱可開啟 Google Maps
- 每天可記錄每日總花費
- 每天自動計算行程數量與完成進度
- 使用 `localStorage` 儲存，重新整理後資料仍保留
- 現代 Notion 風格與手機友善版面
- 活潑可愛馬卡龍 UI
- PWA 支援，可安裝到手機主畫面
- App icon
- Service Worker 離線快取
