export default class CircularProgressBar {
    readonly element: HTMLElement;

    constructor() {
        this.element = CircularProgressBar.generateComponents();
    }

    setProgress(progress: number) {
        if (progress >= 0 && progress <= 100) {
            this.element.style.setProperty("--progress", `${progress}`);
        }
    }

    private static generateComponents(): HTMLElement {
        const SVGNamespace = "http://www.w3.org/2000/svg";

        const element = document.createElement("div");
        element.classList.add("circular-progress-bar");

        const svg = document.createElementNS(SVGNamespace, "svg");
        svg.setAttribute("viewBox", "0 0 18 18");
        const circle = document.createElementNS(SVGNamespace, "circle");
        circle.setAttribute("cx", "9");
        circle.setAttribute("cy", "9");
        circle.setAttribute("r", "8");
        circle.setAttribute("stroke-width", "2");
        svg.appendChild(circle);

        element.append(svg, svg.cloneNode(true));

        return element;
    }
}
