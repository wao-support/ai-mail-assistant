"""東京ビッグサイト イベント一覧スクレイパー

bigsight.jp/visitor/event/ からイベント一覧を取得する。
将来の会場横展開のため BaseScraper を定義し継承する構造。
"""
import re
import time
from abc import ABC, abstractmethod
from datetime import datetime
from typing import List, Dict, Optional

import requests
from bs4 import BeautifulSoup

import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from config import Config
from utils.logger import setup_logger

logger = setup_logger(__name__)


class BaseScraper(ABC):
    """会場スクレイパー基底クラス（将来の横展開用）"""

    def __init__(self, venue_config: dict):
        self.venue_config = venue_config
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': Config.USER_AGENT,
            'Accept-Language': 'ja,en;q=0.9',
        })

    @abstractmethod
    def fetch_events(self) -> List[Dict]:
        """イベント一覧を取得する"""
        pass

    def _get_with_retry(self, url: str, params: dict = None) -> Optional[requests.Response]:
        """リトライ付きGETリクエスト"""
        for attempt in range(Config.MAX_RETRY + 1):
            try:
                logger.info(f"GET {url} (attempt {attempt + 1})")
                resp = self.session.get(url, params=params, timeout=30)
                resp.raise_for_status()
                return resp
            except requests.RequestException as e:
                logger.warning(f"リクエスト失敗 ({attempt + 1}/{Config.MAX_RETRY + 1}): {e}")
                if attempt < Config.MAX_RETRY:
                    time.sleep(Config.REQUEST_INTERVAL)
        return None


class BigSightScraper(BaseScraper):
    """東京ビッグサイト イベント一覧スクレイパー"""

    def __init__(self):
        super().__init__(Config.VENUES['bigsight'])

    def fetch_events(self) -> List[Dict]:
        """全ページのイベント一覧を取得"""
        all_events = []
        page = 1

        while True:
            logger.info(f"=== ページ {page} を取得中 ===")

            if page == 1:
                resp = self._get_with_retry(self.venue_config['event_url'])
            else:
                resp = self._get_with_retry(
                    self.venue_config['search_url'],
                    params={'page': page}
                )

            if not resp:
                logger.error(f"ページ {page} の取得に失敗。終了します。")
                break

            soup = BeautifulSoup(resp.content, 'lxml')
            events = self._parse_event_list(soup)

            if not events:
                logger.info(f"ページ {page} にイベントなし。終了。")
                break

            all_events.extend(events)
            logger.info(f"ページ {page}: {len(events)}件取得")

            # 次ページがあるか確認
            if not self._has_next_page(soup, page):
                break

            page += 1
            time.sleep(Config.REQUEST_INTERVAL)

        logger.info(f"合計 {len(all_events)}件のイベントを取得")
        return all_events

    def _parse_event_list(self, soup: BeautifulSoup) -> List[Dict]:
        """イベント一覧ページをパースする"""
        events = []
        today = datetime.now().strftime('%Y-%m-%d')

        # イベントカード: メインコンテンツ内のイベントブロックを探す
        # 各イベントは h3 タイトル + dl/dt/dd の詳細 + 主催者情報ボックスで構成
        content_area = soup.find('div', class_='resultContent') or soup.find('main') or soup

        # h3 タグをイベント区切りとして使う
        event_titles = content_area.find_all('h3')

        for title_tag in event_titles:
            try:
                event = self._parse_single_event(title_tag, today)
                if event:
                    events.append(event)
            except Exception as e:
                logger.warning(f"イベントパースエラー: {e}")
                continue

        return events

    def _parse_single_event(self, title_tag, today: str) -> Optional[Dict]:
        """個別イベントをパース"""
        # イベント名・URL
        link = title_tag.find('a')
        if not link:
            return None

        event_name = link.get_text(strip=True)
        # 「新規タブで開きます」等のテキストを除去
        event_name = re.sub(r'新規タブで開きます$', '', event_name).strip()

        event_url = link.get('href', '')
        if event_url and not event_url.startswith('http'):
            event_url = Config.BIGSIGHT_BASE_URL + event_url

        # イベント名が空なら無視
        if not event_name:
            return None

        # dl/dt/dd から詳細情報を取得
        # title_tag の後の兄弟要素を走査する
        details = {}
        organizer = ''
        contact = ''

        # title_tag の親ブロックまたは後続の兄弟要素から dl を探す
        parent = title_tag.parent
        if parent is None:
            parent = title_tag

        # 次のイベントタイトルまでの範囲を走査
        current = title_tag.next_sibling
        siblings_to_check = []
        while current:
            if current.name == 'h3':
                break
            siblings_to_check.append(current)
            current = current.next_sibling

        # 親要素内も含めて探索
        search_area = parent
        for dl in search_area.find_all('dl'):
            dts = dl.find_all('dt')
            dds = dl.find_all('dd')
            for dt, dd in zip(dts, dds):
                label = dt.get_text(strip=True)
                value = dd.get_text(strip=True)
                details[label] = value

        # 主催者情報: 「主催者」「連絡先」ラベルを探す
        for el in search_area.find_all(['dt', 'th', 'span', 'div', 'p']):
            text = el.get_text(strip=True)
            if text == '主催者' or text == '主催':
                next_el = el.find_next_sibling() or el.find_next()
                if next_el:
                    organizer = next_el.get_text(strip=True)
            elif text == '連絡先':
                next_el = el.find_next_sibling() or el.find_next()
                if next_el:
                    contact = next_el.get_text(strip=True)

        # 利用施設（会場）
        venue = details.get('利用施設', '')

        # 開催期間
        period = details.get('開催期間', '')

        # 入場区分（商談 or 一般）
        entry_type = details.get('入場区分', '')

        return {
            '取得日': today,
            'イベント名': event_name,
            '開催期間': period,
            '会場': venue,
            'イベントURL': event_url,
            '主催者名': organizer,
            '連絡先': contact,
            '入場区分': entry_type,
        }

    def _has_next_page(self, soup: BeautifulSoup, current_page: int) -> bool:
        """次のページが存在するか確認"""
        # 「次へ」リンクを探す
        next_links = soup.find_all('a', string=re.compile(r'次へ|次の|>'))
        if next_links:
            return True

        # ページネーションリンク内に current_page + 1 があるか
        paging = soup.find_all('a', href=re.compile(r'page='))
        for link in paging:
            href = link.get('href', '')
            match = re.search(r'page=(\d+)', href)
            if match and int(match.group(1)) == current_page + 1:
                return True

        return False


if __name__ == '__main__':
    """単体テスト用"""
    scraper = BigSightScraper()
    events = scraper.fetch_events()
    print(f"\n取得件数: {len(events)}")
    for i, ev in enumerate(events[:5]):
        print(f"\n--- イベント {i+1} ---")
        for k, v in ev.items():
            print(f"  {k}: {v}")
