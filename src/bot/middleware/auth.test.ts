import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import type { TUserService } from '@/services/user/UserService/types';

import { AuthMiddleware } from './auth';

describe('AuthMiddleware', () => {
  let authMiddleware: AuthMiddleware;
  let mockUserService: TUserService;

  beforeEach(() => {
    mockUserService = {
      createUser: vi.fn(),
      getUser: vi.fn(),
      updateUserCity: vi.fn(),
      updateSubscription: vi.fn(),
      checkSubscriptionExpiry: vi.fn(),
      addToSearchHistory: vi.fn(),
      getSearchHistory: vi.fn(),
      clearSearchHistory: vi.fn(),
      deleteUser: vi.fn(),
    };

    authMiddleware = new AuthMiddleware(mockUserService);
  });

  describe('constructor', () => {
    it('should create middleware instance', () => {
      expect(authMiddleware).toBeInstanceOf(AuthMiddleware);
    });
  });
});
