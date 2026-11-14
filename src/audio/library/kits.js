// Набори ударних (етап 11): ролі партії «Ударні» → інструменти бібліотеки.
// Тема або стиль обирає набір; ритм (коли й скільки ударів) лишається від даних.
export const KITS = {
  orchestral: { label: "оркестровий (литаври, тарілки)", kick: "kick", snare: "snare", shaker: "shaker", timpani: "timpani", cymbal: "cymbal" },
  ambient: { label: "ембієнт (м'які удари, щітки)", kick: "softkick", snare: "brush", shaker: "brush", timpani: "timpani", cymbal: "swell" },
  electronic: { label: "електронний (808, плеск, хай-хет)", kick: "kick808", snare: "clap", shaker: "hihat", timpani: "tom", cymbal: "cymbal" },
  earth: { label: "«земний» (дерево, камінь, вода)", kick: "stone", snare: "woodblock", shaker: "waterdrop", timpani: "logdrum", cymbal: "crackle" },
};
export const kitOf = id => KITS[id] || KITS.orchestral;
