import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UsersService } from './user.service';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private users: UsersService) {}

  @Get('me')
  async me(@Req() req: any) {
    const u = await this.users.findById(req.user.sub);
    return this.users.toPublic(u);
  }

  @Patch('me/change-password')
  async changePassword(@Req() req: any, @Body() dto: ChangePasswordDto) {
    return this.users.changePassword(
      req.user.sub,
      dto.oldPassword,
      dto.newPassword,
    );
  }
}
