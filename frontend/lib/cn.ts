type ClassValue =
  | string
  | number
  | false
  | null
  | undefined
  | ClassValue[]
  | Record<string, boolean | null | undefined>;

function flatten(value: ClassValue, target: string[]): void {
  if (!value) return;

  if (typeof value === "string" || typeof value === "number") {
    target.push(String(value));
    return;
  }

  if (Array.isArray(value)) {
    for (const entry of value) flatten(entry, target);
    return;
  }

  for (const [key, enabled] of Object.entries(value)) {
    if (enabled) target.push(key);
  }
}

export function cn(...values: ClassValue[]): string {
  const tokens: string[] = [];
  for (const value of values) flatten(value, tokens);
  return tokens.join(" ");
}
