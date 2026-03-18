const SPREADSHEET_ID = '1N7-uNsPJozGtaYC8SjQTHnbINTaLX9rJh6HzcX31Dk8';

// スプレッドシートを取得する関数
function getSheet() {
  return SpreadsheetApp.openById(SPREADSHEET_ID).getSheets()[0];
}

// データ取得API (GET)
// スプレッドシートの1行目をヘッダーとし、2行目以降の全データをJSONで返す
function doGet(e) {
  const sheet = getSheet();
  const data = sheet.getDataRange().getValues();
  
  if (data.length <= 1) {
    return createJsonResponse({ headers: [], rows: [] });
  }
  
  const headers = data[0];
  const rows = [];
  
  for (let i = 1; i < data.length; i++) {
    const rowObj = { row_index: i + 1 }; // 行番号を保持(1始まり)
    for (let j = 0; j < headers.length; j++) {
      rowObj[headers[j]] = data[i][j] !== undefined && data[i][j] !== "" ? data[i][j] : null;
    }
    rows.push(rowObj);
  }
  
  return createJsonResponse({ headers: headers, rows: rows });
}

// データ更新API (POST)
// 1店舗分のデータを受け取り、スプレッドシートの該当行を更新する
function doPost(e) {
  try {
    const params = JSON.parse(e.postData.contents);
    const sheet = getSheet();
    let headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    
    // 足りないヘッダー列を自動追加（初回のみ実行される）
    const requiredHeaders = ['research_date', 'department_store', 'brand_name', 'segment', 'has_bento', 'price_min', 'price_max', 'item_count', 'updated_at'];
    let lastColumn = headers.length;
    for (let h of requiredHeaders) {
      if (!headers.includes(h)) {
        headers.push(h);
        lastColumn++;
        sheet.getRange(1, lastColumn).setValue(h);
      }
    }

    const rowIndex = params.row_index;
    if (!rowIndex || rowIndex < 2) {
      throw new Error("Invalid row_index: " + rowIndex);
    }

    // タイムスタンプ付与
    const nowOffset = new Date();
    // GASはサーバーのタイムゾーンに依存するため、日本時間(JST)のISO文字列を生成
    params.updated_at = Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyy-MM-dd'T'HH:mm:ssXXX");
    
    if (!params.research_date) {
      params.research_date = Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyy-MM-dd");
    }
    
    // スプレッドシートの各セルを更新
    // ※高速化のため一括更新(setValues)の適用も可能だが、
    // セルごとのフォーマット崩れなどを防ぐため列ごとにセル取得して書き込む（データ量が少なければ問題なし）
    const rowUpdates = [];
    const updateIndices = [];
    
    for (let j = 0; j < headers.length; j++) {
      const header = headers[j];
      if (params.hasOwnProperty(header)) {
         // 配列にセット
         updateIndices.push(j + 1);
         rowUpdates.push(params[header] !== null ? params[header] : "");
      }
    }
    
    // 1セルずつ書き込む
    for(let k = 0; k < updateIndices.length; k++){
       sheet.getRange(rowIndex, updateIndices[k]).setValue(rowUpdates[k]);
    }
    
    return createJsonResponse({ success: true, updated_at: params.updated_at, row_index: rowIndex });
  } catch (err) {
    return createJsonResponse({ success: false, error: err.toString() });
  }
}

// JSONレスポンスを作成するヘルパー
function createJsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
