export default class CircularProgressBar {
    readonly element: HTMLElement;

    constructor() {
        this.element = CircularProgressBar.generateComponent();
    }

    setProgress(progress: number) {
        if (progress >= 0 && progress <= 100) {
            this.element.style.setProperty("--progress", progress.toString(10));
        }
    }

    private static generateComponent(): HTMLElement {
        const element = document.createElement("div");
        element.classList.add("circular-progress-bar");

        const svg = document.createElementNS(SVG_NAMESPACE, "svg");
        svg.setAttribute("viewBox", "0 0 18 18");
        const circle = document.createElementNS(SVG_NAMESPACE, "circle");
        circle.setAttribute("cx", "9");
        circle.setAttribute("cy", "9");
        circle.setAttribute("r", "8");
        circle.setAttribute("stroke-width", "2");
        svg.appendChild(circle);

        element.append(svg, svg.cloneNode(true));

        return element;
    }
}
