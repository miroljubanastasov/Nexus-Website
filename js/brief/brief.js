import { run_brief } from "./brief_logic.js";

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

const roomIcons = {
  "MBR": "fa-bed",
  "SBR": "fa-bed",
  "GBR": "fa-user-friends",
  "PBR": "fa-person-cane",
  "MBT": "fa-bath",
  "PBT": "fa-shower",
  "SBT": "fa-shower",
  "PRM": "fa-toilet",
  "LIV": "fa-couch",
  "DIN": "fa-utensils",
  "KCH": "fa-kitchen-set",
  "SPA": "fa-hot-tub-person",
  "OFF": "fa-laptop",
  "ATE": "fa-palette",
  "TRA": "fa-tools",
  "SER": "fa-shirt",
  "STA": "fa-stairs",
  "GAR": "fa-warehouse",
  "ENT": "fa-door-open"
};

runBrief()
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
  const parents = document.getElementById("parents").checked;
  const office = document.getElementById("office").checked;
  const atelier = document.getElementById("atelier").checked;
  const spa = document.getElementById("spa").checked;
  const garage = document.getElementById("garage").checked;
  const technik = document.getElementById("technik").checked;
  const stories = parseInt(document.getElementById("stories").value);

  const input = { occupants, tier, guest, office, atelier, spa, garage, stories, parents, technik };
  const output = run_brief(input);

  const roomData = output.rooms;

  const category_bedrooms = "Bedrooms";
  const category_living = "Living Spaces";
  const category_utility = "Utilities";

  const categories = [category_bedrooms, category_living, category_utility]

  const grouped = {};
  let totalArea = output.totalArea;


  const outputSection = document.getElementById("output");
  const summary = document.getElementById("summary");
  const cards = document.getElementById("roomCards");
  cards.innerHTML = "";
  summary.innerHTML = "";


  roomData.forEach(room => {
    const card = document.createElement("div");
    card.className = "card mb-3 shadow-sm";

    const cardBody = document.createElement("div");
    cardBody.className = "card-body";

    const iconClass = roomIcons[room["Room ID"]] || "fa-box";

    const icon = document.createElement("h3");
    icon.className = "card-title";
    icon.innerHTML = `<i class="fa-solid ${iconClass} me-2"></i>`;

    const title = document.createElement("h3");
    title.className = "card-title";
    title.innerHTML = `${room.Name || "Unnamed Room"}`;

    const area = document.createElement("p");
    area.className = "card-text mb-1";
    area.innerHTML = `<strong>Area:</strong> ${room.Area.Value ?? "n/a"} m²`;

    const desc = document.createElement("p");
    desc.className = "card-text text-muted mb-1";
    desc.innerHTML = `<strong></strong> ${room.Description.Value ?? "No description provided"}`;

    const price = document.createElement("p");
    price.className = "card-text";
    price.innerHTML = `<strong>Price:</strong> ${room.Price ?? "n/a"}`;

    cardBody.appendChild(icon);
    cardBody.appendChild(title);
    cardBody.appendChild(desc);
    cardBody.appendChild(area);

    for (let equipment in room) {
      if (room[equipment].Report) {
        let name = equipment
        let value = room[equipment].Value

        if (typeof value === "boolean" && value === true) {
          const li = document.createElement("li");
          li.innerText = `${name}`;
          cardBody.append(li)
        }
        else if (typeof value != "boolean") {
          const li = document.createElement("li");
          li.innerText = `${name}: ${value ?? "n/a"}`;
          cardBody.append(li)
        }
      }
    }

    if (room.NestedRooms && room.NestedRooms.length > 0) {
      room.NestedRooms.forEach(nestedRoom => {

        const nestedCard = document.createElement("div");
        nestedCard.className = "card mb-3 shadow-sm";

        const nestedCardBody = document.createElement("div");
        nestedCardBody.className = "card-body";

        const iconClass = roomIcons[nestedRoom["Room ID"]] || "fa-box";

        const icon = document.createElement("h5");
        icon.className = "card-title";
        icon.innerHTML = `<i class="fa-solid ${iconClass} me-2"></i>`;

        const title = document.createElement("h5");
        title.className = "card-title";
        title.innerHTML = `${nestedRoom.Name || "Unnamed Room"}`;

        const area = document.createElement("p");
        area.className = "card-text mb-1";
        area.innerHTML = `<strong>Area:</strong> ${nestedRoom.Area.Value ?? "n/a"} m²`;

        const desc = document.createElement("p");
        desc.className = "card-text text-muted mb-1";
        desc.innerHTML = `<strong></strong> ${nestedRoom.Description.Value ?? "No description provided"}`;

        const price = document.createElement("p");
        price.className = "card-text";
        price.innerHTML = `<strong>Price:</strong> ${nestedRoom.Price ?? "n/a"}`;

        nestedCardBody.appendChild(icon);
        nestedCardBody.appendChild(title);
        nestedCardBody.appendChild(desc);

        nestedCardBody.appendChild(area);

        for (let equipment in nestedRoom) {
          if (nestedRoom[equipment].Report) {
            let name = equipment
            let value = nestedRoom[equipment].Value

            if (typeof value === "boolean" && value === true) {
              const li = document.createElement("li");
              li.innerText = `${name}`;
              nestedCardBody.append(li)
            }
            else if (typeof value != "boolean") {
              const li = document.createElement("li");
              li.innerText = `${name}: ${value ?? "n/a"}`;
              nestedCardBody.append(li)
            }
          }
        }
        nestedCard.appendChild(nestedCardBody);
        cardBody.appendChild(nestedCard);
      })
    }

    card.appendChild(cardBody);
    cards.appendChild(card);
  });



  // Final aligned summary table
  const totalOccupants = output.occupants;
  const total_bedrooms = output.nRooms;
  const finalTable = document.createElement("table");
  finalTable.className = "table table-bordered w-auto";

  const tbody = document.createElement("tbody");
  tbody.innerHTML = `
    <tr><td colspan="2"><strong>Total Area</strong></td><td><strong>${totalArea.toFixed(1)} m²</strong></td></tr>
    <tr><td>Rooms</td><td colspan="2">${total_bedrooms + 1}</td></tr>
    <tr><td>Bedrooms</td><td colspan="2">${output.nBedRooms}</td></tr>
    <tr><td>Bathrooms</td><td colspan="2">${output.nBaths}</td></tr>
  `;
  finalTable.appendChild(tbody);
  summary.appendChild(finalTable);

  outputSection.style.display = "block";

}
