import { DB } from './db.js';
import { State } from './state.js';
import { UI } from './ui.js';

export const SearchManager = {
    
    async extractTextFromPDF(fileId, base64Data) {
        try {
            const pdfData = atob(base64Data.split(',')[1]);
            const uint8Array = new Uint8Array(pdfData.length);
            for (let i = 0; i < pdfData.length; i++) {
                uint8Array[i] = pdfData.charCodeAt(i);
            }
            const pdfDoc = await pdfjsLib.getDocument({ data: uint8Array }).promise;
            
            const textPages = [];
            for (let i = 1; i <= pdfDoc.numPages; i++) {
                const page = await pdfDoc.getPage(i);
                const textContent = await page.getTextContent();
                const pageText = textContent.items.map(item => item.str).join(' ');
                textPages.push(pageText);
            }
            
            await DB.saveExtractedText(fileId, textPages);
        } catch(e) {
            console.error("Could not extract PDF text", e);
        }
    },

    async performSearch(courseId, query) {
        if(!query || query.length < 2) return null;
        
        const q = query.toLowerCase();
        const course = State.getCourse(courseId);
        if(!course) return null;

        const results = []; // { source: 'Note'|'PDF', title: str, snippet: str, link: func }

        // Search General Notes
        if (course.generalNotes && course.generalNotes.toLowerCase().includes(q)) {
            results.push({
                source: 'General Notes',
                title: 'Course General Notes',
                snippet: this.getSnippet(course.generalNotes, q),
                action: () => window.App.openCourse(courseId)
            });
        }

        // Search Document Notes
        if (course.notes) {
            for (const docId in course.notes) {
                const docNotes = course.notes[docId];
                const docMeta = course.documents.find(d => d.id === docId);
                const docName = docMeta ? docMeta.name : 'Unknown Material';

                for (const page in docNotes) {
                    const text = docNotes[page];
                    if (text && text.toLowerCase().includes(q)) {
                        results.push({
                            source: `Note - Page ${page}`,
                            title: docName,
                            snippet: this.getSnippet(text, q),
                            action: () => this.findAndOpenSessionForDoc(course, docId, page)
                        });
                    }
                }
            }
        }

        // Search Session Headers
        course.sessions.forEach(session => {
            if (session.headerNotes && session.headerNotes.toLowerCase().includes(q)) {
                results.push({
                    source: 'Session Header',
                    title: session.title,
                    snippet: this.getSnippet(session.headerNotes, q),
                    action: () => window.App.openSession(courseId, session.id)
                });
            }
        });

        // Search Extracted PDF Texts
        for (const doc of course.documents) {
            const textPages = await DB.loadExtractedText(doc.id);
            if(textPages) {
                textPages.forEach((text, index) => {
                    if (text.toLowerCase().includes(q)) {
                        results.push({
                            source: `PDF - Page ${index + 1}`,
                            title: doc.name,
                            snippet: this.getSnippet(text, q),
                            action: () => this.findAndOpenSessionForDoc(course, doc.id, index + 1)
                        });
                    }
                });
            }
        }

        return results;
    },

    getSnippet(text, query) {
        const index = text.toLowerCase().indexOf(query);
        const start = Math.max(0, index - 40);
        const end = Math.min(text.length, index + query.length + 40);
        let snippet = text.substring(start, end);
        if(start > 0) snippet = '...' + snippet;
        if(end < text.length) snippet = snippet + '...';
        
        // highlight query
        const regex = new RegExp(`(${query})`, 'gi');
        return snippet.replace(regex, '<mark>$1</mark>');
    },

    findAndOpenSessionForDoc(course, docId, page) {
        // Find a session using this doc
        const session = course.sessions.find(s => s.documentId === docId || s.solutionDocumentId === docId);
        if (session) {
            // override startPage for this jump
            State.saveSessionProperty(course.id, session.id, 'startPage', parseInt(page));
            window.App.openSession(course.id, session.id);
        } else {
            UI.showToast("Cannot find session associated with this document.", "error");
        }
    },

    renderSearchResults(results, containerId) {
        const container = document.getElementById(containerId);
        if(!container) return;

        if(!results) {
            container.innerHTML = '';
            return;
        }

        if(results.length === 0) {
            container.innerHTML = `<div style="padding: 1rem; color: var(--text-muted); text-align: center;">No results found.</div>`;
            return;
        }

        let html = `<div style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-md); box-shadow: var(--shadow-lg); max-height: 400px; overflow-y: auto; position: absolute; z-index: 100; width: 100%; top: 100%; margin-top: 0.5rem;">`;
        
        results.forEach(res => {
            // Need a unique ID to attach event listener later
            const id = 'res-' + Math.random().toString(36).substr(2,9);
            window['__search_actions'] = window['__search_actions'] || {};
            window['__search_actions'][id] = res.action;

            html += `
                <div onclick="window.__search_actions['${id}']()" style="padding: 0.75rem 1rem; border-bottom: 1px solid var(--border-color); cursor: pointer; transition: background 0.2s;" onmouseover="this.style.backgroundColor='var(--bg-hover)'" onmouseout="this.style.backgroundColor='transparent'">
                    <div style="font-size: 0.75rem; color: var(--primary); font-weight: 600; margin-bottom: 0.25rem;">${res.source}</div>
                    <div style="font-weight: 600; color: var(--text-main); margin-bottom: 0.25rem;">${res.title}</div>
                    <div style="font-size: 0.8rem; color: var(--text-muted);">${res.snippet}</div>
                </div>
            `;
        });
        html += `</div>`;
        container.innerHTML = html;
    }
};
