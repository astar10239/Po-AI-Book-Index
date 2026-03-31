from flask import Blueprint, request, jsonify, Response, stream_with_context
from models import db, ChatSession
from utils.ai_client import generate_embedding, ask_question_stream
from sqlalchemy import text
import json

chat_bp = Blueprint('chat_api', __name__, url_prefix='/api/chat')

@chat_bp.route('/', methods=['POST'])
def ask_po():
    """Ask Po! a question using RAG and persistent sessions."""
    data = request.json
    query = data.get('query')
    book_id = data.get('book_id')
    segment_id = data.get('segment_id')
    session_id = data.get('session_id')
    
    if not query:
        return jsonify({'error': 'Query is required'}), 400
        
    session_obj = None
    if session_id:
        session_obj = ChatSession.query.get(session_id)
        
    if not session_obj:
        title = f"Chat about {'Book '+str(book_id) if book_id else 'Global Library'}"
        if segment_id:
            title = f"Chat about Segment {segment_id}"
            
        session_obj = ChatSession(
            book_id=book_id,
            segment_id=segment_id,
            title=title,
            messages=[]
        )
        db.session.add(session_obj)
        db.session.commit()
        
    query_embedding = generate_embedding(query)
    sql_base = "SELECT text_content FROM knowledge_nodes"
    params = {'embedding': str(query_embedding), 'query': query}
    conditions = []
    
    ctx_book_id = session_obj.book_id
    ctx_segment_id = session_obj.segment_id
    
    if ctx_book_id:
        conditions.append("book_id = :book_id")
        params['book_id'] = ctx_book_id
    if ctx_segment_id:
        conditions.append("segment_id = :segment_id")
        params['segment_id'] = ctx_segment_id
        
    if conditions:
        sql_base += " WHERE " + " AND ".join(conditions)
        
    sql_base += """
    ORDER BY (0.7 * (1 - (embedding <=> :embedding))) + (0.3 * similarity(text_content, :query)) DESC
    LIMIT 4
    """
    
    result = db.session.execute(text(sql_base), params)
    context_texts = [getattr(row, 'text_content') for row in result]
    
    context_joined = "\n\n---\n\n".join(context_texts) if context_texts else "No specific document context found."
    
    if session_obj.summary:
        context_joined = f"### PREVIOUS CHAT HISTORY SUMMARY:\n{session_obj.summary}\n\n### RELEVANT BOOK CONTEXT:\n{context_joined}"

    def generate():
        answer_chunks = []
        try:
            for chunk in ask_question_stream(context_joined, query, session_obj.messages):
                if "error" in chunk:
                    yield f"data: {json.dumps({'type': 'error', 'message': chunk['error']})}\n\n"
                    return
                    
                content = chunk.get("content", "")
                reasoning = chunk.get("reasoning", "")
                
                if content:
                    answer_chunks.append(content)
                    
                if content or reasoning:
                    yield f"data: {json.dumps({'type': 'chunk', 'content': content, 'reasoning': reasoning})}\n\n"
            
            # Update Session history after stream completion
            answer_text = "".join(answer_chunks)
            msgs = list(session_obj.messages)
            msgs.append({"role": "user", "content": query})
            msgs.append({"role": "assistant", "content": answer_text})
            session_obj.messages = msgs
            db.session.add(session_obj)
            db.session.commit()
            
            # Automatically bound the context window utilizing a background cleanup worker
            from config import Config
            current_chat_len = sum(len(str(m.get('content', ''))) for m in msgs)
            if current_chat_len > Config.CHAT_CONTEXT_WINDOW:
                from tasks import summarize_chat_history
                summarize_chat_history.delay(session_obj.id)
                
            yield f"data: {json.dumps({'type': 'done', 'session_id': session_obj.id, 'context_used': context_texts})}\n\n"
            
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

    return Response(stream_with_context(generate()), mimetype='text/event-stream')

@chat_bp.route('/sessions/<book_id>', methods=['GET'])
def get_sessions(book_id):
    if book_id == 'global':
        sessions = ChatSession.query.filter(ChatSession.book_id == None).order_by(ChatSession.created_at.desc()).all()
    else:
        sessions = ChatSession.query.filter_by(book_id=int(book_id)).order_by(ChatSession.created_at.desc()).all()
    return jsonify([s.to_dict() for s in sessions])

@chat_bp.route('/sessions/delete/<int:session_id>', methods=['DELETE'])
def delete_session(session_id):
    session = ChatSession.query.get(session_id)
    if session:
        db.session.delete(session)
        db.session.commit()
        return jsonify({'success': True})
    return jsonify({'error': 'Not found'}), 404
