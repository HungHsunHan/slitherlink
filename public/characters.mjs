export const characters = [
  { id: 'chiikawa', name: '吉伊卡哇' },
  { id: 'hachiware', name: '小八貓' },
  { id: 'usagi', name: '兔兔' },
  { id: 'momonga', name: '小桃鼠' },
  { id: 'kurimanju', name: '栗子饅頭' },
  { id: 'rakko', name: '海獺' },
  { id: 'shisa', name: '風獅爺' },
  { id: 'furuhonya', name: '古本屋' },
].map((character) => ({
  ...character,
  images: ['', '-2', '-3'].map((suffix) => `./characters/${character.id}${suffix}.webp`),
}));

export function pickCharacters(count, random = Math.random) {
  const available = [...characters];
  return Array.from({ length: count }, () => {
    const index = Math.floor(random() * available.length);
    const [{ id, name, images }] = available.splice(index, 1);
    const src = images[Math.floor(random() * images.length)];
    return { id, name, src };
  });
}
