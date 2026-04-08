<?php

namespace App\Shared\Exceptions;

use Exception;

class TenantNotFoundException extends Exception
{
    public function __construct(string $slug)
    {
        parent::__construct("Tenant [{$slug}] no encontrado.");
    }
}
