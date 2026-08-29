import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class PageQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page = 1;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200)
  limit = 20;

  @IsOptional() @IsString()
  search?: string;
}

export function paginate(q: PageQuery) {
  return { skip: (q.page - 1) * q.limit, take: q.limit };
}

export function pageResult<T>(items: T[], total: number, q: PageQuery) {
  return {
    items,
    total,
    page: q.page,
    limit: q.limit,
    pages: Math.max(1, Math.ceil(total / q.limit)),
  };
}
