"use client";

import { Accordion as AccordionPrimitive } from "@base-ui/react/accordion";
import { cn } from "@masc-landing/ui/lib/utils";

function Accordion({ className, ...props }: AccordionPrimitive.Root.Props) {
	return (
		<AccordionPrimitive.Root
			data-slot="accordion"
			className={cn(className)}
			{...props}
		/>
	);
}

function AccordionItem({ className, ...props }: AccordionPrimitive.Item.Props) {
	return (
		<AccordionPrimitive.Item
			data-slot="accordion-item"
			className={cn(className)}
			{...props}
		/>
	);
}

function AccordionHeader({ className, ...props }: AccordionPrimitive.Header.Props) {
	return (
		<AccordionPrimitive.Header
			data-slot="accordion-header"
			className={cn(className)}
			{...props}
		/>
	);
}

function AccordionTrigger({ className, ...props }: AccordionPrimitive.Trigger.Props) {
	return (
		<AccordionPrimitive.Trigger
			data-slot="accordion-trigger"
			className={cn(className)}
			{...props}
		/>
	);
}

function AccordionPanel({ className, ...props }: AccordionPrimitive.Panel.Props) {
	return (
		<AccordionPrimitive.Panel
			data-slot="accordion-panel"
			className={cn(className)}
			{...props}
		/>
	);
}

export { Accordion, AccordionItem, AccordionHeader, AccordionTrigger, AccordionPanel };
