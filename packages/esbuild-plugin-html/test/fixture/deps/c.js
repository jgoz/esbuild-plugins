export async function C() {
  const { A } = await import('./a');
  const { B } = await import('./b');

  return A + B;
}
