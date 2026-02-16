const MAX_ENTRIES = 10000;

export class LogBuffer {
    constructor() {
        this._entries = [];
        this._readIndex = 0;
    }

    push(entry) {
        this._entries.push(entry);
        if (this._entries.length > MAX_ENTRIES) {
            const overflow = this._entries.length - MAX_ENTRIES;
            this._entries.splice(0, overflow);
            this._readIndex = Math.max(0, this._readIndex - overflow);
        }
    }

    getAll() {
        return this._entries.slice();
    }

    getSinceLastRead() {
        const newEntries = this._entries.slice(this._readIndex);
        this._readIndex = this._entries.length;
        return newEntries;
    }

    clear() {
        this._entries = [];
        this._readIndex = 0;
    }
}
