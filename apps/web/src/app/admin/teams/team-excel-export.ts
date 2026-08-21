import type { AppRouter } from "@masc-landing/api/routers/index";
import type { RoundId } from "@masc-landing/api/rounds";
import { TEAM_SIZE } from "@masc-landing/api/registration";
import type { inferRouterOutputs } from "@trpc/server";
import type { Cell, SheetData } from "write-excel-file/browser";

type ExportTeams = inferRouterOutputs<AppRouter>["admin"]["exportTeams"];

const statusLabels = {
  pending: "Pending review",
  approved: "Approved",
  rejected: "Rejected",
} as const;

const preferenceStatusLabels = {
  not_submitted: "Not submitted",
  submitted: "Submitted",
  assigned: "Assigned",
} as const;

const admissionMethodLabels = {
  direct: "Direct application",
  cv_screening: "CV screening",
  round_0_5_promotion: "Promoted from Round 0.5",
  promotion: "Promotion",
} as const;

const awarenessSourceLabels = {
  masc_fanpage: "MASC Fanpage",
  masc_community_group: "MASC Community Group",
  other_facebook_group: "Another Facebook group",
  other_organization_fanpage: "Another organization or club's fanpage",
  media_ambassador: "Media ambassador",
} as const;

const headerStyle = {
  backgroundColor: "#6550ED",
  textColor: "#FFFFFF",
  fontWeight: "bold" as const,
  align: "center" as const,
  alignVertical: "center" as const,
  wrap: true,
};

function textCell(value: string | null | undefined): Cell {
  return value ? { value, type: String } : null;
}

function dateCell(value: string | Date, format: string): Cell {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : { value: date, type: Date, format };
}

function birthdateCell(value: string): Cell {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]); const month = Number(match[2]); const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return { value: date, type: Date, format: "yyyy-mm-dd" };
}

function headerCell(value: string): Cell {
  return { value, type: String, ...headerStyle };
}

function localDateStamp(date = new Date()) {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export async function exportTeamsToExcel(round: RoundId, teams: ExportTeams) {
  const memberSlots = Math.max(TEAM_SIZE, ...teams.map((team) => team.members.length));
  const headers = [
    "Team ID", "Team Name", "Round", "Registration Status", "Registered At", "Admission Method",
    "Source Round", "Source Team ID", "Source Team Name", "Captain Phone", "Awareness Source",
    "Awareness Source Detail",
  ];
  const columns = [
    { width: 38 }, { width: 28 }, { width: 10 }, { width: 20 }, { width: 22 }, { width: 26 },
    { width: 12 }, { width: 38 }, { width: 28 }, { width: 18 }, { width: 30 }, { width: 36 },
  ];
  if (round === "1") {
    headers.push("Preference Status", "Preferences", "Assigned Track");
    columns.push({ width: 20 }, { width: 54 }, { width: 32 });
  }
  for (let slot = 1; slot <= memberSlots; slot += 1) {
    headers.push(`Member ${slot} Role`, `Member ${slot} Name`, `Member ${slot} Email`,
      `Member ${slot} Birthdate`, `Member ${slot} University`);
    columns.push({ width: 16 }, { width: 26 }, { width: 32 }, { width: 18 }, { width: 32 });
  }

  const sheetData: SheetData = [
    headers.map(headerCell),
    ...teams.map((team) => {
      const row: Cell[] = [
        textCell(team.id),
        textCell(team.name),
        textCell(round),
        textCell(statusLabels[team.status]),
        dateCell(team.createdAt, "yyyy-mm-dd hh:mm"),
        textCell(admissionMethodLabels[team.admissionMethod]),
        textCell(team.sourceRound),
        textCell(team.sourceTeamId),
        textCell(team.sourceTeamName),
        textCell(team.captainPhone),
        textCell(team.awarenessSource ? awarenessSourceLabels[team.awarenessSource] : null),
        textCell(team.awarenessSourceDetail),
      ];
      if (round === "1") row.push(
        textCell(team.preferenceStatus ? preferenceStatusLabels[team.preferenceStatus] : null),
        textCell(team.preferences.map((preference, index) => `${index + 1}. ${preference.name}`).join(" | ")),
        textCell(team.assignedTrack?.name),
      );
      for (let index = 0; index < memberSlots; index += 1) {
        const member = team.members[index];
        row.push(
          textCell(member ? member.isCaptain ? "Captain" : "Member" : null),
          textCell(member?.fullName),
          textCell(member?.email),
          member ? birthdateCell(member.birthdate) : null,
          textCell(member?.universityName),
        );
      }
      return row;
    }),
  ];

  const { default: writeExcelFile } = await import("write-excel-file/browser");
  await writeExcelFile(sheetData, {
    sheet: `Round ${round} Teams`,
    columns,
    stickyRowsCount: 1,
    stickyColumnsCount: 2,
    orientation: "landscape",
  }).toFile(`masc-teams-round-${round}-${localDateStamp()}.xlsx`);
}
