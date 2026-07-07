import { describe, expect, it } from "vitest";
import { SolanaClientAdapter } from "../src/adapter";
import { createMappingReport } from "../src/diagnostics";
import { XP_FOR_LEVEL } from "../src/experience";

describe("redacted diagnostics", () => {
  it("reports shapes and methods without string values or invoking accessors", () => {
    let accessorReads = 0;
    const prototype = { pluginIsIngame: () => true };
    const client = Object.create(prototype) as Record<string, unknown>;
    client.nz = Array.from({ length: 21 }, () => XP_FOR_LEVEL[2] ?? 83);
    client.lz = Array.from({ length: 21 }, () => 2);
    client.mz = Array.from({ length: 21 }, () => 2);
    client.secret = "do-not-copy-this";
    Object.defineProperty(client, "dangerousAccessor", {
      enumerable: true,
      get: () => {
        accessorReads += 1;
        throw new Error("must not run");
      },
    });
    const report = createMappingReport(client, new SolanaClientAdapter(client));
    const serialized = JSON.stringify(report);
    expect(accessorReads).toBe(0);
    expect(serialized).not.toContain("do-not-copy-this");
    expect(report.properties).toContainEqual({ name: "secret", type: "string" });
    expect(report.properties).toContainEqual({ name: "dangerousAccessor", type: "accessor" });
    expect(report.prototypeMethods).toContain("pluginIsIngame");
  });

  it("reports the client script URL actually loaded by the page", () => {
    const script = document.createElement("script");
    script.src = "https://solanascape.online/client/client.js?v=live-build";
    document.head.append(script);
    const report = createMappingReport({}, null);
    expect(report.clientBuild).toBe("client.js?v=live-build");
    script.remove();
  });
});
