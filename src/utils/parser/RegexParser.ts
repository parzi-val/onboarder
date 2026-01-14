
export class RegexParser {
    public async parseImports(
        content: string,
        languageId: string
    ): Promise<string[]> {
        const imports: Set<string> = new Set();

        // Basic regexes for supported languages
        // Note: These are simplified and might not catch all cases (e.g. multi-line imports in Go)
        // But they are sufficient for a "Get it working" baseline.
        const regexes: Record<string, RegExp> = {
            'typescript': /from\s+['"](.*?)['"]/g,
            'typescriptreact': /from\s+['"](.*?)['"]/g,
            'javascript': /from\s+['"](.*?)['"]/g,
            'javascriptreact': /from\s+['"](.*?)['"]/g,
            'python': /(?:^|\s)(?:from|import)\s+([\w.]+)/g,
            'go': /import\s+"(.*?)"|import\s+\(\s*([\s\S]*?)\s*\)/g, // Attempt to handle blocks?
            'java': /import\s+([\w.]+);/g,
            'cpp': /#include\s+["<](.*?)[">]/g,
            'c': /#include\s+["<](.*?)[">]/g,
        };

        // Go specific handling for blocks requires more logic or multiple passes.
        // For now let's use a simpler per-line approach or multiple regexes.

        if (languageId === 'go') {
            // 1. Single line: import "fmt"
            const singleLine = /import\s+"(.*?)"/g;
            let match;
            while ((match = singleLine.exec(content)) !== null) {
                imports.add(match[1]);
            }
            // 2. Blocks: import ( ... )
            // Naive block extractor: fine lines between import ( and )
            const blockRegex = /import\s+\(([\s\S]*?)\)/g;
            while ((match = blockRegex.exec(content)) !== null) {
                const blockContent = match[1];
                const lines = blockContent.split('\n');
                for (const line of lines) {
                    const lineMatch = /"(.+?)"/.exec(lines[0]); // Just find quote in line
                    // Wait, loop over 'line' variable
                    const quoteMatch = /"(.*?)"/.exec(line);
                    if (quoteMatch) {
                        imports.add(quoteMatch[1]);
                    }
                }
            }
        } else {
            const regex = regexes[languageId];
            if (regex) {
                let match;
                // Reset lastIndex just in case
                regex.lastIndex = 0;
                while ((match = regex.exec(content)) !== null) {
                    // Capture group 1 is usually the path
                    if (match[1]) {
                        imports.add(match[1]);
                    }
                }
            }

            // Additional check for JS/TS: require()
            if (['javascript', 'typescript', 'javascriptreact', 'typescriptreact'].includes(languageId)) {
                const requireRegex = /require\(['"](.*?)['"]\)/g;
                let match;
                while ((match = requireRegex.exec(content)) !== null) {
                    if (match[1]) imports.add(match[1]);
                }
                // dynamic import() ?
            }
        }

        return Array.from(imports);
    }
}
