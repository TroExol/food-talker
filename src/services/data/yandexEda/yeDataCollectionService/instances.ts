import { YEDataCollectionService } from './YEDataCollectionService';
import { cachedYeService } from '../cachedYEService/instances';

export const yeDataCollectionService = new YEDataCollectionService(cachedYeService);
