const CONFIG = Object.freeze({
  spreadsheetId: '1ikRfxOks0UWSAwKPYbT_tYuo51Q1_5qwuvwWvwdXf_k',
  sheetName: '報名資料',
  headers: ['填寫時間', '學號', '姓名', '報名分組', '電子信箱', '資料ID', '更新時間'],
  groups: ['A 組－金融科技與量化', 'B 組－行為經濟與實驗', 'C 組－個案與商業策略']
});

// 在編輯器執行一次。保留原有資料，只增加識別與版本欄位。
function setup() {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sheet = SpreadsheetApp.openById(CONFIG.spreadsheetId).getSheetByName(CONFIG.sheetName);
    if (!sheet) throw new Error('找不到「報名資料」工作表。');
    const headers = sheet.getRange(1, 1, 1, 7).getDisplayValues()[0];
    CONFIG.headers.slice(0, 5).forEach((h, i) => {
      if (headers[i] !== h) throw new Error('原欄位不符：第 ' + (i + 1) + ' 欄應為 ' + h);
    });
    if ((headers[5] && headers[5] !== CONFIG.headers[5]) ||
        (headers[6] && headers[6] !== CONFIG.headers[6])) {
      throw new Error('F 或 G 欄已有其他用途，請先調整欄位，避免覆蓋。');
    }
    sheet.getRange(1, 6, 1, 2).setValues([CONFIG.headers.slice(5)]);
    sheet.getRange(1, 6, 1, 2).setBackground('#334155').setFontColor('#ffffff').setFontWeight('bold');
    sheet.setColumnWidth(6, 290); sheet.setColumnWidth(7, 230);
    sheet.setFrozenRows(1);
    const count = sheet.getLastRow() - 1;
    if (count > 0) {
      const rows = sheet.getRange(2, 1, count, 7).getValues();
      const ids = new Set();
      rows.forEach(row => {
        if (!row.slice(1, 5).some(v => v !== '')) return;
        if (!row[5]) row[5] = Utilities.getUuid();
        if (ids.has(String(row[5]))) throw new Error('發現重複資料ID，請先修正。');
        ids.add(String(row[5]));
        if (!row[6]) row[6] = new Date().toISOString();
      });
      sheet.getRange(2, 6, count, 2).setNumberFormat('@').setValues(rows.map(r => r.slice(5)));
    }
    SpreadsheetApp.flush();
  } finally { lock.releaseLock(); }
}

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('營隊報名資料管理').addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// Apps Script HTML 頁面透過 google.script.run 呼叫；所有操作都需管理金鑰。
function handleRequest(request) {
  try {
    authorize_(request);
    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try { return { ok: true, data: dispatch_(request) }; }
    finally { SpreadsheetApp.flush(); lock.releaseLock(); }
  } catch (error) {
    return { ok: false, error: String(error.message || error) };
  }
}

// 外部程式由後端 POST JSON 呼叫，格式與 handleRequest 相同。
function doPost(e) {
  let result;
  try {
    const request = JSON.parse(e && e.postData ? e.postData.contents : '{}');
    result = handleRequest(request);
  } catch (_) { result = { ok: false, error: '請傳送有效的 JSON。' }; }
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}

function authorize_(request) {
  const expected = PropertiesService.getScriptProperties().getProperty('API_TOKEN');
  if (!expected) throw new Error('管理金鑰尚未設定，請設定指令碼屬性 API_TOKEN。');
  if (!request || typeof request.token !== 'string' || request.token !== expected) {
    throw new Error('管理金鑰不正確。');
  }
}

function sheet_() {
  const sheet = SpreadsheetApp.openById(CONFIG.spreadsheetId).getSheetByName(CONFIG.sheetName);
  if (!sheet) throw new Error('找不到工作表。');
  const headers = sheet.getRange(1, 1, 1, 7).getDisplayValues()[0];
  if (!CONFIG.headers.every((h, i) => headers[i] === h)) throw new Error('請先執行 setup，並保留欄位順序。');
  return sheet;
}

function records_(sheet) {
  const count = sheet.getLastRow() - 1;
  if (count < 1) return [];
  return sheet.getRange(2, 1, count, 7).getValues()
    .map((row, i) => ({ rowNumber: i + 2, row }))
    .filter(item => item.row.slice(1, 5).some(v => v !== ''));
}

function text_(value, label, limit) {
  if (typeof value !== 'string') throw new Error(label + '必須是文字。');
  const valueText = value.trim();
  if (!valueText || valueText.length > limit || /[\x00-\x1f\x7f]/.test(valueText)) {
    throw new Error(label + '不可空白、過長或包含控制字元。');
  }
  return valueText;
}

function validate_(data) {
  if (!data || typeof data !== 'object') throw new Error('缺少報名資料。');
  const result = {
    studentId: text_(data.studentId, '學號', 50),
    name: text_(data.name, '姓名', 100),
    group: text_(data.group, '報名分組', 50),
    email: text_(data.email, '電子信箱', 254)
  };
  if (!CONFIG.groups.includes(result.group)) throw new Error('請選擇有效的 A、B 或 C 組。');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.email)) throw new Error('電子信箱格式不正確。');
  return result;
}

function safeCell_(value) { return /^[=+\-@]/.test(value) ? "'" + value : value; }
function iso_(value) { return value instanceof Date ? value.toISOString() : String(value || ''); }
function output_(row) {
  return { createdAt: iso_(row[0]), studentId: String(row[1]), name: String(row[2]),
    group: String(row[3]), email: String(row[4]), id: String(row[5]), updatedAt: iso_(row[6]) };
}

function dispatch_(request) {
  const sheet = sheet_();
  const records = records_(sheet);
  if (request.action === 'list') {
    if (records.some(r => !r.row[5] || !r.row[6])) throw new Error('有資料缺少ID或更新時間，請重新執行 setup。');
    return records.map(item => output_(item.row));
  }
  if (!['create', 'update', 'delete'].includes(request.action)) throw new Error('不支援的操作。');
  let item;
  if (request.action !== 'create') {
    const id = text_(request.id, '資料ID', 100);
    const matches = records.filter(r => String(r.row[5]) === id);
    if (matches.length !== 1) throw new Error('資料不存在或資料ID重複，請重新載入。');
    item = matches[0];
    if (!request.updatedAt || iso_(item.row[6]) !== request.updatedAt) {
      throw new Error('資料已被修改，請重新載入後再操作。');
    }
  }
  if (request.action === 'delete') {
    sheet.deleteRow(item.rowNumber);
    return { id: String(item.row[5]), deleted: true };
  }
  const data = validate_(request.data);
  if (records.some(r => (!item || r.rowNumber !== item.rowNumber) &&
      String(r.row[1]).trim().toUpperCase() === data.studentId.toUpperCase())) {
    throw new Error('這個學號已經報名，請使用修改功能。');
  }
  const now = new Date();
  const updatedAt = item ? new Date(Math.max(now.getTime(), Date.parse(iso_(item.row[6])) + 1)).toISOString() : now.toISOString();
  const row = [item ? item.row[0] : now, data.studentId, data.name, data.group, data.email,
    item ? String(item.row[5]) : Utilities.getUuid(), updatedAt];
  const rowNumber = item ? item.rowNumber : sheet.getLastRow() + 1;
  if (rowNumber > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), 100);
  sheet.getRange(rowNumber, 2, 1, 6).setNumberFormat('@');
  sheet.getRange(rowNumber, 1, 1, 7).setValues([row.map(v => typeof v === 'string' ? safeCell_(v) : v)]);
  sheet.getRange(rowNumber, 1).setNumberFormat('yyyy/mm/dd hh:mm:ss');
  sheet.getRange(rowNumber, 4).setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInList(CONFIG.groups, true).setAllowInvalid(false).build());
  return output_(row);
}
