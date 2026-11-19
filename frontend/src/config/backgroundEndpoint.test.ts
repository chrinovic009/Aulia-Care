import test from "node:test";
import assert from "node:assert/strict";
import { isBackgroundEndpoint } from "./backgroundEndpoints";

test("le pointage automatique n'ouvre aucune fenêtre", () => {
  assert.equal(isBackgroundEndpoint("/users/me/clock-in"), true);
});

test("les actions saisies par l'utilisateur gardent leur confirmation", () => {
  assert.equal(isBackgroundEndpoint("/users/me/clock-out"), false);
  assert.equal(isBackgroundEndpoint("/appointments/me"), false);
});
