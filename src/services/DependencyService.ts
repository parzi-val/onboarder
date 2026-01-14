import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { RegexParser } from '../utils/parser/RegexParser';
import { getWorkspaceFiles, getConfig } from '../utils/project-details';

export interface Node {
    id: string;
    position: { x: number; y: number };
    data: { label: string; fullPath: string; directory: string };
}

export interface Edge {
    id: string;
    source: string;
    target: string;
}

export class DependencyService {
    private parser: RegexParser;

    constructor() {
        this.parser = new RegexParser();
    }

    public async generate(context: vscode.ExtensionContext): Promise<{ nodes: Node[]; edges: Edge[] }> {
        console.log('[DependencyService] Starting graph generation...');
        const startTime = Date.now();

        try {
            const files = await getWorkspaceFiles();
            const config = await getConfig();

            const nodes: Node[] = [];
            const edges: Edge[] = [];

            // Map of fsPath -> Node ID
            const fileToNodeId = new Map<string, string>();
            let nodeIdCounter = 0;

            const rootDir = vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders[0].uri.fsPath : '';

            // 1. Create Nodes
            for (const file of files) {
                const id = (nodeIdCounter++).toString();
                fileToNodeId.set(file.fsPath, id);

                const relativePath = path.relative(rootDir, file.fsPath);
                const directory = path.dirname(relativePath);

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
            const concurrencyLimit = 10; // Simple concurrency control if needed, but Promise.all is mostly fine for I/O
            const errors: string[] = [];

            const edgePromises = files.map(async (file) => {
                try {
                    const ext = path.extname(file.fsPath).toLowerCase();
                    let languageId = config.languageMapping[ext]?.toLowerCase();

                    // Logic Mapping
                    if (languageId === 'c++') { languageId = 'cpp'; }
                    if (ext === '.tsx') { languageId = 'typescriptreact'; }
                    if (ext === '.jsx') { languageId = 'javascriptreact'; }

                    if (!['typescript', 'typescriptreact', 'javascript', 'javascriptreact', 'python', 'go', 'java'].includes(languageId || '')) {
                        return;
                    }

                    const content = await fs.promises.readFile(file.fsPath, 'utf8');
                    const imports = await this.parser.parseImports(content, languageId!);

                    if (imports.length > 0) {
                        // console.log(`[DependencyService] ${path.basename(file.fsPath)} imports: ${imports.length}`);
                    }

                    const sourceId = fileToNodeId.get(file.fsPath);
                    if (!sourceId) return;

                    for (const importPath of imports) {
                        const resolvedPaths = await this.resolveImport(importPath, file.fsPath, rootDir, files);

                        for (const resolvedPath of resolvedPaths) {
                            if (fileToNodeId.has(resolvedPath)) {
                                const targetId = fileToNodeId.get(resolvedPath)!;
                                if (sourceId !== targetId) {
                                    edges.push({
                                        id: `e${sourceId}-${targetId}`,
                                        source: sourceId,
                                        target: targetId
                                    });
                                }
                            }
                        }
                    }
                } catch (e) {
                    errors.push(`${path.basename(file.fsPath)}: ${e}`);
                }
            });

            await Promise.all(edgePromises);

            console.log(`[DependencyService] Generation complete. Nodes: ${nodes.length}, Edges: ${edges.length}, Time: ${Date.now() - startTime}ms`);
            if (errors.length > 0) {
                console.warn(`[DependencyService] Encountered ${errors.length} errors during parsing.`);
            }

            return { nodes, edges };

        } catch (error) {
            console.error('[DependencyService] Fatal error generating graph:', error);
            throw error;
        }
    }

    private async resolveImport(importPath: string, sourceFile: string, rootPath: string, allFiles: vscode.Uri[]): Promise<string[]> {
        const extensions = ['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.java', '/index.ts', '/index.js', '/index.tsx'];
        const hits: string[] = [];

        // Helper to check if a path points to a file directly
        const checkFile = (candidate: string) => {
            const results: string[] = [];
            if (fs.existsSync(candidate) && fs.lstatSync(candidate).isFile()) {
                results.push(candidate);
            }
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
            // A. Root-relative
            const candidateRoot = path.join(rootPath, importPath);
            hits.push(...checkFile(candidateRoot));
            if (hits.length === 0) hits.push(...checkDir(candidateRoot));

            // B. Src-relative
            if (hits.length === 0) {
                const candidateSrc = path.join(rootPath, 'src', importPath);
                hits.push(...checkFile(candidateSrc));
                if (hits.length === 0) hits.push(...checkDir(candidateSrc));
            }

            // C. Fuzzy Workspace Match (Go/Java/Python modules)
            if (hits.length === 0) {
                const parts = importPath.split('/');
                for (let i = 0; i < parts.length; i++) {
                    const suffix = parts.slice(i).join(path.sep);
                    if (!suffix) continue;

                    const candidateFuzzy = path.join(rootPath, suffix);
                    if (fs.existsSync(candidateFuzzy)) {
                        if (fs.lstatSync(candidateFuzzy).isDirectory()) {
                            hits.push(...checkDir(candidateFuzzy));
                        } else if (fs.lstatSync(candidateFuzzy).isFile()) {
                            hits.push(candidateFuzzy);
                        }
                    }
                    if (hits.length > 0) break;
                }
            }
        }

        return hits;
    }
}
