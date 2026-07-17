export const TEAM_SIZE = 3;
export const TEAMMATE_COUNT = TEAM_SIZE - 1;
export const MIN_PARTICIPANT_AGE = 18;
export const MAX_PARTICIPANT_AGE = 22;

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

export function isEligibleBirthdate(value: string, referenceYear = new Date().getFullYear()) {
  if (!isValidBirthdate(value)) return false;
  const ageByYear = referenceYear - Number(value.slice(0, 4));
  return ageByYear >= MIN_PARTICIPANT_AGE && ageByYear <= MAX_PARTICIPANT_AGE;
}

export function getEligibleBirthdateRange(referenceYear = new Date().getFullYear()) {
  return {
    min: `${referenceYear - MAX_PARTICIPANT_AGE}-01-01`,
    max: `${referenceYear - MIN_PARTICIPANT_AGE}-12-31`,
  };
}
