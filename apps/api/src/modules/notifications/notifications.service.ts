import { Injectable } from '@nestjs/common';
import type { PaginationQuery } from '@ts/types';
import type { z } from '@ts/validation';
import { idParamSchema } from '../../common/dto/phase7.dto';
import { notImplemented } from '../../common/errors/stub-errors';
import { emptyPage, type CursorPage } from '../../common/helpers/pagination';

type IdParam = z.infer<typeof idParamSchema>;

export abstract class NotificationsService {
  abstract list(query: PaginationQuery): CursorPage<never>;
  abstract markRead(_id: IdParam): never;
}

@Injectable()
export class Phase7NotificationsService extends NotificationsService {
  list(query: PaginationQuery): CursorPage<never> {
    return emptyPage(query);
  }

  markRead(): never {
    notImplemented('notification read receipt');
  }
}
