import { UserService } from './UserService/UserService';
import { UserRepositoryFactory } from './UserRepository/UserRepositoryFactory';
import { CacheServiceFactory } from '../cacheService/CacheServiceFactory';

export class UserServiceFactory {
  private static instance: UserService | null = null;

  static getInstance = async (): Promise<UserService> => {
    if (!UserServiceFactory.instance) {
      UserServiceFactory.instance = new UserService(
        await UserRepositoryFactory.getInstance(),
        CacheServiceFactory.getRedisInstance(),
      );
    }
    return UserServiceFactory.instance;
  };

  static resetInstance = (): void => {
    UserServiceFactory.instance = null;
  };
}
