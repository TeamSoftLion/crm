import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshGuard } from './guards/refresh.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { Role } from '@prisma/client';
import { Roles } from './decorator/roles.decorator';
import { RolesGuard } from './guards/roles.guard';
import type { Request, Response } from 'express';

const REFRESH_COOKIE_NAME = 'refreshToken';

const refreshCookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/auth/refresh',
  maxAge: 1000 * 60 * 60 * 24 * 7,
};

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Post('login')
  @HttpCode(200)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accessToken, refreshToken, user } = await this.auth.login(
      dto.phone,
      dto.password,
    );

    res.cookie(REFRESH_COOKIE_NAME, refreshToken, refreshCookieOptions);

    return {
      accessToken,
      user,
    };
  }

  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = req.cookies?.[REFRESH_COOKIE_NAME];

    const { accessToken, refreshToken: newRefreshToken } =
      await this.auth.refresh(refreshToken);

    if (newRefreshToken) {
      res.cookie(REFRESH_COOKIE_NAME, newRefreshToken, refreshCookieOptions);
    }

    // Frontga faqat yangi access token
    return { accessToken };
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  async logout(@Req() req: any, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(req.user.sub);

    res.clearCookie(REFRESH_COOKIE_NAME, {
      ...refreshCookieOptions,
      maxAge: 0,
    });

    return { message: 'Logged out' };
  }

  @Get('whoami')
  @UseGuards(JwtAuthGuard)
  whoami(@Req() req: any) {
    return req.user;
  }

  @Get('admin-only')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  adminOnly() {
    return { ok: true, area: 'admin' };
  }
}
