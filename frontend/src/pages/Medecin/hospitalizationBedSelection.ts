export type BedSelectionRoom = {
  id: string;
  number: string;
  beds?: Array<{ id: string; code: string; status: string }>;
};

export type BedSelectionState = {
  selectedRoomId: string | null;
  availableBeds: Array<{ id: string; code: string; status: string }>;
  message: string | null;
};

export function getBedSelectionState(rooms: BedSelectionRoom[], selectedRoomId: string | null): BedSelectionState {
  const roomWithFreeBed = rooms.find((room) => (room.beds || []).some((bed) => bed.status === 'FREE'));
  const fallbackRoom = roomWithFreeBed ?? null;
  const effectiveRoomId = selectedRoomId && rooms.some((room) => room.id === selectedRoomId) ? selectedRoomId : fallbackRoom?.id ?? null;

  const room = rooms.find((room) => room.id === effectiveRoomId) ?? fallbackRoom ?? null;
  const availableBeds = (room?.beds || []).filter((bed) => bed.status === 'FREE');

  if (room && availableBeds.length === 0) {
    return {
      selectedRoomId: fallbackRoom?.id ?? null,
      availableBeds: (fallbackRoom?.beds || []).filter((bed) => bed.status === 'FREE'),
      message: fallbackRoom
        ? `Aucun lit disponible pour cette chambre. Utilisez la chambre ${fallbackRoom.number}.`
        : 'Aucun lit disponible pour le moment.',
    };
  }

  return {
    selectedRoomId: room?.id ?? null,
    availableBeds,
    message: room && availableBeds.length === 0 ? 'Aucun lit disponible pour cette chambre.' : null,
  };
}
