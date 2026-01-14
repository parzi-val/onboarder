export class InputManager {
    private element: HTMLElement;
    private onZoom: (scale: number, x: number, y: number) => void;
    private onPan: (dx: number, dy: number) => void;

    // Transform State
    public scale: number = 1;
    public x: number = 0;
    public y: number = 0;

    // Dynamic Constraints
    public minScale: number = 0.1;

    private isDragging: boolean = false;
    private lastX: number = 0;
    private lastY: number = 0;

    private isPanEnabled: boolean = true;

    constructor(
        element: HTMLElement,
        onZoom: (scale: number, x: number, y: number) => void,
        onPan: (dx: number, dy: number) => void
    ) {
        this.element = element;
        this.onZoom = onZoom;
        this.onPan = onPan;

        this.setupListeners();
    }

    public setPanEnabled(enabled: boolean) {
        this.isPanEnabled = enabled;
        if (!enabled) {
            this.isDragging = false;
        }
    }

    private setupListeners() {
        this.element.addEventListener('wheel', this.handleWheel.bind(this), { passive: false });
        this.element.addEventListener('pointerdown', this.handleDown.bind(this));
        window.addEventListener('pointermove', this.handleMove.bind(this));
        window.addEventListener('pointerup', this.handleUp.bind(this));
    }

    private handleDown(e: PointerEvent) {
        // Only drag if not clicking a node (heuristic: if target is canvas)
        if ((e.target as HTMLElement).tagName !== 'CANVAS') return;
        if (!this.isPanEnabled) return;

        this.isDragging = true;
        this.lastX = e.clientX;
        this.lastY = e.clientY;
        this.element.setPointerCapture(e.pointerId);
    }

    private handleMove(e: PointerEvent) {
        if (!this.isDragging) return;
        const dx = e.clientX - this.lastX;
        const dy = e.clientY - this.lastY;
        this.lastX = e.clientX;
        this.lastY = e.clientY;
        this.onPan(dx, dy);
    }

    private handleUp(e: PointerEvent) {
        this.isDragging = false;
        if (this.element.hasPointerCapture(e.pointerId)) {
            this.element.releasePointerCapture(e.pointerId);
        }
    }

    private handleWheel(e: WheelEvent) {
        e.preventDefault();

        const zoomIntensity = 0.001;
        const delta = -e.deltaY * zoomIntensity;
        // Uses dynamic minScale
        const newScale = Math.max(this.minScale, Math.min(this.scale + delta, 5));

        this.scale = newScale;
        this.onZoom(this.scale, e.clientX, e.clientY);
    }

    // Clean up
    public dispose() {
        this.element.removeEventListener('wheel', this.handleWheel.bind(this));
        this.element.removeEventListener('pointerdown', this.handleDown.bind(this));
        window.removeEventListener('pointermove', this.handleMove.bind(this));
        window.removeEventListener('pointerup', this.handleUp.bind(this));
    }
}
