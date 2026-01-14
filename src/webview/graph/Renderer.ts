import * as PIXI from 'pixi.js';
import { GraphNode, GraphLink } from './Layout';
import { Hull } from './HullGenerator';

// --- Semantic Themes ---
const THEMES = {
    LIGHT: {
        RED: 0xD62828,
        BLUE: 0x0077B6,
        CYAN: 0x00B4D8,
        NAVY: 0x03045E,
        BEIGE: 0xFDFCDC,
        GRAY: 0xADB5BD,
        DARK: 0x212529,
        PAPER: 0xF8F9FA,
        LAND: 0xE9ECEF,
        STROKE: 0x333333,
        HALO: 0xFFFFFF
    },
    DARK: {
        RED: 0xFF6B6B,
        BLUE: 0x4D96FF,
        CYAN: 0x6BCB77,
        NAVY: 0x2C3E50,
        BEIGE: 0x222222,
        GRAY: 0x888888,
        DARK: 0xDDDDDD,
        PAPER: 0x050505, // Deep Void
        LAND: 0x161616,  // Dark Land
        STROKE: 0xFFFFFF,
        HALO: 0x000000
    }
};

export class Renderer {
    public app: PIXI.Application;
    private container: PIXI.Container;
    private currentTheme: 'LIGHT' | 'DARK' = 'LIGHT';

    // Layers
    private hullLayer: PIXI.Container;
    private edgeLayer: PIXI.Graphics;
    private nodeLayer: PIXI.Container;
    private nodesMap: Map<string, PIXI.Container> = new Map();

    // Interaction State
    private hoveredNodeId: string | null = null;
    private selectedNodeId: string | null = null;
    private selectedClusterId: string | null = null;
    private highlightNeighbors: Set<string> = new Set();

    constructor(
        private callbacks: {
            onClickNode: (id: string, clickCount: number) => void;
            onClickHull: (id: string, nodeCount: number) => void;
            onClickBackground: (clickCount: number) => void;
            onDragStart: (id: string) => void;
            onDragMove: (id: string, x: number, y: number) => void;
            onDragEnd: (id: string) => void;
        }
    ) {
        this.app = new PIXI.Application();
        this.container = new PIXI.Container();
        this.hullLayer = new PIXI.Container();
        this.edgeLayer = new PIXI.Graphics();
        this.nodeLayer = new PIXI.Container();
    }

    public async init(parentElement: HTMLElement) {
        const pal = THEMES[this.currentTheme];
        await this.app.init({
            background: pal.PAPER,
            antialias: true,
            resizeTo: parentElement,
            autoDensity: true,
            resolution: window.devicePixelRatio || 1,
        });

        parentElement.appendChild(this.app.canvas);
        this.app.stage.addChild(this.container);

        // Initial Center
        this.container.x = this.app.screen.width / 2;
        this.container.y = this.app.screen.height / 2;

        this.container.addChild(this.hullLayer);
        this.container.addChild(this.edgeLayer);
        this.container.addChild(this.nodeLayer);

        // Background Interaction (True Click Detection)
        this.app.stage.eventMode = 'static';
        this.app.stage.hitArea = this.app.screen; // Full Screen Hit Area

        let stageDownPos: { x: number, y: number } | null = null;
        let lastStageClickTime = 0;

        this.app.stage.on('pointerdown', (e) => {
            // Only capture if clicking Stage directly (not children)
            if (e.target === this.app.stage) {
                stageDownPos = { x: e.global.x, y: e.global.y };
            }
        });

        this.app.stage.on('pointerup', (e) => {
            if (stageDownPos && e.target === this.app.stage) {
                const dist = Math.hypot(e.global.x - stageDownPos.x, e.global.y - stageDownPos.y);
                // If moved less than 5px, consider it a click (not a pan)
                if (dist < 5) {
                    const now = Date.now();
                    if (now - lastStageClickTime < 300) {
                        this.callbacks.onClickBackground(2);
                    } else {
                        this.callbacks.onClickBackground(1);
                    }
                    lastStageClickTime = now;
                }
            }
            stageDownPos = null;
        });

        // Clear state if drag leaves window
        this.app.stage.on('pointerupoutside', () => {
            stageDownPos = null;
        });

        window.addEventListener('resize', () => {
            // Keep container centered if desired, or just update hitArea
            this.app.stage.hitArea = this.app.screen;
        });
    }

    public toggleTheme() {
        this.currentTheme = this.currentTheme === 'LIGHT' ? 'DARK' : 'LIGHT';
        const pal = THEMES[this.currentTheme];
        this.app.renderer.background.color = pal.PAPER;
        // Invalidate cache or force re-style of nodes/hulls in next render
    }

    public render(nodes: GraphNode[], links: GraphLink[], plates: Hull[], landmass: Hull | null) {
        const pal = THEMES[this.currentTheme];
        const isDark = this.currentTheme === 'DARK';

        // 0. Render Global Landmass
        this.hullLayer.removeChildren();
        this.hullLayer.mask = null;

        if (landmass && landmass.path.length > 0) {
            const landGfx = new PIXI.Graphics();
            landGfx.beginPath();
            landGfx.moveTo(landmass.path[0][0], landmass.path[0][1]);
            for (let i = 1; i < landmass.path.length; i++) {
                landGfx.lineTo(landmass.path[i][0], landmass.path[i][1]);
            }
            landGfx.closePath();
            landGfx.fill({ color: pal.LAND });
            this.hullLayer.addChild(landGfx);

            // Plates Container & Mask
            const platesContainer = new PIXI.Container();
            const maskGfx = landGfx.clone();
            this.hullLayer.addChild(maskGfx);
            platesContainer.mask = maskGfx;
            this.hullLayer.addChild(platesContainer);

            // Render Plates
            plates.forEach(plate => {
                const color = parseInt(plate.color.replace('#', '0x'), 16);
                const gfx = new PIXI.Graphics();

                gfx.beginPath();
                if (plate.path.length > 0) {
                    gfx.moveTo(plate.path[0][0], plate.path[0][1]);
                    for (let i = 1; i < plate.path.length; i++) {
                        gfx.lineTo(plate.path[i][0], plate.path[i][1]);
                    }
                    gfx.closePath();
                }

                // Highlight Logic for Clusters
                const isSelected = this.selectedClusterId === plate.id;
                const isDimmed = !isSelected && this.selectedClusterId !== null;

                let fillAlpha = isSelected ? 0.35 : 0.15; // Brighten if selected
                if (isDimmed) fillAlpha = 0.15; // USER REQ: Dim others but keep visible (was 0.05)

                gfx.fill({ color: color, alpha: fillAlpha });
                // Borders
                gfx.stroke({ width: 1, color: isDark ? 0x000000 : 0x000000, alpha: isSelected ? 0.5 : 0.2 });

                // Interaction (Double Click Logic)
                gfx.eventMode = 'static';
                gfx.cursor = 'pointer';
                const flatPoints = plate.path.flat();
                gfx.hitArea = new PIXI.Polygon(flatPoints);

                let lastClickTime = 0;
                gfx.on('pointerdown', (e) => {
                    e.stopPropagation();
                    const now = Date.now();
                    if (now - lastClickTime < 300) {
                        this.callbacks.onClickHull(plate.id, 2);
                    } else {
                        this.callbacks.onClickHull(plate.id, 1);
                    }
                    lastClickTime = now;
                });

                platesContainer.addChild(gfx);
            });
        }

        // 2. Draw Edges (Roads)
        this.edgeLayer.clear();
        links.forEach(link => {
            const source = link.source as GraphNode;
            const target = link.target as GraphNode;

            const isConnected = (this.selectedNodeId === source.id || this.selectedNodeId === target.id);
            const isInternal = (this.selectedClusterId === source.directory && this.selectedClusterId === target.directory);

            // Visual Request: Black Edges, Slightly Thicker
            let alpha = isInternal ? 0.35 : 0.2;
            let color = 0x000000; // Always Black
            let width = isInternal ? 2 : 1.5;

            if (this.selectedNodeId) {
                if (isConnected) {
                    alpha = 1.0;
                    width = 3.5;
                } else {
                    alpha = 0.15; // Visible but dimmed (was 0.05)
                }
            } else if (this.selectedClusterId) {
                if (isInternal) {
                    alpha = 0.7;
                    width = 2.5;
                } else {
                    alpha = 0.15; // Visible but dimmed (was 0.05)
                }
            } else {
                // Default
                if (source.directory === target.directory) {
                    alpha = 0.35;
                    width = 2;
                }
            }

            this.edgeLayer.strokeStyle.width = width;
            this.edgeLayer.strokeStyle.color = color;
            this.edgeLayer.strokeStyle.alpha = alpha;
            this.edgeLayer.beginPath();
            this.edgeLayer.moveTo(source.x!, source.y!);
            this.edgeLayer.lineTo(target.x!, target.y!);
            this.edgeLayer.stroke();
        });

        // 3. Draw Nodes
        nodes.forEach(node => {
            let nodeSprite = this.nodesMap.get(node.id);
            if (!nodeSprite) {
                nodeSprite = this.createNodeSprite(node, pal); // Pass initial palette, will update lazily
                this.nodeLayer.addChild(nodeSprite);
                this.nodesMap.set(node.id, nodeSprite);
            }

            nodeSprite.x = node.x!;
            nodeSprite.y = node.y!;

            // Visual Updates
            const gfx = nodeSprite.getChildAt(0) as PIXI.Graphics;
            const text = nodeSprite.getChildAt(1) as PIXI.Text;

            // Check if we need to update Styles for Theme Change
            if (text.style.fill !== pal.DARK) {
                text.style.fill = pal.DARK;
                text.style.stroke = { color: pal.HALO, width: 3, join: 'round' };
            }

            let alpha = 1;
            let scale = 1;
            let fillColor = isDark ? 0xFFFFFF : 0xFFFFFF; // Nodes usually white-ish
            let strokeColor = pal.STROKE;

            const isNodeSelected = this.selectedNodeId !== null;
            const isClusterSelected = this.selectedClusterId !== null;

            if (isNodeSelected) {
                if (node.id === this.selectedNodeId) {
                    scale = 1.6;
                    fillColor = pal.RED;
                    strokeColor = pal.RED;
                } else if (this.highlightNeighbors.has(node.id)) {
                    scale = 1.3;
                    fillColor = pal.BLUE;
                    strokeColor = pal.BLUE;
                } else {
                    alpha = 0.35; // More visible dimmed nodes (was 0.2)
                    scale = 0.8;
                }
            } else if (isClusterSelected) {
                if (node.directory === this.selectedClusterId) {
                    scale = 1.2; // Highlight cluster members
                    strokeColor = pal.DARK;
                } else {
                    alpha = 0.25; // More visible dimmed nodes (was 0.1)
                }
            }

            nodeSprite.alpha = alpha;
            nodeSprite.scale.set(scale);

            gfx.clear();
            gfx.circle(0, 0, 6);
            gfx.fill({ color: fillColor });
            gfx.stroke({ width: 1.5, color: strokeColor });
        });
    }

    private createNodeSprite(node: GraphNode, pal: any): PIXI.Container {
        const container = new PIXI.Container();
        container.eventMode = 'static';
        container.cursor = 'pointer';

        let dragStartData: any = null;
        let isDragging = false;

        container.on('pointerdown', (e) => {
            e.stopPropagation();
            dragStartData = e;
            isDragging = false;
            this.callbacks.onDragStart(node.id);
            container.on('globalpointermove', onMove);
            container.on('pointerup', onUp);
            container.on('pointerupoutside', onUp);
        });

        const onMove = (e: PIXI.FederatedPointerEvent) => {
            isDragging = true;
            const newPos = this.container.toLocal(e.global);
            this.callbacks.onDragMove(node.id, newPos.x, newPos.y);
        };

        const onUp = (e: PIXI.FederatedPointerEvent) => {
            container.off('globalpointermove', onMove);
            container.off('pointerup', onUp);
            container.off('pointerupoutside', onUp);
            this.callbacks.onDragEnd(node.id);
            if (!isDragging) {
                const now = Date.now();
                // Heuristic for double click on node
                if ((node as any)._lastClick && now - (node as any)._lastClick < 300) {
                    this.callbacks.onClickNode(node.id, 2);
                } else {
                    this.callbacks.onClickNode(node.id, 1);
                }
                (node as any)._lastClick = now;
            }
        };

        const gfx = new PIXI.Graphics();
        gfx.circle(0, 0, 6);
        gfx.fill({ color: 0xFFFFFF });
        container.addChild(gfx);

        // Update Font Here too although mostly style update handles it
        const text = new PIXI.Text({
            text: node.label,
            style: {
                fontFamily: '"JetBrains Mono", monospace', // Updated Font
                fontWeight: '500',
                fontSize: 14,
                fill: pal.DARK,
                align: 'center',
                stroke: { color: pal.HALO, width: 3, join: 'round' }
            }
        });
        text.anchor.set(0.5, 0);
        text.y = 8;
        container.addChild(text);

        return container;
    }

    public updateSelection(selectedNodeId: string | null, neighbors: Set<string>, selectedClusterId: string | null = null) {
        this.selectedNodeId = selectedNodeId;
        this.highlightNeighbors = neighbors;
        this.selectedClusterId = selectedClusterId;
    }

    public setTransform(scale: number, x: number, y: number) {
        this.container.scale.set(scale);
    }

    public pan(dx: number, dy: number) {
        this.container.x += dx;
        this.container.y += dy;
    }

    // Smooth Camera Logic
    public smoothLookAt(x: number, y: number, scale: number = 1) {
        const startX = this.container.x;
        const startY = this.container.y;
        const startScale = this.container.scale.x;

        // Target: Center (Screen W/2, H/2) should map to World (x,y)
        // container.x = ScreenCenter.x - (World.x * Scale)
        const targetX = (this.app.screen.width / 2) - (x * scale);
        const targetY = (this.app.screen.height / 2) - (y * scale);

        let progress = 0;
        const duration = 60; // frames (~1s)

        const tick = () => {
            progress++;
            const t = progress / duration;
            // Ease Out Cubic
            const ease = 1 - Math.pow(1 - t, 3);

            this.container.x = startX + (targetX - startX) * ease;
            this.container.y = startY + (targetY - startY) * ease;
            const s = startScale + (scale - startScale) * ease;
            this.container.scale.set(s);

            if (progress < duration) {
                requestAnimationFrame(tick);
            }
        };
        requestAnimationFrame(tick);
    }
}
