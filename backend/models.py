from flask_sqlalchemy import SQLAlchemy
from pgvector.sqlalchemy import Vector
from sqlalchemy.sql import func

db = SQLAlchemy()

book_tags = db.Table('book_tags',
    db.Column('book_id', db.Integer, db.ForeignKey('books.id', ondelete="CASCADE"), primary_key=True),
    db.Column('tag_id', db.Integer, db.ForeignKey('tags.id', ondelete="CASCADE"), primary_key=True)
)

class Tag(db.Model):
    __tablename__ = 'tags'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(50), unique=True, nullable=False)

class Book(db.Model):
    __tablename__ = 'books'
    
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(255), nullable=False)
    type = db.Column(db.String(50), nullable=False) # 'pdf', 'image_sequence', 'text'
    cover_path = db.Column(db.String(512), nullable=True)
    complexity = db.Column(db.Integer, default=5) # 1-10
    custom_prompt = db.Column(db.Text, nullable=True)
    active_task_id = db.Column(db.String(255), nullable=True)
    processing_status = db.Column(db.String(50), nullable=True, default='pending') # 'pending', 'processing', 'completed', 'failed', 'cancelled'
    total_pages = db.Column(db.Integer, nullable=True)
    processed_pages = db.Column(db.Integer, nullable=True, default=0)
    created_at = db.Column(db.DateTime(timezone=True), server_default=func.now())
    
    segments = db.relationship('UploadSegment', backref='book', lazy=True, cascade="all, delete-orphan")
    nodes = db.relationship('KnowledgeNode', backref='book', lazy=True, cascade="all, delete-orphan")
    quizzes = db.relationship('Quiz', backref='book', lazy=True, cascade="all, delete-orphan")
    chat_sessions = db.relationship('ChatSession', backref='book_ref', lazy=True, cascade="all, delete-orphan")
    
    tags = db.relationship('Tag', secondary=book_tags, lazy='subquery',
        backref=db.backref('books', lazy=True))

    def to_dict(self):
        return {
            'id': self.id,
            'title': self.title,
            'type': self.type,
            'cover_path': self.cover_path,
            'complexity': self.complexity,
            'custom_prompt': self.custom_prompt,
            'active_task_id': self.active_task_id,
            'processing_status': self.processing_status,
            'total_pages': self.total_pages,
            'processed_pages': self.processed_pages,
            'tags': [t.name for t in self.tags],
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'chapter_count': len(self.segments)
        }

class UploadSegment(db.Model):
    __tablename__ = 'upload_segments'
    
    id = db.Column(db.Integer, primary_key=True)
    book_id = db.Column(db.Integer, db.ForeignKey('books.id'), nullable=False)
    index = db.Column(db.Integer, nullable=False)
    title = db.Column(db.String(255), nullable=True)
    page_start = db.Column(db.Integer, nullable=True)
    page_end = db.Column(db.Integer, nullable=True)
    extracted_text = db.Column(db.Text, nullable=True)
    summary = db.Column(db.Text, nullable=True)
    source_assets = db.Column(db.JSON, nullable=True)
    created_at = db.Column(db.DateTime(timezone=True), server_default=func.now())
    
    nodes = db.relationship('KnowledgeNode', backref='segment', lazy=True, cascade="all, delete-orphan")

    def to_dict(self):
        return {
            'id': self.id,
            'book_id': self.book_id,
            'index': self.index,
            'title': self.title,
            'page_start': self.page_start,
            'page_end': self.page_end,
            'summary': self.summary,
            'extracted_text': self.extracted_text,
            'source_assets': self.source_assets
        }

class KnowledgeNode(db.Model):
    __tablename__ = 'knowledge_nodes'
    
    id = db.Column(db.Integer, primary_key=True)
    book_id = db.Column(db.Integer, db.ForeignKey('books.id'), nullable=False)
    segment_id = db.Column(db.Integer, db.ForeignKey('upload_segments.id'), nullable=False)
    chunk_index = db.Column(db.Integer, nullable=False)
    text_content = db.Column(db.Text, nullable=False)
    embedding = db.Column(Vector(), nullable=True) # Supports any generated embedding length (like 1024 for BAAI/bge-m3)
    created_at = db.Column(db.DateTime(timezone=True), server_default=func.now())

class Quiz(db.Model):
    __tablename__ = 'quizzes'
    
    id = db.Column(db.Integer, primary_key=True)
    book_id = db.Column(db.Integer, db.ForeignKey('books.id'), nullable=False)
    difficulty = db.Column(db.String(50), nullable=False)
    total_questions = db.Column(db.Integer, nullable=False)
    score = db.Column(db.Integer, nullable=True)
    quized_data = db.Column(db.JSON, nullable=True) # Store question and answers history here
    created_at = db.Column(db.DateTime(timezone=True), server_default=func.now())

class ChatSession(db.Model):
    __tablename__ = 'chat_sessions'
    
    id = db.Column(db.Integer, primary_key=True)
    book_id = db.Column(db.Integer, db.ForeignKey('books.id'), nullable=True) # None for global
    segment_id = db.Column(db.Integer, db.ForeignKey('upload_segments.id'), nullable=True)
    title = db.Column(db.String(255), nullable=True)
    messages = db.Column(db.JSON, nullable=False, default=list) # [{role: 'user', content: '...'}, {role: 'assistant', content: '...'}]
    summary = db.Column(db.Text, nullable=True) # Compressed background history
    created_at = db.Column(db.DateTime(timezone=True), server_default=func.now())
    
    def to_dict(self):
        return {
            'id': self.id,
            'book_id': self.book_id,
            'segment_id': self.segment_id,
            'title': self.title,
            'messages': self.messages,
            'summary': self.summary,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }
