from celery import Celery
from config import Config

celery = Celery(
    'po_tasks',
    broker=Config.CELERY_BROKER_URL,
    backend=Config.CELERY_RESULT_BACKEND
)

import os
import fitz  # PyMuPDF
from models import db, Book, UploadSegment, KnowledgeNode
from utils.ai_client import generate_embedding, generate_summary

from flask import Flask
def get_celery_app():
    _app = Flask(__name__)
    _app.config.from_object(Config)
    db.init_app(_app)
    return _app

@celery.task
def process_pdf_task(book_id, pdf_path):
    """
    Extract text, chunk it, summarize chapters, 
    and create embeddings for a PDF book.
    """
    try:
        app = get_celery_app()
        with app.app_context():
            doc = fitz.open(pdf_path)
            book = Book.query.get(book_id)
            if not book: return
            
            # Simple chunking: 5 pages per segment
            pages_per_segment = 5
            total_pages = len(doc)
            
            for i in range(0, total_pages, pages_per_segment):
                start = i
                end = min(i + pages_per_segment, total_pages)
                
                text_content = ""
                for page_num in range(start, end):
                    page = doc.load_page(page_num)
                    text_content += page.get_text() + "\n"
                    
                if not text_content.strip(): continue
                
                # Summarize via user's custom directions if present
                summary = generate_summary(text_content[:Config.MAX_EXTRACT_CHARS], complexity=book.complexity, custom_prompt=book.custom_prompt)
                
                # Store segment
                segment = UploadSegment(
                    book_id=book_id,
                    index=(i // pages_per_segment) + 1,
                    title=f"Pages {start+1}-{end}",
                    page_start=start+1,
                    page_end=end,
                    extracted_text=text_content,
                    summary=summary,
                    source_assets=[os.path.relpath(pdf_path, Config.UPLOAD_FOLDER)]
                )
                db.session.add(segment)
                db.session.commit()
                
                # Chunk further for KnowledgeNodes (e.g. 1000 chars)
                chunk_size = 1000
                chunks = [text_content[j:j+chunk_size] for j in range(0, len(text_content), chunk_size)]
                
                for idx, chunk in enumerate(chunks):
                    if not chunk.strip(): continue
                    embedding = generate_embedding(chunk)
                    
                    if embedding:
                        node = KnowledgeNode(
                            book_id=book_id,
                            segment_id=segment.id,
                            chunk_index=idx,
                            text_content=chunk,
                            embedding=embedding
                        )
                        db.session.add(node)
                
                db.session.commit()
                
            print(f"Finished processing PDF for book {book_id}")
    except Exception as e:
        print(f"Error processing PDF task: {str(e)}")

import base64

@celery.task
def process_image_task(book_id, image_paths, session_id):
    """
    Background worker to run OCR via vision model on uploaded batch of images,
    extract raw text, generate high-level summary, and store into vector database.
    """
    try:
        from utils.ai_client import analyze_image, generate_summary, generate_embedding
        app = get_celery_app()
        with app.app_context():
            book = Book.query.get(book_id)
            if not book: return
            
            combined_text = ""
            
            for image_path in image_paths:
                with open(image_path, "rb") as img_file:
                    base64_image = base64.b64encode(img_file.read()).decode('utf-8')
                    
                # Extract raw text per image
                analysis = analyze_image(base64_image)
                if analysis:
                    combined_text += analysis + "\n\n"
            
            if not combined_text.strip(): return
            
            # Generate summary based on custom instructions
            summary = generate_summary(combined_text, complexity=book.complexity, custom_prompt=book.custom_prompt)
            
            existing = UploadSegment.query.filter_by(book_id=book_id).count()
            
            segment = UploadSegment(
                book_id=book_id,
                index=existing + 1,
                title=f"Session {session_id} - {len(image_paths)} Images",
                extracted_text=combined_text.strip(),
                summary=summary.strip() if summary else "",
                source_assets=[os.path.relpath(p, Config.UPLOAD_FOLDER) for p in image_paths]
            )
            db.session.add(segment)
            db.session.commit()
            
            # Embed the Summary for RAG / Search Knowledge
            embedding = generate_embedding(summary or combined_text[:1000])
            if embedding:
                node = KnowledgeNode(
                    book_id=book_id,
                    segment_id=segment.id,
                    chunk_index=0,
                    text_content=summary or combined_text,
                    embedding=embedding
                )
                db.session.add(node)
                db.session.commit()
                
            print(f"Finished processing {len(image_paths)} images for book {book_id}")
    except Exception as e:
        print(f"Error processing image task: {str(e)}")

@celery.task
def summarize_chat_history(session_id):
    """
    Background worker triggered when a session's character length exceeds 
    the CHAT_CONTEXT_WINDOW. Compresses the entire past conversation into a summary
    and clears the JSON log, preserving only the most recent 4 messages.
    """
    try:
        app = get_celery_app()
        with app.app_context():
            from models import ChatSession
            from utils.ai_client import generate_summary
            
            session = ChatSession.query.get(session_id)
            if not session or not session.messages: return
            
            # Combine historical compression with active uncompressed messages
            chat_text = session.summary + "\n\n" if session.summary else ""
            for msg in session.messages:
                chat_text += f"{msg['role'].upper()}: {msg['content']}\n\n"
                
            prompt = "You are compressing a highly technical chat history between a user and an AI Assistant. Summarize the key topics discussed, the user's overarching goals, any unresolved questions, and the core conclusions strictly in a dense, factual format. Output ONLY the summary without filler so it can be seamlessly passed into the next AI context window."
            
            # Process via DeepSeek pipeline natively mapping to config complexities
            compressed = generate_summary(chat_text, complexity=5, custom_prompt=prompt)
            
            if compressed:
                session.summary = compressed
                # Retain only the last 4 active messages to preserve immediate context tone
                session.messages = session.messages[-4:]
                db.session.commit()
                print(f"Successfully compressed memory context for Chat Session {session_id}")
    except Exception as e:
        print(f"Error compressing chat session context: {str(e)}")
