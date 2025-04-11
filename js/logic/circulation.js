export function evaluateCirculation({ stories }) {
    const rooms = [];
    const trace = [];
  
    if (stories > 1) {
      rooms.push("stairs");
      trace.push("Added stairs for multi-story dwelling");
    }
  
    return { rooms, trace };
  }
  