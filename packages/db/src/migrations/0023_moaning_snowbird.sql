ALTER TABLE "admission_tickets" DROP COLUMN "event";--> statement-breakpoint
ALTER TABLE "ticket_gift_batches" DROP COLUMN "event";--> statement-breakpoint
ALTER TABLE "ticket_settings" DROP COLUMN "event";--> statement-breakpoint
UPDATE "ticket_orders" SET "snapshot" = "snapshot" - 'event'
WHERE "snapshot" ? 'event';--> statement-breakpoint
-- Retire obsolete copy overrides and return messages using removed variables to
-- the localized default introduction. Preserve appearance and other labels.
WITH cleaned_locales AS (
	SELECT settings.id, jsonb_object_agg(locale.key,
		jsonb_set(jsonb_set(jsonb_set(locale.value,
			'{copy}', (locale.value->'copy') - 'dateUnknown' - 'venueUnknown'),
			'{purchaseBody}', CASE WHEN locale.value->>'purchaseBody' ~ '\{\{\s*(eventName|eventDate|venue)\s*\}\}'
				THEN '""'::jsonb ELSE locale.value->'purchaseBody' END),
			'{giftBody}', CASE WHEN locale.value->>'giftBody' ~ '\{\{\s*(eventName|eventDate|venue)\s*\}\}'
				THEN '""'::jsonb ELSE locale.value->'giftBody' END)
	) AS locales
	FROM "ticket_template_settings" settings,
		jsonb_each(settings.config->'locales') locale
	GROUP BY settings.id
)
UPDATE "ticket_template_settings" settings
SET "config" = jsonb_set(settings.config, '{locales}', cleaned.locales),
	"revision" = settings.revision + 1, "updated_at" = now()
FROM cleaned_locales cleaned
WHERE settings.id = cleaned.id AND settings.config->'locales' IS DISTINCT FROM cleaned.locales;
