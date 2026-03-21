import os
from flask import Blueprint, request, jsonify
from werkzeug.utils import secure_filename
from config import Config
from models import db, Book
from tasks import process_pdf_task, process_image_task

upload_bp = Blueprint('upload_api', __name__, url_prefix='/api/upload')

# Ensure upload directory exists
os.makedirs(Config.UPLOAD_FOLDER, exist_ok=True)

def allowed_file(filename, allowed_extensions):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in allowed_extensions

@upload_bp.route('/pdf/<int:book_id>', methods=['POST'])
def upload_pdf(book_id):
    """Upload a PDF and trigger background processing."""
    book = Book.query.get_or_404(book_id)
    
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400
        
    if file and allowed_file(file.filename, {'pdf'}):
        filename = secure_filename(file.filename)
        save_dir = os.path.join(Config.UPLOAD_FOLDER, f"book_{book_id}", "pdf")
        os.makedirs(save_dir, exist_ok=True)
        save_path = os.path.join(save_dir, filename)
        file.save(save_path)
        
        book.cover_path = save_path # Temporary until thumbnail generation
        db.session.commit()
        
        # Trigger async background task for PDF chunking/embedding
        process_pdf_task.delay(book_id, save_path)
        
        return jsonify({'msg': 'PDF uploaded successfully. Processing started.', 'path': save_path}), 202
        
    return jsonify({'error': 'Invalid file type. Only PDF is allowed.'}), 400

@upload_bp.route('/image/<int:book_id>', methods=['POST'])
def upload_image(book_id):
    """Upload a camera image (for progressive learning) and trigger vision + background processing."""
    book = Book.query.get_or_404(book_id)
    
    if 'files' not in request.files:
        return jsonify({'error': 'No file part'}), 400
    files = request.files.getlist('files')
    if not files or files[0].filename == '':
        return jsonify({'error': 'No selected files'}), 400
        
    session_id = request.form.get('session_id', '1')
    save_dir = os.path.join(Config.UPLOAD_FOLDER, f"book_{book_id}", "image")
    os.makedirs(save_dir, exist_ok=True)
    saved_paths = []
    
    for idx, file in enumerate(files):
        if file and allowed_file(file.filename, {'png', 'jpg', 'jpeg', 'webp'}):
            filename = secure_filename(file.filename)
            save_path = os.path.join(save_dir, f"session_{session_id}_{idx}_{filename}")
            file.save(save_path)
            saved_paths.append(save_path)
            
    if not saved_paths:
        return jsonify({'error': 'Invalid file types. Allowed: png, jpg, jpeg, webp.'}), 400
        
    if not book.cover_path:
        book.cover_path = saved_paths[0]
        db.session.commit()
        
    # Trigger async background task passing the LIST of paths
    process_image_task.delay(book_id, saved_paths, session_id)
    
    return jsonify({'msg': f'{len(saved_paths)} images uploaded successfully. Processing started.', 'paths': saved_paths}), 202
