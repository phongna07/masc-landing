"use client";

import { cn } from "@masc-landing/ui/lib/utils";
import { useTranslations } from "next-intl";
import { forwardRef, useId, type ComponentPropsWithoutRef } from "react";

type FileInputProps = Omit<ComponentPropsWithoutRef<"input">, "type"> & {
	selectedFileName?: string | null;
};

const FileInput = forwardRef<HTMLInputElement, FileInputProps>(function FileInput({
	className,
	id,
	selectedFileName,
	...props
}, ref) {
	const generatedId = useId();
	const inputId = id ?? generatedId;
	const t = useTranslations("FileInput");

	return <div className={cn("cv-file-control", className)}>
		<input {...props} ref={ref} id={inputId} className="cv-file-control-input" type="file" />
		<label className="cv-file-input" htmlFor={inputId}>
			<span className="cv-file-input-button">{t("choose")}</span>
			<span className="cv-file-input-name">{selectedFileName || t("empty")}</span>
		</label>
	</div>;
});

export default FileInput;
