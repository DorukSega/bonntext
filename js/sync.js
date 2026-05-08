import { DB } from './db.js';
import { State } from './state.js';
import { UI } from './ui.js';

export const Sync = {
    async pushToGithub() {
        if (!State.settings.githubToken) {
            UI.showToast('Please provide a GitHub Token', 'error');
            return;
        }

        const state = await DB.loadState();
        if (!state) {
            UI.showToast('No data to sync', 'error');
            return;
        }

        const content = JSON.stringify(state, null, 2);
        const btn = document.getElementById('sync-push-btn');
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Pushing...';
        btn.disabled = true;

        try {
            let response;
            if (State.settings.gistId) {
                response = await fetch(`https://api.github.com/gists/${State.settings.gistId}`, {
                    method: 'PATCH',
                    headers: {
                        'Authorization': `token ${State.settings.githubToken}`,
                        'Accept': 'application/vnd.github.v3+json'
                    },
                    body: JSON.stringify({
                        files: { 'bonntext_state.json': { content } }
                    })
                });
            } else {
                response = await fetch('https://api.github.com/gists', {
                    method: 'POST',
                    headers: {
                        'Authorization': `token ${State.settings.githubToken}`,
                        'Accept': 'application/vnd.github.v3+json'
                    },
                    body: JSON.stringify({
                        description: 'BonnText App State Backup',
                        public: false,
                        files: { 'bonntext_state.json': { content } }
                    })
                });
            }

            if (!response.ok) throw new Error('GitHub API Error');
            const data = await response.json();
            
            if (!State.settings.gistId) {
                State.settings.gistId = data.id;
                document.getElementById('github-gist-id').value = data.id;
                localStorage.setItem('bt_gist_id', data.id);
            }
            
            UI.showToast('Successfully synced to GitHub', 'success');
        } catch (e) {
            console.error(e);
            UI.showToast('Sync failed. Check token and permissions.', 'error');
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    },

    async pullFromGithub() {
        if (!State.settings.githubToken || !State.settings.gistId) {
            UI.showToast('Both Token and Gist ID are required to pull', 'error');
            return;
        }

        const btn = document.getElementById('sync-pull-btn');
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Pulling...';
        btn.disabled = true;

        try {
            const response = await fetch(`https://api.github.com/gists/${State.settings.gistId}`, {
                headers: {
                    'Authorization': `token ${State.settings.githubToken}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });

            if (!response.ok) throw new Error('GitHub API Error');
            const data = await response.json();
            
            const file = data.files['bonntext_state.json'];
            if (!file) throw new Error('bonntext_state.json not found in Gist');

            const stateContent = JSON.parse(file.content);
            await DB.saveState(stateContent);
            await State.init(); // Reload
            
            UI.renderSidebar();
            if(State.active.courseId) {
                if(State.active.sessionId) UI.renderSessionView(State.active.courseId, State.active.sessionId);
                else UI.renderCourseView(State.active.courseId);
            } else {
                UI.renderDashboard();
            }
            
            UI.showToast('Successfully pulled from GitHub', 'success');
        } catch (e) {
            console.error(e);
            UI.showToast('Pull failed. Check Gist ID.', 'error');
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    }
};
