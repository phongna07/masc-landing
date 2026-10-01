CREATE TABLE "round_problem_statements" (
	"round" text PRIMARY KEY NOT NULL,
	"object_key" text NOT NULL,
	"original_filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"file_size" bigint NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "round_problem_statements_object_key_unique" UNIQUE("object_key"),
	CONSTRAINT "round_problem_statements_round_check" CHECK ("round_problem_statements"."round" in ('2', '3')),
	CONSTRAINT "round_problem_statements_file_check" CHECK ("round_problem_statements"."mime_type" = 'application/pdf' and "round_problem_statements"."file_size" > 0 and "round_problem_statements"."file_size" <= 209715200)
);
