![PO](po.jpg)

# Po! AI Book Library 📖🤖

Fully Local AI Book Reader, PDF Summarizer, Quiz Generator & Searchable Library – Free Kindle Alternative for All Books (PDFs, Images)

Transform PDFs and images into a personal AI-powered book library. Chat with books, get instant AI chapter summaries, auto-generated quizzes, and semantic search – all offline, private, and free.

Experience a distraction-free Kindle-like reader with local AI for book summarization, interactive Q&A, and full-text discovery across your entire collection.

Version 1.0.1

---

## ✨ Key Features

- **🧠 Deep Ingestion**: Processes large PDFs (up to 1000+ pages) by intelligently chunking them into readable segments.
- **📚 Smart Summaries**: Every chapter or image batch is automatically summarized by an LLM (OpenAI/DeepSeek).
- **📱 Kindle Mode**: A premium, fullscreen reading experience with intuitive navigation (arrows, clicks, or touch).
- **🔍 Semantic Search (RAG)**: Chat with your library. Po! uses Vector embeddings (pgvector) to find exact answers from your books.
- **📷 OCR Fallback**: Scanned PDFs or low-quality images? Po! uses Vision models to extract text where standard OCR fails.
- **🔴 Task Management**: Real-time progress bars for uploads and the ability to cancel background processing instantly.

---



## Screenshots

![1](screenshots/image1.png) ![1](screenshots/image2.png) ![3](screenshots/image3.png) ![4](screenshots/image4.png) ![5](screenshots/image5.png)





## 🏗️ Architecture

### **The Stack**
- **Frontend**: Vanilla JavaScript (PWA-ready), Bootstrap 5, Three.js (3D Library View), Marked.js.
- **Backend**: Flask (Python 3.10+), SQLAlchemy + PostgreSQL (with `pgvector` extension).
- **Asynchronous Worker**: Celery + Redis (Handles the heavy lifting of OCR, Summarization, and Embedding).
- **AI Engine**: Integrated with OpenAI/DeepInfra for high-performance LLM and Embedding models.

---

## 🛠️ Requirements

- **Python 3.9+**
- **PostgreSQL 14+** (Must have the [pgvector](https://github.com/pgvector/pgvector) extension installed).
- **Redis Server** (For Celery task queuing).
- **OpenAI API Key** (Or compatible endpoint like DeepInfra).

---

## 🚀 Installation & Setup

Follow these steps to get Po! running on your local machine:

### 1. Clone the Repository
```bash
git clone https://github.com/astar10239/Po-AI-Book-Index.git
cd Po-AI-Book-Index
```

### 2. Configure Environment Variables
Create a `.env` file in the root directory (use `.env.example` as a template):
```ini
DATABASE_URL=postgresql://user:password@localhost:5432/po_db
REDIS_URL=redis://localhost:6379/0
OPENAI_API_KEY=your_key_here
# Optional:
OPENAI_BASE_URL=
```

### 3. Install Dependencies
```bash
cd backend
pip install -r requirements.txt
```

### 4. Initialize Database
Ensure your PostgreSQL server is running and the database exists. Then run the app once to create tables:
```bash
python app.py
```

### 5. Start the Engines
You need **two** terminals running:

**Terminal 1: Flask Web Server**
```bash
cd backend
python app.py
```

**Terminal 2: Celery Background Worker**
```bash
cd backend
celery -A tasks.celery worker --loglevel=info

## For Mac
OBJC_DISABLE_INITIALIZE_FORK_SAFETY=YES celery -A tasks.celery worker --loglevel=info
```

### 6. Access the App
Open your browser and go to: `http://localhost:5000`

---

## 📖 Using Po!
1. **Add a Book**: Create a new book, give it a title and some optional tags.
2. **Upload**: Drag and drop a PDF or upload images.
3. **Wait & Watch**: Watch the real-time progress bar. Po! is reading for you.
4. **Read & Chat**: Once processed, click on a segment to read the summary, or click again to enter **Kindle Mode**. Use the "Ask AI" button to chat with the book's contents.

---
**Enjoy your intelligent library!** 🚀
