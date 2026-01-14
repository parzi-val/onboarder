import {
    forceSimulation,
    forceLink,
    forceManyBody,
    forceCenter,
    forceCollide,
    forceX,
    forceY,
    Simulation,
    SimulationNodeDatum,
    SimulationLinkDatum
} from 'd3-force';

export interface GraphNode extends SimulationNodeDatum {
    id: string;
    label: string;
    directory: string;
    description?: string;
    fullPath?: string; // Added for Open File
    x?: number;
    y?: number;
    fx?: number | null;
    fy?: number | null;
}

export interface GraphLink extends SimulationLinkDatum<GraphNode> {
    source: string | GraphNode;
    target: string | GraphNode;
}

export class Layout {
    private simulation: Simulation<GraphNode, GraphLink>;
    private nodes: GraphNode[] = [];
    private links: GraphLink[] = [];
    private onTick: () => void;

    constructor(onTick: () => void) {
        this.onTick = onTick;
        this.simulation = forceSimulation<GraphNode, GraphLink>()
            .force("link", forceLink<GraphNode, GraphLink>().id(d => d.id).distance(80))
            .force("charge", forceManyBody().strength(-200))
            .force("center", forceCenter(0, 0))
            .force("collide", forceCollide(30).iterations(2))
            .stop();
    }

    public setData(nodes: GraphNode[], links: GraphLink[]) {
        this.nodes = nodes;
        this.links = links;

        // Group by directory for clustering
        const clusters: Record<string, { x: number; y: number; count: number }> = {};
        nodes.forEach(node => {
            const dir = node.directory || 'root';
            if (!clusters[dir]) clusters[dir] = { x: 0, y: 0, count: 0 };
            clusters[dir].count++;
        });

        // Compute Cluster Centers (Compact Circle)
        const clusterNames = Object.keys(clusters);
        const radius = Math.max(100, clusterNames.length * 40);
        clusterNames.forEach((dir, i) => {
            const angle = (i / clusterNames.length) * 2 * Math.PI;
            clusters[dir].x = Math.cos(angle) * radius;
            clusters[dir].y = Math.sin(angle) * radius;
        });

        // Initialize Simulation
        this.simulation.nodes(this.nodes);
        const linkForce = this.simulation.force("link") as any;
        linkForce.links(this.links);

        // Add Cluster Forces
        this.simulation
            .force("clusterX", forceX((d: any) => clusters[d.directory]?.x || 0).strength(0.5))
            .force("clusterY", forceY((d: any) => clusters[d.directory]?.y || 0).strength(0.5));

        // Restart
        this.simulation.alpha(1).restart();

        // Listen to ticks
        this.simulation.on("tick", () => {
            this.onTick();
        });
    }

    public getNodes(): GraphNode[] {
        return this.nodes;
    }

    public getLinks(): GraphLink[] {
        return this.links;
    }

    // --- Drag Interaction ---
    public dragStart() {
        if (!this.simulation) return;
        this.simulation.alphaTarget(0.3).restart();
    }

    public dragMove(node: GraphNode, x: number, y: number) {
        node.fx = x;
        node.fy = y;
    }

    public dragEnd(node: GraphNode) {
        if (!this.simulation) return;
        this.simulation.alphaTarget(0);
        node.fx = null;
        node.fy = null;
    }
}
