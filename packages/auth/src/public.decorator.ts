import { SetMetadata } from '@nestjs/common';

// Marks a route handler (or controller) as public so the JWT guards skip it.
// Shared across services so every guard reads the same metadata key.
export const IS_PUBLIC_KEY = 'isPublic';

export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
