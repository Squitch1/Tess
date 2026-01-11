export default class Slider extends EventTarget {
    readonly element: HTMLDivElement;

    private pageCount: number = 0;
    private currentPageIndex: number = 0;
    private isDotsHiding: boolean = false;
    private dotsHiddenTimeout?: ReturnType<typeof setTimeout>;

    constructor() {
        super();

        this.element = Slider.generateComponent();

        this.element.addEventListener("click", (e) => {
            for (let k = 0; k < this.element.children.length; k++) {
                if (this.element.children[k] === e.target) {
                    this.dispatchEvent(
                        new CustomEvent("pageChangeRequest", { detail: k })
                    );
                    break;
                }
            }
        });
    }

    setPageCount(count: number, focusIndex: number) {
        if (count === this.pageCount) {
            this.setCurrentPage(focusIndex);
            return;
        }
        if (count < 1) {
            return;
        }

        this.pageCount = count;
        this.currentPageIndex = focusIndex;

        if (this.isDotsHiding) {
            return;
        }

        this.isDotsHiding = true;
        const onceDotsHidden = () => {
            const shallResize = this.element.children.length < 2 !== count < 2;

            this.element.replaceChildren();
            for (let index = 0; index < this.pageCount; index++) {
                const dot = document.createElement("div");
                dot.classList.toggle("active", index === this.currentPageIndex);
                setTimeout(
                    () => dot.classList.add("visible"),
                    shallResize ? 140 : 0
                );

                this.element.appendChild(dot);
            }
            this.element.style.height = `${
                this.pageCount < 2 ? 0 : this.element.children[1].clientHeight
            }px`;

            this.isDotsHiding = false;
        };

        for (let k = 0; k < this.element.children.length; k++) {
            this.element.children[k].addEventListener(
                "transitionstart",
                () => {
                    clearTimeout(this.dotsHiddenTimeout);
                    this.dotsHiddenTimeout = setTimeout(onceDotsHidden, 140);
                },
                { once: true }
            );
            this.element.children[k].classList.remove("visible");
        }
        this.dotsHiddenTimeout = setTimeout(
            onceDotsHidden,
            this.element.childNodes.length === 0 ? 0 : 140
        );
    }

    setCurrentPage(index: number) {
        for (let k = 0; k < this.element.children.length; k++) {
            this.element.children[k].classList.toggle("active", index === k);
        }
    }

    private static generateComponent(): HTMLDivElement {
        const element = document.createElement("div");
        element.classList.add("slider");
        return element;
    }
}
