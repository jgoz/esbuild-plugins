import { mod } from './fixture/mod';

jest.mock('./fixture/mod', () => {
  return {
    mod() {
      return 'mock';
    },
  };
});

describe('jest-esbuild', () => {
  it('hoists mocked modules', () => {
    expect(mod()).toBe('mock');
  });
});
