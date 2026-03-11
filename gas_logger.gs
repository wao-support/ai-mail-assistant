/**
 * AIメールアシスタント君 - 実行ログ記録スクリプト
 *
 * 【デプロイ手順】
 * 1. Google スプレッドシートを新規作成し、Apps Script エディタを開く
 *    （拡張機能 > Apps Script）
 * 2. このコードをすべて貼り付けて保存
 * 3. 「デプロイ」>「新しいデプロイ」>「種類: ウェブアプリ」を選択
 * 4. 実行ユーザー: 自分、アクセスできるユーザー: 全員 に設定してデプロイ
 * 5. 表示されたウェブアプリのURLをコピーし、ツールの設定画面に貼り付ける
 */

const SHEET_NAME = '実行ログ';

const HEADERS = [
  '実行日時',
  '担当者名',
  '機能',
  'カテゴリ',
  'トーン',
  '入力内容',
  '追加指示',
  '生成件名',
  '生成本文'
];

function getOrCreateSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function doGet(e) {
  try {
    // GETパラメータ経由でもログ記録できるようにする
    if (e.parameter && e.parameter.data) {
      const data = JSON.parse(e.parameter.data);
      const sheet = getOrCreateSheet();
      sheet.appendRow([
        data.timestamp || new Date().toLocaleString('ja-JP'),
        data.staffName || '',
        data.feature || '',
        data.category || '',
        data.tone || '',
        data.inputContent || '',
        data.additionalInstruction || '',
        data.generatedSubject || '',
        data.generatedBody || ''
      ]);
      return ContentService.createTextOutput('ok');
    }
    return ContentService.createTextOutput('ok');
  } catch (err) {
    return ContentService.createTextOutput('error: ' + err.toString());
  }
}

function doPost(e) {
  try {
    // フォームデータ形式（URLSearchParams）で受信
    let data;
    if (e.parameter && e.parameter.data) {
      data = JSON.parse(e.parameter.data);
    } else if (e.postData && e.postData.contents) {
      data = JSON.parse(e.postData.contents);
    } else {
      throw new Error('No data received');
    }

    const sheet = getOrCreateSheet();
    sheet.appendRow([
      data.timestamp || new Date().toLocaleString('ja-JP'),
      data.staffName || '',
      data.feature || '',
      data.category || '',
      data.tone || '',
      data.inputContent || '',
      data.additionalInstruction || '',
      data.generatedSubject || '',
      data.generatedBody || ''
    ]);

    return ContentService
      .createTextOutput(JSON.stringify({ success: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// 動作確認用（GASエディタから直接実行して列幅を整える）
function setup() {
  const sheet = getOrCreateSheet();
  sheet.setColumnWidth(1, 160); // 実行日時
  sheet.setColumnWidth(2, 100); // 担当者名
  sheet.setColumnWidth(3, 100); // 機能
  sheet.setColumnWidth(4, 150); // カテゴリ
  sheet.setColumnWidth(5, 120); // トーン
  sheet.setColumnWidth(6, 300); // 入力内容
  sheet.setColumnWidth(7, 200); // 追加指示
  sheet.setColumnWidth(8, 200); // 生成件名
  sheet.setColumnWidth(9, 400); // 生成本文
}
