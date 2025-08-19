import { createDatabaseConnection } from '@/config/database';

import { UserService } from './userService';
import { UserRepository } from './userRepository';

export class UserServiceFactory {
  private static instance: UserService | null = null;

  static getInstance = async (): Promise<UserService> => {
    if (!UserServiceFactory.instance) {
      const db = await createDatabaseConnection();
      const repository = new UserRepository(db);
      UserServiceFactory.instance = new UserService(repository);
    }
    return UserServiceFactory.instance;
  };

  static resetInstance = (): void => {
    UserServiceFactory.instance = null;
  };
}
