const tabFieldCache = new WeakMap<object, string | null>();

function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return typeof value === "object" && value !== null;
}

function sourceOf(value: unknown): string | null {
  if (typeof value !== "function") return null;
  try {
    return Function.prototype.toString.call(value);
  } catch {
    return null;
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function methodOnPrototype(prototype: object, name: string): Function | null {
  for (let current: object | null = prototype; current && current !== Object.prototype; current = Object.getPrototypeOf(current) as object | null) {
    const descriptor = Object.getOwnPropertyDescriptor(current, name);
    if (typeof descriptor?.value === "function") return descriptor.value as Function;
  }
  return null;
}

export function resolveCurrentSideTabField(client: unknown): string | null {
  if (!isRecord(client)) return null;
  const prototype = Object.getPrototypeOf(client) as object | null;
  if (!prototype) return null;
  if (tabFieldCache.has(prototype)) return tabFieldCache.get(prototype) ?? null;

  const publicMethod = methodOnPrototype(prototype, "pluginSetSideTab");
  const publicSource = sourceOf(publicMethod);
  const parameter = publicSource?.match(/^[^(]*\(\s*([A-Za-z_$][\w$]*)/)?.[1];
  if (!publicSource || !parameter) {
    tabFieldCache.set(prototype, null);
    return null;
  }
  const delegateMatch = publicSource.match(new RegExp(`this\\.([A-Za-z_$][\\w$]*)\\(\\s*${escapeRegExp(parameter)}\\s*\\)`));
  const delegateName = delegateMatch?.[1];
  const delegate = delegateName ? methodOnPrototype(prototype, delegateName) : null;
  const delegateSource = sourceOf(delegate);
  const delegateParameter = delegateSource?.match(/^[^(]*\(\s*([A-Za-z_$][\w$]*)/)?.[1];
  if (!delegateSource || !delegateParameter || !delegateSource.includes("13")) {
    tabFieldCache.set(prototype, null);
    return null;
  }
  const fieldMatch = delegateSource.match(new RegExp(`this\\.([A-Za-z_$][\\w$]*)\\s*=\\s*${escapeRegExp(delegateParameter)}(?:\\W|$)`));
  const field = fieldMatch?.[1] ?? null;
  tabFieldCache.set(prototype, field);
  return field;
}

export function readCurrentSideTab(client: unknown): number | null {
  if (!isRecord(client)) return null;
  const field = resolveCurrentSideTabField(client);
  if (!field) return null;
  const value = Reflect.get(client, field);
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 13 ? value : null;
}
