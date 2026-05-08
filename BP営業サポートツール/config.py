"""設定管理モジュール"""
import os
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), '.env'))


class Config:
    """アプリケーション設定"""

    # Google Spreadsheet
    SPREADSHEET_ID = os.getenv('SPREADSHEET_ID', '')

    # 国税庁法人番号API
    NTA_APP_ID = os.getenv('NTA_APP_ID', '')

    # Google API認証
    CREDENTIALS_PATH = os.getenv(
        'CREDENTIALS_PATH',
        os.path.join(os.path.dirname(__file__), 'credentials.json')
    )
    TOKEN_PICKLE_PATH = os.getenv(
        'TOKEN_PICKLE_PATH',
        os.path.join(os.path.dirname(__file__), 'token.pickle')
    )

    # スクレイピング設定
    REQUEST_INTERVAL = int(os.getenv('REQUEST_INTERVAL', '3'))
    MAX_RETRY = int(os.getenv('MAX_RETRY', '2'))

    # Big Sight設定
    BIGSIGHT_BASE_URL = 'https://www.bigsight.jp'
    BIGSIGHT_EVENT_URL = 'https://www.bigsight.jp/visitor/event/'
    BIGSIGHT_SEARCH_URL = 'https://www.bigsight.jp/visitor/event/search.php'

    # 将来の会場横展開用
    VENUES = {
        'bigsight': {
            'name': '東京ビッグサイト',
            'base_url': 'https://www.bigsight.jp',
            'event_url': 'https://www.bigsight.jp/visitor/event/',
            'search_url': 'https://www.bigsight.jp/visitor/event/search.php',
        }
    }

    # シート名
    SHEET_NAMES = {
        'events_raw': 'イベント一覧_raw',
        'manual_review': '要手動確認',
        'company_info': '企業情報',
        'sales_list': '営業リスト',
        'errors': 'エラーログ',
        'execution_log': '実行ログ',
    }

    # NTA API
    NTA_API_BASE = 'https://api.houjin-bangou.nta.go.jp/4'

    # User-Agent
    USER_AGENT = 'SalesListBot/1.0'
