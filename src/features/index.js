// Точка входу шару 1: реєструє всі ознаки й рахує «Аудіо-ДНК» кадру.
import "./basic.js";
import "./scene.js";
import { computeFeatures, listFeatures, getFeature } from "./registry.js";
import { computeZones } from "./zones.js";

export { listFeatures, getFeature };

/** Головна ознака для типу сцени — нею вимірюємо масштаб змін. */
export const MAIN_FEATURE = { heatmap: "warmth", nightlights: "lightLog", truecolor: "whiteness", chart: "brightness", mixed: "brightness" };

export function computeFrame(ctx, withZones = true) {
  return { features: computeFeatures(ctx), zones: withZones ? computeZones(ctx) : null };
}
