import { YEDataCollectionService } from './YEDataCollectionService';
import { cachedYEService } from '../cachedYEService/instances';

export const yeDataCollectionService = new YEDataCollectionService(cachedYEService);
