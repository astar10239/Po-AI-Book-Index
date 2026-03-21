from flask import Blueprint, request, jsonify
from sqlalchemy import text
from models import db
from utils.ai_client import generate_embedding

search_bp = Blueprint('search_api', __name__, url_prefix='/api/search')

@search_bp.route('/', methods=['POST'])
def hybrid_search():
    """Perform a hybrid search using pgvector and pg_trgm similarity."""
    data = request.json
    query = data.get('query')
    book_id = data.get('book_id')
    limit = data.get('limit', 5)
    
    if not query:
        return jsonify({'error': 'Query is required'}), 400
        
    query_embedding = generate_embedding(query)
    if not query_embedding:
         return jsonify({'error': 'Failed to generate embedding for query'}), 500
    
    # Raw SQL for Hybrid Search
    # Using 1 - (embedding <=> :embedding) for cosine similarity
    # Using similarity(text_content, :query) for trigram text match
    sql_base = """
    SELECT id, book_id, segment_id, text_content, 
           1 - (embedding <=> :embedding) AS vector_score,
           similarity(text_content, :query) AS text_score
    FROM knowledge_nodes
    """
    
    params = {'embedding': str(query_embedding), 'query': query, 'limit': limit}
    
    if book_id:
        sql_base += " WHERE book_id = :book_id"
        params['book_id'] = book_id
        
    # We rank by a weighted sum of both scores
    sql_base += """
    ORDER BY (0.7 * (1 - (embedding <=> :embedding))) + (0.3 * similarity(text_content, :query)) DESC
    LIMIT :limit
    """
    
    result = db.session.execute(text(sql_base), params)
    
    matches = []
    for row in result:
        matches.append({
            'node_id': getattr(row, 'id'),
            'book_id': getattr(row, 'book_id'),
            'segment_id': getattr(row, 'segment_id'),
            'text_content': getattr(row, 'text_content'),
            'vector_score': getattr(row, 'vector_score'),
            'text_score': getattr(row, 'text_score')
        })
        
    return jsonify({'results': matches}), 200
