import { PostgreSQLFactory } from '@/services/database/PostgreSQL/PostgreSQLFactory';

import { UserRepository } from './UserRepository';

export class UserRepositoryFactory {
  private static instance: UserRepository | null = null;

  static getInstance = async (): Promise<UserRepository> => {
    if (!UserRepositoryFactory.instance) {
      UserRepositoryFactory.instance = new UserRepository(await PostgreSQLFactory.getInstance());
    }
    return UserRepositoryFactory.instance;
  };

  static resetInstance = (): void => {
    UserRepositoryFactory.instance = null;
  };
}
