import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { getProjectGraph } from '../utils/project-details';

export class GraphServer {
    private server: http.Server | null = null;
    private port: number = 0;
    private context: vscode.ExtensionContext;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
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
                        const graphData = await getProjectGraph(this.context);
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify(graphData));
                    } catch (error) {
                        res.writeHead(500);
                        res.end(JSON.stringify({ error: String(error) }));
                    }
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
