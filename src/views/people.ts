// A person as the board shows them: the name they gave, else the first part
// of their email as words ("maria.lopez@" is Maria Lopez). Who is not an
// email (the AI) shows as it is.
import type { Person } from "../db/queries";

export type NameOf = (who: string) => string;

export function namer(people: Person[]): NameOf {
  const given = new Map(people.filter((p) => p.name).map((p) => [p.email, p.name!]));
  return (who) => given.get(who) ?? (who.includes("@") ? fromEmail(who) : who);
}

const fromEmail = (email: string) =>
  email.split("@")[0].split(/[._+-]+/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(" ") || email;

// One or two letters for a name: "Maria" is M, "Maria Lopez" is ML.
// Words that start with no letter, like "(dispatch)", are skipped.
export const initials = (name: string) => name.split(/\s+/).filter((w) => /^\p{L}/u.test(w)).slice(0, 2).map((w) => w[0].toUpperCase()).join("") || name.slice(0, 1).toUpperCase();
