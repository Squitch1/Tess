export default function clamp(min: number, val: number, max: number): number {
    return Math.max(min, Math.min(val, max));
}
