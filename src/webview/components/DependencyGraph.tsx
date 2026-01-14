import React, { useEffect, useRef, useState } from 'react';
import { GraphEngine } from '../graph/GraphEngine';

const DependencyGraph: React.FC = () => {
    const containerRef = useRef<HTMLDivElement>(null);
    const engineRef = useRef<GraphEngine | null>(null);
    const [modalData, setModalData] = useState<any>(null);

    useEffect(() => {
        if (!containerRef.current) return;

        // Initialize Engine
        if (!engineRef.current) {
            engineRef.current = new GraphEngine(containerRef.current);
            engineRef.current.onSelectionChange = (data) => {
                setModalData(data);
            };
        }

        // Data Fetching Logic
        const isBrowser = (window as any).vscode === null && (window as any).acquireVsCodeApi === undefined;

        if (isBrowser) {
            fetch('/api/graph')
                .then(res => res.json())
                .then(data => {
                    engineRef.current?.init(data.nodes, data.edges);
                })
                .catch(err => console.error("Failed to fetch graph data:", err));
        } else {
            const handleMessage = (event: MessageEvent) => {
                const message = event.data;
                if (message.type === 'graph-data') {
                    const { nodes, edges } = message.payload;
                    engineRef.current?.init(nodes, edges);
                }
            };
            window.addEventListener('message', handleMessage);
            return () => window.removeEventListener('message', handleMessage);
        }

        return () => {
            engineRef.current?.dispose();
        };
    }, []);

    return (
        <div
            ref={containerRef}
            style={{
                width: '100%',
                height: '100vh',
                background: '#111111',
                overflow: 'hidden',
                position: 'relative',
                fontFamily: '"JetBrains Mono", monospace'
            }}
        >
            {/* Controls Overlay */}
            <div style={{
                position: 'absolute',
                bottom: 30,
                right: 30,
                zIndex: 1000,
                background: 'rgba(15, 15, 15, 0.90)',
                backdropFilter: 'blur(12px)',
                padding: '24px',
                borderRadius: '16px',
                border: '1px solid rgba(255,255,255,0.15)',
                boxShadow: '0 12px 48px rgba(0,0,0,0.6)',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
                color: '#ddd',
                fontSize: '13px',
                minWidth: '280px'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 700, color: '#fff', fontSize: '14px', letterSpacing: '-0.5px' }}>CONTROLS</span>
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                        onClick={() => {
                            if (engineRef.current) {
                                (engineRef.current as any).toggleTheme();
                            }
                        }}
                        style={{
                            flex: 1,
                            padding: '8px 14px',
                            background: '#333',
                            color: '#fff',
                            border: '1px solid #555',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '11px',
                            fontWeight: 600,
                            fontFamily: '"JetBrains Mono", monospace'
                        }}
                    >
                        THEME_TOGGLE
                    </button>
                    <button
                        onClick={() => {
                            if (engineRef.current) {
                                (engineRef.current as any).resetCamera();
                            }
                        }}
                        style={{
                            flex: 1,
                            padding: '8px 14px',
                            background: '#444',
                            color: '#fff',
                            border: '1px solid #666',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '11px',
                            fontWeight: 600,
                            fontFamily: '"JetBrains Mono", monospace'
                        }}
                    >
                        RESET_CAM
                    </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', opacity: 0.9, marginTop: '4px' }}>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                        <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#4D96FF', flexShrink: 0 }}></span>
                        <span>Double-Click Node -&gt; Focus</span>
                    </div>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                        <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#6BCB77', flexShrink: 0 }}></span>
                        <span>Double-Click Cluster -&gt; Zoom</span>
                    </div>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                        <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#888', flexShrink: 0 }}></span>
                        <span>BACKGROUND -&gt; NO ACTION (Safe)</span>
                    </div>
                </div>
            </div>

            {/* Modal Overlay */}
            {modalData && (
                <div style={{
                    position: 'absolute',
                    top: 30,
                    right: 30,
                    width: 320,
                    background: 'rgba(15, 15, 15, 0.9)',
                    backdropFilter: 'blur(12px)',
                    padding: 24,
                    color: '#eee',
                    borderRadius: 16,
                    border: '1px solid rgba(255,255,255,0.15)',
                    boxShadow: '0 12px 48px rgba(0,0,0,0.6)',
                    zIndex: 999
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                        <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700 }}>{modalData.label}</h3>
                        <button
                            onClick={() => setModalData(null)}
                            style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 18 }}
                        >✕</button>
                    </div>
                    <div style={{ fontSize: '1.0rem', color: '#bbb', marginBottom: 12 }}>
                        <span style={{ color: '#666', display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: 4 }}>DIRECTORY</span>
                        {modalData.directory}
                    </div>
                    <div style={{ fontSize: '0.95rem', color: '#ccc', lineHeight: 1.6 }}>
                        {modalData.description ? (
                            modalData.description
                        ) : modalData.type === 'node' ? (
                            <button
                                onClick={() => {
                                    // Lazy Loading VS Code API
                                    const { getVsCodeApi } = require('../vscode-api');
                                    const vscode = getVsCodeApi();

                                    if (vscode) {
                                        vscode.postMessage({
                                            command: 'openFile',
                                            path: modalData.path
                                        });
                                    } else {
                                        console.error("VS Code API not available. Path:", modalData.path);
                                    }
                                }}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    padding: '8px 12px',
                                    background: '#0F4C81', // Blue-ish
                                    color: '#fff',
                                    border: '1px solid #1F5FA0',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    fontSize: '0.9rem',
                                    fontWeight: 600,
                                    fontFamily: '"JetBrains Mono", monospace',
                                    marginTop: '8px'
                                }}
                            >
                                <span>Go to File</span>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="7" y1="17" x2="17" y2="7"></line>
                                    <polyline points="7 7 17 7 17 17"></polyline>
                                </svg>
                            </button>
                        ) : (
                            <span style={{ color: '#666', fontStyle: 'italic' }}>No description available.</span>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default DependencyGraph;
