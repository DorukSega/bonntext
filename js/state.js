import { DB } from './db.js';

function getCurrentSemester() {
    const date = new Date();
    const month = date.getMonth() + 1; // 1-12
    const year = date.getFullYear();
    if (month >= 4 && month <= 9) return `SS${year}`;
    return `WS${month >= 10 ? year : year - 1}`;
}

export const State = {
    data: {
        currentSemester: getCurrentSemester(),
        semesters: [getCurrentSemester()],
        courses: []
    },
    settings: {
        githubToken: '',
        gistId: ''
    },
    active: {
        courseId: null,
        sessionId: null,
        editMode: true
    },

    async init() {
        const savedState = await DB.loadState();
        if (savedState) {
            this.data = { ...this.data, ...savedState.data };
            if (!this.data.semesters.includes(this.data.currentSemester)) {
                this.data.semesters.push(this.data.currentSemester);
            }
        }
        
        // Settings from localStorage (not synced)
        this.settings.githubToken = localStorage.getItem('bt_gh_token') || '';
        this.settings.gistId = localStorage.getItem('bt_gist_id') || '';
    },

    async persist() {
        await DB.saveState({ data: this.data });
    },

    getCourse(id) {
        return this.data.courses.find(c => c.id === id);
    },

    getSession(courseId, sessionId) {
        const c = this.getCourse(courseId);
        return c ? c.sessions.find(s => s.id === sessionId) : null;
    },

    getNotesForDocument(courseId, documentId) {
        const c = this.getCourse(courseId);
        if (!c) return {};
        if (!c.notes) c.notes = {};
        if (!c.notes[documentId]) c.notes[documentId] = {};
        return c.notes[documentId];
    },

    saveNoteForDocument(courseId, documentId, pageIndex, content) {
        const c = this.getCourse(courseId);
        if (!c) return;
        if (!c.notes) c.notes = {};
        if (!c.notes[documentId]) c.notes[documentId] = {};
        c.notes[documentId][pageIndex] = content;
        this.persist();
    },

    saveSessionProperty(courseId, sessionId, property, value) {
        const session = this.getSession(courseId, sessionId);
        if (session) {
            session[property] = value;
            this.persist();
        }
    }
};

// Also expose a simple ID generator
export const generateId = () => Math.random().toString(36).substr(2, 9);
export const formatDate = (dateString) => {
    if(!dateString) return '';
    const options = { year: 'numeric', month: 'short', day: 'numeric' };
    return new Intl.DateTimeFormat('en-US', options).format(new Date(dateString));
};
