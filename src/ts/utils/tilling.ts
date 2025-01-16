export default function computeLayout(
    parentWidth: number,
    parentHeight: number,
    childCount: number
): [number, number] {
    if (
        childCount === 0 ||
        (!Number.isInteger(Math.sqrt(childCount)) && childCount % 2 !== 0)
    ) {
        childCount++;
    }

    const factorizations = computeFactorizations(childCount);

    let optimalLayout = factorizations[0];
    let optimalAspectRationDiff = Math.abs(
        parentWidth / parentHeight -
            parentWidth / optimalLayout[0] / (parentHeight / optimalLayout[1])
    );

    factorizations.slice(1).forEach((factorization) => {
        if (
            parentWidth / parentHeight < 0.75 ||
            parentWidth / parentHeight > 2.75
        ) {
            if (
                Math.abs(
                    parentWidth / parentHeight -
                        parentHeight /
                            factorization[1] /
                            (parentWidth / factorization[0])
                ) < optimalAspectRationDiff
            ) {
                optimalAspectRationDiff = Math.abs(
                    parentWidth / parentHeight -
                        parentHeight /
                            factorization[1] /
                            (parentWidth / factorization[0])
                );
                optimalLayout = factorization;
            }
        } else if (
            Math.abs(
                parentWidth / parentHeight -
                    parentWidth /
                        factorization[0] /
                        (parentHeight / factorization[1])
            ) < optimalAspectRationDiff
        ) {
            optimalAspectRationDiff = Math.abs(
                parentWidth / parentHeight -
                    parentWidth /
                        factorization[0] /
                        (parentHeight / factorization[1])
            );
            optimalLayout = factorization;
        }
    });

    return optimalLayout;
}

function computeFactorizations(n: number): [number, number][] {
    return [...Array(n + 1).keys()]
        .filter((x) => n % x === 0)
        .map((x) => [x, n / x]);
}
