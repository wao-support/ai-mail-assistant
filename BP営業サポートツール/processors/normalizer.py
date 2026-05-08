"""企業名 名寄せモジュール

法人格表記のゆれを統一し、バリデーション・重複判定を行う。
Big Sight主催者名からの企業名抽出に特化。
"""
import re
import unicodedata
from typing import List, Dict, Tuple

import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from utils.logger import setup_logger

logger = setup_logger(__name__)

# 法人格の正規化マッピング
CORPORATE_TYPE_MAP = {
    '（株）': '株式会社',
    '(株)': '株式会社',
    '㈱': '株式会社',
    '（有）': '有限会社',
    '(有)': '有限会社',
    '㈲': '有限会社',
    '（一社）': '一般社団法人',
    '(一社)': '一般社団法人',
    '（社）': '一般社団法人',
    '(社)': '一般社団法人',
    '（一財）': '一般財団法人',
    '(一財)': '一般財団法人',
    '（財）': '一般財団法人',
    '(財)': '一般財団法人',
    '（公社）': '公益社団法人',
    '(公社)': '公益社団法人',
    '（公財）': '公益財団法人',
    '(公財)': '公益財団法人',
    '（NPO）': 'NPO法人',
    '(NPO)': 'NPO法人',
    '（同）': '合同会社',
    '(同)': '合同会社',
}

# 有効な法人格キーワード（バリデーション用）
VALID_CORPORATE_TYPES = [
    '株式会社', '有限会社', '合同会社', '合資会社', '合名会社',
    '一般社団法人', '一般財団法人', '公益社団法人', '公益財団法人',
    'NPO法人', '特定非営利活動法人',
    '独立行政法人', '国立研究開発法人',
    '学校法人', '医療法人', '社会福祉法人',
]

# 法人格なしでも企業名として許容するパターン
VALID_ORG_PATTERNS = [
    r'実行委員会$',
    r'事務局$',
    r'協会$',
    r'協議会$',
    r'連合会$',
    r'工業会$',
    r'新聞社$',
    r'Co\.,?\s*Ltd',
    r'Inc\.',
    r'Corp\.',
    r'LLC',
    r'Ltd\.?$',
]

# 明らかにゴミなパターン（除外用）
GARBAGE_PATTERNS = [
    r'^者',         # 「主催者」の「者」から始まるゴミ
    r'^を',
    r'^の',
    r'^に',
    r'^より',
    r'^まで',
    r'^する',
    r'^した',
    r'^など',
    r'^ぜひ',
    r'^ください',
    r'ご覧ください',
    r'お問い合わせ',
    r'お問合せ',
    r'ご注意',
    r'ご連絡',
    r'ご登録',
    r'ご参照',
    r'ご紹介',
    r'ご案内',
    r'お断り',
    r'お知らせ',
    r'ございま',
    r'させていただ',
    r'思われます',
    r'ありません',
    r'相次いで',
    r'TEL[：:]',
    r'FAX[：:]',
    r'Email[：:]',
    r'E-mail[：:]',
    r'@[a-zA-Z]',  # メールアドレス
    r'https?://',   # URL
    r'^\d{4}$',     # 年のみ
    r'^\d+$',       # 数字のみ
    r'^[a-zA-Z]{1,3}$',  # 短い英字のみ
    r'詐欺',
    r'フィッシング',
    r'クレジットカード',
    r'来場をお断',
    r'未成年者',
    r'裁量により',
    r'適切でない',
    r'一切責任',
    r'噛み合い',
    r'過去のイベント',
    r'注意事項',
    r'概要$',
    r'支援$',
    r'支援展$',
    r'^会社$',
]


def normalize_company_name(name: str) -> str:
    """企業名を正規化する"""
    if not name:
        return ''

    result = name.strip()
    result = re.sub(r'[\n\r\t]', '', result)
    result = unicodedata.normalize('NFKC', result)

    for abbrev, full in CORPORATE_TYPE_MAP.items():
        norm_abbrev = unicodedata.normalize('NFKC', abbrev)
        result = result.replace(norm_abbrev, full)

    result = re.sub(r'[\s　]+', ' ', result)
    result = result.strip(' 　・／/,、。.')

    return result


def is_valid_company_name(name: str) -> bool:
    """企業名として妥当かどうかを判定する

    Returns:
        True: 有効な企業名, False: ゴミデータ
    """
    if not name:
        return False

    # 短すぎる（2文字以下）
    if len(name) <= 2:
        return False

    # 長すぎる（60文字超 → 文章断片の可能性大）
    if len(name) > 60:
        return False

    # ゴミパターンに一致
    for pattern in GARBAGE_PATTERNS:
        if re.search(pattern, name, re.IGNORECASE):
            return False

    # 法人格を含む → 有効
    for corp_type in VALID_CORPORATE_TYPES:
        if corp_type in name:
            return True

    # 法人格なしでも許容されるパターン
    for pattern in VALID_ORG_PATTERNS:
        if re.search(pattern, name, re.IGNORECASE):
            return True

    # 法人格なし＆許容パターンなし → ただし短めの名前は許容
    # （例: 「日本食糧新聞社」は新聞社パターンで拾う）
    # 残りは除外
    return False


def extract_company_names_from_event(event: Dict) -> List[Tuple[str, str]]:
    """イベント情報から企業名を抽出する（主催者名フィールドのみ使用）

    Args:
        event: イベント情報のdict（Big Sightスクレイパー出力）

    Returns:
        [(原文企業名, 名寄せ後企業名), ...] のリスト
    """
    names = []

    # Big Sightの「主催者名」のみを使用（クリーンなデータ）
    raw_name = event.get('主催者名', '').strip()
    if not raw_name:
        return names

    # 複数企業の分割（「／」「/」区切り）
    split_names = re.split(r'[／/]', raw_name)

    for sn in split_names:
        sn = sn.strip()
        if len(sn) < 2:
            continue

        normalized = normalize_company_name(sn)
        if not normalized:
            continue

        # バリデーション
        if is_valid_company_name(normalized):
            names.append((sn, normalized))
        else:
            logger.debug(f"企業名バリデーション除外: '{sn}'")

    return names


def deduplicate_companies(
    all_companies: List[Dict],
) -> Tuple[List[Dict], int]:
    """企業リストの重複除外

    優先順:
    1. 法人番号で重複判定
    2. 名寄せ後企業名 + イベントURL
    3. 名寄せ後企業名
    """
    seen_corp_numbers = set()
    seen_name_url = set()
    seen_names = set()
    unique = []
    removed = 0

    for company in all_companies:
        corp_num = company.get('法人番号', '')
        norm_name = company.get('名寄せ後企業名', '')
        event_url = company.get('イベントURL', '')

        # 1. 法人番号で判定
        if corp_num and corp_num != '':
            if corp_num in seen_corp_numbers:
                removed += 1
                continue
            seen_corp_numbers.add(corp_num)
            unique.append(company)
            continue

        # 2. 名寄せ後企業名 + イベントURL
        name_url_key = f"{norm_name}|{event_url}"
        if name_url_key in seen_name_url:
            removed += 1
            continue
        seen_name_url.add(name_url_key)

        # 3. 名寄せ後企業名のみ
        if norm_name in seen_names:
            unique.append(company)
            continue
        seen_names.add(norm_name)
        unique.append(company)

    logger.info(f"重複除外: {removed}件除外 → {len(unique)}件に絞込")
    return unique, removed


if __name__ == '__main__':
    """単体テスト"""
    print("=== 名寄せテスト ===")
    test_cases = [
        ('（株）リードエグジビションジャパン', True),
        ('㈱テスト', True),
        ('(一社)日本能率協会', True),
        ('RX Japan合同会社', True),
        ('者サイトをご覧ください', False),
        ('を装った詐欺の報告が相次いでいます', False),
        ('より協力会社をご紹介', False),
        ('までお問い合わせください', False),
        ('未成年者の来場をお断り', False),
        ('2025', False),
        ('概要', False),
        ('支援', False),
        ('会社', False),
        ('プレミアム・フードショー実行委員会', True),
        ('サイクルモード実行委員会', True),
    ]
    for raw, expected_valid in test_cases:
        normalized = normalize_company_name(raw)
        valid = is_valid_company_name(normalized)
        status = 'OK' if valid == expected_valid else 'NG'
        print(f"  {status}: '{raw}' → valid={valid} (expected={expected_valid})")
