import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_ACCESS_SECRET ?? 'change-me-access-secret',
    });
  }

  async validate(payload: any) {
    if (!payload?.sub) throw new UnauthorizedException();
    return {
      id: payload.sub,
      role: payload.role,
      fullName: payload.name,
      siteId: payload.siteId ?? null,
      kioskClassroomId: payload.kioskClassroomId ?? null,
    };
  }
}
