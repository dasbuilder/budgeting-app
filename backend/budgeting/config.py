from pathlib import Path
from dotenv import dotenv_values

BACKEND_PATH = Path(__file__).parent.parent  # backend/

_env = dotenv_values(BACKEND_PATH / '.env')
DB_ENCRYPTION_KEY = _env.get('DB_ENCRYPTION_KEY', '')
if not DB_ENCRYPTION_KEY:
    print("WARNING: DB_ENCRYPTION_KEY not set — debt data encryption will fail at write time.")
ANTHROPIC_API_KEY = _env.get('ANTHROPIC_API_KEY', '')
GEMINI_API_KEY = _env.get('GEMINI_API_KEY', '')

_DB_PATH = BACKEND_PATH / 'instance' / 'budgeting_app.db'
_DB_PATH.parent.mkdir(exist_ok=True)


class Config:
    SQLALCHEMY_DATABASE_URI = f'sqlite:///{_DB_PATH}'
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    MAX_CONTENT_LENGTH = 16 * 1024 * 1024
