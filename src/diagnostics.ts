import { SolanaClientAdapter } from "./adapter";
import { CURRENT_FIELD_MAP, getArrayLikeLength, isRecord } from "./mapping";
import type { MappingReport, MappingReportEntry } from "./types";

function describeOwnProperties(client: unknown): readonly MappingReportEntry[] {
  if (!isRecord(client)) return Object.freeze([]);
  const entries: MappingReportEntry[] = [];
  for (const key of Reflect.ownKeys(client)) {
    if (typeof key !== "string") continue;
    const descriptor = Object.getOwnPropertyDescriptor(client, key);
    if (!descriptor) continue;
    if (!("value" in descriptor)) {
      entries.push(Object.freeze({ name: key, type: "accessor" }));
      continue;
    }
    const value: unknown = descriptor.value;
    const length = getArrayLikeLength(value);
    const type = value === null ? "null" : ArrayBuffer.isView(value) ? value.constructor.name : Array.isArray(value) ? "Array" : typeof value;
    entries.push(Object.freeze(length === null ? { name: key, type } : { name: key, type, length }));
  }
  entries.sort((left, right) => left.name.localeCompare(right.name));
  return Object.freeze(entries);
}

function describePrototypeMethods(client: unknown): readonly string[] {
  if (!isRecord(client)) return Object.freeze([]);
  const names = new Set<string>();
  let prototype: object | null = Object.getPrototypeOf(client) as object | null;
  let depth = 0;
  while (prototype && prototype !== Object.prototype && depth < 6) {
    for (const name of Object.getOwnPropertyNames(prototype)) {
      if (name === "constructor") continue;
      const descriptor = Object.getOwnPropertyDescriptor(prototype, name);
      if (descriptor && "value" in descriptor && typeof descriptor.value === "function") names.add(name);
    }
    prototype = Object.getPrototypeOf(prototype) as object | null;
    depth += 1;
  }
  return Object.freeze([...names].sort());
}

export function createMappingReport(client: unknown, adapter: SolanaClientAdapter | null): MappingReport {
  return Object.freeze({
    clientBuild: detectClientBuild(),
    generatedAt: new Date().toISOString(),
    clientAvailable: isRecord(client),
    resolvedFields: adapter?.getResolvedFields() ?? Object.freeze({}),
    capabilities: adapter?.getCapabilities() ?? new SolanaClientAdapter(null).getCapabilities(),
    properties: describeOwnProperties(client),
    prototypeMethods: describePrototypeMethods(client),
    validationFailures: adapter?.getValidationFailures() ?? Object.freeze(["gameClient is not available"]),
  });
}

function detectClientBuild(): string {
  if (typeof document === "undefined") return CURRENT_FIELD_MAP.build;
  for (const script of document.scripts) {
    const source = script.getAttribute("src");
    if (!source || !/\/client\/client\.js(?:\?|$)/.test(source)) continue;
    try {
      const url = new URL(source, document.baseURI);
      return `${url.pathname.split("/").pop() ?? "client.js"}${url.search}`;
    } catch {
      return source;
    }
  }
  return CURRENT_FIELD_MAP.build;
}

export function cloneReport(report: MappingReport): MappingReport {
  return structuredClone(report);
}
