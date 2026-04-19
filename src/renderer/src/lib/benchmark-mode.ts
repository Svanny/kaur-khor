export function isBenchmarkRendererMode(target: Pick<Window, 'banjiDesktop'> = window) {
  return Boolean((target as Partial<Window>).banjiDesktop?.benchmark?.enabled);
}
