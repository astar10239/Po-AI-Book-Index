from flask import Blueprint, request, jsonify
from models import db, Book, Quiz
from utils.ai_client import client
from config import Config
import json

quiz_bp = Blueprint('quiz_api', __name__, url_prefix='/api/quiz')

@quiz_bp.route('/', methods=['GET'])
def get_all_quizzes():
    quizzes = Quiz.query.order_by(Quiz.created_at.desc()).all()
    results = []
    for q in quizzes:
        results.append({
            'id': q.id,
            'book_title': q.book.title if q.book else 'Unknown',
            'difficulty': q.difficulty,
            'total_questions': q.total_questions,
            'score': q.score,
            'created_at': q.created_at.isoformat() if q.created_at else None
        })
    return jsonify(results), 200

@quiz_bp.route('/<int:quiz_id>', methods=['GET'])
def get_quiz_details(quiz_id):
    q = Quiz.query.get_or_404(quiz_id)
    return jsonify({
        'id': q.id,
        'book_title': q.book.title if q.book else 'Unknown',
        'difficulty': q.difficulty,
        'score': q.score,
        'quized_data': q.quized_data,
        'created_at': q.created_at.isoformat() if q.created_at else None
    }), 200

@quiz_bp.route('/generate/<int:book_id>', methods=['POST'])
def generate_quiz(book_id):
    """Generate a quiz based on book contents using DeepSeek."""
    book = Book.query.get_or_404(book_id)
    data = request.json
    num_questions = data.get('num_questions', 5)
    difficulty = data.get('difficulty', 'Mixed')
    
    # To properly generate a quiz, we should provide context. Let's fetch some top nodes or summaries.
    # For a real implementation, we might extract the book's overall summary.
    segments = book.segments[:5] # use first 5 segments for context optionally
    context = "\n".join([s.summary for s in segments if s.summary])[:4000] # limit context
    
    instruction = f"Generate a {num_questions}-question quiz with {difficulty} difficulty about the following text. Provide the output strictly as a JSON array of objects, with keys 'question', 'options' (array if multiple choice, null if open-ended), 'answer', and 'type' ('multiple-choice' or 'open-ended')."
    
    try:
        response = client.chat.completions.create(
            model=Config.LLM_MODEL_NAME,
            messages=[
                {"role": "system", "content": instruction},
                {"role": "user", "content": context if context else f"{book.title} concepts."}
            ],
            temperature=0.0,
            seed=42,
            response_format={"type": "json_object"} if hasattr(client.chat.completions, 'response_format') else None
        )
        
        quiz_data = response.choices[0].message.content
        try:
             questions = json.loads(quiz_data)
             # Extract the list if the LLM returned an enclosing JSON object (e.g. {"questions": [...]})
             if isinstance(questions, dict):
                 for key, value in questions.items():
                     if isinstance(value, list):
                         questions = value
                         break
                 else:
                     questions = [questions] # Fallback if no array found
        except json.JSONDecodeError:
             questions = []
             
        # Save Quiz intent to DB
        quiz = Quiz(
            book_id=book.id,
            difficulty=difficulty,
            total_questions=num_questions,
            quized_data=questions
        )
        db.session.add(quiz)
        db.session.commit()
        
        return jsonify({
            'quiz_id': quiz.id,
            'questions': questions
        }), 201
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@quiz_bp.route('/submit/<int:quiz_id>', methods=['POST'])
def submit_quiz(quiz_id):
    """Grade the submitted quiz."""
    quiz = Quiz.query.get_or_404(quiz_id)
    user_answers = request.json.get('answers', [])
    
    # Calculate score based on generated LLM expected answers
    correct = 0
    quiz_questions = quiz.quized_data if isinstance(quiz.quized_data, list) else quiz.quized_data.get('quiz', [])
    total = len(quiz_questions) if quiz_questions else 1
    
    for i, q in enumerate(quiz_questions):
        # Match using lowercase strict string equivalence for multiple choice
        if i < len(user_answers) and isinstance(user_answers[i], str) and isinstance(q.get('answer'), str):
            if user_answers[i].strip().lower() == q.get('answer').strip().lower():
                correct += 1
                
    score = int((correct / total) * 100) if total > 0 else 0
    quiz.score = score
    
    # Overwrite the payload safely mapping both LLM generation UI text alongside User Submission text
    quiz.quized_data = {
        "quiz": quiz_questions,
        "user_answers": user_answers
    }
    
    db.session.commit()
    
    return jsonify({
        'msg': 'Quiz graded successfully',
        'score': score,
        'feedback': f'You answered {correct} out of {total} questions correctly.'
    }), 200
