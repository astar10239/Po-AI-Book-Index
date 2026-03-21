const app = {
    currentView: 'dashboard',
    currentBook: null,
    books: [],
    
    init() {
        this.setupTheme();
        
        // Register Service Worker
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js')
                .then(reg => console.log('Service Worker Registered'))
                .catch(err => console.log('Service Worker Failed:', err));
        }

        // Handle Hash Routing
        window.addEventListener('hashchange', () => this.handleRouting());
        this.handleRouting();
    },

    handleRouting() {
        const hash = window.location.hash.slice(1);
        if (!hash) {
            this.navigate('dashboard', null, false);
            return;
        }
        
        const parts = hash.split('/');
        const view = parts[0];
        const id = parts[1] ? parseInt(parts[1]) : null;
        this.navigate(view, id, false);
    },

    setupTheme() {
        const theme = localStorage.getItem('theme') || 'dark';
        document.documentElement.setAttribute('data-bs-theme', theme);
        this.updateThemeIcon(theme);
    },

    toggleTheme() {
        const current = document.documentElement.getAttribute('data-bs-theme');
        const next = current === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-bs-theme', next);
        localStorage.setItem('theme', next);
        this.updateThemeIcon(next);
    },

    updateThemeIcon(theme) {
        const icon = document.getElementById('themeIcon');
        if(theme === 'dark') {
            icon.className = 'bi bi-sun';
        } else {
            icon.className = 'bi bi-moon-stars';
        }
    },

    navigate(viewId, bookId = null, updateHash = true) {
        document.querySelectorAll('.app-view').forEach(v => {
            v.classList.add('d-none');
            v.classList.remove('d-flex');
        });
        
        const targetView = document.getElementById(`view-${viewId}`);
        if(targetView) {
            targetView.classList.remove('d-none');
            if(viewId === 'chat') targetView.classList.add('d-flex');
        }
        
        this.currentView = viewId;
        
        if (updateHash) {
            let hash = `#${viewId}`;
            if (bookId) hash += `/${bookId}`;
            // Use pushState to avoid triggering hashchange recursively
            window.history.pushState(null, null, hash);
        }

        if (viewId === 'dashboard') {
            this.loadBooks();
        } else if (viewId === 'reader' && bookId) {
            this.loadBookDetails(bookId);
        } else if (viewId === 'quizzes') {
            this.loadQuizzes();
        }
    },

    async loadBooks() {
        try {
            this.books = await api.getBooks();
            this.renderBooksGrid();
        } catch (e) {
            console.error("Failed to load books", e);
            document.getElementById('books-grid').innerHTML = `<div class="alert alert-danger">Failed to load library. Is the backend running?</div>`;
        }
    },

    renderBooksGrid() {
        const grid = document.getElementById('books-grid');
        grid.innerHTML = '';
        
        if (this.books.length === 0) {
            grid.innerHTML = `<div class="text-center text-muted py-5"><i class="bi bi-journal-x fs-1"></i><p>Your library is empty. Click 'New Book' to start.</p></div>`;
            return;
        }

        this.books.forEach(b => {
            let tagsHtml = '';
            if (b.tags && b.tags.length > 0) {
                b.tags.forEach(t => tagsHtml += `<span class="badge bg-secondary me-1">${t}</span>`);
            }
            
            const col = document.createElement('div');
            col.className = 'col-12 col-md-4 col-lg-3';
            col.innerHTML = `
                <div class="card h-100 book-card shadow-sm border-0 overflow-hidden" style="cursor: pointer" onclick="app.navigate('reader', ${b.id})">
                    <div class="card-img-top bg-primary bg-gradient d-flex align-items-center justify-content-center" style="height: 140px;">
                        <span class="fs-4 fw-bold text-white text-center w-100 px-3 text-truncate">${b.title}</span>
                    </div>
                    <div class="card-body">
                        <h5 class="card-title text-truncate">${b.title}</h5>
                        <div class="mb-2">${tagsHtml}</div>
                        <p class="card-text text-muted small">${b.chapter_count || 0} Segment(s)</p>
                    </div>
                </div>
            `;
            grid.appendChild(col);
        });
    },

    openNewBookModal() {
        const modal = new bootstrap.Modal(document.getElementById('newBookModal'));
        modal.show();
    },

    async submitNewBook() {
        const title = document.getElementById('bookTitle').value.trim();
        const tagsStr = document.getElementById('bookTags').value;
        const prompt = document.getElementById('bookPrompt').value.trim();
        const fileInput = document.getElementById('bookPdf');
        
        if (!title) return alert("Title is required");
        
        const type = fileInput.files.length > 0 ? 'PDF' : 'Image';
        const tags = tagsStr.split(',').map(t => t.trim()).filter(t => t);
        
        // Disable button
        const btn = document.querySelector('#newBookModal .btn-primary');
        const originalText = btn.innerText;
        btn.innerText = "Creating...";
        btn.disabled = true;
        
        try {
            const book = await api.createBook(title, type, tags, prompt);
            
            if (fileInput.files.length > 0) {
                btn.innerText = "Uploading PDF...";
                await api.uploadPdf(book.id, fileInput.files[0]);
            }
            
            // Close modal and navigate
            bootstrap.Modal.getInstance(document.getElementById('newBookModal')).hide();
            this.navigate('reader', book.id);
            
            if (fileInput.files.length > 0) {
                // If PDF was uploaded, show processing banner immediately in the new reader view
                document.getElementById('upload-progress-banner').classList.remove('d-none');
            }
            
            document.getElementById('newBookForm').reset();
            
        } catch (e) {
            alert("Error creating book: " + e.message);
        } finally {
            btn.innerText = originalText;
            btn.disabled = false;
        }
    },

    async loadBookDetails(id) {
        document.getElementById('reader-book-title').innerText = "Loading...";
        document.getElementById('reader-chapters').innerHTML = '<div class="p-3 text-center"><div class="spinner-border spinner-border-sm"></div></div>';
        
        try {
            this.currentBook = await api.getBook(id);
            document.getElementById('reader-book-title').innerHTML = `
                ${this.currentBook.title}
                <button class="btn btn-sm btn-outline-secondary ms-2 rounded-pill" onclick="app.openEditBookModal()">
                    <i class="bi bi-pencil"></i> Edit
                </button>
                <button class="btn btn-sm btn-outline-danger ms-1 rounded-pill" onclick="app.deleteBook()">
                    <i class="bi bi-trash"></i> Delete Book
                </button>
            `;
            
            const list = document.getElementById('reader-chapters');
            list.innerHTML = '';
            
            if (this.currentBook.segments.length === 0) {
                 list.innerHTML = '<div class="p-3 text-muted small">No segments yet. Upload a PDF or add images.</div>';
                 return;
            }
            
            this.currentBook.segments.forEach((s, idx) => {
                const btn = document.createElement('button');
                btn.className = 'list-group-item list-group-item-action';
                btn.innerHTML = `<strong>Seq ${s.index}</strong>: ${s.title || 'Untitled Segment'}`;
                btn.onclick = () => this.showSegmentSummary(s);
                list.appendChild(btn);
            });
            
            // Show first by default
            if(this.currentBook.segments.length > 0) {
                this.showSegmentSummary(this.currentBook.segments[0]);
            }
            
            // Auto-refresh segments while in Reader view
            if(this.pollingInterval) clearInterval(this.pollingInterval);
            this.pollingInterval = setInterval(async () => {
                if (this.currentView !== 'reader' || !this.currentBook) {
                    clearInterval(this.pollingInterval);
                    return;
                }
                try {
                    const refreshedBook = await api.getBook(id);
                    // If we have new segments processed by Celery, refresh the whole UI!
                    if (refreshedBook.segments.length > this.currentBook.segments.length) {
                        document.getElementById('upload-progress-banner').classList.add('d-none');
                        this.loadBookDetails(id); 
                    }
                } catch(e) {}
            }, 3000);
        } catch (e) {
             document.getElementById('reader-book-title').innerText = "Error loading book";
             console.error(e);
        }
    },
    
    showSegmentSummary(segment) {
        document.getElementById('reader-summary-title').innerHTML = `
            ${segment.title || `Segment ${segment.index}`}
            <button class="btn btn-sm btn-outline-danger ms-2" onclick="app.deleteSegment(${segment.id})">
                <i class="bi bi-trash"></i> Delete
            </button>
        `;
        let content = segment.summary ? marked.parse(segment.summary) : '<em class="text-muted">Summary is empty or pending processing...</em>';
        
        if (segment.source_assets && segment.source_assets.length > 0) {
            content += `<h6 class="mt-4 mb-2 fw-bold text-secondary text-uppercase small"><i class="bi bi-paperclip me-2"></i>Source Assets</h6><div class="d-flex gap-2 flex-wrap mb-4">`;
            segment.source_assets.forEach(asset => {
                if(asset.match(/\.(jpeg|jpg|png|webp)$/i)) {
                    content += `<a href="/uploads/${asset}" target="_blank" class="border rounded d-inline-block overflow-hidden shadow-sm bg-black"><img src="/uploads/${asset}" style="height: 100px; width: 100px; object-fit: cover;"></a>`;
                } else {
                    content += `<a href="/uploads/${asset}" target="_blank" class="btn btn-outline-secondary btn-sm shadow-sm"><i class="bi bi-file-pdf-fill text-danger"></i> View Original PDF</a>`;
                }
            });
            content += `</div>`;
        }
        
        if (segment.extracted_text) {
            const raw = segment.extracted_text.replace(/\\n/g, '<br>');
            content += `
                <hr class="my-4 text-muted">
                <details class="text-muted border p-3 rounded bg-body-tertiary">
                    <summary class="fw-semibold user-select-none" style="cursor:pointer;"><i class="bi bi-file-earmark-text me-2"></i>View Raw Uploaded Text</summary>
                    <div class="mt-3 small" style="max-height: 300px; overflow-y: auto;">
                        ${raw}
                    </div>
                </details>
            `;
        }
        
        document.getElementById('reader-summary-content').innerHTML = content;
    },

    async deleteBook() {
        if (!this.currentBook) return;
        if (!confirm(`Are you sure you want to delete "${this.currentBook.title}"?`)) return;
        if (!confirm(`FINAL WARNING: This will permanently wipe all uploaded images, PDFs, extracted text, and AI summaries for this book.\n\nPress OK to permanently wipe data.`)) return;
        
        try {
            await api.deleteBook(this.currentBook.id);
            this.navigate('dashboard');
        } catch(e) {
            alert("Error deleting book: " + e.message);
        }
    },

    async deleteSegment(segmentId) {
        if(!confirm("Are you sure you want to delete this segment? You can rescan the image afterwards.")) return;
        try {
            await api.deleteSegment(this.currentBook.id, segmentId);
            this.loadBookDetails(this.currentBook.id);
        } catch(e) {
            alert("Error deleting segment: " + e.message);
        }
    },
    
    openEditBookModal() {
        if (!this.currentBook) return;
        document.getElementById('editBookTags').value = (this.currentBook.tags || []).join(', ');
        document.getElementById('editBookPrompt').value = this.currentBook.custom_prompt || '';
        new bootstrap.Modal(document.getElementById('editBookModal')).show();
    },

    async submitEditBook() {
        const tagsStr = document.getElementById('editBookTags').value;
        const prompt = document.getElementById('editBookPrompt').value.trim();
        const tags = tagsStr.split(',').map(t => t.trim()).filter(t => t);
        
        const btn = document.querySelector('#editBookForm button[type="button"]');
        const originalText = btn.innerText;
        btn.innerText = "Saving...";
        btn.disabled = true;
        
        try {
            await api.updateBookMetadata(this.currentBook.id, tags, prompt);
            bootstrap.Modal.getInstance(document.getElementById('editBookModal')).hide();
            this.loadBookDetails(this.currentBook.id);
        } catch(e) {
            alert("Error updating: " + e.message);
        } finally {
            btn.innerText = originalText;
            btn.disabled = false;
        }
    },

    async sendChatMessage() {
        const input = document.getElementById('chat-input');
        const text = input.value.trim();
        if(!text) return;
        
        this.addChatBubble(text, 'user');
        input.value = '';
        
        // Target specific book if in reader mode, else global
        const targetBookId = this.currentBook ? this.currentBook.id : null; 
        
        // Form the context string for smooth UI experience
        const bgBookTitle = this.currentBook ? this.currentBook.title : "Global Library";
        document.getElementById('chat-input').placeholder = `Asking Po about ${bgBookTitle}...`;
        
        // ChatGPT style pulsing typing indicator
        const typingId = this.addChatBubble(
            '<div class="spinner-grow spinner-grow-sm text-primary" role="status"></div><div class="spinner-grow spinner-grow-sm text-primary mx-1" role="status" style="animation-delay: 0.2s"></div><div class="spinner-grow spinner-grow-sm text-primary" role="status" style="animation-delay: 0.4s"></div>', 
            'ai', 
            true
        );
        
        try {
            const res = await api.askChat(text, targetBookId, this.currentSessionId);
            this.currentSessionId = res.session_id; // Map pointer dynamically forward
            
            document.getElementById(typingId).remove();
            this.addChatBubble(res.answer || 'Sorry, I couldn\'t process that.', 'ai');
        } catch(e) {
            document.getElementById(typingId).remove();
            this.addChatBubble('Error: ' + e.message, 'ai');
        } finally {
            document.getElementById('chat-input').placeholder = "Message Po...";
        }
    },
    
    handleChatEnter(e) {
        if(e.key === 'Enter') this.sendChatMessage();
    },
    
    addChatBubble(text, sender, isHtml = false) {
        const container = document.getElementById('chat-messages');
        const id = 'msg-' + Date.now();
        const wrapper = document.createElement('div');
        
        // Align user to right, AI to left
        wrapper.className = `d-flex align-items-start mb-2 ${sender === 'user' ? 'justify-content-end' : ''}`;
        
        const bubble = document.createElement('div');
        bubble.id = id;
        
        if (sender === 'user') {
            bubble.className = 'bg-primary text-white p-3 rounded-4 shadow-sm';
            bubble.style.borderBottomRightRadius = '4px';
            bubble.style.maxWidth = '85%';
        } else {
            bubble.className = 'bg-body-secondary p-3 rounded-4 shadow-sm text-break';
            bubble.style.borderBottomLeftRadius = '4px';
            bubble.style.maxWidth = '85%';
        }
        bubble.style.fontSize = '1.05rem';
        
        if (sender === 'ai' && !isHtml) {
            bubble.innerHTML = `<i class="bi bi-robot text-primary me-2 mb-2 d-block"></i> ` + marked.parse(text);
        } else if (isHtml) {
            bubble.innerHTML = text; // For the nice loading indicator
        } else {
            bubble.textContent = text;
        }
        
        wrapper.appendChild(bubble);
        container.appendChild(wrapper);
        container.scrollTop = container.scrollHeight;
        return id;
    },
    
    escapeHtml(unsafe) {
        return unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;").replace(/\\n/g, '<br>');
    },
    
    async performSearch() {
        const query = document.getElementById('search-input').value;
        if(!query) return;
        
        const resultsContainer = document.getElementById('search-results');
        resultsContainer.innerHTML = '<div class="spinner-border spinner-border-sm"></div> Searching...';
        
        try {
            const res = await api.search(query);
            resultsContainer.innerHTML = '';
            
            if(res.results.length === 0) {
                 resultsContainer.innerHTML = '<div class="alert alert-info">No confident matches found.</div>';
                 return;
            }
            
            res.results.forEach(r => {
                const card = document.createElement('div');
                card.className = 'card bg-body-tertiary shadow-sm';
                card.innerHTML = `
                    <div class="card-body">
                        <h6 class="card-subtitle mb-2 text-primary">Book ID: ${r.book_id} <span class="badge bg-secondary float-end">Score: ${(r.vector_score).toFixed(2)}</span></h6>
                        <p class="card-text small">${r.text_content.substring(0, 200)}...</p>
                        <button class="btn btn-sm btn-outline-primary" onclick="app.navigate('reader', ${r.book_id})">Open Book</button>
                    </div>
                `;
                resultsContainer.appendChild(card);
            });
        } catch(e) {
            resultsContainer.innerHTML = `<div class="alert alert-danger">Error: ${e.message}</div>`;
        }
    },
    
    currentSessionId: null,

    async openChat() {
        this.navigate('chat');
        this.currentSessionId = null;
        const msgContainer = document.getElementById('chat-messages');
        msgContainer.innerHTML = '';
        
        const bookId = this.currentBook ? this.currentBook.id : 'global';
        const titleText = this.currentBook ? this.currentBook.title : 'Global Library';
        
        document.getElementById('chat-header-title').innerText = `Chat: ${titleText}`;
        document.getElementById('chat-input').placeholder = `Message Po about ${titleText}...`;

        try {
            // Fetch highest-level recent session globally or per book
            const sessions = await api.getSessions(bookId);
            if (sessions && sessions.length > 0) {
                await this.loadSpecificSession(sessions[0].id);
            } else {
                this.startNewChatSession();
            }
        } catch(e) {
            this.addChatBubble("Error loading past sessions.", "ai");
        }
    },

    async openChatHistorySidebar() {
        const bookId = this.currentBook ? this.currentBook.id : 'global';
        const listEl = document.getElementById('chat-history-list');
        listEl.innerHTML = '<div class="p-4 text-center"><div class="spinner-border spinner-border-sm mb-2"></div></div>';
        
        const offcanvasEl = document.getElementById('chatHistoryOffcanvas');
        const bsOffcanvas = bootstrap.Offcanvas.getInstance(offcanvasEl) || new bootstrap.Offcanvas(offcanvasEl);
        bsOffcanvas.show();

        try {
            const sessions = await api.getSessions(bookId);
            if (sessions.length === 0) {
                listEl.innerHTML = '<div class="p-4 text-center text-muted">No past sessions found.</div>';
                return;
            }
            
            listEl.innerHTML = sessions.map(s => `
                <div class="list-group-item list-group-item-action d-flex justify-content-between align-items-start ${this.currentSessionId === s.id ? 'active' : ''}">
                    <div class="ms-2 me-auto" style="cursor: pointer; width:85%;" onclick="app.loadSpecificSession(${s.id})">
                        <div class="fw-bold text-truncate">${s.summary ? s.summary.substring(0,40)+'...' : 'General Chat Session'}</div>
                        <small class="${this.currentSessionId === s.id ? 'text-light' : 'text-muted'}">${new Date(s.created_at).toLocaleString()}</small>
                    </div>
                    <button class="btn btn-sm btn-link text-danger p-0 align-self-center shadow-none" onclick="app.deleteChatSession(${s.id}, event)">
                        <i class="bi bi-trash"></i>
                    </button>
                </div>
            `).join('');
        } catch (e) {
            listEl.innerHTML = '<div class="p-4 text-danger text-center">Failed to load history.</div>';
        }
    },

    async loadSpecificSession(sessionId) {
        const bookId = this.currentBook ? this.currentBook.id : 'global';
        const sessions = await api.getSessions(bookId);
        const starget = sessions.find(s => s.id === sessionId);
        if (!starget) return;
        
        this.currentSessionId = starget.id;
        document.getElementById('chat-messages').innerHTML = '';
        
        if (starget.summary) {
            this.addChatBubble(`<i class="bi bi-archive text-secondary me-2"></i> <em class="small text-muted">Archived Context: ${starget.summary.substring(0, 100)}...</em>`, 'ai', true);
        }
        
        if (starget.messages && starget.messages.length > 0) {
            starget.messages.forEach(msg => {
                this.addChatBubble(msg.content, msg.role === 'user' ? 'user' : 'ai');
            });
        } else {
            this.startNewChatSession(true); // Populate welcome text if empty
        }
        
        const offcanvasEl = document.getElementById('chatHistoryOffcanvas');
        const bsOffcanvas = bootstrap.Offcanvas.getInstance(offcanvasEl);
        if (bsOffcanvas) bsOffcanvas.hide();
    },

    async deleteChatSession(sessionId, event) {
        if(event) event.stopPropagation();
        if(confirm('Are you sure you want to permanently delete this chat thread?')) {
            await api.deleteSession(sessionId);
            if (this.currentSessionId === sessionId) {
                this.startNewChatSession();
                const obj = bootstrap.Offcanvas.getInstance(document.getElementById('chatHistoryOffcanvas'));
                if (obj) obj.hide();
            } else {
                this.openChatHistorySidebar();
            }
        }
    },

    startNewChatSession(skipReset = false) {
        this.currentSessionId = null;
        document.getElementById('chat-messages').innerHTML = '';
        const title = this.currentBook ? this.currentBook.title : 'Global Library';
        this.addChatBubble(`<i class="bi bi-stars text-primary me-2"></i> Started a fresh session! Ask me anything about <b>${title}</b>.`, 'ai', true);
        
        if (!skipReset) {
            const obj = bootstrap.Offcanvas.getInstance(document.getElementById('chatHistoryOffcanvas'));
            if (obj) obj.hide();
        }
    },

    openQuizModal() {
        document.getElementById('quiz-content').innerHTML = `
            <form id="quizForm">
                <div class="mb-3"><label class="form-label">Difficulty</label><select class="form-select" id="quizDifficulty"><option>Easy</option><option selected>Mixed</option><option>Hard</option></select></div>
                <div class="mb-3"><label class="form-label">Questions</label><input type="number" class="form-control" id="quizQuestions" value="5" min="1" max="20"></div>
            </form>
        `;
        const btn = document.querySelector('#quizModal .btn-primary');
        if (btn) {
            btn.classList.remove('d-none');
            btn.innerText = "Generate";
            btn.disabled = false;
        }
        new bootstrap.Modal(document.getElementById('quizModal')).show();
    },

    async generateAndShowQuiz() {
        const diff = document.getElementById('quizDifficulty').value;
        const num = document.getElementById('quizQuestions').value;
        const btn = document.querySelector('#quizModal .btn-primary');
        const content = document.getElementById('quiz-content');
        
        btn.disabled = true;
        btn.innerText = "Generating...";
        
        try {
            const res = await api.generateQuiz(this.currentBook.id, num, diff);
            if(res.questions) {
                let html = '<div class="quiz-container">';
                res.questions.forEach((q, i) => {
                    html += `<div class="card mb-3 border-0 shadow-sm bg-body-tertiary">
                                <div class="card-body">
                                    <h6 class="card-title text-primary fw-bold">Q${i+1}</h6>
                                    <p class="card-text">${q.question}</p>`;
                    
                    if(q.options && q.options.length > 0) {
                        html += `<ul class="list-group list-group-flush mb-3 border rounded shadow-sm">`;
                        q.options.forEach(opt => html += `<li class="list-group-item bg-transparent">${opt}</li>`);
                        html += `</ul>`;
                    } else {
                        html += `<p class="text-muted fst-italic mb-3">(Open Answer)</p>`;
                    }
                    
                    if (q.answer) {
                        html += `<details class="mt-2 text-success" style="cursor: pointer;">
                                    <summary class="fw-semibold user-select-none"><i class="bi bi-eye"></i> Show Answer</summary>
                                    <div class="p-2 bg-success text-white mt-2 rounded shadow-sm small">${q.answer}</div>
                                 </details>`;
                    }
                    
                    html += `</div></div>`;
                });
                html += '</div>';
                content.innerHTML = html;
                btn.classList.add("d-none"); // Hide Generate button so we only have one Close button
            }
        } catch(e) {
            content.innerHTML = `<div class="alert alert-danger">${e.message}</div>`;
            btn.innerText = "Error";
        } finally {
            btn.disabled = false;
        }
    },
    
    async loadQuizzes() {
        const grid = document.getElementById('quizzes-grid');
        grid.innerHTML = '<div class="text-center text-muted py-5"><div class="spinner-border"></div></div>';
        try {
            const list = await api.getQuizzes();
            grid.innerHTML = '';
            if (list.length === 0) {
                grid.innerHTML = `<div class="text-center text-muted py-5"><i class="bi bi-patch-question fs-1 d-block mb-3 opacity-50"></i><p>You haven't generated any quizzes yet.</p></div>`;
                return;
            }
            
            list.forEach(q => {
                const scoreText = q.score !== null ? `<span class="badge bg-${q.score >= 80 ? 'success' : (q.score >= 50 ? 'warning' : 'danger')} float-end">Score: ${q.score}%</span>` : '<span class="badge bg-secondary float-end">Not Scored</span>';
                const col = document.createElement('div');
                col.className = 'col-12 col-md-4 col-lg-3';
                col.innerHTML = `
                    <div class="card h-100 shadow-sm border-0 border-top border-4 border-${q.score >= 80 ? 'success' : (q.score >= 50 ? 'warning' : 'danger')} rounded-top" style="cursor: pointer" onclick="app.openHistoricalQuiz(${q.id})">
                        <div class="card-body">
                            ${scoreText}
                            <h6 class="card-subtitle mb-2 text-primary fw-bold text-truncate">${q.book_title}</h6>
                            <p class="card-text mb-1"><i class="bi bi-list-ol text-muted me-2"></i> ${q.total_questions} Questions</p>
                            <p class="card-text small text-muted"><i class="bi bi-bar-chart-fill me-2"></i> ${q.difficulty} Difficulty</p>
                        </div>
                        <div class="card-footer bg-transparent border-0 text-muted small data-bs-theme='dark'">
                            ${new Date(q.created_at).toLocaleDateString()}
                        </div>
                    </div>
                `;
                grid.appendChild(col);
            });
        } catch(e) {
            grid.innerHTML = `<div class="alert alert-danger">Error fetching quizzes.</div>`;
        }
    },

    async openHistoricalQuiz(quizId) {
        document.getElementById('quiz-content').innerHTML = '<div class="text-center p-4"><div class="spinner-border text-primary"></div></div>';
        const btn = document.querySelector('#quizModal .btn-primary');
        if (btn) btn.classList.add('d-none');
        
        const modalEl = document.getElementById('quizModal');
        const bsModal = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
        bsModal.show();
        
        try {
            const qTarget = await api.getQuizDetails(quizId);
            const content = document.getElementById('quiz-content');
            
            const quizList = Array.isArray(qTarget.quized_data) ? qTarget.quized_data : qTarget.quized_data?.quiz || [];
            const userAnswers = qTarget.quized_data?.user_answers || [];
            
            let html = `
                <div class="d-flex justify-content-between align-items-center mb-3">
                    <span class="badge bg-primary text-uppercase">${qTarget.difficulty} Difficulty</span>
                    <span class="fw-bold text-${qTarget.score >= 80 ? 'success' : 'warning'} fs-5">Score: ${qTarget.score !== null ? qTarget.score + '%' : 'N/A'}</span>
                </div>
                <div class="quiz-container">
            `;
            
            quizList.forEach((q, i) => {
                html += `<div class="card mb-3 border-0 shadow-sm bg-body-tertiary">
                            <div class="card-body">
                                <h6 class="card-title text-primary fw-bold mb-3 border-bottom pb-2">Question #${i+1}</h6>
                                <p class="card-text mb-4 lead" style="font-size: 1.1rem">${q.question}</p>`;
                
                const userAnswerObj = userAnswers[i];
                const userAnswer = userAnswerObj ? userAnswerObj.answer : null;
                
                if(q.options && q.options.length > 0) {
                    html += `<ul class="list-group list-group-flush mb-3 border rounded shadow-sm">`;
                    q.options.forEach(opt => {
                        let liClass = "bg-transparent";
                        let icon = "";
                        
                        // Strict check matching our backend logic
                        const optNorm = opt.toString().trim().toLowerCase();
                        const ansNorm = (q.answer || "").toString().trim().toLowerCase();
                        const usrNorm = (userAnswer || "").toString().trim().toLowerCase();

                        if (usrNorm === optNorm && usrNorm === ansNorm) {
                            liClass = "list-group-item-success fw-bold";
                            icon = `<i class="bi bi-check-circle-fill text-success me-2"></i>`;
                        } else if (usrNorm === optNorm && usrNorm !== ansNorm) {
                            liClass = "list-group-item-danger text-decoration-line-through text-muted";
                            icon = `<i class="bi bi-x-circle-fill text-danger me-2"></i>`;
                        } else if (optNorm === ansNorm) {
                            liClass = "list-group-item-success bg-opacity-25";
                            icon = `<i class="bi bi-lightbulb-fill text-success me-2"></i>`;
                        }
                        
                        html += `<li class="list-group-item ${liClass}">${icon}${opt}</li>`;
                    });
                    html += `</ul>`;
                } else {
                    html += `<p class="text-muted border rounded p-3 mb-3 bg-body">Your Answer: <em>${userAnswer || 'None Provided'}</em></p>`;
                }
                
                if (q.answer) {
                    html += `<details class="mt-2 text-success" style="cursor: pointer;">
                                <summary class="fw-semibold user-select-none"><i class="bi bi-eye"></i> Show Official Knowledge Source</summary>
                                <div class="p-3 bg-success text-white mt-2 rounded-4 shadow-sm small">${q.answer}</div>
                             </details>`;
                }
                
                html += `</div></div>`;
            });
            html += '</div>';
            content.innerHTML = html;
        } catch(e) {
            document.getElementById('quiz-content').innerHTML = `<div class="alert alert-danger">Error Loading Quiz History: ${e.message}</div>`;
        }
    },

    startCamera() {
        new bootstrap.Modal(document.getElementById('cameraModal')).show();
    },

    async uploadScannedImage() {
        const fileInput = document.getElementById('cameraInput');
        if(!fileInput.files.length) return alert('Take a photo first.');
        
        const btn = document.querySelector('#cameraModal .btn-primary');
        btn.disabled = true;
        btn.innerText = "Processing...";
        
        try {
            document.getElementById('upload-progress-banner').classList.remove('d-none');
            await api.uploadImages(this.currentBook.id, fileInput.files, 1);
            bootstrap.Modal.getInstance(document.getElementById('cameraModal')).hide();
        } catch(e) {
            alert("Error: " + e.message);
        } finally {
            btn.disabled = false;
            btn.innerText = "Upload & Process";
            fileInput.value = "";
        }
    }
};

document.addEventListener('DOMContentLoaded', () => app.init());
