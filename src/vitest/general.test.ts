import {
  describe,
  expect,
  it,
} from 'vitest';
import { vol } from 'memfs';

describe('General', () => {
  it('Должен проверить что memfs работает корректно', () => {
    // Проверяем, что vol действительно используется вместо реального fs
    // Создаем корневую директорию для memfs
    vol.mkdirSync('.', { recursive: true });
    vol.writeFileSync('./test-file.txt', 'test content');
    expect(vol.existsSync('./test-file.txt')).toBe(true);
    expect(vol.readFileSync('./test-file.txt', 'utf8') as string).toBe('test content');
  });
});
