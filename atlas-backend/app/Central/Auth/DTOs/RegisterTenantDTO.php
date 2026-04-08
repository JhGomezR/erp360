<?php

namespace App\Central\Auth\DTOs;

use Spatie\LaravelData\Data;

class RegisterTenantDTO extends Data
{
    public function __construct(
        public readonly string  $owner_name,
        public readonly string  $email,
        public readonly string  $password,
        public readonly string  $business_name,
        public readonly int     $plan_id,
        public readonly ?int    $business_type_id = null, // FK al nuevo módulo de tipos de negocio
        public readonly ?string $business_type    = null, // legacy string: restaurant | store
        public readonly ?string $phone            = null,
        public readonly ?string $address          = null,
        public readonly bool    $seed_puc         = false,
    ) {}
}
