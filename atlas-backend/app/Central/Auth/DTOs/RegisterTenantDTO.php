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
        public readonly ?int    $business_type_id  = null,
        public readonly ?string $business_type     = null,
        public readonly ?string $phone             = null,
        public readonly ?string $address           = null,
        public readonly bool    $seed_puc          = false,
        // Aceptación de términos — validada en el backend con 'accepted' (OWASP A01)
        public readonly bool    $terms_accepted    = false,
        public readonly ?string $terms_version     = null,
    ) {}
}
