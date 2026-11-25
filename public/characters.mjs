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

const SPECIAL_REWARD_LIMITS_MS = { easy: 90_000, medium: 150_000, hard: 180_000 };
const specialRewards = [
  '頭戴粉色小花的小桃鼠',
  '小桃鼠和粉色角色一起比出手勢',
  '小桃鼠看著書攤上正在讀書的角色',
  '角色們穿著聖誕裝在樹下慶祝',
  '風獅爺抱著寫有福字的金幣',
  '小八貓和吉伊卡哇開心地跑步',
  '戴著藍色蝴蝶結的小桃鼠',
].map((alt, index) => ({ alt, src: `./rewards/speed-${index + 1}.webp` }));

export function pickSpecialReward(difficulty, elapsedMs, random = Math.random) {
  if (elapsedMs <= SPECIAL_REWARD_LIMITS_MS[difficulty]) {
    return specialRewards[Math.floor(random() * specialRewards.length)];
  }
  return null;
}

export function pickCharacters(count, random = Math.random) {
  const available = [...characters];
  return Array.from({ length: count }, () => {
    const index = Math.floor(random() * available.length);
    const [{ id, name, images }] = available.splice(index, 1);
    const src = images[Math.floor(random() * images.length)];
    return { id, name, src };
  });
}
