import {
  afterEach,
  beforeEach,
  vi,
} from 'vitest';
import { vol } from 'memfs';

import { MOCKED_CURRENT_DATE } from './constants';

vi.mock('fs');
vi.mock('fs/promises');

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(MOCKED_CURRENT_DATE);
});

afterEach(() => {
  // reset the state of in-memory fs
  vol.reset();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
