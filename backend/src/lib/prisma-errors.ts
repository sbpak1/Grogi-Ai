export function isPrismaUnavailableError(error: unknown): boolean {
    if (!error || typeof error !== "object") return false;
    const err = error as Record<string, unknown>;
    const code = String(err.code || "");
    const message = String(err.message || "");
    return (
        code === "P2021" ||
        code === "P1001" ||
        code === "ECONNREFUSED" ||
        message.includes("does not exist") ||
        message.includes("ECONNREFUSED")
    );
}
