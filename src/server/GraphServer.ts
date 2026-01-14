import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { DependencyService } from '../services/DependencyService';

export class GraphServer {
    private server: http.Server | null = null;
    private port: number = 0;
    private context: vscode.ExtensionContext;

    private isDirty: boolean = true;
    private watcher: vscode.FileSystemWatcher | null = null;
    private dependencyService: DependencyService;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.dependencyService = new DependencyService();

        // Watch for file changes to invalidate cache
        // We use a broad pattern but focused on likely source files to avoid noise, plus .gitignore
        this.watcher = vscode.workspace.createFileSystemWatcher('**/{*.{ts,js,tsx,jsx,py,go,java,json},.gitignore}');
        this.watcher.onDidChange(() => { this.isDirty = true; });
        this.watcher.onDidCreate(() => { this.isDirty = true; });
        this.watcher.onDidDelete(() => { this.isDirty = true; });
    }

    private getCachePath(): string | null {
        if (!this.context.storageUri) return null;
        return path.join(this.context.storageUri.fsPath, 'graph_cache.json');
    }

    private async getGraphDataWithCache(): Promise<any> {
        const cachePath = this.getCachePath();
        if (cachePath) {
            console.log(`[GraphServer] Cache Path: ${cachePath}`);
        }

        // 1. Try to load from Cache
        if (cachePath && !this.isDirty && fs.existsSync(cachePath)) {
            try {
                const raw = await fs.promises.readFile(cachePath, 'utf8');
                console.log("[GraphServer] Status: HIT (Serving from disk)");
                return JSON.parse(raw);
            } catch (e) {
                console.warn("Failed to read cache:", e);
            }
        }

        // 2. Refresh Data
        console.log("[GraphServer] Status: MISS (Parsing fresh graph...)");
        const graphData = await this.dependencyService.generate(this.context);

        // 3. Write to Cache
        if (cachePath) {
            try {
                const dir = path.dirname(cachePath);
                if (!fs.existsSync(dir)) {
                    await fs.promises.mkdir(dir, { recursive: true });
                }
                await fs.promises.writeFile(cachePath, JSON.stringify(graphData), 'utf8');
                this.isDirty = false;
                console.log("[GraphServer] Cache updated and saved to disk.");
            } catch (e) {
                console.warn("Failed to write cache:", e);
            }
        }

        return graphData;
    }

    public async start(): Promise<string> {
        if (this.server) {
            return `http://localhost:${this.port}`;
        }

        return new Promise((resolve, reject) => {
            this.server = http.createServer(async (req, res) => {
                // Enable CORS
                res.setHeader('Access-Control-Allow-Origin', '*');

                if (req.url === '/api/graph') {
                    // Serve Graph Data
                    try {
                        const projectPath = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
                        if (!projectPath) {
                            throw new Error('No workspace open');
                        }
                        const graphData = await this.getGraphDataWithCache();
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify(graphData));
                    } catch (error) {
                        res.writeHead(500);
                        res.end(JSON.stringify({ error: String(error) }));
                    }
                    return;
                }

                if (req.url === '/api/open-file' && req.method === 'POST') {
                    let body = '';
                    req.on('data', chunk => { body += chunk.toString(); });
                    req.on('end', async () => {
                        try {
                            const { path: filePath } = JSON.parse(body);
                            if (filePath && fs.existsSync(filePath)) {
                                const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
                                await vscode.window.showTextDocument(doc, {
                                    preview: false,
                                    preserveFocus: false,
                                    viewColumn: vscode.ViewColumn.One
                                });
                                // Attempt to force focus
                                await vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup');
                                vscode.window.showInformationMessage(`Onboarder: Opened ${path.basename(filePath)}`);
                                res.writeHead(200, { 'Content-Type': 'application/json' });
                                res.end(JSON.stringify({ success: true }));
                            } else {
                                res.writeHead(404);
                                res.end(JSON.stringify({ error: 'File not found' }));
                            }
                        } catch (error) {
                            res.writeHead(500);
                            res.end(JSON.stringify({ error: String(error) }));
                        }
                    });
                    return;
                }

                if (req.url === '/') {
                    // Serve Index HTML wrapper
                    // We need a custom HTML that loads the script from the correct path
                    const html = this.getIndexHtml();
                    res.writeHead(200, { 'Content-Type': 'text/html' });
                    res.end(html);
                    return;
                }

                // Serve Static Files (JS/CSS)
                // The build output is likely in 'out/webview' or similar. 
                // We need to verify where build-script.js outputs.
                // Assuming extension path + out/compiled... let's check.
                // For now, let's assume specific files we know exist.

                // Safety: Prevent traversing out of extension dir
                const safeSuffix = path.normalize(req.url || '').replace(/^(\.\.[\/\\])+/, '');
                const filePath = path.join(this.context.extensionPath, 'out', safeSuffix);

                if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
                    const ext = path.extname(filePath);
                    const contentType = {
                        '.js': 'text/javascript',
                        '.css': 'text/css',
                        '.html': 'text/html',
                    }[ext] || 'text/plain';

                    res.writeHead(200, { 'Content-Type': contentType });
                    fs.createReadStream(filePath).pipe(res);
                } else {
                    res.writeHead(404);
                    res.end('Not found');
                }
            });

            this.server.listen(0, () => { // Random available port
                const address = this.server?.address();
                if (typeof address === 'object' && address !== null) {
                    this.port = address.port;
                    console.log(`Graph Server running at http://localhost:${this.port}`);
                    resolve(`http://localhost:${this.port}`);
                } else {
                    reject(new Error('Failed to get server port'));
                }
            });
        });
    }

    public stop() {
        if (this.watcher) {
            this.watcher.dispose();
            this.watcher = null;
        }
        if (this.server) {
            this.server.close();
            this.server = null;
        }
    }

    private getIndexHtml() {
        return `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Onboarder Graph</title>
                <style>
                    body { margin: 0; padding: 0; background-color: #0f0f0f; color: white; }
                </style>
            </head>
            <body>
                <div id="root"></div>
                <script>
                    window.vscode = null; // Signal to App to use fetch
                </script>
                <link rel="stylesheet" href="/webview.css">
                <script src="/webview.js"></script>
            </body>
            </html>
        `;
    }
}
