export function replaceAllVariables(template: string, variables: Record<string, any>): string {
	return template.replace(/\{\{([^}]+)\}\}/g, (match, key) => {
		const trimmedKey = key.trim();

		// Support nested properties like {{user.name}}
		const keys = trimmedKey.split('.');
		let value: any = variables;

		for (const k of keys) {
			if (value && typeof value === 'object' && k in value) {
				value = value[k];
			} else {
				// Variable not found, return original placeholder
				return match;
			}
		}

		if (null != value) {
			if (value instanceof Object) {
				return JSON.stringify(value);
			}
			return String(value);
		}

		return match;
	});
}
