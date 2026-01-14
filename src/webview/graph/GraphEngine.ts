import { Layout, GraphNode, GraphLink } from './Layout';
import { Renderer } from './Renderer';
import { HullGenerator } from './HullGenerator';
import { InputManager } from './InputManager';

export class GraphEngine {
    private layout: Layout;
    private renderer: Renderer;
    private hullGenerator: HullGenerator;
    private inputManager: InputManager;
    private isRunning: boolean = false;
    public onSelectionChange?: (data: any) => void;

    private isDragging: boolean = false;
    private selectedNodeId: string | null = null;

    public toggleTheme() {
        this.renderer.toggleTheme();
        this.update(); // Force re-render
    }

    public resetCamera() {
        // Reset Logic: Clear Selection + Reset Camera
        this.selectedNodeId = null;
        this.renderer.updateSelection(null, new Set(), null);
        this.update();

        if (this.onSelectionChange) {
            this.onSelectionChange(null);
        }

        this.renderer.smoothLookAt(0, 0, 1.0);
    }

    constructor(container: HTMLElement) {
        // Initialize Components
        this.renderer = new Renderer({
            onClickNode: this.handleNodeClick.bind(this),
            onClickHull: this.handleHullClick.bind(this),
            onClickBackground: this.handleBackgroundClick.bind(this),
            onDragStart: this.handleDragStart.bind(this),
            onDragMove: this.handleDragMove.bind(this),
            onDragEnd: this.handleDragEnd.bind(this)
        });

        // Connect Input Manager
        this.inputManager = new InputManager(
            container,
            (scale, x, y) => this.renderer.setTransform(scale, x, y),
            (dx, dy) => this.renderer.pan(dx, dy)
        );

        this.layout = new Layout(() => {
            this.update();
        });

        this.hullGenerator = new HullGenerator();

        // Start Init
        this.renderer.init(container).then(() => {
            console.log("Renderer Initialized");
            // Initial Zoom (Wait for layout to run a bit?)
            setTimeout(() => {
                this.renderer.smoothLookAt(0, 0, 1.2);
            }, 500);
        });
    }

    public async init(nodes: any[], edges: any[]) {
        // Convert raw data to GraphNode/Link
        const graphNodes: GraphNode[] = nodes.map(n => ({
            id: n.id,
            label: n.data.label,
            directory: n.data.directory || 'root',
            fullPath: n.data.fullPath, // MAP ACTUAL PATH
            x: Math.random() * 100, // Initial random
            y: Math.random() * 100
        }));

        const graphLinks: GraphLink[] = edges.map(e => ({
            source: e.source,
            target: e.target
        }));

        this.layout.setData(graphNodes, graphLinks);
        this.isRunning = true;
    }

    private update() {
        if (!this.isRunning) return;

        // 1. Get Positions from Layout
        const nodes = this.layout.getNodes();
        const links = this.layout.getLinks();

        // 2. Compute Landforms (Global + Plates)
        const { landmass, plates } = this.hullGenerator.computeLandforms(
            nodes,
            (dir) => this.getColor(dir)
        );

        // 3. Render
        this.renderer.render(nodes, links, plates, landmass);

        // 4. Update Dynamic Zoom Constraints (Throttle this if performance is an issue)
        if (nodes.length > 0) {
            let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
            nodes.forEach(n => {
                if (n.x! < minX) minX = n.x!;
                if (n.x! > maxX) maxX = n.x!;
                if (n.y! < minY) minY = n.y!;
                if (n.y! > maxY) maxY = n.y!;
            });

            const width = maxX - minX + 200; // Padding
            const height = maxY - minY + 200;
            const containerW = this.renderer.app.screen.width;
            const containerH = this.renderer.app.screen.height;

            // Scale to fit: Screen / World
            const scaleX = containerW / width;
            const scaleY = containerH / height;
            const fitScale = Math.min(scaleX, scaleY) * 0.8; // 80% fit

            // Hard Cap: Don't let them zoom out further than what fits the graph
            this.inputManager.minScale = Math.min(fitScale, 0.5);
        }
    }

    private handleNodeClick(id: string, clickCount: number) {
        // ONLY ACT ON DOUBLE CLICK
        if (clickCount === 2) {
            const node = this.layout.getNodes().find(n => n.id === id);
            if (!node) return;

            this.selectedNodeId = id;

            // Calculate Neighbors
            const neighbors = new Set<string>();
            this.layout.getLinks().forEach(link => {
                const s = (link.source as GraphNode).id;
                const t = (link.target as GraphNode).id;
                if (s === id) neighbors.add(t);
                if (t === id) neighbors.add(s);
            });

            // Update Renderer (Highlight Node)
            this.renderer.updateSelection(id, neighbors, null);
            this.update(); // Force Update

            // Camera Focus
            this.renderer.smoothLookAt(node.x!, node.y!, 1.5);

            // Open Modal
            if (this.onSelectionChange) {
                this.onSelectionChange({
                    label: node.label,
                    directory: node.directory,
                    description: node.description || null,
                    type: 'node',
                    path: node.fullPath // USE ACTUAL PATH, NOT ID
                });
            }
        }
        // Single click allows dragging without visual flashes
    }

    private handleHullClick(id: string, clickCount: number) {
        // ONLY ACT ON DOUBLE CLICK
        if (clickCount === 2) {
            this.selectedNodeId = null;

            // Update Renderer (Highlight Cluster)
            this.renderer.updateSelection(null, new Set(), id);
            this.update(); // Force Update

            // Camera Focus
            const nodes = this.layout.getNodes().filter(n => (n.directory || 'root') === id);
            if (nodes.length > 0) {
                const avgX = nodes.reduce((s, n) => s + (n.x || 0), 0) / nodes.length;
                const avgY = nodes.reduce((s, n) => s + (n.y || 0), 0) / nodes.length;
                this.renderer.smoothLookAt(avgX, avgY, 1.5);
            }

            if (this.onSelectionChange) {
                this.onSelectionChange({
                    label: `Cluster: ${id}`,
                    directory: id,
                    description: `Contains ${nodes.length} nodes.`,
                    type: 'cluster'
                });
            }
        }
    }

    private handleBackgroundClick(clickCount: number) {
        // Background click ALWAYS cleans up selection
        this.selectedNodeId = null;
        this.renderer.updateSelection(null, new Set(), null);
        this.update(); // Force Update

        if (this.onSelectionChange) {
            this.onSelectionChange(null);
        }

        // Camera Action: Reset to Overview only on DOUBLE CLICK
        if (clickCount === 2) {
            this.renderer.smoothLookAt(0, 0, 1.0);
        }
    }

    // --- Drag Logic ---
    private handleDragStart(id: string) {
        this.inputManager.setPanEnabled(false); // Fix Jitter
        this.layout.dragStart();
        this.update();
    }

    private handleDragMove(id: string, x: number, y: number) {
        const node = this.layout.getNodes().find(n => n.id === id);
        if (node) {
            this.layout.dragMove(node, x, y);
            this.update();
        }
    }

    private handleDragEnd(id: string) {
        this.inputManager.setPanEnabled(true); // Restore Pan
        const node = this.layout.getNodes().find(n => n.id === id);
        if (node) {
            this.layout.dragEnd(node);
            this.update();
        }
    }

    private getColor(str: string): string {
        // Simple hash to hex
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = str.charCodeAt(i) + ((hash << 5) - hash);
        }
        const c = (hash & 0x00FFFFFF).toString(16).toUpperCase();
        return '#' + '00000'.substring(0, 6 - c.length) + c;
    }

    public dispose() {
        this.isRunning = false;
        this.inputManager.dispose();
        // this.renderer.destroy();
    }
}
