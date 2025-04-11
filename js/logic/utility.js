export function evaluateUtility({ tier }) {
    const rooms = [];
    const trace = [];
  
    if (tier === 2) {
      rooms.push("combined_storage_laundry");
      trace.push("Tier 2: combined storage and laundry room");
    } else if (tier === 3) {
      rooms.push("storage_room", "laundry_room");
      trace.push("Tier 3: separate storage and laundry rooms");
    }
  
    return { rooms, trace };
  }
  