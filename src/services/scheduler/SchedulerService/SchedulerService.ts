import * as cron from 'node-cron';

import { ConsoleLogger } from '@/utils/ConsoleLogger';
import { AppError } from '@/utils/AppError';

export interface TScheduledJob {
  id: string;
  name: string;
  cronExpression: string;
  task: () => Promise<void>;
  isRunning: boolean;
  lastRun?: Date;
  nextRun?: Date;
  errorCount: number;
  lastError?: Error;
}

export interface TSchedulerService {
  addJob(job: Omit<TScheduledJob, 'isRunning' | 'errorCount'>): void;
  removeJob(jobId: string): boolean;
  startJob(jobId: string): void;
  stopJob(jobId: string): void;
  startAllJobs(): void;
  stopAllJobs(): void;
  getJob(jobId: string): TScheduledJob | undefined;
  getAllJobs(): TScheduledJob[];
  getJobStats(): {
    totalJobs: number;
    runningJobs: number;
    stoppedJobs: number;
    totalErrors: number;
  };
}

export class SchedulerService implements TSchedulerService {
  private jobs: Map<string, TScheduledJob> = new Map();
  private cronTasks: Map<string, cron.ScheduledTask> = new Map();
  private isStarted = false;

  public addJob = (job: Omit<TScheduledJob, 'isRunning' | 'errorCount'>): void => {
    try {
      const scheduledJob: TScheduledJob = {
        ...job,
        isRunning: false,
        errorCount: 0,
      };

      this.jobs.set(job.id, scheduledJob);

      // Если сервис уже запущен, сразу создаем cron задачу
      if (this.isStarted) {
        this.createCronTask(scheduledJob);
      }

      ConsoleLogger.info('Задача добавлена в планировщик', {
        jobId: job.id,
        name: job.name,
        cronExpression: job.cronExpression,
      });
    } catch (error) {
      ConsoleLogger.error('Ошибка добавления задачи в планировщик', error as Error, { job });
      throw AppError.systemError('SCHEDULER_ADD_JOB_FAILED', 'Не удалось добавить задачу в планировщик');
    }
  };

  public removeJob = (jobId: string): boolean => {
    try {
      const job = this.jobs.get(jobId);
      if (!job) {
        return false;
      }

      // Останавливаем cron задачу если она существует
      const cronTask = this.cronTasks.get(jobId);
      if (cronTask) {
        void cronTask.stop();
        this.cronTasks.delete(jobId);
      }

      this.jobs.delete(jobId);

      ConsoleLogger.info('Задача удалена из планировщика', { jobId, name: job.name });
      return true;
    } catch (error) {
      ConsoleLogger.error('Ошибка удаления задачи из планировщика', error as Error, { jobId });
      throw AppError.systemError('SCHEDULER_REMOVE_JOB_FAILED', 'Не удалось удалить задачу из планировщика');
    }
  };

  public startJob = (jobId: string): void => {
    try {
      const job = this.jobs.get(jobId);
      if (!job) {
        throw AppError.systemError('JOB_NOT_FOUND', `Задача с ID ${jobId} не найдена`);
      }

      if (job.isRunning) {
        ConsoleLogger.warn('Задача уже запущена', { jobId, name: job.name });
        return;
      }

      this.createCronTask(job);
      job.isRunning = true;

      ConsoleLogger.info('Задача запущена', { jobId, name: job.name });
    } catch (error) {
      ConsoleLogger.error('Ошибка запуска задачи', error as Error, { jobId });
      throw AppError.systemError('SCHEDULER_START_JOB_FAILED', 'Не удалось запустить задачу');
    }
  };

  public stopJob = (jobId: string): void => {
    try {
      const job = this.jobs.get(jobId);
      if (!job) {
        throw AppError.systemError('JOB_NOT_FOUND', `Задача с ID ${jobId} не найдена`);
      }

      if (!job.isRunning) {
        ConsoleLogger.warn('Задача уже остановлена', { jobId, name: job.name });
        return;
      }

      const cronTask = this.cronTasks.get(jobId);
      if (cronTask) {
        void cronTask.stop();
        this.cronTasks.delete(jobId);
      }

      job.isRunning = false;

      ConsoleLogger.info('Задача остановлена', { jobId, name: job.name });
    } catch (error) {
      ConsoleLogger.error('Ошибка остановки задачи', error as Error, { jobId });
      throw AppError.systemError('SCHEDULER_STOP_JOB_FAILED', 'Не удалось остановить задачу');
    }
  };

  public startAllJobs = (): void => {
    try {
      this.isStarted = true;

      for (const job of this.jobs.values()) {
        if (!job.isRunning) {
          this.createCronTask(job);
          job.isRunning = true;
        }
      }

      ConsoleLogger.info('Все задачи планировщика запущены', {
        totalJobs: this.jobs.size,
      });
    } catch (error) {
      ConsoleLogger.error('Ошибка запуска всех задач планировщика', error as Error);
      throw AppError.systemError('SCHEDULER_START_ALL_FAILED', 'Не удалось запустить все задачи планировщика');
    }
  };

  public stopAllJobs = (): void => {
    try {
      this.isStarted = false;

      // Останавливаем все cron задачи
      for (const [jobId, cronTask] of this.cronTasks.entries()) {
        void cronTask.stop();
        const job = this.jobs.get(jobId);
        if (job) {
          job.isRunning = false;
        }
      }

      this.cronTasks.clear();

      ConsoleLogger.info('Все задачи планировщика остановлены', {
        totalJobs: this.jobs.size,
      });
    } catch (error) {
      ConsoleLogger.error('Ошибка остановки всех задач планировщика', error as Error);
      throw AppError.systemError('SCHEDULER_STOP_ALL_FAILED', 'Не удалось остановить все задачи планировщика');
    }
  };

  public getJob = (jobId: string): TScheduledJob | undefined => {
    return this.jobs.get(jobId);
  };

  public getAllJobs = (): TScheduledJob[] => {
    return Array.from(this.jobs.values());
  };

  public getJobStats = (): {
    totalJobs: number;
    runningJobs: number;
    stoppedJobs: number;
    totalErrors: number;
  } => {
    const jobs = Array.from(this.jobs.values());
    const runningJobs = jobs.filter(job => job.isRunning).length;
    const totalErrors = jobs.reduce((sum, job) => sum + job.errorCount, 0);

    return {
      totalJobs: jobs.length,
      runningJobs,
      stoppedJobs: jobs.length - runningJobs,
      totalErrors,
    };
  };

  private createCronTask = (job: TScheduledJob): void => {
    try {
      const cronTask = cron.schedule(job.cronExpression, async () => {
        try {
          ConsoleLogger.info('Выполнение запланированной задачи', {
            jobId: job.id,
            name: job.name,
          });

          job.lastRun = new Date();
          await job.task();

          ConsoleLogger.info('Задача успешно выполнена', {
            jobId: job.id,
            name: job.name,
          });
        } catch (error) {
          job.errorCount++;
          job.lastError = error as Error;

          ConsoleLogger.error('Ошибка выполнения запланированной задачи', error as Error, {
            jobId: job.id,
            name: job.name,
            errorCount: job.errorCount,
          });
        }
      });

      this.cronTasks.set(job.id, cronTask);
      job.isRunning = true;

      ConsoleLogger.info('Cron задача создана', {
        jobId: job.id,
        name: job.name,
        cronExpression: job.cronExpression,
        nextRun: job.nextRun,
      });
    } catch (error) {
      ConsoleLogger.error('Ошибка создания cron задачи', error as Error, { job });
      throw AppError.systemError('CRON_TASK_CREATION_FAILED', 'Не удалось создать cron задачу');
    }
  };
}
