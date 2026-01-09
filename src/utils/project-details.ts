import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

interface OnboarderConfig {
    ignorePatterns: string[];
    languageMapping: Record<string, string>;
    projectNameDetectors: {
        file: string;
        parser: 'json' | 'regex';
        key?: string;
        pattern?: string;
    }[];
}

async function getConfig(): Promise<OnboarderConfig> {
    const configPath = path.join(__dirname, '..', 'onboarder.config.json');
    const defaultConfig: OnboarderConfig = {
        ignorePatterns: [],
        languageMapping: {},
        projectNameDetectors: [],
    };

    try {
        const configContent = await fs.promises.readFile(configPath, 'utf8');
        return JSON.parse(configContent) as OnboarderConfig;
    } catch (error) {
        console.error("Error reading onboarder.config.json:", error);
        return defaultConfig;
    }
}

export async function getProjectName(): Promise<string> {
    if (!vscode.workspace.workspaceFolders) {
        return "Unknown Project";
    }

    const rootPath = vscode.workspace.workspaceFolders[0].uri.fsPath;
    const rootName = path.basename(rootPath);
    const config = await getConfig();

    for (const detector of config.projectNameDetectors) {
        const filePath = path.join(rootPath, detector.file);
        try {
            const content = await fs.promises.readFile(filePath, 'utf8');
            let name: string | undefined;

            if (detector.parser === 'json' && detector.key) {
                name = JSON.parse(content)[detector.key];
            } else if (detector.parser === 'regex' && detector.pattern) {
                const regex = new RegExp(detector.pattern);
                const match = content.match(regex);
                if (match && match[1]) {
                    name = match[1];
                }
            }

            if (name) {
                return name;
            }
        } catch (error) {
        }
    }

    return rootName || "Unknown Project";
}

export async function getWorkspaceFiles(): Promise<vscode.Uri[]> {
    if (!vscode.workspace.workspaceFolders) {
        return [];
    }
    const config = await getConfig();
    const excludePattern = `{${config.ignorePatterns.join(',')}}`;


    const files = await vscode.workspace.findFiles('**/*', excludePattern, Infinity);
    return files;
}

export async function getFileCount(files: vscode.Uri[]): Promise<number> {
    return files.length;
}

export async function getLanguageDistribution(files: vscode.Uri[]): Promise<{ name: string; percentage: number }[]> {
    const languageLines: Map<string, number> = new Map();
    let totalLines = 0;
    const config = await getConfig();
    const extensionToLanguage = config.languageMapping;

    const fileReadPromises = files.map(async (fileUri) => {
        const ext = path.extname(fileUri.fsPath).toLowerCase();
        const language = extensionToLanguage[ext] || 'Other';

        try {
            const content = await fs.promises.readFile(fileUri.fsPath, 'utf8');
            const lines = content.split(/\r\n|\r|\n/).length;

            languageLines.set(language, (languageLines.get(language) || 0) + lines);
            totalLines += lines;
        } catch (error) {
        }
    });

    await Promise.all(fileReadPromises);

    const result: { name: string; percentage: number }[] = [];
    for (const [lang, lines] of languageLines.entries()) {
        if (totalLines > 0) {
            result.push({ name: lang, percentage: parseFloat(((lines / totalLines) * 100).toFixed(0)) });
        }
    }

    result.sort((a, b) => b.percentage - a.percentage);

    return result;
}
