ALTER TABLE "round_1_member_cvs" ADD COLUMN "proof_files" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "round_1_member_cvs" ADD CONSTRAINT "round_1_member_cvs_proof_files_check" CHECK (
      jsonb_typeof("round_1_member_cvs"."proof_files") = 'array' and jsonb_array_length("round_1_member_cvs"."proof_files") <= 10
    );