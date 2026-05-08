"""営業リスト作成ツール メインオーケストレーター

全体の処理フローを制御する。
1. イベント一覧取得（Big Sight）
2. 企業名名寄せ（主催者名から抽出）
3. 会社情報取得（NTA API / Webスクレイピング）
4. 重複除外
5. Googleスプレッドシート出力
6. ログ出力
"""
import sys
import os
from datetime import datetime

PROJECT_ROOT = os.path.dirname(__file__)
sys.path.insert(0, PROJECT_ROOT)

from config import Config
from utils.logger import setup_logger, ExecutionStats
from scrapers.bigsight_scraper import BigSightScraper
from processors.normalizer import (
    normalize_company_name,
    extract_company_names_from_event,
    deduplicate_companies,
)
from processors.company_lookup import CompanyLookup
from output.sheets_writer import SheetsWriter


logger = setup_logger('main')


def main():
    """メイン処理"""
    stats = ExecutionStats()
    logger.info("=" * 60)
    logger.info("営業リスト作成ツール 開始")
    logger.info(f"実行日時: {stats.start_time.strftime('%Y-%m-%d %H:%M:%S')}")
    logger.info("=" * 60)

    if not Config.SPREADSHEET_ID:
        logger.error("SPREADSHEET_ID が設定されていません。.env を確認してください。")
        stats.status = 'エラー終了'
        stats.add_error('初期化', 'SPREADSHEET_ID未設定')
        return

    sheets = SheetsWriter()

    try:
        # === ステップ0: シート準備 ===
        logger.info("\n--- ステップ0: シート準備 ---")
        sheets.ensure_sheets_exist()

        # === ステップ1: イベント一覧取得 ===
        logger.info("\n--- ステップ1: イベント一覧取得 ---")
        scraper = BigSightScraper()
        events = scraper.fetch_events()
        stats.event_count = len(events)

        if not events:
            logger.error("イベントが1件も取得できませんでした")
            stats.status = 'エラー終了'
            stats.add_error('イベント取得', '取得件数0')
            _finalize(sheets, stats)
            return

        logger.info(f"イベント取得完了: {len(events)}件")

        # イベント一覧_raw に出力
        sheets.write_events_raw(events)

        # 要手動確認シートにイベントURL一覧を出力
        # （手動で運営会社名・事務局名を補完するためのリスト）
        sheets.write_manual_review(events)

        stats.url_success_count = len(events)

        # === ステップ2: 企業名名寄せ ===
        logger.info("\n--- ステップ2: 企業名名寄せ（主催者名から抽出）---")
        company_records = []

        for event in events:
            names = extract_company_names_from_event(event)
            if names:
                stats.company_extract_success += 1

            for raw_name, normalized_name in names:
                record = {
                    '取得日': event.get('取得日', ''),
                    'イベント名': event.get('イベント名', ''),
                    '開催期間': event.get('開催期間', ''),
                    '会場': event.get('会場', ''),
                    'イベントURL': event.get('イベントURL', ''),
                    '主催者名（原文）': event.get('主催者名', ''),
                    '運営会社名（原文）': '',  # 手動補完用
                    '事務局名（原文）': '',     # 手動補完用
                    '原文企業名': raw_name,
                    '名寄せ後企業名': normalized_name,
                    '会社概要URL': '',
                    '問い合わせURL': '',
                }
                company_records.append(record)

        logger.info(
            f"企業名抽出完了: {len(company_records)}社 "
            f"({stats.company_extract_success}/{len(events)}イベントから抽出)"
        )

        # === ステップ3: 会社情報取得 ===
        logger.info("\n--- ステップ3: 会社情報取得 ---")
        lookup = CompanyLookup()

        # ユニーク企業名でキャッシュして検索回数を最小化
        unique_names = {}
        for rec in company_records:
            norm = rec.get('名寄せ後企業名', '')
            if norm and norm not in unique_names:
                unique_names[norm] = rec.get('会社概要URL', '')

        company_info_cache = {}
        for i, (name, url) in enumerate(unique_names.items()):
            logger.info(f"  ({i+1}/{len(unique_names)}) {name[:40]}")
            try:
                info = lookup.lookup(name, url)
                company_info_cache[name] = info
                if info.get('正式法人名') or info.get('法人番号'):
                    stats.company_info_success += 1
            except Exception as e:
                logger.error(f"  会社情報取得エラー: {e}")
                stats.add_error('会社情報取得', f"{name}: {str(e)}")
                company_info_cache[name] = {'情報取得ステータス': '要確認'}

        logger.info(
            f"会社情報取得完了: {stats.company_info_success}/{len(unique_names)}件成功"
        )

        # キャッシュ結果を各レコードにマージ
        for rec in company_records:
            norm = rec.get('名寄せ後企業名', '')
            if norm in company_info_cache:
                for k, v in company_info_cache[norm].items():
                    if k not in rec or not rec[k]:
                        rec[k] = v

        # 企業情報シート出力
        company_info_rows = []
        for name, info in company_info_cache.items():
            row = {'名寄せ後企業名': name, '原文企業名': '', **info}
            company_info_rows.append(row)
        sheets.write_company_info(company_info_rows)

        # === ステップ4: 重複除外 & 営業リスト出力 ===
        logger.info("\n--- ステップ4: 重複除外 & 営業リスト出力 ---")
        unique_records, removed = deduplicate_companies(company_records)
        stats.duplicate_removed = removed

        sales_records = []
        for rec in unique_records:
            sales_rec = {
                '取得日': rec.get('取得日', ''),
                'イベント名': rec.get('イベント名', ''),
                '開催期間': rec.get('開催期間', ''),
                '会場': rec.get('会場', ''),
                'イベントURL': rec.get('イベントURL', ''),
                '主催者名（原文）': rec.get('主催者名（原文）', ''),
                '運営会社名（原文）': rec.get('運営会社名（原文）', ''),
                '事務局名（原文）': rec.get('事務局名（原文）', ''),
                '名寄せ後企業名': rec.get('名寄せ後企業名', ''),
                '正式法人名': rec.get('正式法人名', ''),
                '法人番号': rec.get('法人番号', ''),
                '本社所在地': rec.get('本社所在地', ''),
                '企業サイトURL': rec.get('企業サイトURL', ''),
                '会社概要URL': rec.get('会社概要URL', ''),
                '問い合わせURL': rec.get('問い合わせURL', ''),
                '電話番号': rec.get('電話番号', ''),
                '事業内容': rec.get('事業内容', ''),
                '取得ステータス': rec.get('情報取得ステータス', ''),
                '備考': '',
            }
            sales_records.append(sales_rec)

        sheets.write_sales_list(sales_records)
        logger.info(f"営業リスト出力完了: {len(sales_records)}件")

        stats.status = '正常終了'

    except Exception as e:
        logger.error(f"予期せぬエラー: {e}")
        import traceback
        traceback.print_exc()
        stats.status = 'エラー終了'
        stats.add_error('全体処理', str(e))

    finally:
        _finalize(sheets, stats)


def _finalize(sheets: SheetsWriter, stats: ExecutionStats):
    """最終処理: エラーログ・実行ログの書き込み"""
    try:
        if stats.errors:
            error_rows = []
            for ts, step, msg in stats.errors:
                error_rows.append((ts, step, msg, '', ''))
            sheets.write_errors(error_rows)

        sheets.write_execution_log(stats.to_log_row())
    except Exception as e:
        logger.error(f"最終ログ出力エラー: {e}")

    logger.info("\n" + "=" * 60)
    logger.info("処理完了サマリー")
    logger.info(f"  ステータス: {stats.status}")
    logger.info(f"  イベント取得: {stats.event_count}件")
    logger.info(f"  企業名抽出成功: {stats.company_extract_success}件")
    logger.info(f"  会社情報取得成功: {stats.company_info_success}件")
    logger.info(f"  重複除外: {stats.duplicate_removed}件")
    logger.info(f"  エラー: {stats.error_count}件")
    logger.info("=" * 60)


if __name__ == '__main__':
    main()
