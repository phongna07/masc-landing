ALTER TABLE "preferences_settings" ADD COLUMN "problem_statement_object_key" text;--> statement-breakpoint
ALTER TABLE "preferences_settings" ADD COLUMN "problem_statement_original_filename" text;--> statement-breakpoint
ALTER TABLE "preferences_settings" ADD COLUMN "problem_statement_mime_type" text;--> statement-breakpoint
ALTER TABLE "preferences_settings" ADD COLUMN "problem_statement_file_size" bigint;--> statement-breakpoint
ALTER TABLE "preferences_settings" ADD CONSTRAINT "preferences_settings_problem_statement_object_key_unique" UNIQUE("problem_statement_object_key");--> statement-breakpoint
ALTER TABLE "preferences_settings" ADD CONSTRAINT "preferences_settings_problem_statement_check" CHECK ((
			("preferences_settings"."problem_statement_object_key" is null
				and "preferences_settings"."problem_statement_original_filename" is null
				and "preferences_settings"."problem_statement_mime_type" is null
				and "preferences_settings"."problem_statement_file_size" is null)
			or
			("preferences_settings"."problem_statement_object_key" is not null
				and "preferences_settings"."problem_statement_original_filename" is not null
				and "preferences_settings"."problem_statement_mime_type" is not null
				and "preferences_settings"."problem_statement_mime_type" = 'application/pdf'
				and "preferences_settings"."problem_statement_file_size" is not null
				and "preferences_settings"."problem_statement_file_size" > 0)
		));