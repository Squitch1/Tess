export function clamp(min: number, val: number, max: number): number {
    return Math.max(min, Math.min(val, max));
}

export function roundHalfDown(x: number): number {
    return -Math.round(-x);
}
