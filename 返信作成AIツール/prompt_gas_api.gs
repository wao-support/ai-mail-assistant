/**
 * AIメールアシスタント プロンプト置き場用 Google Apps Script
 * 
 * 【設定手順】
 * 1. スプレッドシート（https://docs.google.com/spreadsheets/d/1g2lrvCPGQrwu7Rf23Voqf_PHdIpLj-Ih2Ge2QokxsLs/edit）を開く
 * 2. メニューから「拡張機能」>「Apps Script」をクリック
 * 3. 最初に開く「コード.gs」の中身をすべて消し、このファイルの内容を貼り付ける
 * 4. 初回のみ、上の実行ボタンの横のドロップダウンで「setup」を選択し、「実行」をクリック（シート名や見出しが自動作成されます。権限承認が求められた場合は許可してください）
 * 5. 右上の「デプロイ」>「新しいデプロイ」をクリック
 * 6. 「種類の選択」の歯車アイコンをクリックし、「ウェブアプリ」を選択
 * 7. 以下の設定にする:
 *    - 説明: 「プロンプト管理API v1」等
 *    - 次のユーザーとして実行: 「自分（あなたのGoogleアカウント）」
 *    - アクセスできるユーザー: 「全員」
 * 8. 「デプロイ」をクリック
 * 9. 「ウェブアプリのURL」が表示されるので「コピー」をクリック
 * 10. AIメールアシスタントの「プロンプト置き場」画面の左下「設定」を開き、コピーしたURLを貼り付けて保存
 */

const SHEET_NAME = 'プロンプト一覧';

// 初回セットアップ用関数（手動で一度実行する）
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(['タイムスタンプ', 'タイトル', '事業部別', 'カテゴリ', '投稿者', 'プロンプト本文']);
    sheet.setFrozenRows(1);
    
    // 見出しの書式設定
    const headerRange = sheet.getRange("A1:F1");
    headerRange.setBackground("#f3f4f6");
    headerRange.setFontWeight("bold");
    sheet.setColumnWidth(1, 150); // タイムスタンプ
    sheet.setColumnWidth(2, 300); // タイトル
    sheet.setColumnWidth(3, 120); // 事業部別
    sheet.setColumnWidth(4, 120); // カテゴリ
    sheet.setColumnWidth(5, 120); // 投稿者
    sheet.setColumnWidth(6, 500); // プロンプト本文
  } else {
    migrateSheetIfNeeded(sheet);
  }
}

// 後方互換性のためのマイグレーション処理
function migrateSheetIfNeeded(sheet) {
  if (sheet.getLastColumn() < 3) return;
  const header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  if (header[2] === 'カテゴリ') {
    // 古いフォーマットの場合、C列に「事業部別」を挿入してマイグレーションする
    sheet.insertColumnBefore(3);
    sheet.getRange(1, 3).setValue('事業部別');
    
    // 既存の行にはデフォルトで「全社」を設定
    const lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      const range = sheet.getRange(2, 3, lastRow - 1, 1);
      const values = [];
      for(let i=0; i < lastRow - 1; i++){
        values.push(['全社']);
      }
      range.setValues(values);
    }
  }
}

// アプリケーション（JS）からデータを読み込むときに呼ばれる（GETリクエスト）
function doGet(e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME);
  
  if (!sheet) {
    return ContentService.createTextOutput(JSON.stringify([]))
      .setMimeType(ContentService.MimeType.JSON);
  }
  
  // 読み込み前にマイグレーションを確認
  migrateSheetIfNeeded(sheet);
  
  const data = sheet.getDataRange().getValues();
  
  if (data.length <= 1) {
    return ContentService.createTextOutput(JSON.stringify([]))
      .setMimeType(ContentService.MimeType.JSON);
  }
  
  const result = [];
  
  // 2行目から読み込み (1行目は見出し)
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row[1] && !row[5]) continue; // タイトルと本文が両方空ならスキップ
    
    // 日付のフォーマット処理
    let dateStr = row[0];
    if (typeof row[0] === 'object' && row[0] instanceof Date) {
      dateStr = Utilities.formatDate(row[0], Session.getScriptTimeZone(), 'yyyy/MM/dd HH:mm');
    }
    
    // prompts.js が期待する形式({date, title, department, category, author, content})のオブジェクトにする
    result.push({
      date: dateStr,
      title: row[1],
      department: row[2],
      category: row[3],
      author: row[4],
      content: row[5]
    });
  }
  
  // 新しいプロンプトが上に来るように逆順にする
  result.reverse();
  
  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// アプリケーション（JS）から新しいプロンプトを保存するときに呼ばれる（POSTリクエスト）
function doPost(e) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(SHEET_NAME);
    
    if (!sheet) {
       // シートが無ければ勝手に作る
       setup();
       sheet = ss.getSheetByName(SHEET_NAME);
    } else {
       migrateSheetIfNeeded(sheet);
    }
    
    // 送信されてきたデータを取得
    const params = e.parameter;
    const date = new Date();
    
    const title = params.title || '';
    const department = params.department || '全社';
    const category = params.category || 'その他';
    const author = params.author || '名無しさん';
    const content = params.content || '';
    
    if (!title || !content) {
       return ContentService.createTextOutput(JSON.stringify({status: "error", message: "タイトルと本文は必須です。"}))
         .setMimeType(ContentService.MimeType.JSON);
    }

    // スプレッドシートの最終行に追加 [date, title, department, category, author, content]
    sheet.appendRow([date, title, department, category, author, content]);
    
    return ContentService.createTextOutput(JSON.stringify({status: "success"}))
      .setMimeType(ContentService.MimeType.JSON);

  } catch(err) {
    return ContentService.createTextOutput(JSON.stringify({status: "error", message: err.toString()}))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
