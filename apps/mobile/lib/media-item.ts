// MediaItem-formen och formatMediaDuration bor numera i
// packages/shared/src/media.ts - webben renderar samma media. Den här
// filen står kvar som en re-export så att skärmarnas
// `import ... from "../lib/media-item"` inte behöver röras.
export { formatMediaDuration, type MediaItem } from "@repcount/shared";
