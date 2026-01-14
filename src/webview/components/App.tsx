import React, { useEffect, useState } from 'react';
import FileView from './FileView';
import DependencyGraph from './DependencyGraph';

// Define the types of messages we can receive from the extension
interface Message {
    type: 'file-selected' | 'show-graph';
    payload: any;
}

// Global state injected by VS Code
declare const window: any;
const vscode = window.vscode;

const App: React.FC = () => {
    // We determine our mode based on initial configuration or context
    // In Browser Mode (GraphServer), vscode is null/undefined, so we default to 'graph'
    const isBrowser = (window as any).vscode === null;
    const initialMode = isBrowser ? 'graph' : ((window as any).initialMode || 'sidebar');

    const [viewMode, setViewMode] = useState<'sidebar' | 'graph'>(initialMode);
    const [fileData, setFileData] = useState<any>(null);

    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            const message: Message = event.data;
            switch (message.type) {
                case 'file-selected':
                    setFileData(message.payload);
                    setViewMode('sidebar');
                    break;
                case 'show-graph':
                    setViewMode('graph');
                    break;
            }
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, []);

    return (
        <div className="h-screen w-full bg-vscode-editor-background text-vscode-editor-foreground font-sans">
            {viewMode === 'sidebar' ? (
                <FileView data={fileData} />
            ) : (
                <DependencyGraph />
            )}
        </div>
    );
};

export default App;
