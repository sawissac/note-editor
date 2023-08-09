export function generateMock<T>(times: number, callback: () => T) {
  return Array.from({ length: times }).map(callback);
}
