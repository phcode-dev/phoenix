const MAX_ENTRIES = 10000;

export class LogBuffer {
    constructor() {
        this._entries = [];
        this._readIndex = 0;
        this._totalPushed = 0;
    }

    push(entry) {
        this._entries.push(entry);
        this._totalPushed++;
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

    totalPushed() {
        return this._totalPushed;
    }

    getTail(n, before) {
        const firstIndex = this._totalPushed - this._entries.length;
        let endIdx = this._entries.length;
        if (before != null) {
            endIdx = Math.max(0, Math.min(this._entries.length, before - firstIndex));
        }
        if (n === 0) {
            return this._entries.slice(0, endIdx);
        }
        const startIdx = Math.max(0, endIdx - n);
        return this._entries.slice(startIdx, endIdx);
    }

    clear() {
        this._entries = [];
        this._readIndex = 0;
    }
}
