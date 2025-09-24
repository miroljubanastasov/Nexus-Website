const roomData = await fetch("src/rooms.json").then(res => res.json());

function getRoomById(ID) {
  const room = roomData.find(r => r.ID === ID);
  return JSON.parse(JSON.stringify(room)); // return a copy
}

function getRoomByTier(Room_ID, tier) {
  const room = roomData.find(r => r["Room ID"] === Room_ID && r.Tier_ID === tier);
  return JSON.parse(JSON.stringify(room)); // return a copy
}

export function run_brief({ occupants, guest, office, atelier, garage, spa, stories, tier, parents, technik }) {
  let rooms = [];
  const shared_baths = [];

  let total_occupants = occupants;

  let no_of_rooms = 0;
  let no_of_bedrooms = 0;
  let no_of_baths = 0;

  let shared_bath_occupants = 0;

  //Bedrooms
  //Master Bedroom
  let master_bedroom = getRoomByTier("MBR", tier);
  rooms.push(master_bedroom);
  no_of_rooms += 1;
  no_of_bedrooms += 1;
  master_bedroom.NestedRooms = [];
  //Ensuite master Bathroom
  if (master_bedroom["Ensuite Bathroom"].Value) {
    let master_bathroom = getRoomByTier("MBT", tier);
    master_bathroom.Name = "Ensuite Bathroom";
    master_bedroom.NestedRooms.push(master_bathroom);
    master_bedroom.Area.Value += master_bathroom.Area.Value;
    no_of_baths += 1;
  }
  else {
    let primary_bathroom = getRoomByTier("PBT", tier);
    shared_baths.push(primary_bathroom);
    primary_bathroom.Name += " " + String(shared_baths.length)
    shared_bath_occupants += master_bedroom.Occupancy.Value;
    no_of_baths += 1;
  }
  //Walk in closet
  if (master_bedroom["Walk in Closet"].Value) {
    let walk_in_closet = getRoomByTier("WIC", tier);
    walk_in_closet.Name = "Walk in Closet";
    master_bedroom.NestedRooms.push(walk_in_closet);
    master_bedroom.Area.Value += walk_in_closet.Area.Value;
  }

  //Rooms
  for (let i = 0; i < occupants - 2; i++) {
    let bedroom = getRoomByTier("SBR", tier);
    bedroom.Name += " " + String(no_of_bedrooms);
    no_of_rooms += 1;
    no_of_bedrooms += 1;
    bedroom.NestedRooms = [];
    rooms.push(bedroom);
    // Ensuite bathroom
    if (bedroom["Ensuite Bathroom"].Value) {
      let ensuite_bath = getRoomByTier("SBT", tier);
      ensuite_bath.Name = "Ensuite Bathroom";
      bedroom.NestedRooms.push(ensuite_bath);
      bedroom.Area.Value += ensuite_bath.Area.Value;
      no_of_baths += 1;
    }
    else {
      shared_bath_occupants += bedroom.Occupancy.Value;
      if (Math.ceil(shared_bath_occupants / 4) > shared_baths.length) {
        let second_bathroom = getRoomByTier("SBT", tier);
        shared_baths.push(second_bathroom);
        second_bathroom.Name += " " + String(shared_baths.length)
        no_of_baths += 1;
      }
    }
    //Walk in closet
    if (bedroom["Walk in Closet"].Value) {
      let walk_in_closet = getRoomByTier("WIC", tier);
      walk_in_closet.Name = "Walk in Closet";
      bedroom.NestedRooms.push(walk_in_closet);
      bedroom.Area.Value += walk_in_closet.Area.Value;
    }
  }

  //Parents Room
  if (parents) {
    let parent_room = getRoomByTier("PBR", tier);
    parent_room.NestedRooms = [];
    rooms.push(parent_room);
    no_of_rooms += 1;
    total_occupants += parent_room.Occupancy.Value;
    no_of_bedrooms += 1;
    if (parent_room["Ensuite Bathroom"].Value) {
      let ensuite_bath = getRoomByTier("SBT", tier);
      ensuite_bath.Name = "Ensuite Bathroom";
      parent_room.NestedRooms.push(ensuite_bath);
      parent_room.Area.Value += ensuite_bath.Area.Value;
      no_of_baths += 1;
    }
    else {
      shared_bath_occupants += parent_room.Occupancy.Value;
      if (Math.ceil(shared_bath_occupants / 4) > shared_baths.length) {
        let second_bathroom = getRoomByTier("SBT", tier);
        shared_baths.push(second_bathroom);
        second_bathroom.Name += " " + String(shared_baths.length)
        no_of_baths += 1;
      }
    }
    //Walk in closet
    if (parent_room["Walk in Closet"].Value) {
      let walk_in_closet = getRoomByTier("WIC", tier);
      walk_in_closet.Name = "Walk in Closet";
      parent_room.NestedRooms.push(walk_in_closet);
      parent_room.Area.Value += walk_in_closet.Area.Value;
    }
  }

  //Guest Room
  if (guest) {
    let guest_room = getRoomByTier("GBR", tier);
    guest_room.NestedRooms = [];
    rooms.push(guest_room);
    no_of_rooms += 1;
    no_of_bedrooms += 1;
    if (guest_room["Ensuite Bathroom"].Value) {
      let ensuite_bath = getRoomByTier("SBT", tier);
      ensuite_bath.Name = "Ensuite Bathroom";
      guest_room.NestedRooms.push(ensuite_bath);
      guest_room.Area.Value += ensuite_bath.Area.Value;
      no_of_baths += 1;
    }
    else if (shared_baths.length === 0) {
      let second_bathroom = getRoomByTier("SBT", tier);
      shared_baths.push(second_bathroom);
      second_bathroom.Name += " " + String(shared_baths.length)
      no_of_baths += 1;
    }
    //Walk in closet
    if (guest_room["Walk in Closet"].Value) {
      let walk_in_closet = getRoomByTier("WIC", tier);
      walk_in_closet.Name = "Walk in Closet";
      guest_room.NestedRooms.push(walk_in_closet);
      guest_room.Area.Value += walk_in_closet.Area.Value;
    }
  }

  rooms.push(...shared_baths);

  //Living Spaces
  //Entrance Lobby
  let entrance = getRoomByTier("ENT", tier);
  rooms.push(entrance);

  let living_room = getRoomByTier("LIV", tier)
  living_room.Occupancy = total_occupants + 2;
  living_room.Area.Value = Math.max(living_room["Area per person"].Value * living_room.Occupancy, living_room["Min Area"].Value)
  rooms.push(living_room);

  let dinning_room = getRoomByTier("DIN", tier)
  dinning_room.Occupancy = total_occupants + 2;
  dinning_room.Area.Value = Math.max(dinning_room["Area per person"].Value * dinning_room.Occupancy, dinning_room["Min Area"].Value)
  dinning_room["Number of Seats"] = {
    "Value": dinning_room.Occupancy,
    "Report": true
  }
  rooms.push(dinning_room);

  let kitchen = getRoomByTier("KCH", tier)
  kitchen.Occupancy = total_occupants + 2;
  kitchen.Area.Value = Math.max(kitchen["Area per person"].Value * kitchen.Occupancy, kitchen["Min Area"].Value)
  rooms.push(kitchen);

  //Powder Room
  if ((tier === 1 && shared_baths.length === 0) || tier > 1) {

    rooms.push(getRoomByTier("PRM", tier))
  }

  //OPTIONAL
  if (office) rooms.push(getRoomByTier("OFF", tier));
  if (atelier) rooms.push(getRoomByTier("ATE", tier));
  if (spa) rooms.push(getRoomByTier("SPA", tier));

  //STAIRS
  if (stories > 1) {
    rooms.push(getRoomByTier("STA", tier));
  }

  // Services
  if (tier > 1) {
    rooms.push(getRoomByTier("SER", tier))
  }

  if (technik) rooms.push(getRoomByTier("TRA", tier));
  if (garage) rooms.push(getRoomByTier("GAR", tier));

  return {
    rooms: rooms,
    occupants: total_occupants,
    totalArea: rooms.reduce((a, r) => a + (r.Area.Value || 0), 0),
    nRooms: no_of_rooms,
    nBedRooms: no_of_bedrooms,
    nBaths: no_of_baths
  };
}
