import * as vscode from 'vscode';
import getHtml, { getLoadingHtml } from './utils/pane';
import { getProjectName, getWorkspaceFiles, getFileCount, getLanguageDistribution } from './utils/project-details';

export function activate(context: vscode.ExtensionContext) {
	const disposable = vscode.commands.registerCommand('onboarder.helloWorld', () => {
		vscode.window.showInformationMessage('Hello World from onboarder!');
	});

	context.subscriptions.push(disposable);

	const openPane = vscode.commands.registerCommand(
    "onboarder.openPane",
    async () => {
      const panel = vscode.window.createWebviewPanel(
        "onboarderPane",             
        "Onboarder",                 
        vscode.ViewColumn.Beside,     
        {
          enableScripts: true
        }
      );

      // Show loading spinner
      panel.webview.html = getLoadingHtml();

      const projectName = await getProjectName();
      const workspaceFiles = await getWorkspaceFiles();
      const fileCount = await getFileCount(workspaceFiles);
      const languageDistribution = await getLanguageDistribution(workspaceFiles);

      // Update with actual content
      panel.webview.html = getHtml(
        projectName,
        fileCount,
        languageDistribution
      );
    }
  );

  context.subscriptions.push(openPane);
}

export function deactivate() {}
