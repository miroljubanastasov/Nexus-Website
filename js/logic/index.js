import { evaluateBedrooms } from "./bedrooms.js";
import { evaluateBathrooms } from "./bathrooms.js";
import { evaluateUtility } from "./utility.js";
import { evaluateOptional } from "./optional.js";
import { evaluateLiving } from "./living.js";
import { evaluateCirculation } from "./circulation.js";

export function evaluateAll(input) {
  let rooms = [];

  const modules = [
    evaluateBedrooms,
    evaluateBathrooms,
    evaluateUtility,
    evaluateOptional,
    evaluateLiving,
    evaluateCirculation
  ];

  for (const fn of modules) {
    const out = fn(input);
    rooms.push(...out.rooms);
  }

  return { rooms, occupants: input.occupants };
}
