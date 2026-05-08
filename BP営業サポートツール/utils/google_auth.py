"""Google API認証モジュール

既存 obento_deli_automation プロジェクトの認証パターンを移植。
credentials.json / token.pickle を共有利用する。
"""
import os
import pickle
from google.auth.transport.requests import Request
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

from config import Config

SCOPES = [
    'https://www.googleapis.com/auth/drive',
    'https://www.googleapis.com/auth/spreadsheets',
]


def get_creds():
    """認証情報を取得・更新する"""
    creds = None
    token_path = Config.TOKEN_PICKLE_PATH
    credentials_path = Config.CREDENTIALS_PATH

    if os.path.exists(token_path):
        with open(token_path, 'rb') as token:
            creds = pickle.load(token)

    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            if not os.path.exists(credentials_path):
                raise FileNotFoundError(
                    f"認証ファイルが見つかりません: {credentials_path}"
                )
            flow = InstalledAppFlow.from_client_secrets_file(
                credentials_path, SCOPES
            )
            creds = flow.run_local_server(port=0)

        with open(token_path, 'wb') as token:
            pickle.dump(creds, token)

    return creds


def get_sheets_service():
    """Google Sheets APIのサービスオブジェクトを取得"""
    creds = get_creds()
    return build('sheets', 'v4', credentials=creds)


def get_drive_service():
    """Google Drive APIのサービスオブジェクトを取得"""
    creds = get_creds()
    return build('drive', 'v3', credentials=creds)
