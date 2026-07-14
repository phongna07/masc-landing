DELETE FROM "teams" AS "team"
WHERE (
	SELECT count(*)
	FROM "members"
	WHERE "members"."team_id" = "team"."id"
) <> 3;
--> statement-breakpoint
CREATE FUNCTION "assert_team_has_three_members"("target_team_id" text)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
	"actual_member_count" integer;
BEGIN
	IF NOT EXISTS (SELECT 1 FROM "teams" WHERE "id" = "target_team_id") THEN
		RETURN;
	END IF;

	SELECT count(*)
	INTO "actual_member_count"
	FROM "members"
	WHERE "team_id" = "target_team_id";

	IF "actual_member_count" <> 3 THEN
		RAISE EXCEPTION 'Team % must have exactly 3 members; found %', "target_team_id", "actual_member_count"
			USING ERRCODE = '23514';
	END IF;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION "check_team_size_after_team_change"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	PERFORM "assert_team_has_three_members"(NEW."id");
	RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION "check_team_size_after_member_change"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	IF TG_OP IN ('UPDATE', 'DELETE') THEN
		PERFORM "assert_team_has_three_members"(OLD."team_id");
	END IF;

	IF TG_OP IN ('INSERT', 'UPDATE') THEN
		PERFORM "assert_team_has_three_members"(NEW."team_id");
	END IF;

	RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "teams_exactly_three_members_check"
AFTER INSERT OR UPDATE ON "teams"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION "check_team_size_after_team_change"();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "members_exactly_three_members_check"
AFTER INSERT OR UPDATE OR DELETE ON "members"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION "check_team_size_after_member_change"();
