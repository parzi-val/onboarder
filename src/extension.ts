import * as vscode from 'vscode';
import { SidebarProvider } from './webviews/SidebarProvider';
import { GraphPanel } from './webviews/GraphPanel';
import { GraphServer } from './server/GraphServer';

export function activate(context: vscode.ExtensionContext) {
  const sidebarProvider = new SidebarProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      "onboarder-sidebar",
      sidebarProvider
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('onboarder.openGraph', () => {
      GraphPanel.createOrShow(context.extensionUri, context);
    })
  );

  const graphServer = new GraphServer(context);
  context.subscriptions.push(
    vscode.commands.registerCommand('onboarder.openGraphInBrowser', async () => {
      try {
        const url = await graphServer.start();
        vscode.env.openExternal(vscode.Uri.parse(url));
        vscode.window.showInformationMessage(`Graph opened at ${url}`);
      } catch (err) {
        vscode.window.showErrorMessage(`Failed to start graph server: ${err}`);
      }
    })
  );

  // Keep the old hello world command for sanity check if needed, or remove it.
  const disposable = vscode.commands.registerCommand('onboarder.helloWorld', () => {
    vscode.window.showInformationMessage('Hello World from onboarder!');
  });
  context.subscriptions.push(disposable);
}

export function deactivate() { }
