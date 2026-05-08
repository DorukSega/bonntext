import { State, generateId, formatDate } from './state.js';
import * as AppLogic from './main.js'; // Will import circular actions carefully
import { PDFManager } from './pdfManager.js';

export const UI = {
    elements: {
        sidebar: document.getElementById('sidebar'),
        main: document.getElementById('main-content'),
        breadcrumbs: document.getElementById('breadcrumbs'),
        globalActions: document.getElementById('global-actions'),
        semesterSelect: document.getElementById('semester-select'),
        courseList: document.getElementById('course-list'),
        modalOverlay: document.getElementById('modal-overlay'),
        mobileOverlay: document.getElementById('mobile-overlay')
    },

    showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        
        let icon = 'fa-info-circle';
        if(type === 'success') icon = 'fa-check-circle';
        if(type === 'error') icon = 'fa-exclamation-circle';
        
        toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${message}</span>`;
        container.appendChild(toast);
        
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(100%)';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    },

    showModal(id) {
        this.elements.modalOverlay.classList.add('active');
        document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
        document.getElementById(id).classList.remove('hidden');
        
        if(id === 'course-modal') {
            document.getElementById('course-semester-input').value = State.data.currentSemester;
            setTimeout(() => document.getElementById('course-name-input').focus(), 100);
        }
        if(id === 'session-modal') {
            document.getElementById('session-date-input').valueAsDate = new Date();
            setTimeout(() => document.getElementById('session-title-input').focus(), 100);
        }
        if(id === 'settings-modal') {
            document.getElementById('github-token').value = State.settings.githubToken;
            document.getElementById('github-gist-id').value = State.settings.gistId;
        }
    },

    hideModal() {
        this.elements.modalOverlay.classList.remove('active');
        setTimeout(() => {
            document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
        }, 300);
    },

    renderSidebar() {
        const select = this.elements.semesterSelect;
        select.innerHTML = '';
        const sorted = [...new Set(State.data.semesters)].sort().reverse();
        sorted.forEach(sem => {
            const opt = document.createElement('option');
            opt.value = sem;
            opt.textContent = sem;
            if(sem === State.data.currentSemester) opt.selected = true;
            select.appendChild(opt);
        });

        const list = this.elements.courseList;
        list.innerHTML = '';
        
        const filteredCourses = State.data.courses.filter(c => c.semester === State.data.currentSemester);
        
        if (filteredCourses.length === 0) {
            list.innerHTML = '<li style="padding: 0.5rem 1rem; color: var(--text-muted); font-size: 0.8rem; font-style: italic;">No courses added.</li>';
            return;
        }

        filteredCourses.forEach(course => {
            const li = document.createElement('li');
            const isActiveCourse = State.active.courseId === course.id;
            li.className = `nav-item ${isActiveCourse && !State.active.sessionId ? 'active' : ''}`;
            li.style.marginBottom = isActiveCourse ? '0' : '0.25rem';
            li.innerHTML = `<i class="fa-solid fa-book fa-sm opacity-70"></i> <span class="truncate w-full">${course.name}</span>`;
            li.onclick = () => {
                if(window.innerWidth < 768) this.elements.sidebar.classList.remove('open');
                window.App.openCourse(course.id);
            };
            list.appendChild(li);

            if (isActiveCourse && course.sessions && course.sessions.length > 0) {
                const subUl = document.createElement('ul');
                subUl.style.cssText = 'list-style: none; padding-left: 1rem; margin-bottom: 0.5rem; border-left: 2px solid var(--border-sidebar); margin-left: 0.75rem; padding-top: 0.25rem;';
                course.sessions.forEach(s => {
                    const isActiveSession = s.id === State.active.sessionId;
                    let icon = 'fa-person-chalkboard';
                    if (s.type === 'tutorial') icon = 'fa-users-class';
                    if (s.type === 'exercise') icon = 'fa-laptop-code';
                    
                    const subLi = document.createElement('li');
                    subLi.className = `nav-item ${isActiveSession ? 'active' : ''}`;
                    subLi.style.cssText = 'padding: 0.35rem 0.5rem; font-size: 0.85rem; margin-bottom: 0.15rem;';
                    subLi.innerHTML = `<i class="fa-solid ${icon} fa-fw" style="opacity: 0.7;"></i> <span class="truncate">${s.title}</span>`;
                    subLi.onclick = (e) => {
                        e.stopPropagation();
                        if(window.innerWidth < 768) this.elements.sidebar.classList.remove('open');
                        window.App.openSession(course.id, s.id);
                    };
                    subUl.appendChild(subLi);
                });
                list.appendChild(subUl);
            }
        });
    },

    renderDashboard() {
        State.active.courseId = null;
        State.active.sessionId = null;
        this.elements.breadcrumbs.innerHTML = `<span class="current">Dashboard</span>`;
        this.elements.globalActions.innerHTML = '';
        const toolbarContainer = document.getElementById('editor-toolbar-container');
        if(toolbarContainer) toolbarContainer.innerHTML = '';
        
        const courses = State.data.courses.filter(c => c.semester === State.data.currentSemester);
        
        if (courses.length === 0) {
            this.elements.main.innerHTML = `
                <div class="empty-state h-full" style="height: 100%;">
                    <i class="fa-solid fa-graduation-cap" style="color: var(--primary);"></i>
                    <h2 style="font-size: 1.5rem; font-weight: 600; color: var(--text-main); margin-bottom: 0.5rem;">Semester: ${State.data.currentSemester}</h2>
                    <p style="max-width: 400px; margin-bottom: 2rem;">Create a course to start managing your notes, slides, and exercises.</p>
                    <button class="btn btn-primary" onclick="document.getElementById('add-course-btn').click()">
                        <i class="fa-solid fa-plus"></i> Add First Course
                    </button>
                </div>
            `;
            return;
        }

        let html = `
            <div style="max-width: 1000px; margin: 0 auto; padding-bottom: 4rem;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
                    <h1 style="font-size: 1.5rem; font-weight: 700; color: var(--text-main);">${State.data.currentSemester}</h1>
                    <button class="btn btn-primary" onclick="document.getElementById('add-course-btn').click()">
                        <i class="fa-solid fa-plus"></i> Add Course
                    </button>
                </div>
                <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1rem;">
        `;

        courses.forEach(course => {
            const sessionCount = course.sessions ? course.sessions.length : 0;
            const docCount = course.documents ? course.documents.length : 0;
            const icon = 'fa-book';
            const colors = ['#3b82f6', '#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4'];
            const color = colors[courses.indexOf(course) % colors.length];

            html += `
                <div class="card" style="cursor: pointer; transition: all 0.2s; border-left: 4px solid ${color};" 
                     onclick="window.App.openCourse('${course.id}')"
                     onmouseover="this.style.transform='translateY(-3px)'; this.style.boxShadow='var(--shadow-lg)';"
                     onmouseout="this.style.transform='none'; this.style.boxShadow='var(--shadow-sm)';">
                    <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1rem;">
                        <div style="width: 40px; height: 40px; border-radius: 50%; background: ${color}20; color: ${color}; display: flex; align-items: center; justify-content: center; font-size: 1.1rem;">
                            <i class="fa-solid ${icon}"></i>
                        </div>
                        <h3 style="font-weight: 600; font-size: 1.05rem; color: var(--text-main); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${course.name}</h3>
                    </div>
                    <div style="display: flex; gap: 1.5rem; font-size: 0.8rem; color: var(--text-muted);">
                        <span><i class="fa-solid fa-chalkboard-user" style="margin-right: 0.25rem;"></i>${sessionCount} session${sessionCount !== 1 ? 's' : ''}</span>
                        <span><i class="fa-regular fa-file-pdf" style="margin-right: 0.25rem;"></i>${docCount} file${docCount !== 1 ? 's' : ''}</span>
                    </div>
                </div>
            `;
        });

        html += `</div></div>`;
        this.elements.main.innerHTML = html;
    },

    renderCourseView(courseId) {
        const course = State.getCourse(courseId);
        if(!course) return;

        this.elements.breadcrumbs.innerHTML = `
            <span class="clickable" onclick="window.App.renderDashboard()"><i class="fa-solid fa-home"></i></span>
            <i class="fa-solid fa-chevron-right" style="font-size: 0.6rem; opacity: 0.5;"></i>
            <span class="current">${course.name}</span>
        `;

        this.elements.globalActions.innerHTML = `
            <div style="position: relative;" class="no-print">
                <input type="text" id="course-search" placeholder="Search notes & PDFs..." class="form-control" style="padding-left: 2.5rem; width: 250px;" onkeyup="window.App.searchCourse(event, '${course.id}')">
                <i class="fa-solid fa-search" style="position: absolute; left: 0.75rem; top: 50%; transform: translateY(-50%); color: var(--text-muted);"></i>
            </div>
        `;
        
        const toolbarContainer = document.getElementById('editor-toolbar-container');
        if(toolbarContainer) toolbarContainer.innerHTML = '';

        let html = `
            <div style="max-width: 900px; margin: 0 auto; padding-bottom: 4rem;">
                <div class="card">
                    <div class="card-header">
                        <h1 class="card-title">${course.name}</h1>
                        <button onclick="window.App.deleteCourse('${course.id}')" class="btn-icon btn-danger" title="Delete Course">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                    
                    <div style="margin-bottom: 1.5rem;">
                        <h3 style="font-size: 0.75rem; text-transform: uppercase; font-weight: 600; color: var(--text-muted); margin-bottom: 0.5rem;">Important Links</h3>
                        <div style="display: flex; flex-wrap: wrap; gap: 0.5rem;">
                            ${course.links.map((link, idx) => `
                                <a href="${link.url}" target="_blank" style="display: inline-flex; align-items: center; padding: 0.4rem 0.75rem; background: #eff6ff; color: #1d4ed8; border-radius: var(--radius-md); font-size: 0.875rem; text-decoration: none; border: 1px solid #bfdbfe;">
                                    <i class="fa-solid fa-link mr-2" style="margin-right: 0.25rem;"></i>${link.title}
                                    <button onclick="event.preventDefault(); window.App.removeLink('${course.id}', ${idx})" style="margin-left: 0.5rem; color: #93c5fd; background: none; border: none; cursor: pointer;"><i class="fa-solid fa-times"></i></button>
                                </a>
                            `).join('')}
                            <button onclick="window.App.addLinkPrompt('${course.id}')" style="display: inline-flex; align-items: center; padding: 0.4rem 0.75rem; border: 1px dashed var(--border-color); color: var(--text-muted); border-radius: var(--radius-md); font-size: 0.875rem; background: transparent; cursor: pointer;">
                                <i class="fa-solid fa-plus mr-1" style="margin-right: 0.25rem;"></i> Add Link
                            </button>
                        </div>
                    </div>

                    <div>
                        <h3 style="font-size: 0.75rem; text-transform: uppercase; font-weight: 600; color: var(--text-muted); margin-bottom: 0.5rem;">General Course Notes</h3>
                        <textarea id="course-general-notes" class="form-control" style="min-height: 120px; resize: vertical;" placeholder="Syllabus info, exam dates, general remarks...">${course.generalNotes || ''}</textarea>
                    </div>
                </div>

                <div class="card">
                    <div class="card-header mb-4">
                        <h2 class="card-title" style="font-size: 1.25rem;">Sessions & Materials</h2>
                        <button onclick="window.App.showSessionModal()" class="btn btn-primary btn-sm">
                            <i class="fa-solid fa-plus"></i> Add Session
                        </button>
                    </div>

                    <div style="display: flex; flex-direction: column;">
                        ${course.sessions.length === 0 ? '<p class="empty-state" style="padding: 2rem;">No sessions added yet.</p>' : ''}
                        ${course.sessions.map(session => {
                            const icon = session.type === 'lecture' ? 'fa-chalkboard-user' : 
                                        session.type === 'exercise_session' ? 'fa-users-gear' : 'fa-pen-ruler';
                            const iconColor = session.type === 'lecture' ? 'var(--primary)' : 
                                            session.type === 'exercise_session' ? 'var(--secondary)' : '#f59e0b';
                            
                            const docName = session.documentId ? course.documents.find(d=>d.id===session.documentId)?.name || 'Attached File' : 'No material';
                            const solutionDocName = session.solutionDocumentId ? course.documents.find(d=>d.id===session.solutionDocumentId)?.name || 'Solution File' : '';

                            return `
                            <div class="session-item" onclick="window.App.openSession('${course.id}', '${session.id}')">
                                <div class="session-icon" style="color: ${iconColor};">
                                    <i class="fa-solid ${icon}"></i>
                                </div>
                                <div class="session-info">
                                    <div class="session-title">${session.title}</div>
                                    <div class="session-meta">
                                        <span><i class="fa-regular fa-calendar" style="margin-right:0.25rem;"></i>${formatDate(session.date)}</span>
                                        <span class="truncate" style="max-width: 200px;"><i class="fa-regular fa-file-pdf" style="margin-right:0.25rem;"></i>${docName}</span>
                                        ${solutionDocName ? `<span class="truncate" style="max-width: 200px;"><i class="fa-solid fa-check-double" style="margin-right:0.25rem;"></i>${solutionDocName}</span>` : ''}
                                    </div>
                                </div>
                                <div style="color: var(--text-muted);">
                                    <i class="fa-solid fa-chevron-right"></i>
                                </div>
                            </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            </div>
        `;
        
        this.elements.main.innerHTML = html;

        document.getElementById('course-general-notes').addEventListener('blur', (e) => {
            course.generalNotes = e.target.value;
            State.persist();
        });
    },

    async renderSessionView(courseId, sessionId) {
        const course = State.getCourse(courseId);
        const session = State.getSession(courseId, sessionId);
        if(!course || !session) return;

        const isEdit = State.active.editMode;

        this.elements.breadcrumbs.innerHTML = `
            <span class="clickable" onclick="window.App.renderDashboard()"><i class="fa-solid fa-home"></i></span>
            <i class="fa-solid fa-chevron-right" style="font-size: 0.6rem; opacity: 0.5;"></i>
            <span class="clickable" onclick="window.App.openCourse('${course.id}')">${course.name}</span>
            <i class="fa-solid fa-chevron-right" style="font-size: 0.6rem; opacity: 0.5;"></i>
            <span class="current truncate" style="max-width: 150px;">${session.title}</span>
        `;

        this.elements.globalActions.innerHTML = `
            <div class="flex items-center gap-2 no-print" style="background: var(--bg-hover); padding: 0.25rem; border-radius: var(--radius-md);">
                <button id="btn-edit-mode" onclick="window.App.toggleEditMode(true)" class="btn ${isEdit ? 'btn-primary' : 'btn-outline'}" style="padding: 0.35rem 0.75rem;">
                    <i class="fa-solid fa-pen"></i> Edit
                </button>
                <button id="btn-preview-mode" onclick="window.App.toggleEditMode(false)" class="btn ${!isEdit ? 'btn-primary' : 'btn-outline'}" style="padding: 0.35rem 0.75rem;">
                    <i class="fa-solid fa-eye"></i> Preview
                </button>
            </div>
            <button onclick="window.print()" class="btn btn-outline no-print">
                <i class="fa-solid fa-print"></i> <span class="hidden md:inline">PDF</span>
            </button>
        `;
        
        const toolbarContainer = document.getElementById('editor-toolbar-container');
        if(toolbarContainer) {
            toolbarContainer.innerHTML = `
                <div class="toolbar ${isEdit ? '' : 'hidden'} no-print">
                    <button onmousedown="event.preventDefault(); window.App.formatText('**', '**')" class="toolbar-btn" title="Bold"><i class="fa-solid fa-bold"></i></button>
                    <button onmousedown="event.preventDefault(); window.App.formatText('*', '*')" class="toolbar-btn" title="Italic"><i class="fa-solid fa-italic"></i></button>
                    <div class="toolbar-divider"></div>
                    <button onmousedown="event.preventDefault(); window.App.formatText('# ', '')" class="toolbar-btn" style="font-weight:bold" title="Heading 1">H1</button>
                    <button onmousedown="event.preventDefault(); window.App.formatText('## ', '')" class="toolbar-btn" style="font-weight:bold; font-size:0.8em;" title="Heading 2">H2</button>
                    <div class="toolbar-divider"></div>
                    <button onmousedown="event.preventDefault(); window.App.formatText('- ', '')" class="toolbar-btn" title="Bullet List"><i class="fa-solid fa-list-ul"></i></button>
                    <button onmousedown="event.preventDefault(); window.App.formatText('1. ', '')" class="toolbar-btn" title="Number List"><i class="fa-solid fa-list-ol"></i></button>
                    <button onmousedown="event.preventDefault(); window.App.formatText('> ', '')" class="toolbar-btn" title="Quote"><i class="fa-solid fa-quote-right"></i></button>
                    <button onmousedown="event.preventDefault(); window.App.formatText('\`', '\`')" class="toolbar-btn" title="Code"><i class="fa-solid fa-code"></i></button>
                    <div class="toolbar-divider"></div>
                    <div style="position: relative; display: flex; align-items: center;">
                        <button class="toolbar-btn" title="Text Color" onclick="document.getElementById('note-color-picker').click()"><i class="fa-solid fa-palette"></i></button>
                        <input type="color" id="note-color-picker" class="color-picker" value="#ef4444" onchange="window.App.applyColor(this.value)">
                    </div>
                    <div class="toolbar-divider"></div>
                    <button onclick="window.App.toggleHighlightMode()" id="highlight-toggle-btn" class="toolbar-btn" title="Draw PDF Highlight"><i class="fa-solid fa-highlighter"></i></button>
                </div>
            `;
        }

        // Action Menu for Documents
        let docActions = '';
        if (session.type === 'exercise') {
            docActions = `
                <div style="position: relative;" class="group">
                    <button class="btn btn-outline" style="font-size: 0.75rem; padding: 0.4rem 0.75rem;">
                        <i class="fa-solid fa-file-pdf"></i> Exercise Material <i class="fa-solid fa-caret-down" style="margin-left: 0.25rem;"></i>
                    </button>
                    ${this.generateDocDropdown(course, session, 'documentId')}
                </div>
                <div style="position: relative;" class="group">
                    <button class="btn btn-outline" style="font-size: 0.75rem; padding: 0.4rem 0.75rem;">
                        <i class="fa-solid fa-check-double"></i> Solution Material <i class="fa-solid fa-caret-down" style="margin-left: 0.25rem;"></i>
                    </button>
                    ${this.generateDocDropdown(course, session, 'solutionDocumentId')}
                </div>
            `;
        } else {
             docActions = `
                <div style="position: relative;" class="group">
                    <button class="btn btn-outline" style="font-size: 0.75rem; padding: 0.4rem 0.75rem;">
                        <i class="fa-solid fa-file-pdf"></i> ${session.documentId ? 'Change Material' : 'Attach Material'}
                    </button>
                    ${this.generateDocDropdown(course, session, 'documentId')}
                </div>
            `;
        }

        let html = `
            <div class="workspace">
                <div class="card" style="margin-bottom: 1rem; flex-shrink: 0;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 1rem;">
                        <div>
                            <h1 style="font-size: 1.5rem; font-weight: 700; margin-bottom: 0.25rem;">${session.title}</h1>
                            <div style="font-size: 0.75rem; color: var(--text-muted); display: flex; gap: 1rem;">
                                <span><i class="fa-regular fa-calendar"></i> ${formatDate(session.date)}</span>
                                <span style="text-transform: capitalize;"><i class="fa-solid fa-tag"></i> ${session.type.replace('_', ' ')}</span>
                            </div>
                        </div>
                        <div class="flex items-center gap-2 no-print">
                            ${docActions}
                            <button onclick="window.App.deleteSession('${course.id}', '${session.id}')" class="btn-icon btn-danger ml-2" title="Delete Session">
                                <i class="fa-solid fa-trash"></i>
                            </button>
                        </div>
                    </div>

                    <div class="${isEdit ? '' : 'hidden'} no-print" style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid var(--border-color);">
                        <label class="form-label">Header Notes (Info, deadlines)</label>
                        <textarea id="session-header-notes" class="form-control" rows="2" style="background: transparent; border-color: transparent; padding: 0;" placeholder="Brief notes concerning this session...">${session.headerNotes || ''}</textarea>
                    </div>
                    <div class="session-header-info ${!isEdit && session.headerNotes ? '' : 'hidden'}" style="margin-top: 1rem; background: #eff6ff; padding: 0.75rem; border-radius: var(--radius-md); border: 1px solid #bfdbfe; font-size: 0.875rem; color: #1e3a8a;">
                        <strong><i class="fa-solid fa-circle-info"></i> Info:</strong> ${session.headerNotes}
                    </div>
                </div>

                <div id="workspace-container" class="slides-container">
                    <div class="empty-state">
                        <i class="fa-solid fa-circle-notch fa-spin"></i>
                        <p>Loading workspace...</p>
                    </div>
                </div>
            </div>
        `;

        this.elements.main.innerHTML = html;

        if(isEdit) {
            const hNotes = document.getElementById('session-header-notes');
            hNotes.addEventListener('blur', (e) => {
                session.headerNotes = e.target.value;
                State.persist();
            });
            // auto-expand textarea
            hNotes.addEventListener('input', function() {
                this.style.height = 'auto';
                this.style.height = (this.scrollHeight) + 'px';
            });
        }

        // Render PDF or general note area
        if (session.type === 'exercise' && session.solutionDocumentId) {
            // Exercise mode with solution - we might render two PDFs or let user switch.
            // For simplicity, let's render primary doc, and provide a toggle if both exist.
            this.renderExerciseWorkspace(course, session, isEdit);
        } else if (session.documentId) {
            PDFManager.render(course, session);
        } else {
            this.renderGeneralNoteOnly(course, session, isEdit);
        }
    },

    generateDocDropdown(course, session, fieldName) {
        return `
        <div style="position: absolute; right: 0; top: 100%; margin-top: 0.25rem; width: 220px; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-md); box-shadow: var(--shadow-lg); opacity: 0; visibility: hidden; transition: all 0.2s; z-index: 50;" class="group-hover:opacity-100 group-hover:visible dropdown-menu">
            <div style="padding: 0.5rem; border-bottom: 1px solid var(--border-color);">
                <label class="btn btn-primary w-full justify-center" style="cursor: pointer; padding: 0.4rem; font-size: 0.75rem;">
                    <i class="fa-solid fa-upload"></i> Upload PDF
                    <input type="file" class="hidden" accept="application/pdf" onchange="window.App.uploadMaterial(event, '${course.id}', '${session.id}', '${fieldName}')">
                </label>
            </div>
            <div style="max-height: 200px; overflow-y: auto; padding: 0.5rem;">
                <div style="font-size: 0.65rem; text-transform: uppercase; color: var(--text-muted); font-weight: 700; margin-bottom: 0.25rem; padding: 0 0.5rem;">Existing Files</div>
                ${course.documents.length === 0 ? '<div style="font-size: 0.75rem; color: var(--text-muted); padding: 0.25rem 0.5rem;">No files</div>' : ''}
                ${course.documents.map(doc => `
                    <button onclick="window.App.linkMaterial('${course.id}', '${session.id}', '${doc.id}', '${fieldName}')" style="width: 100%; text-align: left; padding: 0.4rem 0.5rem; font-size: 0.8rem; background: transparent; border: none; border-radius: var(--radius-sm); cursor: pointer; color: var(--text-main); display: flex; align-items: center; justify-content: space-between;" onmouseover="this.style.backgroundColor='var(--bg-hover)'" onmouseout="this.style.backgroundColor='transparent'">
                        <span class="truncate" style="padding-right: 0.5rem;"><i class="fa-regular fa-file-pdf" style="color: var(--text-muted); margin-right: 0.25rem;"></i>${doc.name}</span>
                        ${session[fieldName] === doc.id ? '<i class="fa-solid fa-check" style="color: var(--success); font-size: 0.75rem;"></i>' : ''}
                    </button>
                `).join('')}
            </div>
        </div>
        `;
    },

    renderGeneralNoteOnly(course, session, isEdit) {
        const container = document.getElementById('workspace-container');
        const notesObj = State.getNotesForDocument(course.id, session.id);
        const noteContent = notesObj['general'] || '';
        
        const htmlPreview = DOMPurify.sanitize(marked.parse(noteContent || '*No notes added yet.*'));
        
        container.innerHTML = `
            <div class="slide-note-pair no-notes" style="max-width: 800px; margin: 0 auto; flex-direction: column;">
                <div class="editor-only" style="width: 100%; text-align: center; color: var(--text-muted); margin-bottom: 1rem; font-size: 0.875rem;">
                    <i class="fa-solid fa-pen-to-square"></i> General Note Area (No PDF attached)
                </div>
                <textarea class="md-editor editor-only" id="note-general" placeholder="Start typing markdown notes here...">${noteContent}</textarea>
                
                <div class="markdown-body markdown-preview preview-only w-full" id="preview-general" style="background: var(--bg-card); border-radius: 0; box-shadow: var(--shadow-sm); min-height: 400px; border: 1px solid var(--border-color);">
                    ${htmlPreview}
                </div>
            </div>
        `;
        
        const ta = document.getElementById('note-general');
        const preview = document.getElementById('preview-general');
        
        ta.addEventListener('input', (e) => {
            const val = e.target.value;
            State.saveNoteForDocument(course.id, session.id, 'general', val);
            preview.innerHTML = DOMPurify.sanitize(marked.parse(val || '*No notes added yet.*'));
            const pairDiv = container.querySelector('.slide-note-pair');
            if(val.trim()) {
                pairDiv.classList.remove('no-notes');
            } else {
                pairDiv.classList.add('no-notes');
            }
        });
        
        window.App.activeEditorId = 'note-general';
        ta.addEventListener('focus', () => { window.App.activeEditorId = 'note-general'; });
    },

    renderExerciseWorkspace(course, session, isEdit) {
        // Simple UI: show toggle button between exercise and solution PDF
        const container = document.getElementById('workspace-container');
        container.innerHTML = `
            <div style="display: flex; justify-content: center; gap: 1rem; margin-bottom: 1rem; position: sticky; top: 0; z-index: 20; background: var(--bg-main); padding: 0.5rem;">
                <button onclick="window.App.switchExerciseDoc(true)" class="btn btn-primary" id="btn-show-exercise"><i class="fa-solid fa-file-pen"></i> Show Exercise</button>
                <button onclick="window.App.switchExerciseDoc(false)" class="btn btn-outline" id="btn-show-solution"><i class="fa-solid fa-check-double"></i> Show Solution</button>
            </div>
            <div id="exercise-pdf-container"></div>
        `;
        // default to exercise
        window.App.switchExerciseDoc(true);
    }
};

// Required CSS override to handle dropdowns
const style = document.createElement('style');
style.innerHTML = `
.group:hover .dropdown-menu {
    opacity: 1 !important;
    visibility: visible !important;
}
`;
document.head.appendChild(style);
