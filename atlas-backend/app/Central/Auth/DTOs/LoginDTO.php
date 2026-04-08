<?php

namespace App\Central\Auth\DTOs;

use Spatie\LaravelData\Data;

class LoginDTO extends Data
{
    public function __construct(
        public readonly string $email,
        public readonly string $password,
        public readonly ?string $totp_code = null,
    ) {}

    public static function rules(): array
    {
        return [
            'email'     => ['required', 'email'],
            'password'  => ['required', 'string'],
            'totp_code' => ['nullable', 'string', 'size:6'],
        ];
    }
}
