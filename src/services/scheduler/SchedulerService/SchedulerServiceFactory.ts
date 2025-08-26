import { SchedulerService } from './SchedulerService';

export class SchedulerServiceFactory {
  private static instance: SchedulerService | null = null;

  static getInstance = (): SchedulerService => {
    if (!SchedulerServiceFactory.instance) {
      SchedulerServiceFactory.instance = new SchedulerService();
    }
    return SchedulerServiceFactory.instance;
  };

  static resetInstance = (): void => {
    SchedulerServiceFactory.instance = null;
  };
}
