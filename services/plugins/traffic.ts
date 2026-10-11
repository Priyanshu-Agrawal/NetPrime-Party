/** Roughly how much data the plugin layer has pulled (response bodies; headers and compression aside) — the scorecard's budget. */
export class Traffic {
  private total = 0;

  add(r: { body?: string; encoding?: "text" | "base64" }): void {
    if (typeof r.body !== "string") return;
    this.total += r.encoding === "base64" ? Math.floor((r.body.length * 3) / 4) : r.body.length;
  }

  bytes(): number {
    return this.total;
  }
}
