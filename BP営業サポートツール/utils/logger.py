"""ログ管理モジュール

コンソール＋ファイル出力のロガーを提供。
実行統計をまとめてシートに出力するための集計機能も含む。
"""
import logging
import os
from datetime import datetime


class ExecutionStats:
    """実行統計を追跡するクラス"""

    def __init__(self):
        self.start_time = datetime.now()
        self.event_count = 0
        self.url_success_count = 0
        self.company_extract_success = 0
        self.company_info_success = 0
        self.duplicate_removed = 0
        self.error_count = 0
        self.errors = []  # [(timestamp, step, message), ...]
        self.status = '実行中'

    def add_error(self, step: str, message: str):
        """エラーを記録"""
        self.error_count += 1
        self.errors.append((
            datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
            step,
            message
        ))

    def to_log_row(self) -> list:
        """実行ログシート用の行データを生成"""
        end_time = datetime.now()
        duration = (end_time - self.start_time).total_seconds()
        return [
            self.start_time.strftime('%Y-%m-%d %H:%M:%S'),
            end_time.strftime('%Y-%m-%d %H:%M:%S'),
            f'{duration:.0f}秒',
            self.event_count,
            self.url_success_count,
            self.company_extract_success,
            self.company_info_success,
            self.duplicate_removed,
            self.error_count,
            self.status,
            '; '.join([e[2] for e in self.errors[:10]]) if self.errors else '',
        ]


def setup_logger(name: str = 'sales_list', log_dir: str = None) -> logging.Logger:
    """ロガーのセットアップ

    Args:
        name: ロガー名
        log_dir: ログファイルの出力ディレクトリ

    Returns:
        設定済みのロガー
    """
    logger = logging.getLogger(name)
    if logger.handlers:
        return logger

    logger.setLevel(logging.DEBUG)

    # コンソール出力
    console_handler = logging.StreamHandler()
    console_handler.setLevel(logging.INFO)
    console_format = logging.Formatter(
        '%(asctime)s [%(levelname)s] %(message)s',
        datefmt='%H:%M:%S'
    )
    console_handler.setFormatter(console_format)
    logger.addHandler(console_handler)

    # ファイル出力
    if log_dir is None:
        log_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'logs')
    os.makedirs(log_dir, exist_ok=True)

    log_file = os.path.join(
        log_dir,
        f'execution_{datetime.now().strftime("%Y%m%d_%H%M%S")}.log'
    )
    file_handler = logging.FileHandler(log_file, encoding='utf-8')
    file_handler.setLevel(logging.DEBUG)
    file_format = logging.Formatter(
        '%(asctime)s [%(levelname)s] %(name)s - %(message)s'
    )
    file_handler.setFormatter(file_format)
    logger.addHandler(file_handler)

    return logger
