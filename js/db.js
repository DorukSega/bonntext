// LocalForage wrapper for State and Files

export const DB = {
    stateStore: localforage.createInstance({ name: "BonnText", storeName: "state" }),
    fileStore: localforage.createInstance({ name: "BonnText", storeName: "files" }),
    textStore: localforage.createInstance({ name: "BonnText", storeName: "texts" }), // for search
    
    async saveState(state) {
        try { await this.stateStore.setItem('app_state', state); } 
        catch (e) { console.error('Failed to save state locally', e); throw e; }
    },
    
    async loadState() {
        try { return await this.stateStore.getItem('app_state'); } 
        catch (e) { console.error(e); return null; }
    },
    
    async saveFile(fileId, base64Data) {
        try { await this.fileStore.setItem(fileId, base64Data); } 
        catch (e) { console.error('Failed to save file. Storage might be full.', e); throw e; }
    },
    
    async loadFile(fileId) {
        try { return await this.fileStore.getItem(fileId); } 
        catch (e) { console.error(e); return null; }
    },
    
    async deleteFile(fileId) {
        try { await this.fileStore.removeItem(fileId); } 
        catch (e) { console.error(e); }
    },

    async saveExtractedText(fileId, textArray) {
        try { await this.textStore.setItem(fileId, textArray); }
        catch (e) { console.error('Failed to save extracted text', e); }
    },

    async loadExtractedText(fileId) {
        try { return await this.textStore.getItem(fileId); }
        catch (e) { console.error(e); return null; }
    },
    
    async deleteExtractedText(fileId) {
        try { await this.textStore.removeItem(fileId); }
        catch (e) { console.error(e); }
    }
};
