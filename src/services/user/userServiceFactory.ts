import { UserService } from './UserService/UserService';
import { UserRepositoryFactory } from './UserRepository/UserRepositoryFactory';

export class UserServiceFactory {
  private static instance: UserService | null = null;

  static getInstance = async (): Promise<UserService> => {
    if (!UserServiceFactory.instance) {
      const repository = await UserRepositoryFactory.getInstance();
      UserServiceFactory.instance = new UserService(repository);
    }
    return UserServiceFactory.instance;
  };

  static resetInstance = (): void => {
    UserServiceFactory.instance = null;
  };
}
