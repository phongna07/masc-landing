export function uniqueEntryName(filename: string, usedNames: Set<string>) {
	const safe = filename.trim().replace(/[<>:"/\\|?*\u0000-\u001F\u007F]/g, "_") || "submission.pdf";
	const dot = safe.lastIndexOf(".");
	const extensionIndex = dot > 0 ? dot : safe.length;
	const base = safe.slice(0, extensionIndex);
	const extension = safe.slice(extensionIndex) || ".pdf";
	let candidate = `${base}${extension}`;
	let suffix = 2;
	while (usedNames.has(candidate.toLocaleLowerCase("en-US"))) {
		candidate = `${base} (${suffix})${extension}`;
		suffix += 1;
	}
	usedNames.add(candidate.toLocaleLowerCase("en-US"));
	return candidate;
}

