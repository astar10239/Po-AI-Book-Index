import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    SECRET_KEY = os.environ.get('SECRET_KEY', 'dev-key-default')
    
    # Database
    SQLALCHEMY_DATABASE_URI = os.environ.get('DATABASE_URL', 'postgresql://localhost/po_app')
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    
    # Celery
    CELERY_BROKER_URL = os.environ.get('REDIS_URL', 'redis://localhost:6379/0')
    CELERY_RESULT_BACKEND = os.environ.get('REDIS_URL', 'redis://localhost:6379/0')
    
    # Uploads
    UPLOAD_FOLDER = os.environ.get('UPLOAD_FOLDER', os.path.join(os.getcwd(), 'uploads'))
    MAX_CONTENT_LENGTH = 100 * 1024 * 1024  # 100MB max upload size
    
    # AI Config
    OPENAI_API_BASE = os.environ.get('OPENAI_API_BASE', None)
    OPENAI_API_KEY = os.environ.get('OPENAI_API_KEY', None)
    LLM_MODEL_NAME = os.environ.get('LLM_MODEL_NAME', 'deepseek-v3.2')
    VISION_MODEL_NAME = os.environ.get('VISION_MODEL_NAME', 'qwen-vl')
    EMBEDDINGS_MODEL_NAME = os.environ.get('EMBEDDINGS_MODEL_NAME', 'nomic-embed-text')
    CHAT_CONTEXT_WINDOW = int(os.environ.get('CHAT_CONTEXT_WINDOW', 128000))
    MAX_EXTRACT_CHARS = int(os.environ.get('MAX_EXTRACT_CHARS', 16000))
