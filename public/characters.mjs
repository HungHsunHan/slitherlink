export const characters = [
  { id: 'chiikawa', name: '吉伊卡哇' },
  { id: 'hachiware', name: '小八貓' },
  { id: 'usagi', name: '兔兔' },
  { id: 'momonga', name: '小桃鼠' },
  { id: 'kurimanju', name: '栗子饅頭' },
  { id: 'rakko', name: '海獺' },
  { id: 'shisa', name: '風獅爺' },
  { id: 'furuhonya', name: '古本屋' },
].map((character) => ({ ...character, src: `./characters/${character.id}.webp` }));

export function pickCharacter(sample = Math.random()) {
  return characters[Math.floor(sample * characters.length)];
}
