from flask import Blueprint, jsonify, request
from models import db, Book

books_bp = Blueprint('books_api', __name__, url_prefix='/api/books')

@books_bp.route('/', methods=['GET'])
def get_books():
    """Retrieve all books (library view) ordered by creation date."""
    books = Book.query.order_by(Book.created_at.desc()).all()
    return jsonify([b.to_dict() for b in books]), 200

@books_bp.route('/<int:book_id>', methods=['GET'])
def get_book(book_id):
    """Retrieve details for a specific book including its segments/chapters."""
    book = Book.query.get_or_404(book_id)
    return jsonify({
        **book.to_dict(),
        'segments': [s.to_dict() for s in book.segments]
    }), 200

@books_bp.route('/', methods=['POST'])
def create_book():
    """Create a new book entry before uploading files."""
    data = request.json
    if not data or not data.get('title'):
        return jsonify({'error': 'Title is required'}), 400
        
    from models import Tag
    book = Book(
        title=data['title'],
        type=data.get('type', 'PDF'),
        complexity=data.get('complexity', 5),
        custom_prompt=data.get('custom_prompt', None)
    )
    
    tags = data.get('tags', [])
    for t_name in tags:
        t_name = t_name.strip()
        if not t_name: continue
        tag = Tag.query.filter_by(name=t_name).first()
        if not tag:
            tag = Tag(name=t_name)
            db.session.add(tag)
        book.tags.append(tag)
        
    db.session.add(book)
    db.session.commit()
    
    return jsonify(book.to_dict()), 201

@books_bp.route('/<int:book_id>', methods=['DELETE'])
def delete_book(book_id):
    """Delete a book, its physical assets, and all associated data."""
    book = Book.query.get_or_404(book_id)
    
    import shutil, os
    from config import Config
    
    book_dir = os.path.join(Config.UPLOAD_FOLDER, f"book_{book_id}")
    if os.path.exists(book_dir) and os.path.isdir(book_dir):
        try:
            shutil.rmtree(book_dir)
        except Exception as e:
            print(f"Error removing physical directory {book_dir}: {e}")
            
    db.session.delete(book)
    db.session.commit()
    return jsonify({'msg': 'Book deleted successfully'}), 200

@books_bp.route('/<int:book_id>/cancel', methods=['POST'])
def cancel_task(book_id):
    """Revoke the active processing task for a book."""
    book = Book.query.get_or_404(book_id)
    if book.active_task_id:
        from tasks import celery
        print(f"[!] Revoking active task {book.active_task_id} for Book {book_id}...")
        celery.control.revoke(book.active_task_id, terminate=True)
        book.processing_status = 'cancelled'
        book.active_task_id = None
        db.session.commit()
        return jsonify({'msg': 'Task cancelled successfully'}), 200
    return jsonify({'error': 'No active task found for this book'}), 404

from models import KnowledgeNode, UploadSegment, Tag
import os
from config import Config

@books_bp.route('/<int:book_id>/segments/<int:segment_id>', methods=['DELETE'])
def delete_segment(book_id, segment_id):
    """Delete a specific segment, its knowledge nodes, and physical files."""
    segment = UploadSegment.query.filter_by(id=segment_id, book_id=book_id).first_or_404()
    
    # 1. Delete physical files
    if segment.source_assets:
        for asset in segment.source_assets:
            full_path = os.path.join(Config.UPLOAD_FOLDER, asset)
            if os.path.exists(full_path):
                try:
                    os.remove(full_path)
                except Exception as e:
                    print(f"Error deleting file {full_path}: {e}")
                    
    # 2. Delete nodes and segment
    KnowledgeNode.query.filter_by(segment_id=segment.id).delete()
    db.session.delete(segment)
    db.session.commit()
    return jsonify({'msg': 'Segment deleted successfully'}), 200
    
@books_bp.route('/tags', methods=['GET'])
def get_all_tags():
    tags = Tag.query.order_by(Tag.name).all()
    return jsonify([t.name for t in tags]), 200

@books_bp.route('/<int:book_id>/metadata', methods=['PUT'])
def update_metadata(book_id):
    book = Book.query.get_or_404(book_id)
    data = request.json
    
    if 'custom_prompt' in data:
        book.custom_prompt = data['custom_prompt']
        
    if 'tags' in data:
        book.tags.clear()
        for t_name in data['tags']:
            t_name = t_name.strip()
            if not t_name: continue
            tag = Tag.query.filter_by(name=t_name).first()
            if not tag:
                tag = Tag(name=t_name)
                db.session.add(tag)
            book.tags.append(tag)
            
    db.session.commit()
    return jsonify(book.to_dict()), 200

import io
from flask import send_file

@books_bp.route('/<int:book_id>/export_pdf', methods=['GET'])
def export_book_pdf(book_id):
    """Generate an HTML-structured PDF dump of the book's contents."""
    book = Book.query.get_or_404(book_id)
    
    try:
        from xhtml2pdf import pisa
        import markdown
    except ImportError:
        return jsonify({'error': 'PDF generation libraries (xhtml2pdf, markdown) are not installed.'}), 500

    html_content = f"""
    <html>
    <head>
        <style>
            @page {{
                size: a4 portrait;
                margin: 2cm;
            }}
            body {{
                font-family: Helvetica, sans-serif;
                font-size: 11pt;
                line-height: 1.5;
            }}
            h1 {{ font-size: 24pt; text-align: center; color: #333; }}
            h2 {{ font-size: 16pt; color: #444; margin-top: 15px; border-bottom: 1px solid #ddd; padding-bottom: 5px; }}
            h3 {{ font-size: 13pt; color: #555; margin-top: 15px; }}
            .metadata {{ text-align: center; margin-bottom: 30px; color: #666; font-size: 12pt; }}
            .page-break {{ pdf-pagebreak-before: always; }}
            pre {{ background-color: #f5f5f5; padding: 10px; font-size: 9pt; white-space: pre-wrap; word-wrap: break-word; border: 1px solid #e0e0e0; }}
            code {{ background-color: #f5f5f5; padding: 2px 4px; font-size: 10pt; }}
            blockquote {{ border-left: 4px solid #ccc; margin-left: 0; padding-left: 10px; color: #666; font-style: italic; }}
            ul, ol {{ margin-bottom: 15px; }}
            li {{ margin-bottom: 5px; }}
        </style>
    </head>
    <body>
        <h1>{book.title}</h1>
        <div class="metadata">
            <p><strong>Status:</strong> {book.processing_status.capitalize() if book.processing_status else 'Unknown'}</p>
            <p><strong>Tags:</strong> {', '.join([t.name for t in book.tags]) if book.tags else 'None'}</p>
            <p><strong>Added:</strong> {book.created_at.strftime('%Y-%m-%d %H:%M') if book.created_at else 'Unknown Date'}</p>
        </div>
    """
    
    for i, segment in enumerate(book.segments):
        html_content += f'<div class="page-break"></div>'
        html_content += f'<h2>Segment {segment.index}: {segment.title or "Untitled"}</h2>'
        
        if segment.summary:
            html_content += '<h3>AI Summary</h3>'
            # Render Markdown into well-formed HTML
            html_summary = markdown.markdown(segment.summary)
            html_content += f'<div>{html_summary}</div>'
            
    html_content += "</body></html>"
    
    pdf_bytes = io.BytesIO()
    
    # Render the HTML blob into a PDF stream
    pisa_status = pisa.CreatePDF(html_content, dest=pdf_bytes)
    
    if pisa_status.err:
        return jsonify({'error': 'Failed to generate PDF from HTML content.'}), 500
        
    pdf_bytes.seek(0)
    filename = f"{book.title.replace(' ', '_')[:30]}_Dump.pdf"
    
    return send_file(
        pdf_bytes,
        mimetype='application/pdf',
        as_attachment=True,
        download_name=filename
    )
