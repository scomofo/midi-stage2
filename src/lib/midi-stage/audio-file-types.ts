/** Lightweight file-picker metadata; importing it never loads the audio analyzer. */
export type AudioImportMode = "rhythm" | "drums" | "keys" | "guitar";
export const AUDIO_IMPORT_ACCEPT = ".mp3,.wav,.wave,.flac,.m4a,.aac,.ogg,.oga,.opus,.webm,.aif,.aiff,audio/*";
const AUDIO_EXTENSION = /\.(mp3|wav|wave|flac|m4a|aac|ogg|oga|opus|webm|aif|aiff)$/i;

export function isSupportedAudioFile(file: Pick<File, "name" | "type">): boolean {
  if (/\.(mid|midi|json)$/i.test(file.name) || /midi/i.test(file.type)) return false;
  return AUDIO_EXTENSION.test(file.name) || file.type.startsWith("audio/");
}
