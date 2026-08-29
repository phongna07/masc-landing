"use client";

import { Button } from "@masc-landing/ui/components/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@masc-landing/ui/components/dialog";
import { Input } from "@masc-landing/ui/components/input";
import { Label } from "@masc-landing/ui/components/label";
import { BoldIcon, ItalicIcon, LinkIcon, UnderlineIcon } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ClipboardEvent, type FormEvent, type KeyboardEvent, type ReactNode } from "react";

type RichTextEditorLabels = {
	toolbar: string;
	bold: string;
	italic: string;
	underline: string;
	link: string;
	linkTitle: string;
	linkDescription: string;
	linkUrl: string;
	linkPlaceholder: string;
	linkInvalid: string;
	linkApply: string;
	linkRemove: string;
	cancel: string;
};

type RichTextEditorProps = {
	id: string;
	ariaLabel: string;
	value: string;
	disabled?: boolean;
	maxLength: number;
	labels: RichTextEditorLabels;
	onChange: (value: string) => void;
};

type ActiveFormats = {
	bold: boolean;
	italic: boolean;
	underline: boolean;
	link: boolean;
};

const emptyFormats: ActiveFormats = { bold: false, italic: false, underline: false, link: false };

function closestAnchor(node: Node | null, editor: HTMLElement) {
	const element = node instanceof Element ? node : node?.parentElement;
	const anchor = element?.closest("a") ?? null;
	return anchor && editor.contains(anchor) ? anchor as HTMLAnchorElement : null;
}

function normalizeLink(value: string) {
	const trimmed = value.trim();
	if (!trimmed || /[\r\n]/.test(trimmed) || trimmed.includes("{{") || trimmed.includes("}}")) return null;
	let candidate = trimmed;
	if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate)) candidate = `mailto:${candidate}`;
	else if (!/^[a-z][a-z0-9+.-]*:/i.test(candidate)) candidate = `https://${candidate}`;
	try {
		const url = new URL(candidate);
		if (!(["http:", "https:", "mailto:"] as string[]).includes(url.protocol)) return null;
		if (url.protocol === "mailto:" && !url.pathname) return null;
		if ((url.protocol === "http:" || url.protocol === "https:") && !url.hostname) return null;
		return url.toString();
	} catch {
		return null;
	}
}

export function richTextHasContent(value: string) {
	return value
		.replace(/<br\s*\/?>/gi, "")
		.replace(/<[^>]*>/g, "")
		.replace(/&nbsp;|&#160;/gi, "")
		.trim().length > 0;
}

export default function RichTextEditor({ id, ariaLabel, value, disabled = false, maxLength, labels, onChange }: RichTextEditorProps) {
	const editorRef = useRef<HTMLDivElement>(null);
	const acceptedValueRef = useRef(value);
	const savedRangeRef = useRef<Range | null>(null);
	const editingAnchorRef = useRef<HTMLAnchorElement | null>(null);
	const [formats, setFormats] = useState(emptyFormats);
	const [linkOpen, setLinkOpen] = useState(false);
	const [linkValue, setLinkValue] = useState("");
	const [linkError, setLinkError] = useState(false);

	useLayoutEffect(() => {
		const editor = editorRef.current;
		if (editor && editor.innerHTML !== value) editor.innerHTML = value;
		acceptedValueRef.current = value;
	}, [value]);

	const refreshFormats = useCallback(() => {
		const editor = editorRef.current;
		const selection = window.getSelection();
		if (!editor || !selection?.anchorNode || !editor.contains(selection.anchorNode)) {
			setFormats(emptyFormats);
			return;
		}
		setFormats({
			bold: document.queryCommandState("bold"),
			italic: document.queryCommandState("italic"),
			underline: document.queryCommandState("underline"),
			link: closestAnchor(selection.anchorNode, editor) !== null,
		});
	}, []);

	useEffect(() => {
		document.addEventListener("selectionchange", refreshFormats);
		return () => document.removeEventListener("selectionchange", refreshFormats);
	}, [refreshFormats]);

	const emitChange = () => {
		const editor = editorRef.current;
		if (!editor) return;
		if (editor.innerHTML.length > maxLength) {
			editor.innerHTML = acceptedValueRef.current;
			return;
		}
		acceptedValueRef.current = editor.innerHTML;
		onChange(editor.innerHTML);
		refreshFormats();
	};

	const runCommand = (command: "bold" | "italic" | "underline") => {
		if (disabled) return;
		editorRef.current?.focus();
		document.execCommand(command);
		emitChange();
	};

	const openLinkDialog = () => {
		const editor = editorRef.current;
		const selection = window.getSelection();
		if (!editor || !selection?.rangeCount) return;
		const range = selection.getRangeAt(0);
		if (!editor.contains(range.commonAncestorContainer)) {
			editor.focus();
			return;
		}
		const anchor = closestAnchor(selection.anchorNode, editor);
		savedRangeRef.current = range.cloneRange();
		editingAnchorRef.current = anchor;
		setLinkValue(anchor?.getAttribute("href") ?? "");
		setLinkError(false);
		setLinkOpen(true);
	};

	const restoreSelection = () => {
		const selection = window.getSelection();
		const range = savedRangeRef.current;
		if (!selection || !range) return null;
		editorRef.current?.focus();
		selection.removeAllRanges();
		selection.addRange(range);
		return range;
	};

	const applyLink = (event: FormEvent) => {
		event.preventDefault();
		event.stopPropagation();
		const href = normalizeLink(linkValue);
		if (!href) {
			setLinkError(true);
			return;
		}
		const range = restoreSelection();
		const existingAnchor = editingAnchorRef.current;
		if (existingAnchor) existingAnchor.setAttribute("href", href);
		else if (range?.collapsed) {
			const anchor = document.createElement("a");
			anchor.href = href;
			anchor.textContent = href;
			range.insertNode(anchor);
			range.setStartAfter(anchor);
			range.collapse(true);
		} else if (range) {
			document.execCommand("createLink", false, href);
		}
		emitChange();
		setLinkOpen(false);
	};

	const removeLink = () => {
		const anchor = editingAnchorRef.current;
		if (!anchor) return;
		const parent = anchor.parentNode;
		while (anchor.firstChild) parent?.insertBefore(anchor.firstChild, anchor);
		anchor.remove();
		emitChange();
		setLinkOpen(false);
	};

	const handlePaste = (event: ClipboardEvent<HTMLDivElement>) => {
		event.preventDefault();
		document.execCommand("insertText", false, event.clipboardData.getData("text/plain").replace(/\r\n?/g, "\n"));
		emitChange();
	};

	const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
		if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
		const command = ({ b: "bold", i: "italic", u: "underline" } as const)[event.key.toLowerCase() as "b" | "i" | "u"];
		if (!command) return;
		event.preventDefault();
		runCommand(command);
	};

	const toolbarButton = (command: "bold" | "italic" | "underline", icon: ReactNode, label: string) =>
		<Button type="button" size="icon-sm" variant="ghost" disabled={disabled} aria-label={label} title={label}
			aria-pressed={formats[command]} onMouseDown={(event) => event.preventDefault()} onClick={() => runCommand(command)}>{icon}</Button>;

	return <div className="mail-rich-text-editor" data-disabled={disabled || undefined}>
		<div className="mail-rich-text-toolbar" role="toolbar" aria-label={labels.toolbar}>
			{toolbarButton("bold", <BoldIcon />, labels.bold)}
			{toolbarButton("italic", <ItalicIcon />, labels.italic)}
			{toolbarButton("underline", <UnderlineIcon />, labels.underline)}
			<Button type="button" size="icon-sm" variant="ghost" disabled={disabled} aria-label={labels.link} title={labels.link}
				aria-pressed={formats.link} onMouseDown={(event) => event.preventDefault()} onClick={openLinkDialog}><LinkIcon /></Button>
		</div>
		<div ref={editorRef} id={id} className="mail-rich-text-content" contentEditable={!disabled} role="textbox"
			aria-label={ariaLabel} aria-multiline="true" aria-readonly={disabled} suppressContentEditableWarning spellCheck
			onFocus={() => {
				document.execCommand("defaultParagraphSeparator", false, "p");
				document.execCommand("styleWithCSS", false, "false");
			}}
			onInput={emitChange} onPaste={handlePaste} onKeyDown={handleKeyDown} />
		<Dialog open={linkOpen} onOpenChange={setLinkOpen}>
			<DialogContent className="mail-link-dialog">
				<form onSubmit={applyLink}>
					<DialogHeader><DialogTitle>{labels.linkTitle}</DialogTitle>
						<DialogDescription>{labels.linkDescription}</DialogDescription></DialogHeader>
					<div className="mail-link-field"><Label htmlFor={`${id}-link-url`}>{labels.linkUrl}</Label>
						<Input id={`${id}-link-url`} value={linkValue} placeholder={labels.linkPlaceholder} autoFocus aria-invalid={linkError}
							onChange={(event) => { setLinkValue(event.target.value); setLinkError(false); }} />
						{linkError && <p role="alert">{labels.linkInvalid}</p>}</div>
					<DialogFooter>
						{editingAnchorRef.current && <Button type="button" variant="destructive" onClick={removeLink}>{labels.linkRemove}</Button>}
						<DialogClose render={<Button type="button" variant="outline" />}>{labels.cancel}</DialogClose>
						<Button type="submit">{labels.linkApply}</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	</div>;
}
