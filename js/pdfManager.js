import { DB } from './db.js';
import { State } from './state.js';
import { UI } from './ui.js';

export const PDFManager = {
    pdfDoc: null,
    scale: 1.5,
    isHighlightMode: false,
    currentHighlights: {}, // mapping documentId -> pageIndex -> array of rectangles {x,y,w,h,color}

    // Convert [[color:#hex|text]] syntax to HTML spans
    parseColorSyntax(text) {
        return text.replace(/\[\[color:(#[0-9a-fA-F]{3,8})\|([^\]]+)\]\]/g, '<span style="color:$1">$2</span>');
    },

    async initHighlightMode() {
        // Load highlights from state if any (we can store them in DB or State later)
        // For simplicity we will attach them to notes or keep in memory for now
        this.isHighlightMode = false;
        document.body.classList.remove('highlighting-active');
    },

    toggleHighlightMode() {
        this.isHighlightMode = !this.isHighlightMode;
        if(this.isHighlightMode) {
            document.body.classList.add('highlighting-active');
            UI.showToast('Highlight mode ON. Click and drag on PDF to highlight.', 'info');
            document.getElementById('highlight-toggle-btn').style.color = 'var(--primary)';
        } else {
            document.body.classList.remove('highlighting-active');
            UI.showToast('Highlight mode OFF', 'info');
            document.getElementById('highlight-toggle-btn').style.color = 'var(--text-muted)';
        }
    },

    // Color palette for session markers
    sessionColors: ['#3b82f6', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'],

    async render(course, session, overrideDocId = null, containerId = 'workspace-container') {
        const container = document.getElementById(containerId);
        container.innerHTML = `<div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i><p>Loading document...</p></div>`;

        const docId = overrideDocId || session.documentId;
        if (!docId) return;

        const base64 = await DB.loadFile(docId);
        if(!base64) {
            container.innerHTML = `
                <div class="empty-state" style="color: var(--danger);">
                    <i class="fa-solid fa-triangle-exclamation"></i>
                    <p>Material file not found. It may have been deleted or not synced properly.</p>
                </div>
            `;
            return;
        }

        try {
            const pdfData = atob(base64.split(',')[1]);
            const uint8Array = new Uint8Array(pdfData.length);
            for (let i = 0; i < pdfData.length; i++) {
                uint8Array[i] = pdfData.charCodeAt(i);
            }

            this.pdfDoc = await pdfjsLib.getDocument({ data: uint8Array }).promise;
            container.innerHTML = '';
            
            // Find all sessions in this course that share this document
            const sessionsUsingDoc = course.sessions.filter(s => 
                s.documentId === docId || s.solutionDocumentId === docId
            );
            
            // Build session marker map: pageNum -> [{session, color}]
            const sessionMarkers = {};
            const sessionColorMap = {};
            sessionsUsingDoc.forEach((s, idx) => {
                sessionColorMap[s.id] = this.sessionColors[idx % this.sessionColors.length];
                if (s.sessionStartPage && s.sessionStartPage > 0) {
                    if (!sessionMarkers[s.sessionStartPage]) sessionMarkers[s.sessionStartPage] = [];
                    sessionMarkers[s.sessionStartPage].push({ session: s, color: sessionColorMap[s.id] });
                }
            });

            // Show legend if multiple sessions share this doc
            const showMarkers = sessionsUsingDoc.length > 1;
            if (showMarkers) {
                const legend = document.createElement('div');
                legend.className = 'session-marker-legend';
                legend.innerHTML = `
                    <span style="font-size: 0.75rem; font-weight: 600; color: var(--text-muted); text-transform: uppercase; margin-right: 0.75rem;">Sessions using this material:</span>
                    ${sessionsUsingDoc.map(s => {
                        const c = sessionColorMap[s.id];
                        const isCurrent = s.id === session.id;
                        const hasMarker = s.sessionStartPage && s.sessionStartPage > 0;
                        const clickHandler = hasMarker ? `onclick="document.getElementById('pair-${s.sessionStartPage}')?.scrollIntoView({behavior:'smooth'})"` : '';
                        const hoverAttr = hasMarker ? `onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='none'"` : '';
                        return `<span ${clickHandler} ${hoverAttr} style="display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.25rem 0.6rem; border-radius: 4px; font-size: 0.8rem; font-weight: ${isCurrent ? '600' : '400'}; background: ${c}${isCurrent ? '30' : '15'}; color: ${c}; border: 1px solid ${c}${isCurrent ? '60' : '30'}; ${hasMarker ? 'cursor: pointer;' : ''} transition: transform 0.1s;">
                            <span style="width: 8px; height: 8px; border-radius: 50%; background: ${c};"></span>
                            ${s.title}${hasMarker ? ` <i class="fa-solid fa-location-dot" style="font-size:0.65rem; opacity:0.7;"></i> p.${s.sessionStartPage}` : ''}
                        </span>`;
                    }).join('')}
                `;
                container.appendChild(legend);
            }

            // Render all pages
            const isEdit = State.active.editMode;
            const notes = State.getNotesForDocument(course.id, docId);

            for (let num = 1; num <= this.pdfDoc.numPages; num++) {
                const markers = showMarkers ? (sessionMarkers[num] || []) : [];
                await this.renderPagePair(num, container, notes[num] || '', course.id, docId, isEdit, markers, showMarkers, session);
            }

            // Scroll to last viewed page
            if(session.startPage && document.getElementById(`pair-${session.startPage}`)) {
                setTimeout(() => {
                    document.getElementById(`pair-${session.startPage}`).scrollIntoView({ behavior: 'smooth' });
                }, 500);
            }

            // Setup intersection observer to save last viewed page
            this.setupScrollTracking(session.id, course.id);

        } catch (error) {
            console.error(error);
            container.innerHTML = `<div class="empty-state" style="color: var(--danger);"><p>Error rendering PDF.</p></div>`;
        }
    },

    async renderPagePair(pageNum, container, noteContent, courseId, docId, isEdit, markers = [], showMarkers = false, currentSession = null) {
        const pairDiv = document.createElement('div');
        pairDiv.className = `slide-note-pair ${!isEdit && !noteContent.trim() ? 'no-notes' : ''}`;
        pairDiv.id = `pair-${pageNum}`;
        pairDiv.dataset.page = pageNum;

        // Slide side
        const slideDiv = document.createElement('div');
        slideDiv.className = 'slide-container';
        
        // Calculate target width mathematically for better reliability
        const rect = container.getBoundingClientRect();
        const isDesktop = window.innerWidth >= 1024;
        const hasNotes = isEdit || noteContent.trim();
        let targetWidth = rect.width - 32; // Default column mode (1rem padding on sides)
        if (isDesktop) {
            if (hasNotes) {
                targetWidth = (rect.width - 32 - 24) * 0.65; // row mode, 65% of available width
            } else {
                targetWidth = Math.min((rect.width - 32) * 0.85, 1000); // preview no-notes mode
            }
        }
        
        const page = await this.pdfDoc.getPage(pageNum);
        const unscaledViewport = page.getViewport({ scale: 1.0 });
        const scale = targetWidth / unscaledViewport.width;
        const viewport = page.getViewport({ scale: scale });
        
        const dpr = window.devicePixelRatio || 1;
        
        const wrapperDiv = document.createElement('div');
        wrapperDiv.className = 'pdf-page-wrapper';
        wrapperDiv.style.width = `${viewport.width}px`;
        wrapperDiv.style.height = `${viewport.height}px`;
        
        const canvas = document.createElement('canvas');
        canvas.className = 'pdf-canvas';
        // High-res internal dimensions
        canvas.width = viewport.width * dpr;
        canvas.height = viewport.height * dpr;
        // Exact CSS dimensions
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        wrapperDiv.appendChild(canvas);

        // Highlight layer
        const hCanvas = document.createElement('canvas');
        hCanvas.className = 'highlight-canvas';
        hCanvas.width = viewport.width * dpr;
        hCanvas.height = viewport.height * dpr;
        hCanvas.style.width = `${viewport.width}px`;
        hCanvas.style.height = `${viewport.height}px`;
        wrapperDiv.appendChild(hCanvas);

        slideDiv.appendChild(wrapperDiv);

        // Zoom button
        const zoomBtn = document.createElement('button');
        zoomBtn.className = 'zoom-btn';
        zoomBtn.innerHTML = '<i class="fa-solid fa-magnifying-glass-plus"></i>';
        zoomBtn.onclick = (e) => {
            e.stopPropagation();
            window.App.zoomSlide(pageNum);
        };
        wrapperDiv.appendChild(zoomBtn);

        const ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);
        const hCtx = hCanvas.getContext('2d');
        hCtx.scale(dpr, dpr);
        
        const renderContext = { canvasContext: ctx, viewport: viewport };
        await page.render(renderContext).promise;

        this.renderHighlights(hCanvas, docId, pageNum);
        
        if (!window.__highlightInitialized) {
            this.initGlobalHighlighting();
            window.__highlightInitialized = true;
        }

        // Render Text Layer for selection
        try {
            const textContent = await page.getTextContent();
            const textLayerDiv = document.createElement('div');
            textLayerDiv.className = 'textLayer';
            textLayerDiv.style.width = `${viewport.width}px`;
            textLayerDiv.style.height = `${viewport.height}px`;
            textLayerDiv.style.setProperty('--scale-factor', viewport.scale);
            wrapperDiv.appendChild(textLayerDiv);
            
            await pdfjsLib.renderTextLayer({
                textContentSource: textContent,
                container: textLayerDiv,
                viewport: viewport,
                textDivs: []
            }).promise;
        } catch (e) {
            console.error("Could not render text layer", e);
        }

        // Note side
        const noteDiv = document.createElement('div');
        noteDiv.className = 'note-container';

        // Editor
        const ta = document.createElement('textarea');
        ta.className = 'md-editor editor-only';
        ta.id = `note-pg-${pageNum}`;
        ta.placeholder = `Notes for page ${pageNum}...`;
        ta.value = noteContent;
        ta.style.height = `${viewport.height}px`;
        
        // Preview
        const preview = document.createElement('div');
        preview.className = 'markdown-body markdown-preview preview-only';
        preview.style.cssText = 'background: var(--bg-card); border-radius: 0; padding: 1.5rem; box-shadow: var(--shadow-sm); border: 1px solid var(--border-color); width: 100%;';
        preview.style.minHeight = `${viewport.height}px`;
        const self = this;
        const renderPreview = (text) => {
            const colored = self.parseColorSyntax(text || '*No notes added yet.*');
            return DOMPurify.sanitize(marked.parse(colored));
        };

        preview.innerHTML = renderPreview(noteContent);
        
        ta.addEventListener('input', (e) => {
            const val = e.target.value;
            State.saveNoteForDocument(courseId, docId, pageNum, val);
            preview.innerHTML = renderPreview(val);
            if(val.trim()) {
                pairDiv.classList.remove('no-notes');
            } else {
                pairDiv.classList.add('no-notes');
            }
        });
        ta.addEventListener('focus', () => { window.App.activeEditorId = ta.id; });

        // Arrow key traversal between note textareas
        ta.addEventListener('keydown', function(e) {
            if (e.key === 'ArrowDown' && this.selectionStart === this.value.length) {
                e.preventDefault();
                const nextPair = pairDiv.nextElementSibling;
                if (nextPair) {
                    const nextTa = nextPair.querySelector('.md-editor');
                    if (nextTa) { nextTa.focus(); nextTa.selectionStart = nextTa.selectionEnd = 0; }
                }
            } else if (e.key === 'ArrowUp' && this.selectionStart === 0) {
                e.preventDefault();
                const prevPair = pairDiv.previousElementSibling;
                if (prevPair) {
                    const prevTa = prevPair.querySelector('.md-editor');
                    if (prevTa) { prevTa.focus(); prevTa.selectionStart = prevTa.selectionEnd = prevTa.value.length; }
                }
            }
        });
        
        // Auto expand
        ta.addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = Math.max(this.scrollHeight, viewport.height) + 'px';
        });
        setTimeout(() => { 
            ta.style.height = 'auto'; 
            ta.style.height = Math.max(ta.scrollHeight, viewport.height) + 'px'; 
        }, 10);

        noteDiv.appendChild(ta);
        noteDiv.appendChild(preview);

        // Session start markers (color-coded side bars)
        if (markers.length > 0) {
            markers.forEach(m => {
                const markerBar = document.createElement('div');
                markerBar.className = 'session-start-marker';
                markerBar.style.cssText = `position: absolute; left: 0; top: 0; bottom: 0; width: 5px; background: ${m.color}; z-index: 12;`;
                markerBar.title = `${m.session.title} starts here`;
                
                // Label above the slide
                const markerLabel = document.createElement('div');
                markerLabel.className = 'session-start-label';
                markerLabel.style.cssText = `position: absolute; left: 8px; top: -20px; font-size: 0.7rem; font-weight: 600; color: ${m.color}; white-space: nowrap; z-index: 12;`;
                markerLabel.innerHTML = `<i class="fa-solid fa-caret-down"></i> ${m.session.title}`;
                
                wrapperDiv.appendChild(markerBar);
                wrapperDiv.appendChild(markerLabel);
            });
        }

        // Pin button to mark session start page
        if (currentSession) {
            const pinBtn = document.createElement('button');
            const isCurrentStart = currentSession.sessionStartPage === pageNum;
            pinBtn.className = 'session-pin-btn no-print';
            pinBtn.title = isCurrentStart ? 'Unmark session start' : 'Mark as session start for this session';
            pinBtn.innerHTML = `<i class="fa-solid fa-map-pin"></i>`;
            pinBtn.className = `session-pin-btn no-print ${isCurrentStart ? 'pinned' : ''}`;
            pinBtn.style.cssText = `position: absolute; bottom: 6px; left: 6px; z-index: 15; color: white; border: none; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; font-size: 0.75rem; cursor: pointer; transition: opacity 0.15s; border-radius: 4px;`;
            pinBtn.onclick = (e) => {
                e.stopPropagation();
                window.App.toggleSessionStartPage(pageNum);
            };
            wrapperDiv.appendChild(pinBtn);
        }

        pairDiv.appendChild(slideDiv);
        pairDiv.appendChild(noteDiv);
        container.appendChild(pairDiv);
    },

    setupScrollTracking(sessionId, courseId) {
        const container = document.getElementById('main-content');
        if(!container) return;
        
        let timeout;
        // Delay activation so the initial scroll-to-page doesn't overwrite startPage
        let active = false;
        setTimeout(() => { active = true; }, 2000);
        
        container.addEventListener('scroll', () => {
            if (!active) return;
            clearTimeout(timeout);
            timeout = setTimeout(() => {
                // find which pair is most visible
                const pairs = document.querySelectorAll('.slide-note-pair');
                let maxVisible = 0;
                let activePage = 1;
                
                pairs.forEach(pair => {
                    const rect = pair.getBoundingClientRect();
                    const visibleHeight = Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0);
                    if(visibleHeight > maxVisible) {
                        maxVisible = visibleHeight;
                        activePage = pair.dataset.page;
                    }
                });
                State.saveSessionProperty(courseId, sessionId, 'startPage', parseInt(activePage));
            }, 500);
        });
    },

    renderHighlights(canvas, docId, pageNum) {
        if(!this.currentHighlights[docId]) this.currentHighlights[docId] = {};
        if(!this.currentHighlights[docId][pageNum]) this.currentHighlights[docId][pageNum] = [];
        
        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.restore();
        
        const highlights = this.currentHighlights[docId][pageNum];
        highlights.forEach(h => {
            ctx.fillStyle = h.color;
            ctx.fillRect(h.x, h.y, h.w, h.h);
        });
    },
    
    initGlobalHighlighting() {
        document.addEventListener('mouseup', (e) => {
            if (!this.isHighlightMode) return;
            const sel = window.getSelection();
            
            let node = sel.anchorNode;
            if (!node) return;
            let pair = node.nodeType === 3 ? node.parentNode.closest('.slide-note-pair') : node.closest('.slide-note-pair');
            if (!pair) return;
            
            const pageNum = pair.dataset.page;
            const hCanvas = pair.querySelector('.highlight-canvas');
            const canvasRect = hCanvas.getBoundingClientRect();
            
            const session = State.getSession(State.active.courseId, State.active.sessionId);
            if (!session) return;
            const docId = session.documentId;
            
            if(!this.currentHighlights[docId]) this.currentHighlights[docId] = {};
            if(!this.currentHighlights[docId][pageNum]) this.currentHighlights[docId][pageNum] = [];
            
            let highlights = this.currentHighlights[docId][pageNum];
            
            if (sel.isCollapsed) {
                // Click to delete highlight
                const x = e.clientX - canvasRect.left;
                const y = e.clientY - canvasRect.top;
                const pad = 3; // padding for easier clicking
                
                const idx = highlights.findIndex(h => 
                    x >= h.x - pad && x <= h.x + h.w + pad &&
                    y >= h.y - pad && y <= h.y + h.h + pad
                );
                
                if (idx !== -1) {
                    highlights.splice(idx, 1);
                    this.renderHighlights(hCanvas, docId, pageNum);
                }
                return;
            }

            const range = sel.getRangeAt(0);
            const rects = range.getClientRects();
            
            const dpr = window.devicePixelRatio || 1;
            
            for (let i = 0; i < rects.length; i++) {
                const r = rects[i];
                const x = r.left - canvasRect.left;
                const y = r.top - canvasRect.top;
                const w = r.width;
                const h = r.height;
                
                // Avoid overlaying: if a highlight already covers this area mostly, skip it
                const overlaps = highlights.some(existing => 
                    x < existing.x + existing.w && x + w > existing.x &&
                    y < existing.y + existing.h && y + h > existing.y
                );
                
                if (!overlaps) {
                    highlights.push({
                        x: x, y: y, w: w, h: h,
                        color: 'rgba(253, 224, 71, 0.4)'
                    });
                }
            }
            this.renderHighlights(hCanvas, docId, pageNum);
            sel.removeAllRanges();
        });
    }
};
