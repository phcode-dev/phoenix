// Adapted state management — no Tauri persistence, externally controlled
import { emit } from "./events.js";

const defaultState = {
    currentContent: null,
    parseResult: null,
    theme: "light",
    locale: "en",
    editMode: false,
    isDirty: false
};

let state = { ...defaultState };

export function getState() {
    return state;
}

export function setState(updates) {
    const prev = { ...state };
    Object.assign(state, updates);

    // Emit change events for each changed key
    for (const key of Object.keys(updates)) {
        if (prev[key] !== state[key]) {
            emit("state:" + key, state[key]);
        }
    }

    emit("state:changed", state);
}

export function resetState() {
    state = { ...defaultState };
}
