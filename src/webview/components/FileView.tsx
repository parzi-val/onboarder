import React from 'react';
import { FileText, Cpu, Link } from 'lucide-react';

interface FileData {
    name: string;
    path: string;
    summary?: string;
    functions?: { name: string; signature: string }[];
    classes?: { name: string }[];
}

const FileView: React.FC<{ data: FileData | null }> = ({ data }) => {
    if (!data) {
        return (
            <div className="flex flex-col items-center justify-center h-full p-4 text-center opacity-60">
                <FileText size={48} className="mb-4" />
                <p>Open a file to see details</p>
            </div>
        );
    }

    return (
        <div className="p-4">
            <h2 className="text-xl font-bold mb-2 break-all">{data.name}</h2>
            <p className="text-xs opacity-70 mb-4">{data.path}</p>

            {data.summary && (
                <div className="mb-6 p-3 bg-vscode-textBlockQuote-background border-l-4 border-vscode-textBlockQuote-border">
                    <h3 className="text-sm font-semibold mb-1">Summary</h3>
                    <p className="text-sm">{data.summary}</p>
                </div>
            )}

            <div className="space-y-4">
                {data.classes && data.classes.length > 0 && (
                    <section>
                        <h3 className="flex items-center gap-2 font-semibold mb-2">
                            <Cpu size={16} /> Classes
                        </h3>
                        {data.classes.map((cls, idx) => (
                            <div key={idx} className="p-2 bg-vscode-list-hoverBackground rounded mb-1">
                                <code className="text-sm">{cls.name}</code>
                            </div>
                        ))}
                    </section>
                )}

                {data.functions && data.functions.length > 0 && (
                    <section>
                        <h3 className="flex items-center gap-2 font-semibold mb-2">
                            <Link size={16} /> Functions
                        </h3>
                        {data.functions.map((func, idx) => (
                            <div key={idx} className="p-2 bg-vscode-list-hoverBackground rounded mb-1">
                                <code className="text-xs block mb-1">{func.signature}</code>
                            </div>
                        ))}
                    </section>
                )}
            </div>
        </div>
    );
};

export default FileView;
