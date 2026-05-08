import { DB } from './db.js';
import { State, generateId } from './state.js';
import { UI } from './ui.js';
import { PDFManager } from './pdfManager.js';
import { SearchManager } from './search.js';
import { Sync } from './sync.js';

// Expose globally for inline event handlers in HTML
window.App = {
    activeEditorId: null,

    async init() {
        await State.init();
        
        const saved = localStorage.getItem('bt_active_state');
        if (saved) {
            try { State.active = JSON.parse(saved); } catch(e) {}
        }
        
        UI.renderSidebar();
        
        if (State.active.courseId && State.getCourse(State.active.courseId)) {
            if (State.active.sessionId && State.getSession(State.active.courseId, State.active.sessionId)) {
                this.openSession(State.active.courseId, State.active.sessionId, true);
            } else {
                this.openCourse(State.active.courseId);
            }
        } else {
            this.renderDashboard();
        }
        
        this.setupGlobalListeners();
    },

    setupGlobalListeners() {
        // Sidebar toggles
        document.getElementById('toggle-sidebar-btn').addEventListener('click', () => {
            const sidebar = document.getElementById('sidebar');
            if (window.innerWidth < 768) {
                sidebar.classList.toggle('open');
                document.getElementById('mobile-overlay').classList.toggle('active');
            } else {
                sidebar.classList.toggle('collapsed');
            }
        });
        document.getElementById('mobile-overlay').addEventListener('click', () => {
            document.getElementById('sidebar').classList.remove('open');
            document.getElementById('mobile-overlay').classList.remove('active');
        });

        // Semester Select
        document.getElementById('semester-select').addEventListener('change', (e) => {
            State.data.currentSemester = e.target.value;
            State.persist();
            UI.renderSidebar();
            UI.renderDashboard();
        });

        // Modals
        document.getElementById('add-course-btn').addEventListener('click', () => UI.showModal('course-modal'));
        document.getElementById('settings-btn').addEventListener('click', () => UI.showModal('settings-modal'));
        document.querySelectorAll('.close-modal-btn').forEach(btn => btn.addEventListener('click', () => UI.hideModal()));
        
        // Settings Sync Buttons
        document.getElementById('sync-push-btn').addEventListener('click', () => Sync.pushToGithub());
        document.getElementById('sync-pull-btn').addEventListener('click', () => Sync.pullFromGithub());
        
        // Settings Inputs
        document.getElementById('github-token').addEventListener('change', (e) => {
            State.settings.githubToken = e.target.value;
            localStorage.setItem('bt_gh_token', e.target.value);
        });
        document.getElementById('github-gist-id').addEventListener('change', (e) => {
            State.settings.gistId = e.target.value;
            localStorage.setItem('bt_gist_id', e.target.value);
        });

        // Export / Import Data
        document.getElementById('export-btn').addEventListener('click', this.exportData.bind(this));
        document.getElementById('import-input').addEventListener('change', this.importData.bind(this));

        // Form Saves
        document.getElementById('save-course-btn').addEventListener('click', this.addCourse.bind(this));
        document.getElementById('save-session-btn').addEventListener('click', this.addSession.bind(this));
    },

    // --- Data Management ---
    async exportData() {
        const state = await DB.loadState();
        if(!state) return UI.showToast('No data to export', 'error');
        const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `bonntext_backup_${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
    },

    async importData(e) {
        const file = e.target.files[0];
        if(!file) return;
        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const data = JSON.parse(event.target.result);
                if(data && data.data) {
                    await DB.saveState(data);
                    await State.init();
                    UI.renderSidebar();
                    UI.renderDashboard();
                    UI.showToast('Data imported successfully!', 'success');
                    UI.hideModal();
                } else {
                    throw new Error('Invalid format');
                }
            } catch(error) {
                UI.showToast('Failed to parse JSON backup file.', 'error');
            }
        };
        reader.readAsText(file);
    },

    // --- Navigation ---
    renderDashboard() {
        State.active.courseId = null;
        State.active.sessionId = null;
        localStorage.setItem('bt_active_state', JSON.stringify(State.active));
        UI.renderDashboard();
    },

    openCourse(courseId) {
        State.active.courseId = courseId;
        State.active.sessionId = null;
        localStorage.setItem('bt_active_state', JSON.stringify(State.active));
        UI.renderSidebar(); // highlight active
        UI.renderCourseView(courseId);
    },

    openSession(courseId, sessionId, skipModeReset = false) {
        State.active.courseId = courseId;
        State.active.sessionId = sessionId;
        if (!skipModeReset) State.active.editMode = true; // Default to edit mode unless restoring
        localStorage.setItem('bt_active_state', JSON.stringify(State.active));
        UI.renderSidebar();
        document.getElementById('sidebar').classList.add('collapsed');
        UI.renderSessionView(courseId, sessionId);
        
        if (skipModeReset) {
            this.toggleEditMode(State.active.editMode);
        }
    },

    // --- Course Operations ---
    addCourse() {
        const nameInput = document.getElementById('course-name-input');
        const name = nameInput.value.trim();
        if(!name) return UI.showToast('Course name cannot be empty', 'error');

        const newCourse = {
            id: generateId(),
            name: name,
            semester: State.data.currentSemester,
            generalNotes: '',
            links: [],
            documents: [],
            sessions: []
        };
        
        State.data.courses.push(newCourse);
        State.persist();
        
        nameInput.value = '';
        UI.hideModal();
        UI.renderSidebar();
        this.openCourse(newCourse.id);
        UI.showToast(`Course ${name} created`, 'success');
    },

    deleteCourse(courseId) {
        if(!confirm('Are you sure you want to delete this course? All data and sessions will be lost.')) return;
        
        // Clean up documents and text extraction
        const course = State.getCourse(courseId);
        course.documents.forEach(doc => {
            DB.deleteFile(doc.id);
            DB.deleteExtractedText(doc.id);
        });

        State.data.courses = State.data.courses.filter(c => c.id !== courseId);
        State.persist();
        UI.renderSidebar();
        UI.renderDashboard();
        UI.showToast('Course deleted', 'info');
    },

    addLinkPrompt(courseId) {
        const title = prompt('Link Title (e.g., eCampus, Zoom):');
        if(!title) return;
        const url = prompt('URL:');
        if(!url) return;

        const course = State.getCourse(courseId);
        course.links.push({ title, url: url.startsWith('http') ? url : `https://${url}` });
        State.persist();
        UI.renderCourseView(courseId);
    },

    removeLink(courseId, index) {
        const course = State.getCourse(courseId);
        course.links.splice(index, 1);
        State.persist();
        UI.renderCourseView(courseId);
    },

    // --- Session Operations ---
    showSessionModal() {
        if (!State.active.courseId) return;
        UI.showModal('session-modal');
    },

    showSemesterModal() {
        const yearInput = document.getElementById('semester-year-input');
        if (yearInput) {
            yearInput.value = new Date().getFullYear().toString().slice(-2);
        }
        UI.showModal('semester-modal');
    },

    addSemester() {
        const term = document.getElementById('semester-term-input').value;
        const year = document.getElementById('semester-year-input').value.trim();
        if (!year) {
            UI.showToast("Please enter a year", 'error');
            return;
        }
        const semName = `${term}${year}`;
        if (!State.data.semesters.includes(semName)) {
            State.data.semesters.push(semName);
        }
        State.data.currentSemester = semName;
        State.saveToDB();
        UI.hideModal();
        UI.renderSidebar();
        this.renderDashboard();
        UI.showToast(`Semester ${semName} added!`, 'success');
    },

    addSession() {
        const typeInput = document.getElementById('session-type-input');
        const titleInput = document.getElementById('session-title-input');
        const dateInput = document.getElementById('session-date-input');

        const title = titleInput.value.trim();
        if(!title) return UI.showToast('Session title cannot be empty', 'error');

        const newSession = {
            id: generateId(),
            type: typeInput.value,
            title: title,
            date: dateInput.value,
            headerNotes: '',
            documentId: null,
            solutionDocumentId: null,
            startPage: 1
        };

        const course = State.getCourse(State.active.courseId);
        course.sessions.push(newSession);
        
        // Sort sessions by date ascending
        course.sessions.sort((a, b) => new Date(a.date) - new Date(b.date));
        
        State.persist();
        
        titleInput.value = '';
        UI.hideModal();
        UI.renderCourseView(course.id);
        UI.showToast('Session added', 'success');
    },

    deleteSession(courseId, sessionId) {
        if(!confirm('Are you sure you want to delete this session?')) return;
        
        const course = State.getCourse(courseId);
        course.sessions = course.sessions.filter(s => s.id !== sessionId);
        State.persist();
        
        this.openCourse(courseId);
        UI.showToast('Session deleted', 'info');
    },

    // --- Document Operations ---
    async uploadMaterial(event, courseId, sessionId, fieldName = 'documentId') {
        const file = event.target.files[0];
        if(!file) return;

        // Reset target
        event.target.value = '';

        UI.showToast('Processing file...', 'info');
        
        const reader = new FileReader();
        reader.onload = async (e) => {
            const base64Data = e.target.result;
            const docId = generateId();
            
            try {
                // Save to IndexedDB
                await DB.saveFile(docId, base64Data);
                
                const course = State.getCourse(courseId);
                course.documents.push({ id: docId, name: file.name });
                
                const session = State.getSession(courseId, sessionId);
                session[fieldName] = docId;
                
                State.persist();
                
                UI.showToast('File uploaded successfully!', 'success');
                UI.renderSessionView(courseId, sessionId);

                // Extract text for search in background
                setTimeout(() => SearchManager.extractTextFromPDF(docId, base64Data), 100);

            } catch (error) {
                console.error(error);
                UI.showToast('Failed to save file.', 'error');
            }
        };
        reader.readAsDataURL(file);
    },

    linkMaterial(courseId, sessionId, documentId, fieldName = 'documentId') {
        const session = State.getSession(courseId, sessionId);
        if(session) {
            session[fieldName] = documentId;
            State.persist();
            UI.renderSessionView(courseId, sessionId);
        }
    },

    switchExerciseDoc(showExercise) {
        const btnEx = document.getElementById('btn-show-exercise');
        const btnSol = document.getElementById('btn-show-solution');
        const course = State.getCourse(State.active.courseId);
        const session = State.getSession(State.active.courseId, State.active.sessionId);
        
        if (showExercise) {
            btnEx.classList.replace('btn-outline', 'btn-primary');
            btnSol.classList.replace('btn-primary', 'btn-outline');
            if(session.documentId) {
                PDFManager.render(course, session, session.documentId, 'exercise-pdf-container');
            } else {
                document.getElementById('exercise-pdf-container').innerHTML = '<div class="empty-state">No exercise material attached.</div>';
            }
        } else {
            btnEx.classList.replace('btn-primary', 'btn-outline');
            btnSol.classList.replace('btn-outline', 'btn-primary');
            if(session.solutionDocumentId) {
                PDFManager.render(course, session, session.solutionDocumentId, 'exercise-pdf-container');
            } else {
                document.getElementById('exercise-pdf-container').innerHTML = '<div class="empty-state">No solution material attached.</div>';
            }
        }
    },

    // --- Search ---
    async searchCourse(e, courseId) {
        const query = e.target.value;
        const results = await SearchManager.performSearch(courseId, query);
        
        // Remove old container if exists
        const oldCont = document.getElementById('search-results-container');
        if(oldCont) oldCont.remove();

        if(!results) return;

        const container = document.createElement('div');
        container.id = 'search-results-container';
        e.target.parentNode.appendChild(container);

        SearchManager.renderSearchResults(results, 'search-results-container');

        // Close when clicking outside
        const closeSearch = (ev) => {
            if(!e.target.parentNode.contains(ev.target)) {
                container.remove();
                document.removeEventListener('click', closeSearch);
            }
        };
        setTimeout(() => document.addEventListener('click', closeSearch), 10);
    },

    // --- Editor Commands ---
    toggleEditMode(isEdit) {
        State.active.editMode = isEdit;
        localStorage.setItem('bt_active_state', JSON.stringify(State.active));
        PDFManager.initHighlightMode(); // turn off highlights if switching
        
        if (isEdit) {
            document.body.classList.remove('preview-mode');
            document.getElementById('btn-edit-mode')?.classList.replace('btn-outline', 'btn-primary');
            document.getElementById('btn-preview-mode')?.classList.replace('btn-primary', 'btn-outline');
        } else {
            document.body.classList.add('preview-mode');
            document.getElementById('btn-edit-mode')?.classList.replace('btn-primary', 'btn-outline');
            document.getElementById('btn-preview-mode')?.classList.replace('btn-outline', 'btn-primary');
        }
    },

    toggleHighlightMode() {
        PDFManager.toggleHighlightMode();
    },

    toggleSessionStartPage(pageNum) {
        const session = State.getSession(State.active.courseId, State.active.sessionId);
        if (!session) return;
        
        if (session.sessionStartPage === pageNum) {
            // Unpin
            session.sessionStartPage = null;
            UI.showToast(`Session start marker removed`, 'info');
        } else {
            session.sessionStartPage = pageNum;
            UI.showToast(`Session "${session.title}" now starts at page ${pageNum}`, 'success');
        }
        State.persist();
        
        // Re-render to update markers
        UI.renderSessionView(State.active.courseId, State.active.sessionId);
    },

    formatText(prefix, suffix) {
        if (!this.activeEditorId) return;
        const textarea = document.getElementById(this.activeEditorId);
        if (!textarea) return;

        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const text = textarea.value;
        
        const before = text.substring(0, start);
        const selection = text.substring(start, end);
        const after = text.substring(end, text.length);
        
        textarea.value = before + prefix + selection + suffix + after;
        textarea.selectionStart = start + prefix.length;
        textarea.selectionEnd = end + prefix.length;
        textarea.focus();
        
        // Trigger input event to auto-save and auto-resize
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
    },

    applyColor(color) {
        this.formatText(`[[color:${color}|`, ']]');
    },

    async zoomSlide(pageNum) {
        const session = State.getSession(State.active.courseId, State.active.sessionId);
        if (!session || !session.documentId) return;

        const docId = session.documentId;
        const base64 = await DB.loadFile(docId);
        if (!base64) return;

        const pdfData = atob(base64.split(',')[1]);
        const uint8Array = new Uint8Array(pdfData.length);
        for (let i = 0; i < pdfData.length; i++) {
            uint8Array[i] = pdfData.charCodeAt(i);
        }

        const pdf = await pdfjsLib.getDocument({ data: uint8Array }).promise;
        const page = await pdf.getPage(parseInt(pageNum));

        // Render at a high resolution for zoomed view
        const targetWidth = Math.min(window.innerWidth * 0.9, 1600);
        const unscaledVp = page.getViewport({ scale: 1.0 });
        const scale = targetWidth / unscaledVp.width;
        const viewport = page.getViewport({ scale });
        const dpr = window.devicePixelRatio || 1;

        const modal = document.getElementById('zoom-modal');
        modal.innerHTML = '';

        // Wrapper to hold canvas + text layer
        const wrapper = document.createElement('div');
        wrapper.style.cssText = `position: relative; width: ${viewport.width}px; height: ${viewport.height}px;`;

        const canvas = document.createElement('canvas');
        canvas.width = viewport.width * dpr;
        canvas.height = viewport.height * dpr;
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        wrapper.appendChild(canvas);

        const ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);
        await page.render({ canvasContext: ctx, viewport }).promise;

        // Add text layer for selection
        try {
            const textContent = await page.getTextContent();
            const textLayerDiv = document.createElement('div');
            textLayerDiv.className = 'textLayer';
            textLayerDiv.style.width = `${viewport.width}px`;
            textLayerDiv.style.height = `${viewport.height}px`;
            textLayerDiv.style.setProperty('--scale-factor', viewport.scale);
            wrapper.appendChild(textLayerDiv);

            await pdfjsLib.renderTextLayer({
                textContentSource: textContent,
                container: textLayerDiv,
                viewport: viewport,
                textDivs: []
            }).promise;
        } catch (e) {
            console.error("Could not render zoom text layer", e);
        }

        modal.appendChild(wrapper);
        modal.classList.add('active');

        // Close only when clicking the dark background, not the slide content
        modal.onclick = (e) => {
            if (e.target === modal) modal.classList.remove('active');
        };

        // Close on Esc
        const escHandler = (e) => {
            if (e.key === 'Escape') {
                modal.classList.remove('active');
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);
    }
};

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
    window.App.init();
});
