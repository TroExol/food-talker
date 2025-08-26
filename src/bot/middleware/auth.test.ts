import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import type { UserService } from '@/services/user/UserService/UserService';

import { AuthMiddleware } from './auth';

describe('AuthMiddleware', () => {
  let authMiddleware: AuthMiddleware;
  let mockUserService: UserService;

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
    } as unknown as UserService;

    authMiddleware = new AuthMiddleware(mockUserService);
  });

  describe('constructor', () => {
    it('should create middleware instance', () => {
      expect(authMiddleware).toBeInstanceOf(AuthMiddleware);
    });
  });
});
