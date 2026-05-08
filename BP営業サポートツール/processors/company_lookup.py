"""会社情報取得モジュール

国税庁法人番号公表サイトAPI および 企業公式サイト から会社情報を取得する。
"""
import re
import time
import xml.etree.ElementTree as ET
from typing import Dict, Optional, List

import requests
from bs4 import BeautifulSoup

import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from config import Config
from utils.logger import setup_logger

logger = setup_logger(__name__)


class CompanyLookup:
    """会社情報を外部ソースから取得するクラス"""

    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': Config.USER_AGENT,
        })
        self.nta_app_id = Config.NTA_APP_ID

    def lookup(self, company_name: str, company_url: str = '') -> Dict:
        """会社情報を取得する

        Args:
            company_name: 名寄せ後企業名
            company_url: 会社概要ページURL（あれば）

        Returns:
            取得した会社情報dict
        """
        result = {
            '正式法人名': '',
            '法人番号': '',
            '本社所在地': '',
            '企業サイトURL': company_url,
            '問い合わせURL': '',
            '電話番号': '',
            '事業内容': '',
            '情報取得ステータス': '',
        }

        # 1. 国税庁法人番号APIで検索
        if self.nta_app_id:
            nta_info = self._search_nta_api(company_name)
            if nta_info:
                result.update(nta_info)
                result['情報取得ステータス'] = 'NTA API取得済'
                logger.info(f"NTA API取得成功: {company_name} → {nta_info.get('正式法人名', '')}")
        else:
            result['情報取得ステータス'] = 'NTA API未設定'

        # 2. 会社概要ページから補足情報を取得
        if company_url:
            web_info = self._scrape_company_page(company_url)
            if web_info:
                # NTAで取得済みの項目は上書きしない
                for key, value in web_info.items():
                    if not result.get(key) and value:
                        result[key] = value
                if result['情報取得ステータス'] == 'NTA API未設定':
                    result['情報取得ステータス'] = 'Webスクレイピング取得'

        # 未取得項目がある場合
        if not result['正式法人名'] and not result['法人番号']:
            if result['情報取得ステータス'] in ('NTA API未設定', ''):
                result['情報取得ステータス'] = '要確認'

        return result

    def lookup_batch(self, companies: List[Dict]) -> List[Dict]:
        """複数企業の情報を一括取得

        Args:
            companies: [{'名寄せ後企業名': ..., '会社概要URL': ...}, ...]

        Returns:
            会社情報を追加したリスト
        """
        results = []
        for i, company in enumerate(companies):
            name = company.get('名寄せ後企業名', '')
            url = company.get('会社概要URL', '')
            logger.info(f"会社情報取得 ({i+1}/{len(companies)}): {name[:30]}")

            info = self.lookup(name, url)
            combined = {**company, **info}
            results.append(combined)

            time.sleep(max(1, Config.REQUEST_INTERVAL - 1))  # API呼び出し間隔

        return results

    def _search_nta_api(self, company_name: str) -> Optional[Dict]:
        """国税庁法人番号公表サイトAPIで企業を検索

        API仕様: https://api.houjin-bangou.nta.go.jp/4/name
        レスポンス形式: XML
        """
        if not self.nta_app_id:
            return None

        url = f"{Config.NTA_API_BASE}/name"
        params = {
            'id': self.nta_app_id,
            'name': company_name,
            'type': '12',  # XML(UTF-8)
            'mode': '2',   # 部分一致
            'target': '1', # あいまい検索対象: 法人名
        }

        try:
            resp = self.session.get(url, params=params, timeout=15)
            resp.raise_for_status()

            root = ET.fromstring(resp.content)

            # 結果件数チェック
            count_el = root.find('.//count')
            if count_el is None or count_el.text == '0':
                logger.debug(f"NTA API: {company_name} の結果なし")
                return None

            # 最初のマッチを選択
            corp = root.find('.//corporation')
            if corp is None:
                return None

            corp_num = self._get_xml_text(corp, 'corporateNumber')
            corp_name = self._get_xml_text(corp, 'name')
            prefecture = self._get_xml_text(corp, 'prefectureName')
            city = self._get_xml_text(corp, 'cityName')
            street = self._get_xml_text(corp, 'streetNumber')

            address = f"{prefecture}{city}{street}"

            return {
                '正式法人名': corp_name,
                '法人番号': corp_num,
                '本社所在地': address,
            }

        except ET.ParseError as e:
            logger.warning(f"NTA APIレスポンスパースエラー: {e}")
            return None
        except requests.RequestException as e:
            logger.warning(f"NTA APIリクエストエラー: {e}")
            return None

    def _get_xml_text(self, element, tag: str) -> str:
        """XMLエレメントからテキストを安全に取得"""
        el = element.find(tag)
        return el.text.strip() if el is not None and el.text else ''

    def _scrape_company_page(self, url: str) -> Optional[Dict]:
        """会社概要ページをスクレイピングして情報を取得"""
        try:
            resp = self.session.get(url, timeout=15)
            resp.raise_for_status()
            soup = BeautifulSoup(resp.content, 'lxml')

            result = {}

            # テーブルまたは dl/dt/dd から情報抽出
            info_pairs = []

            # table パターン
            for table in soup.find_all('table'):
                for row in table.find_all('tr'):
                    th = row.find('th')
                    td = row.find('td')
                    if th and td:
                        info_pairs.append((
                            th.get_text(strip=True),
                            td.get_text(strip=True),
                        ))

            # dl/dt/dd パターン
            for dl in soup.find_all('dl'):
                dts = dl.find_all('dt')
                dds = dl.find_all('dd')
                for dt, dd in zip(dts, dds):
                    info_pairs.append((
                        dt.get_text(strip=True),
                        dd.get_text(strip=True),
                    ))

            # 情報分類
            for label, value in info_pairs:
                label_lower = label.lower()
                if any(kw in label_lower for kw in ['会社名', '商号', '法人名', '社名']):
                    if not result.get('正式法人名'):
                        result['正式法人名'] = value
                elif any(kw in label_lower for kw in ['所在地', '住所', '本社']):
                    if not result.get('本社所在地'):
                        result['本社所在地'] = value
                elif any(kw in label_lower for kw in ['電話', 'tel', 'phone']):
                    if not result.get('電話番号'):
                        # 電話番号を正規表現で抽出
                        phone = re.search(r'[\d\-（）()]+[\d]', value)
                        result['電話番号'] = phone.group(0) if phone else value
                elif any(kw in label_lower for kw in ['事業内容', '事業概要', '主な事業']):
                    if not result.get('事業内容'):
                        result['事業内容'] = value[:200]  # 長すぎる場合は切り詰め

            return result if result else None

        except Exception as e:
            logger.warning(f"会社ページスクレイピングエラー ({url}): {e}")
            return None


if __name__ == '__main__':
    """単体テスト"""
    lookup = CompanyLookup()
    info = lookup.lookup('リードエグジビションジャパン')
    print("取得結果:")
    for k, v in info.items():
        print(f"  {k}: {v}")
