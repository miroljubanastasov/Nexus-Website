export function evaluateOptional({ office, atelier, garage, spa, tier }) {
    const rooms = [];
    const trace = [];
  
    if (office) {
      rooms.push("home_office");
      trace.push("Added home office");
    }
  
    if (atelier) {
      rooms.push("atelier");
      trace.push("Added atelier");
    }
  
    if (garage) {
      rooms.push("garage");
      trace.push("Added garage");
    }
  
    if (spa) {
      rooms.push("sauna");
      trace.push("Added sauna");
      if (tier === 3) {
        rooms.push("jacuzzi");
        trace.push("Tier 3: added jacuzzi");
      }
    }
  
    return { rooms, trace };
  }
  