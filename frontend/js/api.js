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

    async askChatStream(query, bookId = null, sessionId = null, callbacks = {}) {
        try {
            const res = await fetch(`${this.baseUrl}/chat/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query, book_id: bookId, session_id: sessionId })
            });

            if (!res.ok) {
                if (callbacks.onError) callbacks.onError('Server error: ' + res.status);
                return;
            }

            const reader = res.body.getReader();
            const decoder = new TextDecoder("utf-8");
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n\n');
                buffer = lines.pop(); // keep the incomplete line in the buffer

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            const data = JSON.parse(line.substring(6));
                            if (data.type === 'error') {
                                if (callbacks.onError) callbacks.onError(data.message);
                            } else if (data.type === 'chunk') {
                                if (callbacks.onChunk) callbacks.onChunk(data);
                            } else if (data.type === 'done') {
                                if (callbacks.onDone) callbacks.onDone(data);
                            }
                        } catch (e) {
                            console.error("Error parsing SSE data:", line, e);
                        }
                    }
                }
            }
        } catch (e) {
            if (callbacks.onError) callbacks.onError(e.message);
        }
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
    },

    async cancelTask(bookId) {
        const res = await fetch(`${this.baseUrl}/books/${bookId}/cancel`, {
            method: 'POST'
        });
        return await res.json();
    },

    async exportBookPdf(bookId) {
        const res = await fetch(`${this.baseUrl}/books/${bookId}/export_pdf`);
        if (!res.ok) {
            let errorText = "Failed to export PDF";
            try {
                const errData = await res.json();
                if (errData.error) errorText = errData.error;
            } catch (e) {}
            throw new Error(errorText);
        }
        
        const blob = await res.blob();
        
        // Extract filename from Content-Disposition if possible
        let filename = "Export.pdf";
        const disposition = res.headers.get('Content-Disposition');
        if (disposition && disposition.indexOf('attachment') !== -1) {
            const filenameRegex = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/;
            const matches = filenameRegex.exec(disposition);
            if (matches != null && matches[1]) { 
                filename = matches[1].replace(/['"]/g, '');
            }
        }

        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        a.remove();
    }
};
