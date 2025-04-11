export function evaluateBathrooms(input) {
  const rooms = [];
  const { occupants, tier, guest } = input;

  const familyOccupants = occupants;
  const totalBedrooms = familyOccupants - 2 > 0 ? familyOccupants - 2 : 0;
  const hasGuest = guest === true;

  // TIER 1
  if (tier === 1) {
    if (familyOccupants <= 4) {
      rooms.push("primary_bathroom");
    } else {
      rooms.push("master_bathroom");
      rooms.push("secondary_bathroom");
    }
  }

  // TIER 2
  else if (tier === 2) {
    if (familyOccupants === 2 && hasGuest) {
      rooms.push("master_bathroom");
      rooms.push("secondary_bathroom");
    } else if (familyOccupants === 2) {
      rooms.push("master_bathroom");
      rooms.push("powder_room");
    } else if (familyOccupants > 2 && familyOccupants < 5) {
      rooms.push("master_bathroom");
      rooms.push("secondary_bathroom");
      rooms.push("powder_room");
    } else if (familyOccupants >= 5) {
      rooms.push("master_bathroom");
      rooms.push("secondary_bathroom");
      rooms.push("secondary_bathroom");
      rooms.push("powder_room");
    }
  }

  // TIER 3
  else if (tier === 3) {
    rooms.push("master_bathroom");
    rooms.push("powder_room");

    for (let i = 0; i < totalBedrooms; i++) {
      rooms.push("ensuite");
    }

    if (hasGuest) {
      rooms.push("ensuite");
    }
  }

  return { rooms };
}
