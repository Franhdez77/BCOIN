import { SetMetadata } from '@nestjs/common';

import { PUBLIC_ROUTE_KEY } from '../domain/auth.constants';

export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(PUBLIC_ROUTE_KEY, true);
