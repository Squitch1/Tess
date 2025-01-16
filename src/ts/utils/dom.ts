export default function hasCSSAnimation(
    el: HTMLElement,
    animationName: string
): boolean {
    return el
        .getAnimations()
        .some(
            (animation) =>
                animation instanceof CSSAnimation &&
                animation.animationName === animationName
        );
}
