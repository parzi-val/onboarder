
// Access the globally acquired VS Code API via a lazy getter functions
// This avoids module-load-time race conditions

declare function acquireVsCodeApi(): any;

export const getVsCodeApi = () => {
    // 1. Try Global (set by inline script)
    if ((window as any).vscode) {
        return (window as any).vscode;
    }

    // 2. Try re-acquiring (last resort)
    try {
        if (typeof acquireVsCodeApi === 'function') {
            const api = acquireVsCodeApi();
            (window as any).vscode = api;
            return api;
        }
    } catch (e) {
        console.warn("Could not acquire VS Code API (likely already acquired):", e);
    }

    return null;
};
