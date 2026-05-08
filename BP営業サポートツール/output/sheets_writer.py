"""Google Spreadsheet 出力モジュール

6つのシートへの書き込みを管理する。
"""
from typing import List, Dict
from utils.google_auth import get_sheets_service
from config import Config
from utils.logger import setup_logger

logger = setup_logger(__name__)


# 各シートのヘッダー定義
HEADERS = {
    'events_raw': [
        '取得日', 'イベント名', '開催期間', '会場',
        'イベントURL', '主催者名', '連絡先', '入場区分',
    ],
    'manual_review': [
        'イベント名', '開催期間', '会場', 'イベントURL',
        '主催者名（Big Sight）', '入場区分',
        '運営会社名（手動入力）', '事務局名（手動入力）',
        '会社概要URL（手動入力）', '問い合わせURL（手動入力）',
        '確認ステータス', '備考',
    ],
    'company_info': [
        '名寄せ後企業名', '原文企業名', '正式法人名', '法人番号',
        '本社所在地', '企業サイトURL', '問い合わせURL',
        '電話番号', '事業内容', '情報取得ステータス',
    ],
    'sales_list': [
        '取得日', 'イベント名', '開催期間', '会場',
        'イベントURL', '主催者名（原文）', '運営会社名（原文）',
        '事務局名（原文）', '名寄せ後企業名', '正式法人名', '法人番号',
        '本社所在地', '企業サイトURL', '会社概要URL', '問い合わせURL',
        '電話番号', '事業内容', '取得ステータス', '備考',
    ],
    'errors': [
        '発生日時', '処理ステップ', 'エラーメッセージ',
        '対象イベント名', '対象URL',
    ],
    'execution_log': [
        '開始日時', '終了日時', '所要時間',
        'イベント取得件数', 'URL解析成功件数',
        '企業名抽出成功件数', '会社情報取得成功件数',
        '重複除外件数', 'エラー件数', 'ステータス', 'エラーメッセージ',
    ],
}


class SheetsWriter:
    """Googleスプレッドシートへの書き込みを管理するクラス"""

    def __init__(self, spreadsheet_id: str = None):
        self.spreadsheet_id = spreadsheet_id or Config.SPREADSHEET_ID
        self.service = None

    def _get_service(self):
        if not self.service:
            self.service = get_sheets_service()
        return self.service

    def ensure_sheets_exist(self):
        """必要なシートがすべて存在することを確認し、なければ作成"""
        service = self._get_service()
        try:
            meta = service.spreadsheets().get(
                spreadsheetId=self.spreadsheet_id
            ).execute()
            existing = {s['properties']['title'] for s in meta['sheets']}

            requests_list = []
            for key, sheet_name in Config.SHEET_NAMES.items():
                if sheet_name not in existing:
                    requests_list.append({
                        'addSheet': {'properties': {'title': sheet_name}}
                    })
                    logger.info(f"シート作成予定: {sheet_name}")

            if requests_list:
                service.spreadsheets().batchUpdate(
                    spreadsheetId=self.spreadsheet_id,
                    body={'requests': requests_list}
                ).execute()
                logger.info(f"{len(requests_list)}シートを作成しました")

            self._write_headers()

        except Exception as e:
            logger.error(f"シート確認/作成エラー: {e}")
            raise

    def _write_headers(self):
        service = self._get_service()
        data = []
        for key, header in HEADERS.items():
            sheet_name = Config.SHEET_NAMES.get(key, '')
            if sheet_name:
                data.append({
                    'range': f'{sheet_name}!A1',
                    'values': [header],
                })

        if data:
            service.spreadsheets().values().batchUpdate(
                spreadsheetId=self.spreadsheet_id,
                body={'valueInputOption': 'USER_ENTERED', 'data': data}
            ).execute()
            logger.info("ヘッダー行を書き込みました")

    def write_events_raw(self, events: List[Dict]):
        """イベント一覧_raw シートに書き込み"""
        header_keys = [
            '取得日', 'イベント名', '開催期間', '会場',
            'イベントURL', '主催者名', '連絡先', '入場区分',
        ]
        rows = [[ev.get(k, '') for k in header_keys] for ev in events]
        self._write_to_sheet('events_raw', rows)

    def write_manual_review(self, events: List[Dict]):
        """要手動確認 シートに書き込み（手動で運営会社名等を補完するリスト）"""
        rows = []
        for ev in events:
            rows.append([
                ev.get('イベント名', ''),
                ev.get('開催期間', ''),
                ev.get('会場', ''),
                ev.get('イベントURL', ''),
                ev.get('主催者名', ''),
                ev.get('入場区分', ''),
                '',  # 運営会社名（手動入力）
                '',  # 事務局名（手動入力）
                '',  # 会社概要URL（手動入力）
                '',  # 問い合わせURL（手動入力）
                '未確認',  # 確認ステータス
                '',  # 備考
            ])
        self._write_to_sheet('manual_review', rows)

    def write_company_info(self, companies: List[Dict]):
        """企業情報 シートに書き込み"""
        header_keys = [
            '名寄せ後企業名', '原文企業名', '正式法人名', '法人番号',
            '本社所在地', '企業サイトURL', '問い合わせURL',
            '電話番号', '事業内容', '情報取得ステータス',
        ]
        rows = [[c.get(k, '') for k in header_keys] for c in companies]
        self._write_to_sheet('company_info', rows)

    def write_sales_list(self, records: List[Dict]):
        """営業リスト シートに書き込み"""
        header_keys = [
            '取得日', 'イベント名', '開催期間', '会場',
            'イベントURL', '主催者名（原文）', '運営会社名（原文）',
            '事務局名（原文）', '名寄せ後企業名', '正式法人名', '法人番号',
            '本社所在地', '企業サイトURL', '会社概要URL', '問い合わせURL',
            '電話番号', '事業内容', '取得ステータス', '備考',
        ]
        rows = [[r.get(k, '') for k in header_keys] for r in records]
        self._write_to_sheet('sales_list', rows)

    def write_errors(self, errors: List[tuple]):
        rows = [list(e) for e in errors]
        self._append_to_sheet('errors', rows)

    def write_execution_log(self, log_row: list):
        self._append_to_sheet('execution_log', [log_row])

    def _write_to_sheet(self, sheet_key: str, rows: List[list]):
        if not rows:
            logger.info(f"{sheet_key}: 書き込みデータなし")
            return

        sheet_name = Config.SHEET_NAMES[sheet_key]
        service = self._get_service()

        try:
            service.spreadsheets().values().clear(
                spreadsheetId=self.spreadsheet_id,
                range=f'{sheet_name}!A2:ZZ',
            ).execute()

            batch_size = 5000
            for i in range(0, len(rows), batch_size):
                chunk = rows[i:i + batch_size]
                start_row = i + 2
                chunk_range = f'{sheet_name}!A{start_row}'
                service.spreadsheets().values().update(
                    spreadsheetId=self.spreadsheet_id,
                    range=chunk_range,
                    valueInputOption='USER_ENTERED',
                    body={'values': chunk},
                ).execute()

            logger.info(f"{sheet_name}: {len(rows)}行書き込み完了")

        except Exception as e:
            logger.error(f"{sheet_name}書き込みエラー: {e}")
            raise

    def _append_to_sheet(self, sheet_key: str, rows: List[list]):
        if not rows:
            return

        sheet_name = Config.SHEET_NAMES[sheet_key]
        service = self._get_service()

        try:
            service.spreadsheets().values().append(
                spreadsheetId=self.spreadsheet_id,
                range=f'{sheet_name}!A1',
                valueInputOption='USER_ENTERED',
                body={'values': rows},
            ).execute()
            logger.info(f"{sheet_name}: {len(rows)}行追記完了")

        except Exception as e:
            logger.error(f"{sheet_name}追記エラー: {e}")
            raise
