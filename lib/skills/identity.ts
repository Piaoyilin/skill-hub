import { createHash } from "node:crypto";

export const MAX_SLUG_LENGTH = 80;
export const MAX_NAME_LENGTH = 200;
export const SKILL_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function slugHash(value: string) {
  return createHash("sha1").update(value, "utf8").digest("hex").slice(0, 12);
}

export function toSkillSlug(value: string, prefix = "skill") {
  const ascii = value
    .trim()
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, "");

  return ascii || `${prefix}-${slugHash(value)}`;
}

export function resolveSkillSlug(value: string | undefined, fallbackName: string) {
  const source = value?.trim() ?? "";
  return source ? source.toLowerCase() : toSkillSlug(fallbackName);
}

export function isValidSkillSlug(value: string) {
  return (
    value.length > 0 &&
    value.length <= MAX_SLUG_LENGTH &&
    SKILL_SLUG_PATTERN.test(value)
  );
}

export function isValidSkillName(value: string) {
  return (
    value.length > 0 &&
    value.length <= MAX_NAME_LENGTH &&
    !/[\r\n]/.test(value)
  );
}
