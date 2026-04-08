<?php

namespace App\Shared\Exceptions;

use Exception;

class PlanFeatureNotAllowedException extends Exception
{
    public function __construct(string $feature)
    {
        parent::__construct("El plan del tenant no incluye el módulo [{$feature}].");
    }
}
