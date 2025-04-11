export function evaluateBedrooms({ occupants, guest }) {
    const rooms = [];
    const trace = [];
  
    if (occupants >= 2) {
      rooms.push("master_bedroom");
      trace.push("Added master bedroom for couple");
    }
  
    if (occupants > 2) {
      const count = occupants - 2;
      rooms.push(...Array(count).fill("standard_bedroom"));
      trace.push(`Added ${count} standard bedroom(s)`);
    }
  
    if (guest) {
      rooms.push("guest_bedroom");
      trace.push("Added guest bedroom");
    }
  
    return { rooms, trace };
  }
  