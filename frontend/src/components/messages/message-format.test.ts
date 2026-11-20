import assert from "node:assert/strict";
import test from "node:test";
import { canShareImaging, formatVoiceDuration, messagePreview } from "./message-format";

test("seuls les médecins et radiologues voient l’action de partage PACS", () => {
  assert.equal(canShareImaging("PHYSICIAN"), true);
  assert.equal(canShareImaging("RADIOLOGIST"), true);
  assert.equal(canShareImaging("PATIENT"), false);
  assert.equal(canShareImaging("ADMIN"), false);
});

test("les pièces jointes sans légende ont un aperçu explicite", () => {
  assert.equal(messagePreview("VOICE", ""), "Message vocal");
  assert.equal(messagePreview("PHOTO", ""), "Photo");
  assert.equal(messagePreview("IMAGING", ""), "Imagerie médicale");
});

test("la durée vocale est présentée en minutes et secondes", () => {
  assert.equal(formatVoiceDuration(65_000), "1:05");
});
