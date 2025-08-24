import { SQLiteFactory } from '@/services/database/SQLite/SQLiteFactory';

import { UserRepository } from './UserRepository';

export class UserRepositoryFactory {
  private static instance: UserRepository | null = null;

  static getInstance = async (): Promise<UserRepository> => {
    if (!UserRepositoryFactory.instance) {
      UserRepositoryFactory.instance = new UserRepository(await SQLiteFactory.getInstance());
    }
    return UserRepositoryFactory.instance;
  };

  static resetInstance = (): void => {
    UserRepositoryFactory.instance = null;
  };
}
