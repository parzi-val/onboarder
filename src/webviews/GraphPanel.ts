import * as vscode from "vscode";
import { getProjectGraph } from "../utils/project-details";

export class GraphPanel {
    public static currentPanel: GraphPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private readonly _context: vscode.ExtensionContext;
    private _disposables: vscode.Disposable[] = [];

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, context: vscode.ExtensionContext) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._context = context;

        this._update();

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        this._panel.webview.onDidReceiveMessage(
            (message) => {
                switch (message.command) {
                    case "alert":
                        vscode.window.showErrorMessage(message.text);
                        return;
                    case "openFile":
                        const openPath = vscode.Uri.file(message.path);
                        vscode.workspace.openTextDocument(openPath).then(doc => {
                            vscode.window.showTextDocument(doc);
                        });
                        return;
                }
            },
            null,
            this._disposables
        );
    }

    public static createOrShow(extensionUri: vscode.Uri, context: vscode.ExtensionContext) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        if (GraphPanel.currentPanel) {
            GraphPanel.currentPanel._panel.reveal(column);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            "onboarderGraph",
            "Dependency Graph",
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [extensionUri],
            }
        );

        GraphPanel.currentPanel = new GraphPanel(panel, extensionUri, context);
    }

    public dispose() {
        GraphPanel.currentPanel = undefined;

        this._panel.dispose();

        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }

    private async _update() {
        const webview = this._panel.webview;
        this._panel.webview.html = this._getHtmlForWebview(webview);

        try {
            const graphData = await getProjectGraph(this._context);
            // Send data after a short delay to ensure react is ready, or use the request mechanism
            setTimeout(() => {
                this._panel.webview.postMessage({ type: 'graph-data', payload: graphData });
            }, 1000);
        } catch (e) {
            console.error("Failed to generate graph", e);
        }
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, "out", "webview.js")
        );
        const styleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, "out", "webview.css")
        );

        const nonce = getNonce();

        return `<!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource} 'unsafe-inline' 'nonce-${nonce}';">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Onboarder Graph</title>
        <link href="${styleUri}" rel="stylesheet">
      </head>
      <body>
        <div id="root"><h2>Loading Onboarder Graph...</h2></div>
        <script nonce="${nonce}">
            try {
                console.log("[GraphPanel] Inline script starting...");
                window.initialMode = 'graph';
                const vscode = acquireVsCodeApi();
                window.vscode = vscode;
                console.log("[GraphPanel] VS Code API acquired and attached to window.");
            } catch (e) {
                console.error("[GraphPanel] Inline script error:", e);
            }
            
            window.onload = () => {
                setTimeout(() => {
                    // Tell React to switch to graph mode if it didn't pick up initialMode
                    window.postMessage({ type: 'show-graph' }, '*');
                }, 100);
            }
        </script>
        <script nonce="${nonce}" src="${scriptUri}"></script>
      </body>
      </html>`;
    }
}

function getNonce() {
    let text = "";
    const possible =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
