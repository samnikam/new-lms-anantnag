import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsString() @IsNotEmpty()
  identifier!: string; // email, username or mobile

  @IsString() @IsNotEmpty()
  password!: string;
}

export class KioskLoginDto {
  @IsString() @IsNotEmpty()
  kioskUsername!: string;

  @IsString() @IsNotEmpty()
  kioskPassword!: string;
}

export class ChangePasswordDto {
  @IsString() @IsNotEmpty()
  currentPassword!: string;

  @IsString() @MinLength(8)
  newPassword!: string;
}

export class ForgotPasswordDto {
  @IsString() @IsNotEmpty()
  identifier!: string;
}

export class ResetPasswordDto {
  @IsString() @IsNotEmpty()
  token!: string;

  @IsString() @MinLength(8)
  newPassword!: string;
}
