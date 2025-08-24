import { YEDataCollectionService } from './YEDataCollectionService';
import { yeApiService } from '../yeApiService/instances';

export const yeDataCollectionService = new YEDataCollectionService(yeApiService);
