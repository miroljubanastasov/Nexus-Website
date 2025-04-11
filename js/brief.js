import { evaluateAll } from "./logic/index.js";

const presets = {
  "Couple Only - Compact": {
    occupants: 2, tier: 1, guest: false, office: false,
    atelier: false, spa: false, garage: false, stories: 1
  },
  "Family of 4 - Standard + Office": {
    occupants: 4, tier: 2, guest: false, office: true,
    atelier: false, spa: false, garage: true, stories: 2
  },
  "Couple + Guests - Spacious Spa": {
    occupants: 2, tier: 3, guest: true, office: false,
    atelier: true, spa: true, garage: true, stories: 2
  }
};

// Handle preset selection
document.getElementById("presetSelect").addEventListener("change", () => {
  const selected = presets[document.getElementById("presetSelect").value];
  if (!selected) return;

  document.getElementById("occupants").value = selected.occupants;
  document.getElementById("tier").value = selected.tier;
  document.getElementById("guest").checked = selected.guest;
  document.getElementById("office").checked = selected.office;
  document.getElementById("atelier").checked = selected.atelier;
  document.getElementById("spa").checked = selected.spa;
  document.getElementById("garage").checked = selected.garage;
  document.getElementById("stories").value = selected.stories;

  runBrief();
});

document.getElementById("configForm").addEventListener("input", runBrief);
document.getElementById("configForm").addEventListener("change", runBrief);
window.addEventListener("DOMContentLoaded", runBrief); // Auto run on load

async function runBrief() {
  let occupants = Math.max(parseInt(document.getElementById("occupants").value), 2);
  const tier = parseInt(document.getElementById("tier").value);
  const guest = document.getElementById("guest").checked;
  const office = document.getElementById("office").checked;
  const atelier = document.getElementById("atelier").checked;
  const spa = document.getElementById("spa").checked;
  const garage = document.getElementById("garage").checked;
  const stories = parseInt(document.getElementById("stories").value);

  const input = { occupants, tier, guest, office, atelier, spa, garage, stories };
  const output = evaluateAll(input);

  const roomData = await fetch("src/rooms.json").then(res => res.json());
  const categories = ["living spaces", "rooms", "utilities"];
  const grouped = {};
  let totalArea = 0;

  for (const roomId of output.rooms) {
    const room = roomData[roomId];
    if (!room) continue;
    const cat = room.category || "uncategorized";
    if (!grouped[cat]) grouped[cat] = [];
    const area = +(room.area?.[tier] || 0);
    grouped[cat].push({
      id: roomId,
      name: room.name,
      description: room.description,
      area
    });
    totalArea += area;
  }

  const outputSection = document.getElementById("output");
  const summary = document.getElementById("summary");
  const tables = document.getElementById("roomTables");
  tables.innerHTML = "";
  summary.innerHTML = "";

  // Generate grouped tables
  for (const cat of categories) {
    const list = grouped[cat];
    if (!list) continue;

    const table = document.createElement("table");
    table.className = "table table-bordered mb-4";

    const thead = document.createElement("thead");
    thead.innerHTML = `<tr><th colspan="3" class="table-primary text-uppercase">${cat}</th></tr>
                       <tr><th style="width: 25%;">Room</th><th style="width: 55%;">Description</th><th style="width: 20%;">Area (m²)</th></tr>`;
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    let subtotal = 0;
    list.forEach(room => {
      subtotal += room.area;
      const row = document.createElement("tr");
      row.innerHTML = `<td>${room.name}</td><td>${room.description}</td><td>${room.area.toFixed(1)}</td>`;
      tbody.appendChild(row);
    });

    const subtotalRow = document.createElement("tr");
    subtotalRow.innerHTML = `<td colspan="2"><strong>Subtotal</strong></td><td><strong>${subtotal.toFixed(1)}</strong></td>`;
    tbody.appendChild(subtotalRow);

    table.appendChild(tbody);
    tables.appendChild(table);
  }

  // Final aligned summary table
  const totalOccupants = occupants + (guest ? 2 : 0);
  const finalTable = document.createElement("table");
  finalTable.className = "table table-bordered w-auto";

  const tbody = document.createElement("tbody");
  tbody.innerHTML = `
    <tr><td><strong>Total Occupants</strong></td><td colspan="2">${totalOccupants}</td></tr>
    <tr><td colspan="2"><strong>Total Area</strong></td><td><strong>${totalArea.toFixed(1)} m²</strong></td></tr>
  `;
  finalTable.appendChild(tbody);
  summary.appendChild(finalTable);

  outputSection.style.display = "block";
}
