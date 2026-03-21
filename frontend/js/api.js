const api = {
    baseUrl: '/api',

    // Books
    async getBooks() {
        const res = await fetch(`${this.baseUrl}/books/`);
        return await res.json();
    },
    
    async getBook(id) {
        const res = await fetch(`${this.baseUrl}/books/${id}`);
        return await res.json();
    },
    
    async createBook(title, type, tags=[], custom_prompt="") {
        const res = await fetch(`${this.baseUrl}/books/`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({title, type, tags, custom_prompt})
        });
        return await res.json();
    },
    
    async updateBookMetadata(bookId, tags, custom_prompt) {
        const res = await fetch(`${this.baseUrl}/books/${bookId}/metadata`, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({tags, custom_prompt})
        });
        return await res.json();
    },
    
    async deleteBook(bookId) {
        const res = await fetch(`${this.baseUrl}/books/${bookId}`, {
            method: 'DELETE'
        });
        return await res.json();
    },

    async deleteSegment(bookId, segmentId) {
        const res = await fetch(`${this.baseUrl}/books/${bookId}/segments/${segmentId}`, {
            method: 'DELETE'
        });
        return await res.json();
    },

    // Upload
    async uploadPdf(bookId, file) {
        const formData = new FormData();
        formData.append('file', file);
        const res = await fetch(`${this.baseUrl}/upload/pdf/${bookId}`, {
            method: 'POST',
            body: formData
        });
        return await res.json();
    },

    async uploadImages(bookId, fileList, sessionId) {
        const formData = new FormData();
        Array.from(fileList).forEach(file => {
            formData.append('files', file);
        });
        formData.append('session_id', sessionId);
        const res = await fetch(`${this.baseUrl}/upload/image/${bookId}`, {
            method: 'POST',
            body: formData
        });
        return await res.json();
    },

    // Search & Chat
    async search(query, bookId = null) {
        const res = await fetch(`${this.baseUrl}/search/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query, limit: 5, book_id: bookId })
        });
        return await res.json();
    },

    async getSessions(bookId) {
        const res = await fetch(`${this.baseUrl}/chat/sessions/${bookId}`);
        return await res.json();
    },

    async deleteSession(sessionId) {
        const res = await fetch(`${this.baseUrl}/chat/sessions/delete/${sessionId}`, { method: 'DELETE' });
        return await res.json();
    },

    async askChat(query, bookId = null, sessionId = null) {
        const res = await fetch(`${this.baseUrl}/chat/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query, book_id: bookId, session_id: sessionId })
        });
        return await res.json();
    },

    // Quiz
    async getQuizzes() {
        const res = await fetch(`${this.baseUrl}/quiz/`);
        return await res.json();
    },

    async getQuizDetails(quizId) {
        const res = await fetch(`${this.baseUrl}/quiz/${quizId}`);
        return await res.json();
    },

    async generateQuiz(bookId, numQuestions = 5, difficulty = 'Mixed') {
        const res = await fetch(`${this.baseUrl}/quiz/generate/${bookId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ num_questions: numQuestions, difficulty })
        });
        return await res.json();
    }
};
