from flask import Flask, jsonify
from config import Config
from models import db
from sqlalchemy import text

def create_app(config_class=Config):
    app = Flask(__name__, static_folder='../frontend', static_url_path='/')
    app.config.from_object(config_class)

    db.init_app(app)

    with app.app_context():
        # Execute raw SQL to ensure pgvector and pg_trgm extensions exist
        db.session.execute(text('CREATE EXTENSION IF NOT EXISTS vector;'))
        db.session.execute(text('CREATE EXTENSION IF NOT EXISTS pg_trgm;'))
        db.session.commit()
        db.create_all()

    @app.route('/health')
    def health_check():
        return jsonify({'status': 'ok'})
        
    @app.route('/')
    def index():
        return app.send_static_file('index.html')

    from flask import send_from_directory
    @app.route('/uploads/<path:filename>')
    def uploaded_file(filename):
        return send_from_directory(app.config['UPLOAD_FOLDER'], filename)

    # Register blueprints (routes)
    from routes.api_books import books_bp
    from routes.api_upload import upload_bp
    from routes.api_search import search_bp
    from routes.api_chat import chat_bp
    from routes.api_quiz import quiz_bp
    
    app.register_blueprint(books_bp)
    app.register_blueprint(upload_bp)
    app.register_blueprint(search_bp)
    app.register_blueprint(chat_bp)
    app.register_blueprint(quiz_bp)
    return app

if __name__ == '__main__':
    app = create_app()
    app.run(host='0.0.0.0', port=5000, debug=True)
