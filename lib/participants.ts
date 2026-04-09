export type ParticipantEntry = {
  name: string;
  email?: string | null;
};

type SelectedContact = {
  name: string;
  email: string;
};

export function normalizeParticipantName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function getParticipantNameKey(value: string) {
  return normalizeParticipantName(value).toLowerCase();
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function parseParticipantString(value: string): ParticipantEntry | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const match = trimmed.match(/^(.*?)\s*<([^<>]+)>$/);
  if (match) {
    const [, rawName, rawEmail] = match;
    return {
      name: normalizeParticipantName(rawName) || normalizeEmail(rawEmail),
      email: normalizeEmail(rawEmail),
    };
  }

  return { name: normalizeParticipantName(trimmed) };
}

function pushUniqueParticipant(target: ParticipantEntry[], participant: ParticipantEntry) {
  const name = normalizeParticipantName(participant.name);
  const nameKey = name ? getParticipantNameKey(name) : null;
  const email = participant.email ? normalizeEmail(participant.email) : null;

  if (!name && !email) return;

  const existingIndex = target.findIndex((item) => {
    const itemName = normalizeParticipantName(item.name);
    const itemNameKey = itemName ? getParticipantNameKey(itemName) : null;
    const itemEmail = item.email ? normalizeEmail(item.email) : null;

    if (email && itemEmail === email) return true;
    if (nameKey && itemNameKey === nameKey) return true;
    return false;
  });

  if (existingIndex >= 0) {
    const existing = target[existingIndex];

    target[existingIndex] = {
      name: normalizeParticipantName(existing.name) || name || email || "",
      email: existing.email ? normalizeEmail(existing.email) : email,
    };
    return;
  }

  target.push({
    name: name || email || "",
    email,
  });
}

export function parseParticipantNamesText(value: string) {
  const seen = new Set<string>();
  const names: string[] = [];

  value
    .split(/\r?\n|,|;/)
    .map((item) => normalizeParticipantName(item))
    .filter(Boolean)
    .forEach((name) => {
      const key = getParticipantNameKey(name);
      if (seen.has(key)) return;
      seen.add(key);
      names.push(name);
    });

  return names;
}

export function pruneParticipantEmailMap(
  displayText: string,
  emailMap: Record<string, string>
) {
  const visibleNameKeys = new Set(
    parseParticipantNamesText(displayText).map((name) => getParticipantNameKey(name))
  );

  return Object.entries(emailMap).reduce<Record<string, string>>((acc, [key, email]) => {
    const normalizedEmail = email?.trim().toLowerCase();

    if (!visibleNameKeys.has(key) || !normalizedEmail) {
      return acc;
    }

    acc[key] = normalizedEmail;
    return acc;
  }, {});
}

export function parseParticipants(value: unknown): ParticipantEntry[] {
  if (!value) return [];

  const participants: ParticipantEntry[] = [];

  if (Array.isArray(value)) {
    value.forEach((item) => {
      if (typeof item === "string") {
        const parsed = parseParticipantString(item);
        if (parsed) pushUniqueParticipant(participants, parsed);
        return;
      }

      if (item && typeof item === "object") {
        const record = item as Record<string, unknown>;
        const name = String(
          record.name ??
            record.full_name ??
            record.displayName ??
            record.email ??
            ""
        ).trim();
        const email =
          typeof record.email === "string" ? normalizeEmail(record.email) : null;

        if (name || email) {
          pushUniqueParticipant(participants, {
            name: name || email || "",
            email,
          });
        }
      }
    });

    return participants;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];

    try {
      const parsedJson = JSON.parse(trimmed);
      return parseParticipants(parsedJson);
    } catch {
    }

    trimmed
      .split(/\r?\n|,|;/)
      .map((item) => parseParticipantString(item))
      .filter(Boolean)
      .forEach((item) => pushUniqueParticipant(participants, item as ParticipantEntry));
  }

  return participants;
}

export function getParticipantsDisplayText(value: unknown) {
  const participants = parseParticipants(value);
  if (participants.length === 0) return "-";

  return participants
    .map((item) => item.name)
    .filter(Boolean)
    .join(", ");
}

export function getParticipantEmailsList(value: unknown) {
  return parseParticipants(value)
    .map((item) => item.email?.trim().toLowerCase() || "")
    .filter(Boolean);
}

export function buildParticipantsStorageValue({
  displayText,
  selectedContacts,
}: {
  displayText: string;
  selectedContacts: SelectedContact[];
}) {
  const merged: ParticipantEntry[] = [];
  const visibleNames = new Set(
    parseParticipantNamesText(displayText).map((item) => getParticipantNameKey(item))
  );

  parseParticipantNamesText(displayText).forEach((name) =>
    pushUniqueParticipant(merged, { name })
  );

  selectedContacts.forEach((contact) => {
    if (!visibleNames.has(getParticipantNameKey(contact.name))) {
      return;
    }

    pushUniqueParticipant(merged, {
      name: normalizeParticipantName(contact.name),
      email: contact.email,
    });
  });

  if (merged.length === 0) return null;

  return JSON.stringify(merged);
}

export function buildParticipantsStorageValueFromEmailMap({
  displayText,
  emailMap,
}: {
  displayText: string;
  emailMap: Record<string, string>;
}) {
  const participantNames = parseParticipantNamesText(displayText);
  const nextEmailMap = pruneParticipantEmailMap(displayText, emailMap);

  if (participantNames.length === 0) {
    return null;
  }

  return JSON.stringify(
    participantNames.map((name) => {
      const email = nextEmailMap[getParticipantNameKey(name)]?.trim().toLowerCase();
      return email ? { name, email } : { name };
    })
  );
}
