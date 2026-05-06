export function isBenchmarkRendererMode(target: Pick<Window, 'kaurKhorDesktop'> = window) {
  return Boolean((target as Partial<Window>).kaurKhorDesktop?.benchmark?.enabled);
}
