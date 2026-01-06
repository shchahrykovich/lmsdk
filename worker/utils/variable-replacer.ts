export function replaceAllVariables(template: string, variables: Record<string, unknown>): string {
	return template.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (match, key) => {
		const trimmedKey = key.trim();

		// Support nested properties like {{user.name}}
		const keys = trimmedKey.split('.');
		let value: unknown = variables;

		for (const k of keys) {
			if (value && typeof value === 'object' && k in value) {
				value = (value as Record<string, unknown>)[k];
			} else {
				// Variable not found, return original placeholder
				return match;
			}
		}

		if (null != value) {
			if (typeof value === "string") {
				return value;
			}
			if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
				return String(value);
			}
			if (value instanceof Date) {
				return value.toISOString();
			}
			if (typeof value === "object") {
				return JSON.stringify(value);
			}
		}

		return match;
	});
}
