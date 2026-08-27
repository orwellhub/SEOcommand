export function siteConstellationPosition(index: number): { x: number; y: number } {
  const column = index % 4;
  const row = Math.floor(index / 4);
  return {
    x: 51 + column * 14.5,
    y: 27 + row * 15.5,
  };
}
