import { polygonHull } from 'd3-polygon';
import { Delaunay } from 'd3-delaunay';
import { GraphNode } from './Layout';

export interface Hull {
    id: string;
    path: [number, number][];
    color: string;
    type: 'plate' | 'landmass';
}

export class HullGenerator {

    // Compute Global Hull + Voronoi Plates
    public computeLandforms(nodes: GraphNode[], colorFn: (id: string) => string): { landmass: Hull | null, plates: Hull[] } {
        if (nodes.length < 3) return { landmass: null, plates: [] };

        // 1. Compute Centroids per Cluster for Voronoi
        const clusterMap: Record<string, { x: number, y: number, count: number }> = {};
        nodes.forEach(node => {
            const dir = node.directory || 'root';
            if (!clusterMap[dir]) clusterMap[dir] = { x: 0, y: 0, count: 0 };
            clusterMap[dir].x += node.x || 0;
            clusterMap[dir].y += node.y || 0;
            clusterMap[dir].count++;
        });

        const centroids: { dir: string, x: number, y: number }[] = [];
        Object.entries(clusterMap).forEach(([dir, data]) => {
            centroids.push({ dir, x: data.x / data.count, y: data.y / data.count });
        });

        // 2. Compute Voronoi
        const points = centroids.map(c => [c.x, c.y] as [number, number]);
        const delaunay = Delaunay.from(points);
        // Voronoi bounds: Large enough to cover the simulation
        const voronoi = delaunay.voronoi([-2000, -2000, 4000, 4000]);

        const plates: Hull[] = centroids.map((c, i) => {
            const cell = voronoi.cellPolygon(i);
            if (!cell) return null; // Should not happen given bounds
            return {
                id: c.dir,
                path: cell as [number, number][],
                color: colorFn(c.dir),
                type: 'plate'
            };
        }).filter(h => h !== null) as Hull[];

        // 3. Compute Global Landmass (Convex Hull of all nodes + Padding)
        const allPoints: [number, number][] = [];
        nodes.forEach(n => {
            const pad = 80; // "Coastline" buffer
            allPoints.push([(n.x || 0) - pad, (n.y || 0) - pad]);
            allPoints.push([(n.x || 0) + pad, (n.y || 0) - pad]);
            allPoints.push([(n.x || 0) + pad, (n.y || 0) + pad]);
            allPoints.push([(n.x || 0) - pad, (n.y || 0) + pad]);
        });

        const landPoly = polygonHull(allPoints);
        const landmass: Hull | null = landPoly ? {
            id: 'global_landmass',
            path: landPoly,
            color: '#111111',
            type: 'landmass'
        } : null;

        return { landmass, plates };
    }
}
