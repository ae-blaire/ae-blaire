type SlotLike = {
  start_datetime?: string | null;
  end_datetime?: string | null;
};

type AvailabilityItemLike = {
  email: string;
  busy: Array<{
    start: string;
    end: string;
  }>;
};

export type SlotAvailabilityResult<TSlot extends SlotLike = SlotLike> = {
  slot: TSlot;
  isAvailableForAll: boolean;
  conflictCount: number;
  conflictParticipants: string[];
};

function isOverlapping(
  slotStart: string | null | undefined,
  slotEnd: string | null | undefined,
  busyStart: string,
  busyEnd: string
) {
  if (!slotStart || !slotEnd) return false;

  const slotStartTime = new Date(slotStart).getTime();
  const slotEndTime = new Date(slotEnd).getTime();
  const busyStartTime = new Date(busyStart).getTime();
  const busyEndTime = new Date(busyEnd).getTime();

  if (
    Number.isNaN(slotStartTime) ||
    Number.isNaN(slotEndTime) ||
    Number.isNaN(busyStartTime) ||
    Number.isNaN(busyEndTime)
  ) {
    return false;
  }

  return slotStartTime < busyEndTime && slotEndTime > busyStartTime;
}

export function getSlotAvailability<TSlot extends SlotLike>(
  slots: TSlot[],
  availabilityItems: AvailabilityItemLike[]
): SlotAvailabilityResult<TSlot>[] {
  return slots.map((slot) => {
    const conflictParticipants = availabilityItems
      .filter((item) =>
        item.busy.some((busySlot) =>
          isOverlapping(
            slot.start_datetime,
            slot.end_datetime,
            busySlot.start,
            busySlot.end
          )
        )
      )
      .map((item) => item.email);

    return {
      slot,
      isAvailableForAll: conflictParticipants.length === 0,
      conflictCount: conflictParticipants.length,
      conflictParticipants,
    };
  });
}
