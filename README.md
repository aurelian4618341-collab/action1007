# 營隊報名表與 Google 試算表串接

本套件已填入這次建立的試算表 ID，工作表為「報名資料」。
試算表：https://docs.google.com/spreadsheets/d/1ikRfxOks0UWSAwKPYbT_tYuo51Q1_5qwuvwWvwdXf_k/edit

## 檔案

- Code.gs：Google Apps Script 後端，新增、查詢、修改、刪除。
- Index.html：可操作的管理表單，欄位依照提供的表單畫面。
- server-example.mjs：現有程式的 Node.js 後端串接範例。

## 建立與部署

1. 開啟上面的試算表，選「擴充功能 → Apps Script」。
2. 將 Code.gs 內容貼入編輯器的 Code.gs。
3. 按新增檔案 → HTML，命名為 Index，貼入 Index.html 全部內容。
4. 到「專案設定 → 指令碼屬性」，新增 API_TOKEN；值使用自行產生的長隨機字串，例如至少 32 字元。這是管理金鑰，能讀取與刪除所有報名資料。
5. 在編輯器選擇 setup 並執行一次，完成 Google 授權。setup 保留 A～E 原資料，於 F 欄加入「資料ID」、G 欄加入「更新時間」，為原有資料補上 ID。空白列不會變成報名資料。
6. 「部署 → 新增部署 → 網頁應用程式」。執行身分選擇「我」。只由自己管理時，存取權限選「僅限自己」。
7. 部署後開啟 /exec 網址，輸入 API_TOKEN，按「載入資料」，即可新增、修改、刪除。此頁面是管理頁，使用者需持有管理金鑰。
8. 程式碼修改後，到「部署 → 管理部署 → 編輯」，版本選「新版本」再部署；既有 /exec 網址通常可沿用。

setup 必須在 Apps Script 編輯器手動執行。不要更動前七欄的欄位順序。試算表時區建議在「檔案 → 設定」改為台北；網頁上的時間固定以台北時間顯示。

## 與現有程式整合

若表單在 Apps Script 的 Index.html 中，使用 google.script.run 呼叫 handleRequest。這套前端已整合完成，須透過部署的 Apps Script 網址開啟，不能直接開本機 HTML。

若表單位於另一個網站，建議由「現有網頁 → 自己的後端 → Apps Script doPost → Google 試算表」。server-example.mjs 可放在 Node.js 18+ 後端。設定 APPS_SCRIPT_URL 為 /exec 部署網址，APPS_SCRIPT_TOKEN 為相同 API_TOKEN。

無登入 Google 的伺服器要呼叫時，Apps Script 部署需允許「任何人」存取；所有資料操作仍會驗證管理金鑰。只有打算使用此外部 API 時才採用此設定。Google Workspace 若禁止匿名部署，須改採可驗證 Google 身分的後端整合；僅限自己部署不能直接用本範例的無登入 fetch 呼叫。

不要在公開前端 JavaScript 放管理金鑰。此套件定位為管理端；若要讓學生公開報名、只修改自己的資料，需要另加使用者身分驗證與每筆資料的權限設計，不能把管理金鑰交給每位學生。

不建議從外部網站直接 fetch Apps Script 並用 no-cors，因為前端無法可靠讀取成功／失敗回應；改由後端代送，或把表單放在這套 Index.html。

## API 格式

所有呼叫為 POST JSON。回應成功為 {"ok":true,"data":...}，失敗為 {"ok":false,"error":"原因"}。請檢查 ok，不只檢查 HTTP 狀態。ContentService 可能重新導向，HTTP 用戶端必須跟隨重新導向。

| 操作 | action | 其他參數 |
| --- | --- | --- |
| 查詢 | list | token |
| 新增 | create | token、data |
| 修改 | update | token、id、updatedAt、完整 data |
| 刪除 | delete | token、id、updatedAt |

data 的四個必填欄位：studentId（學號）、name（姓名）、group（分組）、email（電子信箱）。
group 必須為 A 組－金融科技與量化、B 組－行為經濟與實驗、C 組－個案與商業策略之一。

修改與刪除使用查詢回傳的 id 與 updatedAt，不使用資料列號。資料被別人修改時會拒絕舊版本操作，重新查詢後再操作。
新增／修改會檢查必填欄位、信箱格式及學號重複。重複學號比較不分英文大小寫。操作使用鎖避免本專案同時寫入衝突；直接在試算表手動編輯不會遵守程式的鎖與版本檢查，管理時請優先使用本表單。

## 部署後驗收

1. 用測試學號新增一筆，確認試算表新增 A～G 資料。
2. 用相同學號再新增，應收到已報名訊息。
3. 修改測試姓名與分組，確認仍是相同資料ID、填寫時間不變。
4. 開兩個分頁載入同一筆；第一頁修改後，第二頁用舊資料修改／刪除，應收到重新載入提示。
5. 刪除測試資料，確認試算表與網頁名單移除。
6. 用錯誤金鑰查詢／寫入，應被拒絕。

套件已完成本機模擬測試；尚未部署至你的 Apps Script 專案，Google 授權、部署與實際連線需完成上述步驟。

官方文件：
- https://developers.google.com/apps-script/guides/web
- https://developers.google.com/apps-script/guides/html/communication
- https://developers.google.com/apps-script/guides/content
