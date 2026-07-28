export const TEAM_SIZE = 3;
export const TEAMMATE_COUNT = TEAM_SIZE - 1;
export const MIN_PARTICIPANT_AGE = 18;
export const MAX_PARTICIPANT_AGE = 22;
export const PARTICIPANT_AGE_REFERENCE_DATE = "2026-08-07";

const isoDatePattern = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isValidBirthdate(value: string) {
  const match = isoDatePattern.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

function formatIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function subtractUtcYears(date: Date, years: number) {
  return new Date(Date.UTC(
    date.getUTCFullYear() - years,
    date.getUTCMonth(),
    date.getUTCDate(),
  ));
}

export function isEligibleBirthdate(
  value: string,
  referenceDate = PARTICIPANT_AGE_REFERENCE_DATE,
) {
  if (!isValidBirthdate(value)) return false;
  const range = getEligibleBirthdateRange(referenceDate);
  return value >= range.min && value <= range.max;
}

export function getEligibleBirthdateRange(
  referenceDate = PARTICIPANT_AGE_REFERENCE_DATE,
) {
  if (!isValidBirthdate(referenceDate)) {
    throw new Error("Invalid participant age reference date");
  }

  const reference = new Date(`${referenceDate}T00:00:00Z`);
  const oldestBirthdate = subtractUtcYears(reference, MAX_PARTICIPANT_AGE + 1);
  oldestBirthdate.setUTCDate(oldestBirthdate.getUTCDate() + 1);

  return {
    min: formatIsoDate(oldestBirthdate),
    max: formatIsoDate(subtractUtcYears(reference, MIN_PARTICIPANT_AGE)),
  };
}
