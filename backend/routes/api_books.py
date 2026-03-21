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
