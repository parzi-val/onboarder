import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { RegexParser } from './parser/RegexParser';

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

// Graph Generation
interface Node {
    id: string;
    position: { x: number; y: number };
    data: { label: string; fullPath: string; directory: string };
}

interface Edge {
    id: string;
    source: string;
    target: string;
}

export async function getProjectGraph(context: vscode.ExtensionContext): Promise<{ nodes: Node[]; edges: Edge[] }> {
    // Ensure factory context is set
    const files = await getWorkspaceFiles();
    const parser = new RegexParser();
    const config = await getConfig();

    const nodes: Node[] = [];
    const edges: Edge[] = [];

    // Map of fsPath -> Node ID
    const fileToNodeId = new Map<string, string>();
    let nodeIdCounter = 0;

    // 1. Create Nodes
    for (const file of files) {
        const id = (nodeIdCounter++).toString();
        fileToNodeId.set(file.fsPath, id);

        // Calculate relative directory for clustering
        const rootDir = vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders[0].uri.fsPath : '';
        const relativePath = path.relative(rootDir, file.fsPath);
        const directory = path.dirname(relativePath); // e.g. "src/utils"

        nodes.push({
            id,
            position: { x: 0, y: 0 },
            data: {
                label: path.basename(file.fsPath),
                fullPath: file.fsPath,
                directory: directory === '.' ? 'root' : directory
            }
        });
    }

    // 2. Parse Imports & Create Edges
    const rootPath = vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders[0].uri.fsPath : '';

    const edgePromises = files.map(async (file) => {
        const ext = path.extname(file.fsPath).toLowerCase();
        // Determine languageId for parser
        let languageId = config.languageMapping[ext]?.toLowerCase();

        // Map common extensions to language IDs expected by TreeSitterParser
        if (languageId === 'c++') { languageId = 'cpp'; }
        if (ext === '.tsx') { languageId = 'typescriptreact'; }
        if (ext === '.jsx') { languageId = 'javascriptreact'; }

        // Only parse if we have a parser logic for it
        if (!['typescript', 'typescriptreact', 'javascript', 'javascriptreact', 'python', 'go', 'java'].includes(languageId || '')) {
            return;
        }

        try {
            const content = await fs.promises.readFile(file.fsPath, 'utf8');
            const imports = await parser.parseImports(content, languageId!);

            // Log for debugging (will appear in Debug Console if running in debug mode)
            if (imports.length > 0) {
                console.log(`[Onboarder Graph] ${path.basename(file.fsPath)} imports: ${imports.join(', ')}`);
            }

            const sourceId = fileToNodeId.get(file.fsPath);
            if (!sourceId) { return; }

            for (const importPath of imports) {
                // Try to resolve the targets (could be multiple files if importing a package/folder)
                const resolvedPaths = await resolveImportTargets(importPath, file.fsPath, rootPath, files);

                for (const resolvedPath of resolvedPaths) {
                    if (fileToNodeId.has(resolvedPath)) {
                        const targetId = fileToNodeId.get(resolvedPath)!;
                        // Avoid self-loops
                        if (sourceId !== targetId) {
                            // Check for duplicate edges? React Flow handles logic, but simple check here:
                            const edgeId = `e${sourceId}-${targetId}`;
                            // We are in async map, so we should be careful with shared array 'edges'.
                            // Pushing is fine, TS is single-threaded.
                            edges.push({
                                id: edgeId,
                                source: sourceId,
                                target: targetId
                            });
                        }
                    }
                }
            }
        } catch (e) {
            console.error(`Error parsing file ${file.fsPath}:`, e);
        }
    });

    await Promise.all(edgePromises);

    return { nodes, edges };
}

// Improved Resolver that handles directories/packages (Go, Java) and common JS patterns
async function resolveImportTargets(importPath: string, sourceFile: string, rootPath: string, allFiles: vscode.Uri[]): Promise<string[]> {
    const extensions = ['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.java', '/index.ts', '/index.js', '/index.tsx'];
    const hits: string[] = [];

    // Helper to check if a path points to a file directly
    const checkFile = (candidate: string) => {
        const results: string[] = [];
        // Exact match
        if (fs.existsSync(candidate) && fs.lstatSync(candidate).isFile()) {
            results.push(candidate);
        }
        // Extension match
        for (const ext of extensions) {
            const withExt = candidate + ext;
            if (fs.existsSync(withExt) && fs.lstatSync(withExt).isFile()) {
                results.push(withExt);
            }
        }
        return results;
    };

    // Helper to check if a path is a directory and return relevant workspace files in it
    const checkDir = (candidate: string) => {
        if (fs.existsSync(candidate) && fs.lstatSync(candidate).isDirectory()) {
            // Find files in allFiles that are DIRECT children of this directory
            return allFiles
                .map(f => f.fsPath)
                .filter(f => path.dirname(f) === candidate);
        }
        return [];
    };

    // 1. Relative imports
    if (importPath.startsWith('.')) {
        const absolutePath = path.resolve(path.dirname(sourceFile), importPath);
        hits.push(...checkFile(absolutePath));
        if (hits.length === 0) {
            hits.push(...checkDir(absolutePath));
        }
    }
    // 2. Absolute / Package imports
    else {
        // A. Root-relative (e.g. src/components/Button)
        const candidateRoot = path.join(rootPath, importPath);
        hits.push(...checkFile(candidateRoot));
        if (hits.length === 0) hits.push(...checkDir(candidateRoot));

        // B. Src-relative (common in JS/TS)
        if (hits.length === 0) {
            const candidateSrc = path.join(rootPath, 'src', importPath);
            hits.push(...checkFile(candidateSrc));
            if (hits.length === 0) hits.push(...checkDir(candidateSrc));
        }

        // C. Fuzzy Workspace Match (Crucial for Go/Java modules)
        // If import is "github.com/user/project/pkg/foo" or "app/utils"
        // We assume we want to find "pkg/foo" or "utils" inside the current workspace.

        if (hits.length === 0) {
            // Split import path "a/b/c"
            const parts = importPath.split('/');

            // Try matching any suffix of the import path to a folder in root
            // e.g. "github.com/a/b/c" -> check "root/c", "root/b/c", "root/a/b/c"

            // We start from the longest suffix that keeps context, but usually the project structure matches the END of the import.
            // But actually, "github.com/user/project/pkg" -> maps to "root/pkg" if we are in "project".

            for (let i = 0; i < parts.length; i++) {
                const suffix = parts.slice(i).join(path.sep); // Use OS sep for local check
                if (!suffix) { continue; }

                const candidateFuzzy = path.join(rootPath, suffix);
                if (fs.existsSync(candidateFuzzy)) {
                    if (fs.lstatSync(candidateFuzzy).isDirectory()) {
                        hits.push(...checkDir(candidateFuzzy));
                    } else if (fs.lstatSync(candidateFuzzy).isFile()) {
                        hits.push(candidateFuzzy);
                    }
                }
                if (hits.length > 0) { break; } // Found valid mapping
            }
        }
    }

    return hits;
}
