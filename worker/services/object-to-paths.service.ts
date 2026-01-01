/**
 * Service for transforming nested objects into path-value pairs
 * Example: { a: { b: 1 } } => [{ path: 'a.b', value: 1 }]
 */

export interface PathValue {
  path: string;
  value: any;
}

export class ObjectToPathsService {
  /**
   * Transform a nested object into an array of path-value pairs
   * @param obj - The object to transform
   * @param prefix - Internal use for recursion (leave empty)
   * @returns Array of path-value pairs
   */
  transform(obj: Record<string, any>, prefix: string = ""): PathValue[] {
    const results: PathValue[] = [];

    for (const [key, value] of Object.entries(obj)) {
      const currentPath = prefix ? `${prefix}.${key}` : key;

      if (value === null || value === undefined) {
        // Store null/undefined as-is
        results.push({ path: currentPath, value });
      } else if (Array.isArray(value)) {
        // Store arrays as JSON strings
        results.push({ path: currentPath, value: JSON.stringify(value) });
      } else if (typeof value === "object") {
        // Recursively process non-empty objects, skip empty ones
        if (Object.keys(value).length > 0) {
          results.push(...this.transform(value, currentPath));
        }
        // Empty objects are skipped entirely
      } else {
        // Store primitive values
        results.push({ path: currentPath, value });
      }
    }

    return results;
  }

  /**
   * Format a path-value pair as a searchable string
   * @param pathValue - The path-value pair
   * @returns Formatted string for full-text search
   */
  formatForSearch(pathValue: PathValue): string {
    const { value } = pathValue;

    if (value === null || value === undefined) {
      return ``;
    }

    if (typeof value === "string") {
      return `${value}`;
    }

    if (typeof value === "number" || typeof value === "boolean") {
      return `${String(value)}`;
    }

    // For complex values (arrays stored as JSON)
    return `${value}`;
  }
}
