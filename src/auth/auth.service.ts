// src/auth/auth.service.ts
import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { Role } from '@prisma/client';
import { UsersService } from 'src/users/user.service';

type AuthJwtPayload = { sub: string; role: Role; isActive: boolean };

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async validateUser(phone: string, password: string) {
    const user = await this.users.findByPhone(phone);
    if (!user || !user.isActive)
      throw new UnauthorizedException('Invalid credentials');
    const ok = await argon2.verify(user.passwordHash, password);
    if (!ok) throw new UnauthorizedException('Invalid credentials');
    return user;
  }

  private async signTokens(user: {
    id: string;
    role: Role;
    isActive: boolean;
  }) {
    const payload: AuthJwtPayload = {
      sub: user.id,
      role: user.role,
      isActive: user.isActive,
    };

    const accessToken = await this.jwt.signAsync(
      { ...payload },
      {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        expiresIn: this.config.get<string>('JWT_ACCESS_EXPIRES', '15m'),
      },
    );

    const refreshToken = await this.jwt.signAsync(
      { ...payload },
      {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
        expiresIn: this.config.get<string>('JWT_REFRESH_EXPIRES', '7d'),
      },
    );

    return { accessToken, refreshToken };
  }

  async login(phone: string, password: string) {
    const user = await this.validateUser(phone, password);
    const tokens = await this.signTokens(user);
    const refreshHash = await argon2.hash(tokens.refreshToken);
    await this.users.setRefreshToken(user.id, refreshHash);
    return {
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        phone: user.phone,
      },
      ...tokens,
    };
  }

  async refresh(userId: string, refreshToken: string) {
    const user = await this.users.findById(userId);
    if (!user || !user.refreshTokenHash) throw new UnauthorizedException();
    const ok = await argon2.verify(user.refreshTokenHash, refreshToken);
    if (!ok) throw new ForbiddenException('Invalid refresh token');

    const tokens = await this.signTokens(user);
    const newHash = await argon2.hash(tokens.refreshToken);
    await this.users.setRefreshToken(user.id, newHash);
    return tokens;
  }

  async logout(userId: string) {
    await this.users.setRefreshToken(userId, null);
    return { success: true };
  }
}
